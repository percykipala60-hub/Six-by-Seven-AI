-- Projets et artefacts de Six, copiés sur le compte seulement si la personne a autorisé la synchronisation de sa
-- mémoire (lib/compte.ts, lib/projets-sync.ts). Sans cette autorisation, ils restent sur l'appareil.
-- Une ligne par projet ou par artefact ; chaque compte ne voit, ne crée, ne modifie et n'efface que ses lignes.
-- À exécuter une fois dans Supabase (SQL Editor), comme 20261017_memoires.sql.

create table if not exists public.projets (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,40}$'),
  donnees jsonb not null
    check (jsonb_typeof(donnees) = 'object' and pg_column_size(donnees) <= 300000),
  -- Date de modification sur l'appareil (millisecondes) : la version la plus récente gagne à la fusion.
  maj bigint not null,
  primary key (user_id, id)
);

create table if not exists public.artefacts (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_:-]{1,60}$'),
  projet_id text check (projet_id is null or projet_id ~ '^[A-Za-z0-9_-]{1,40}$'),
  donnees jsonb not null
    check (jsonb_typeof(donnees) = 'object' and pg_column_size(donnees) <= 1500000),
  maj bigint not null,
  primary key (user_id, id)
);

create index if not exists artefacts_projet on public.artefacts (user_id, projet_id);

alter table public.projets enable row level security;
alter table public.artefacts enable row level security;
revoke all on table public.projets from anon;
revoke all on table public.artefacts from anon;
grant select, insert, update, delete on table public.projets to authenticated;
grant select, insert, update, delete on table public.artefacts to authenticated;

drop policy if exists "Chaque compte gère ses projets" on public.projets;
create policy "Chaque compte gère ses projets"
  on public.projets
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Chaque compte gère ses artefacts" on public.artefacts;
create policy "Chaque compte gère ses artefacts"
  on public.artefacts
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
