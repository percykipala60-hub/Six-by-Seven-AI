-- ============================================================
-- SIX — PREMIUM ET PAIEMENTS (MaishaPay)
-- À exécuter dans Supabase : SQL Editor -> New Query -> Run
-- (Après setup_complet_supabase.sql. Ce script ne supprime aucune donnée et peut être relancé.)
-- ============================================================

-- 1. Premium de chaque compte : actif tant que `jusqu_a` est dans le futur.
create table if not exists public.premium (
  user_id uuid primary key references auth.users (id) on delete cascade,
  jusqu_a timestamptz not null,
  maj timestamptz not null default now()
);

alter table public.premium enable row level security;
revoke all on table public.premium from anon, authenticated;
-- Chaque compte peut LIRE son propre premium (pour l'afficher). Seul le serveur (clé service_role) l'écrit.
grant select on table public.premium to authenticated;

drop policy if exists "Chaque compte lit son premium" on public.premium;
create policy "Chaque compte lit son premium"
  on public.premium
  for select
  to authenticated
  using (auth.uid() = user_id);

-- 2. Paiements : une ligne par tentative. Jamais lisible ni modifiable depuis l'app (serveur seulement).
create table if not exists public.paiements (
  reference text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  offre text not null check (offre in ('7j', '30j')),
  jours integer not null check (jours > 0),
  montant numeric not null check (montant > 0),
  devise text not null,
  canal text not null check (canal in ('mobile', 'carte')),
  operateur text,
  statut text not null default 'EN_ATTENTE'
    check (statut in ('EN_ATTENTE', 'REUSSI', 'ECHOUE')),
  maishapay_id text,
  cree timestamptz not null default now(),
  maj timestamptz not null default now()
);

create index if not exists idx_paiements_user on public.paiements (user_id, cree desc);

alter table public.paiements enable row level security;
revoke all on table public.paiements from anon, authenticated;

-- 3. Activation atomique : passe le paiement à REUSSI et prolonge le premium, une seule fois par paiement.
--    Relancée pour un paiement déjà réussi, elle ne prolonge rien (renvoie null).
create or replace function public.activer_paiement(p_reference text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_jours integer;
  v_fin timestamptz;
begin
  update public.paiements
     set statut = 'REUSSI', maj = now()
   where reference = p_reference and statut <> 'REUSSI'
   returning user_id, jours into v_user, v_jours;

  if v_user is null then
    return null;
  end if;

  insert into public.premium as p (user_id, jusqu_a, maj)
  values (v_user, now() + make_interval(days => v_jours), now())
  on conflict (user_id) do update
    set jusqu_a = greatest(p.jusqu_a, now()) + make_interval(days => v_jours),
        maj = now()
  returning jusqu_a into v_fin;

  return v_fin;
end;
$$;

revoke all on function public.activer_paiement(text) from public, anon, authenticated;
grant execute on function public.activer_paiement(text) to service_role;

-- 4. La copie de la mémoire sur le compte devient réservée au premium.
--    Lire et effacer sa copie restent toujours possibles ; seuls l'envoi et la mise à jour demandent le premium.
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

drop policy if exists "Chaque compte gère sa mémoire" on public.memoires;
drop policy if exists "Chaque compte lit sa mémoire" on public.memoires;
drop policy if exists "Chaque compte efface sa mémoire" on public.memoires;
drop policy if exists "Premium : envoyer sa mémoire" on public.memoires;
drop policy if exists "Premium : mettre à jour sa mémoire" on public.memoires;

create policy "Chaque compte lit sa mémoire"
  on public.memoires for select to authenticated
  using (auth.uid() = user_id);

create policy "Chaque compte efface sa mémoire"
  on public.memoires for delete to authenticated
  using (auth.uid() = user_id);

create policy "Premium : envoyer sa mémoire"
  on public.memoires for insert to authenticated
  with check (auth.uid() = user_id and public.premium_actif(auth.uid()));

create policy "Premium : mettre à jour sa mémoire"
  on public.memoires for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.premium_actif(auth.uid()));

notify pgrst, 'reload schema';
