-- Remote en direct (privé, même compte) : les discussions du PC et ce que Six y fait apparaissent d'eux-mêmes
-- sur le téléphone, sans lien. Supabase Realtime diffuse les nouvelles lignes ; les règles d'accès (RLS) font que
-- chaque compte ne reçoit que les siennes. Le script peut être relancé sans risque.
begin;

-- Une ligne par discussion suivie : titre, appareil, Six au travail ou non, et le fil à afficher.
create table if not exists public.six_direct_discussions (
  proprietaire uuid not null default auth.uid() references auth.users on delete cascade,
  discussion text not null check (length(discussion) between 1 and 100),
  titre text not null default '' check (length(titre) <= 200),
  appareil text not null default '' check (length(appareil) <= 80),
  occupe boolean not null default false,
  messages jsonb not null default '[]'
    check (jsonb_typeof(messages) = 'array' and octet_length(messages::text) <= 4000000),
  maj timestamptz not null default now(),
  primary key (proprietaire, discussion)
);
-- Le téléphone demande l'arrêt de la tâche en cours : le PC le voit et arrête Six.
alter table public.six_direct_discussions add column if not exists arret timestamptz;
alter table public.six_direct_discussions enable row level security;
revoke all on public.six_direct_discussions from public, anon, authenticated;
grant select, delete on public.six_direct_discussions to authenticated;
grant insert (discussion, titre, appareil, occupe, messages, maj),
  update (discussion, titre, appareil, occupe, messages, maj, arret) on public.six_direct_discussions to authenticated;
drop policy if exists direct_discussions_proprietaire on public.six_direct_discussions;
create policy direct_discussions_proprietaire on public.six_direct_discussions to authenticated
  using (proprietaire = auth.uid()) with check (proprietaire = auth.uid());

-- Le flux des actions : début, chaque action (format lib/actions-agent.ts), plan, fin ou erreur.
create table if not exists public.six_direct_evenements (
  id bigint generated always as identity primary key,
  proprietaire uuid not null default auth.uid() references auth.users on delete cascade,
  discussion text not null check (length(discussion) between 1 and 100),
  genre text not null check (genre in ('debut', 'action', 'plan', 'fin', 'erreur')),
  donnees jsonb not null default '{}' check (octet_length(donnees::text) <= 20000),
  cree timestamptz not null default now()
);
create index if not exists six_direct_evenements_fil
  on public.six_direct_evenements (proprietaire, discussion, id);
alter table public.six_direct_evenements enable row level security;
revoke all on public.six_direct_evenements from public, anon, authenticated;
grant select, delete on public.six_direct_evenements to authenticated;
grant insert (discussion, genre, donnees) on public.six_direct_evenements to authenticated;
drop policy if exists direct_evenements_proprietaire on public.six_direct_evenements;
create policy direct_evenements_proprietaire on public.six_direct_evenements to authenticated
  using (proprietaire = auth.uid()) with check (proprietaire = auth.uid());

-- On ne garde que deux jours d'événements (de quoi rattraper un téléphone resté éteint).
create or replace function public.six_direct_menage() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.six_direct_evenements where cree < now() - interval '2 days';
  return null;
end $$;
revoke all on function public.six_direct_menage() from public;
drop trigger if exists six_direct_menage on public.six_direct_evenements;
create trigger six_direct_menage after insert on public.six_direct_evenements
  for each statement execute function public.six_direct_menage();

-- Diffusion en direct par Supabase Realtime.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                 and schemaname = 'public' and tablename = 'six_direct_evenements') then
    alter publication supabase_realtime add table public.six_direct_evenements;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                 and schemaname = 'public' and tablename = 'six_direct_discussions') then
    alter publication supabase_realtime add table public.six_direct_discussions;
  end if;
end $$;

commit;
