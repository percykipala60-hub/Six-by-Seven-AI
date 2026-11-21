-- Mémoire synchronisée de Six : chaque compte ne peut lire et modifier que sa propre ligne.
create table if not exists public.memoires (
  user_id uuid primary key references auth.users (id) on delete cascade,
  donnees jsonb not null default '{"choix": [], "contacts": [], "suivis": []}'::jsonb
    check (jsonb_typeof(donnees) = 'object'),
  maj timestamptz not null default now()
);

alter table public.memoires enable row level security;
revoke all on table public.memoires from anon;
grant select, insert, update, delete on table public.memoires to authenticated;

drop policy if exists "Chaque compte gère sa mémoire" on public.memoires;
create policy "Chaque compte gère sa mémoire"
  on public.memoires
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
