-- Sécurité des connexions de Six : alerte e-mail à chaque connexion (avec blocage d'un appareil) et connexion
-- par code QR (comme Steam). À exécuter dans Supabase (SQL Editor) : autonome, ne supprime aucune donnée et peut
-- être relancé.
--
-- 1. Appareils : chaque connexion (mot de passe, Google, Apple, code QR) enregistre l'appareil et sa session.
--    L'e-mail d'alerte contient un lien unique ; « Ce n'était pas moi » bloque CET appareil et coupe sa session.
--    Seul le serveur de Six (clé service_role) écrit ici ; personne ne lit la table depuis l'app.
-- 2. Codes QR : l'appareil qui veut se connecter crée une demande (identifiant + secret, 2 minutes) et l'affiche
--    en QR ; un appareil déjà connecté la scanne et l'approuve (par le serveur de Six) ; le premier appareil reçoit
--    alors un jeton de connexion à usage unique. Tout passe par des fonctions : la table n'est jamais lisible.

create extension if not exists pgcrypto with schema extensions;

-- ---------- 1. Appareils et blocage ----------

create table if not exists public.six_appareils (
  user_id uuid not null references auth.users (id) on delete cascade,
  appareil text not null check (char_length(appareil) between 8 and 64),
  nom text not null default '' check (char_length(nom) <= 120),
  methode text not null default '' check (char_length(methode) <= 30),
  session_id uuid,
  jeton_hash text unique,
  bloque boolean not null default false,
  confirme boolean not null default false,
  cree_le timestamptz not null default now(),
  derniere_connexion timestamptz not null default now(),
  primary key (user_id, appareil)
);

alter table public.six_appareils enable row level security;
revoke all on table public.six_appareils from anon, authenticated;

-- « Ce n'était pas moi » : bloque l'appareil et supprime sa session (il ne peut plus la renouveler).
-- « C'était moi » : marque la connexion comme confirmée. Le lien ne sert qu'une fois.
create or replace function public.six_reponse_alerte(p_jeton text, p_bloquer boolean)
returns table (nom text, methode text, bloque boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v public.six_appareils;
begin
  select * into v from public.six_appareils a
  where a.jeton_hash = encode(extensions.digest(p_jeton, 'sha256'), 'hex');
  if not found then
    return;
  end if;
  update public.six_appareils a
  set bloque = p_bloquer, confirme = not p_bloquer, jeton_hash = null
  where a.user_id = v.user_id and a.appareil = v.appareil;
  if p_bloquer and v.session_id is not null then
    delete from auth.sessions s where s.id = v.session_id;
  end if;
  return query select v.nom, v.methode, p_bloquer;
end;
$$;

revoke all on function public.six_reponse_alerte(text, boolean) from public, anon, authenticated;
grant execute on function public.six_reponse_alerte(text, boolean) to service_role;

-- ---------- 2. Connexion par code QR ----------

create table if not exists public.six_connexions_qr (
  id uuid primary key default gen_random_uuid(),
  secret_hash text not null,
  appareil text not null default '' check (char_length(appareil) <= 120),
  statut text not null default 'attente' check (statut in ('attente', 'approuve', 'consomme', 'refuse')),
  user_id uuid references auth.users (id) on delete cascade,
  token_hash text,
  cree_le timestamptz not null default now(),
  expire_le timestamptz not null default now() + interval '2 minutes'
);

create index if not exists six_connexions_qr_expire on public.six_connexions_qr (expire_le);

alter table public.six_connexions_qr enable row level security;
revoke all on table public.six_connexions_qr from anon, authenticated;

-- L'appareil qui veut se connecter crée sa demande (renvoie l'identifiant et le secret à mettre dans le QR).
create or replace function public.six_qr_creer(p_appareil text)
returns table (id uuid, secret text, expire_le timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text := encode(extensions.gen_random_bytes(24), 'hex');
  v public.six_connexions_qr;
begin
  delete from public.six_connexions_qr q where q.expire_le < now() - interval '10 minutes';
  insert into public.six_connexions_qr (secret_hash, appareil)
  values (encode(extensions.digest(v_secret, 'sha256'), 'hex'), left(coalesce(p_appareil, ''), 120))
  returning * into v;
  return query select v.id, v_secret, v.expire_le;
end;
$$;

-- L'appareil qui scanne lit la demande (pour afficher « Connecter Windows · Chrome ? »).
create or replace function public.six_qr_lire(p_id uuid, p_secret text)
returns table (appareil text, statut text, expire_le timestamptz)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select q.appareil,
         case when q.statut = 'attente' and q.expire_le < now() then 'expire' else q.statut end,
         q.expire_le
  from public.six_connexions_qr q
  where q.id = p_id and q.secret_hash = encode(extensions.digest(p_secret, 'sha256'), 'hex');
$$;

-- L'appareil qui attend récupère son jeton de connexion, une seule fois, puis la demande est consommée.
create or replace function public.six_qr_attendre(p_id uuid, p_secret text)
returns table (statut text, token_hash text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v public.six_connexions_qr;
begin
  select * into v from public.six_connexions_qr q
  where q.id = p_id and q.secret_hash = encode(extensions.digest(p_secret, 'sha256'), 'hex');
  if not found then
    return query select 'inconnu'::text, null::text;
    return;
  end if;
  if v.statut = 'approuve' then
    update public.six_connexions_qr q set statut = 'consomme', token_hash = null where q.id = v.id;
    return query select 'approuve'::text, v.token_hash;
    return;
  end if;
  if v.statut = 'attente' and v.expire_le < now() then
    return query select 'expire'::text, null::text;
    return;
  end if;
  return query select v.statut, null::text;
end;
$$;

revoke all on function public.six_qr_creer(text) from public;
revoke all on function public.six_qr_lire(uuid, text) from public;
revoke all on function public.six_qr_attendre(uuid, text) from public;
grant execute on function public.six_qr_creer(text) to anon, authenticated;
grant execute on function public.six_qr_lire(uuid, text) to anon, authenticated;
grant execute on function public.six_qr_attendre(uuid, text) to anon, authenticated;
