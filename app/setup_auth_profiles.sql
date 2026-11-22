-- ============================================================
-- SIX — COMPLÉMENT D'AUTHENTIFICATION & PROFILS (NOUVEAU SCRIPT)
-- À exécuter dans Supabase : SQL Editor -> New Query -> Run
-- (Ce script s'exécute en complément de setup_complet_supabase.sql)
-- ============================================================

-- 1. Table des profils utilisateurs
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  prenom text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index pour recherches rapides
create index if not exists idx_profiles_id on public.profiles (id);
create index if not exists idx_profiles_email on public.profiles (email);

-- 2. Sécurité RLS sur la table profiles
alter table public.profiles enable row level security;

-- Interdire tout accès anonyme public
revoke all on table public.profiles from anon;

-- Accès complet aux utilisateurs authentifiés pour leur propre profil
grant select, insert, update on table public.profiles to authenticated;

drop policy if exists "Chaque utilisateur gère son profil" on public.profiles;
create policy "Chaque utilisateur gère son profil"
  on public.profiles
  for all
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 3. Fonction déclencheur automatique lors de la création d'un utilisateur (Sign Up)
-- Crée automatiquement son profil et son espace mémoire synchronisé.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Profil
  insert into public.profiles (id, email, prenom)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'prenom', '')
  )
  on conflict (id) do update set
    email = excluded.email,
    prenom = coalesce(nullif(excluded.prenom, ''), profiles.prenom),
    updated_at = now();

  -- Mémoire synchronisée (si la table memoires existe)
  insert into public.memoires (user_id, donnees)
  values (new.id, '{"choix": [], "contacts": [], "suivis": []}'::jsonb)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Attachement du trigger sur auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 4. Remplissage rétroactif pour les comptes déjà existants dans auth.users
insert into public.profiles (id, email, prenom)
select
  id,
  email,
  coalesce(raw_user_meta_data->>'prenom', '')
from auth.users
on conflict (id) do update set
  email = excluded.email,
  prenom = coalesce(nullif(excluded.prenom, ''), profiles.prenom);

insert into public.memoires (user_id, donnees)
select id, '{"choix": [], "contacts": [], "suivis": []}'::jsonb
from auth.users
on conflict (user_id) do nothing;

-- 5. Notification pour recharger le cache d'API Supabase
notify pgrst, 'reload schema';
