-- ============================================================
-- SIX — INITIALISATION COMPLÈTE DE LA BASE DE DONNÉES SUPABASE
-- À exécuter dans Supabase : SQL Editor -> New Query -> Run
-- ============================================================

-- 1. Nettoyage / Réinitialisation propre
drop policy if exists "Chaque compte gère sa mémoire" on public.memoires;
drop table if exists public.memoires cascade;

-- 2. Création de la table de mémoire synchronisée de Six
create table public.memoires (
  user_id uuid primary key references auth.users (id) on delete cascade,
  donnees jsonb not null default '{"choix": [], "contacts": [], "suivis": []}'::jsonb
    check (jsonb_typeof(donnees) = 'object'),
  maj timestamptz not null default now()
);

-- Index pour accélérer les requêtes par utilisateur
create index if not exists idx_memoires_user_id on public.memoires (user_id);

-- 3. Activation de la sécurité stricte (Row Level Security)
alter table public.memoires enable row level security;

-- Interdit tout accès aux invités anonymes (anon)
revoke all on table public.memoires from anon;

-- Autorise les utilisateurs connectés
grant select, insert, update, delete on table public.memoires to authenticated;

-- Règle RLS : chaque utilisateur ne peut lire/modifier que sa propre ligne
create policy "Chaque compte gère sa mémoire"
  on public.memoires
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. Rechargement du cache du schéma de l'API Supabase
notify pgrst, 'reload schema';
