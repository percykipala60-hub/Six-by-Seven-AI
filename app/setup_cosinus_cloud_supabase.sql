-- Cosinus dans le Cloud : des environnements en ligne (comme dans Claude Code), avec leurs fichiers, liés au compte.
-- À exécuter dans Supabase (SQL Editor) : autonome, ne supprime aucune donnée et peut être relancé.
--
-- Règles :
-- - chaque compte a un environnement cloud « Mon cloud », créé automatiquement à l'inscription (et ici pour les
--   comptes qui existent déjà) ;
-- - un environnement peut être lié à un dépôt GitHub public (owner/depot) : ses fichiers y sont importés ;
-- - chaque compte ne voit et ne modifie que ses environnements et ses fichiers (row level security) ;
-- - un fichier fait 10 Mo au plus, un compte 200 Mo au plus (gratuit pour l'instant ; Premium plus tard).

-- 1. Environnements cloud
create table if not exists public.cosinus_environnements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 60),
  depot_github text check (depot_github is null or depot_github ~ '^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$'),
  branche text check (branche is null or char_length(branche) between 1 and 100),
  par_defaut boolean not null default false,
  cree_le timestamptz not null default now(),
  maj timestamptz not null default now()
);

create index if not exists cosinus_environnements_user on public.cosinus_environnements (user_id, maj desc);
create unique index if not exists cosinus_environnements_un_defaut
  on public.cosinus_environnements (user_id) where par_defaut;

alter table public.cosinus_environnements enable row level security;
revoke all on table public.cosinus_environnements from anon;
grant select, insert, update, delete on table public.cosinus_environnements to authenticated;

drop policy if exists "Chaque compte gère ses environnements cloud" on public.cosinus_environnements;
create policy "Chaque compte gère ses environnements cloud"
  on public.cosinus_environnements
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. Fichiers des environnements cloud (contenu en base64)
create table if not exists public.cosinus_fichiers (
  environnement uuid not null references public.cosinus_environnements (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  chemin text not null check (
    char_length(chemin) between 1 and 400
    and left(chemin, 1) <> '/'
    and chemin !~ '(^|/)\.\.(/|$)'
    and chemin !~ '\\'
  ),
  contenu text not null,
  taille integer not null check (taille between 0 and 10485760),
  maj timestamptz not null default now(),
  primary key (environnement, chemin)
);

create index if not exists cosinus_fichiers_user on public.cosinus_fichiers (user_id);

alter table public.cosinus_fichiers enable row level security;
revoke all on table public.cosinus_fichiers from anon;
grant select, insert, update, delete on table public.cosinus_fichiers to authenticated;

drop policy if exists "Chaque compte gère ses fichiers cloud" on public.cosinus_fichiers;
create policy "Chaque compte gère ses fichiers cloud"
  on public.cosinus_fichiers
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.cosinus_environnements e
      where e.id = environnement and e.user_id = auth.uid()
    )
  );

-- Place utilisée par un compte : 200 Mo au plus (vérifié à chaque écriture).
create or replace function public.cosinus_verifier_place()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  total bigint;
begin
  select coalesce(sum(taille), 0) into total
  from public.cosinus_fichiers
  where user_id = new.user_id
    and not (environnement = new.environnement and chemin = new.chemin);
  if total + new.taille > 209715200 then
    raise exception 'Place du Cloud épuisée (200 Mo).' using errcode = 'P0001';
  end if;
  new.maj := now();
  return new;
end;
$$;

drop trigger if exists cosinus_place on public.cosinus_fichiers;
create trigger cosinus_place
  before insert or update on public.cosinus_fichiers
  for each row execute function public.cosinus_verifier_place();

-- 3. « Mon cloud » créé automatiquement pour chaque nouveau compte
create or replace function public.cosinus_creer_cloud()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.cosinus_environnements (user_id, nom, par_defaut)
  values (new.id, 'Mon cloud', true)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists cosinus_cloud_a_l_inscription on auth.users;
create trigger cosinus_cloud_a_l_inscription
  after insert on auth.users
  for each row execute function public.cosinus_creer_cloud();

-- Comptes déjà inscrits : leur « Mon cloud » est créé maintenant.
insert into public.cosinus_environnements (user_id, nom, par_defaut)
select u.id, 'Mon cloud', true
from auth.users u
where not exists (
  select 1 from public.cosinus_environnements e where e.user_id = u.id and e.par_defaut
);
