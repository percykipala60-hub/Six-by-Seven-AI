-- Cloud de Six : partager un élément (une discussion) avec d'autres personnes, par lien.
-- À exécuter dans Supabase (SQL Editor) : autonome, ne supprime aucune donnée et peut être relancé.
-- Il crée au besoin la table premium et la fonction premium_actif, à l'identique de setup_premium_supabase.sql.
--
-- Règles :
-- - créer un partage demande un abonnement Premium actif (comme la copie de la mémoire sur le compte) ;
-- - chaque compte voit et supprime ses propres partages ;
-- - une personne qui a le lien lit CE partage seulement, par la fonction lire_partage : la table n'est jamais
--   lisible en entier (personne ne peut lister les partages des autres) ;
-- - un partage expire (30 jours par défaut) ; son contenu est borné (200 Ko).

-- 0. Premium (si setup_premium_supabase.sql n'a pas encore été exécuté) : lu par les règles du Cloud.
create table if not exists public.premium (
  user_id uuid primary key references auth.users (id) on delete cascade,
  jusqu_a timestamptz not null,
  maj timestamptz not null default now()
);

alter table public.premium enable row level security;
revoke all on table public.premium from anon, authenticated;
grant select on table public.premium to authenticated;

drop policy if exists "Chaque compte lit son premium" on public.premium;
create policy "Chaque compte lit son premium"
  on public.premium for select to authenticated
  using (auth.uid() = user_id);

create or replace function public.premium_actif(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.premium where user_id = p_user and jusqu_a > now());
$$;

revoke all on function public.premium_actif(uuid) from public, anon;
grant execute on function public.premium_actif(uuid) to authenticated, service_role;

-- 1. Partages
create table if not exists public.partages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null default 'discussion' check (type in ('discussion')),
  titre text not null check (char_length(titre) between 1 and 200),
  contenu jsonb not null check (pg_column_size(contenu) <= 200000),
  cree_le timestamptz not null default now(),
  expire_le timestamptz not null default now() + interval '30 days'
);

create index if not exists partages_user_id on public.partages (user_id, cree_le desc);

alter table public.partages enable row level security;

drop policy if exists "Chaque compte voit ses partages" on public.partages;
drop policy if exists "Premium : créer un partage" on public.partages;
drop policy if exists "Chaque compte supprime ses partages" on public.partages;

create policy "Chaque compte voit ses partages"
  on public.partages for select to authenticated
  using (auth.uid() = user_id);

create policy "Premium : créer un partage"
  on public.partages for insert to authenticated
  with check (auth.uid() = user_id and public.premium_actif(auth.uid()));

create policy "Chaque compte supprime ses partages"
  on public.partages for delete to authenticated
  using (auth.uid() = user_id);

-- Lecture d'un partage par son lien (identifiant aléatoire), même sans compte : un seul partage, non expiré.
create or replace function public.lire_partage(p_id uuid)
returns table (titre text, type text, contenu jsonb, cree_le timestamptz, expire_le timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.titre, p.type, p.contenu, p.cree_le, p.expire_le
  from public.partages p
  where p.id = p_id and p.expire_le > now();
$$;

revoke all on function public.lire_partage(uuid) from public;
grant execute on function public.lire_partage(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
