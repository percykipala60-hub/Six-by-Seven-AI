create table public.photos_profil (
  user_id uuid primary key references auth.users(id) on delete cascade,
  photo text check (photo is null or (octet_length(photo) <= 131072 and photo ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'))
);

alter table public.photos_profil enable row level security;
revoke all on public.photos_profil from anon, authenticated;
grant select, insert, update on public.photos_profil to authenticated;

create policy "Lire et modifier sa photo"
on public.photos_profil
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
