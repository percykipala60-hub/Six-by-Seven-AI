-- À appliquer sur le projet Supabase utilisé pour tester la connexion Gmail.
create table if not exists public.six_gmail(
 user_id uuid primary key references auth.users(id) on delete cascade,
 jeton text not null
);
alter table public.six_gmail enable row level security;
revoke all on public.six_gmail from public,anon,authenticated;
grant select,insert,update,delete on public.six_gmail to service_role;
