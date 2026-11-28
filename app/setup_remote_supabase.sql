-- Une ligne existe uniquement pendant la durée d'une activation.
begin;
create table if not exists public.six_remotes (
  lien uuid primary key default gen_random_uuid(),
  proprietaire uuid not null default auth.uid() references auth.users on delete cascade,
  discussion text not null check(length(discussion) between 1 and 100),
  public_lecture boolean not null default false,
  titre text not null check(length(titre) <= 200),
  messages jsonb not null check(jsonb_typeof(messages) = 'array' and octet_length(messages::text) <= 4000000),
  unique(proprietaire, discussion)
);
-- Adresses e-mail autorisées à écrire en plus du propriétaire (en minuscules, 20 au plus).
alter table public.six_remotes add column if not exists ecrivains text[] not null default '{}';
alter table public.six_remotes drop constraint if exists six_remotes_ecrivains_max;
alter table public.six_remotes add constraint six_remotes_ecrivains_max check (cardinality(ecrivains) <= 20);
alter table public.six_remotes enable row level security;
revoke all on public.six_remotes from public, anon, authenticated;
grant select, delete on public.six_remotes to authenticated;
grant insert(discussion, public_lecture, titre, messages, ecrivains), update(messages,titre,ecrivains) on public.six_remotes to authenticated;
drop policy if exists remote_proprietaire on public.six_remotes;
create policy remote_proprietaire on public.six_remotes to authenticated
using (proprietaire = auth.uid()) with check (proprietaire = auth.uid());

create or replace function public.six_remote_peut_ecrire(p_lien uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.six_remotes r where r.lien=p_lien and not r.public_lecture
    and (r.proprietaire=auth.uid() or lower(coalesce(auth.jwt()->>'email','')) = any(r.ecrivains)))
$$;
revoke all on function public.six_remote_peut_ecrire(uuid) from public;
grant execute on function public.six_remote_peut_ecrire(uuid) to authenticated;

create or replace function public.six_remote_lire(p_lien uuid)
returns table(titre text, messages jsonb, editeur boolean)
language sql stable security definer set search_path = '' as $$
  select r.titre,r.messages,public.six_remote_peut_ecrire(r.lien)
  from public.six_remotes r where r.lien=p_lien and (r.public_lecture or public.six_remote_peut_ecrire(r.lien))
$$;
revoke all on function public.six_remote_lire(uuid) from public;
grant execute on function public.six_remote_lire(uuid) to anon, authenticated;

create table if not exists public.six_remote_envois (
  id uuid primary key, lien uuid not null references public.six_remotes on delete cascade,
  texte text not null check(length(trim(texte)) between 1 and 20000),
  etat text not null default 'attente' check (etat in ('attente','traitement','termine','echec')),
  cree timestamptz not null default now()
);
alter table public.six_remote_envois add column if not exists pris timestamptz;
alter table public.six_remote_envois enable row level security;
revoke all on public.six_remote_envois from public,anon,authenticated;
grant insert(id,lien,texte) on public.six_remote_envois to authenticated;
drop policy if exists remote_ecrire on public.six_remote_envois;
create policy remote_ecrire on public.six_remote_envois for insert to authenticated with check
(public.six_remote_peut_ecrire(lien));
grant select(id,lien,etat), update(etat) on public.six_remote_envois to authenticated;
drop policy if exists remote_suivre on public.six_remote_envois;
create policy remote_suivre on public.six_remote_envois for select to authenticated using
(public.six_remote_peut_ecrire(lien));
drop policy if exists remote_terminer on public.six_remote_envois;
create policy remote_terminer on public.six_remote_envois for update to authenticated using
(etat='traitement' and exists(select 1 from public.six_remotes r where r.lien=six_remote_envois.lien and r.proprietaire=auth.uid()))
with check (etat in ('termine','echec') and exists(select 1 from public.six_remotes r where r.lien=six_remote_envois.lien and r.proprietaire=auth.uid()));
create index if not exists six_remote_attente on public.six_remote_envois(lien,cree) where etat='attente';
create or replace function public.six_remote_prendre(p_lien uuid) returns table(id uuid,texte text)
language sql volatile security definer set search_path = '' as $$
  -- Reprend aussi un message resté « traitement » sans nouvelles depuis 3 minutes (poste fermé en route).
  update public.six_remote_envois t set etat='traitement', pris=now() where t.id=(
    select e.id from public.six_remote_envois e join public.six_remotes r on r.lien=e.lien
    where e.lien=p_lien and r.proprietaire=auth.uid() and not r.public_lecture
      and (e.etat='attente' or (e.etat='traitement' and coalesce(e.pris, e.cree) < now() - interval '3 minutes'))
    order by e.cree,e.id limit 1 for update of e skip locked
  ) returning t.id,t.texte
$$;
revoke all on function public.six_remote_prendre(uuid) from public;
grant execute on function public.six_remote_prendre(uuid) to authenticated;

-- Le poste qui traite un message le signale toutes les minutes : tant qu'il vit, personne ne le reprend.
create or replace function public.six_remote_prolonger(p_id uuid) returns void
language sql volatile security definer set search_path = '' as $$
  update public.six_remote_envois t set pris=now() from public.six_remotes r
  where t.id=p_id and t.etat='traitement' and r.lien=t.lien and r.proprietaire=auth.uid()
$$;
revoke all on function public.six_remote_prolonger(uuid) from public;
grant execute on function public.six_remote_prolonger(uuid) to authenticated;
commit;
