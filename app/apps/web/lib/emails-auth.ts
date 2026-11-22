import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * E-mails de connexion de Six, envoyés par l'app elle-même (« Send Email Hook » de Supabase) :
 * Supabase nous transmet chaque demande signée, on vérifie la signature, on applique la limite
 * par personne, puis on envoie par Resend depuis noreply@sixbysevenai.com.
 */

export type ActionEmail =
  'signup' | 'magiclink' | 'recovery' | 'reauthentication' | 'invite' | 'email_change' | 'email';

export type DemandeEmail = {
  user: { id: string; email: string };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: ActionEmail;
    site_url: string;
  };
};

/* ---------- Limite par personne ---------- */

/** Au plus 5 e-mails par heure et 10 par jour pour une même adresse (en plus d'1 par minute côté Supabase). */
export const LIMITE_HEURE = 5;
export const LIMITE_JOUR = 10;
const HEURE = 3_600_000;
const JOUR = 24 * HEURE;
const envois = new Map<string, number[]>();

/** Vrai si cette adresse a déjà reçu trop d'e-mails ; sinon compte celui-ci. */
export function limiteAtteinte(email: string, maintenant = Date.now()): boolean {
  const cle = email.trim().toLowerCase();
  const recents = (envois.get(cle) ?? []).filter((t) => maintenant - t < JOUR);
  const derniereHeure = recents.filter((t) => maintenant - t < HEURE).length;
  if (derniereHeure >= LIMITE_HEURE || recents.length >= LIMITE_JOUR) {
    envois.set(cle, recents);
    return true;
  }
  recents.push(maintenant);
  envois.set(cle, recents);
  // Ménage : la table ne grossit pas indéfiniment.
  if (envois.size > 10_000) {
    for (const [k, v] of envois) if (!v.some((t) => maintenant - t < JOUR)) envois.delete(k);
  }
  return false;
}

/** Pour les tests. */
export function oublierEnvois(): void {
  envois.clear();
}

/* ---------- Signature Supabase (Standard Webhooks) ---------- */

/**
 * Vérifie l'en-tête webhook-signature : HMAC-SHA256 de « id.horodatage.corps » avec le secret
 * du hook (« v1,whsec_<base64> »). Refuse aussi les demandes de plus de 5 minutes.
 */
export function signatureValide(
  corps: string,
  entetes: { id: string | null; horodatage: string | null; signature: string | null },
  secret: string,
  maintenant = Date.now(),
): boolean {
  const { id, horodatage, signature } = entetes;
  if (!id || !horodatage || !signature || !secret) return false;
  const t = Number(horodatage);
  if (!Number.isFinite(t) || Math.abs(maintenant / 1000 - t) > 300) return false;
  const brut = secret.replace(/^v1,/, '').replace(/^whsec_/, '');
  const cle = Buffer.from(brut, 'base64');
  const attendu = createHmac('sha256', cle).update(`${id}.${horodatage}.${corps}`).digest();
  return signature.split(' ').some((morceau) => {
    const [version, valeur] = morceau.split(',');
    if (version !== 'v1' || !valeur) return false;
    const recu = Buffer.from(valeur, 'base64');
    return recu.length === attendu.length && timingSafeEqual(recu, attendu);
  });
}

/* ---------- Contenu des e-mails ---------- */

const CADRE =
  "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#111;line-height:1.55;font-size:15px";

function page(contenu: string, piedDePage: string): string {
  return `<div style="${CADRE}"><p style="font-size:18px;font-weight:600;margin:0 0 24px">Six</p>${contenu}<p style="font-size:13px;color:#777;margin:32px 0 0">${piedDePage}</p></div>`;
}

const echapper = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function blocCode(code: string): string {
  return `<p style="font-size:30px;font-weight:600;letter-spacing:6px;margin:0 0 20px">${echapper(code)}</p>`;
}

const p = (texte: string) => `<p style="margin:0 0 20px">${texte}</p>`;

/** Lien de vérification Supabase (réinitialisation du mot de passe). */
function lienVerification(
  urlSupabase: string,
  d: DemandeEmail['email_data'],
  type: string,
): string {
  const u = new URL('/auth/v1/verify', urlSupabase);
  u.searchParams.set('token', d.token_hash);
  u.searchParams.set('type', type);
  if (d.redirect_to) u.searchParams.set('redirect_to', d.redirect_to);
  return u.toString();
}

/** Objet et contenu en français pour chaque type d'e-mail. Null : type non utilisé par Six. */
export function composerEmail(
  d: DemandeEmail['email_data'],
  urlSupabase: string,
): { objet: string; html: string } | null {
  switch (d.email_action_type) {
    case 'signup':
      return {
        objet: 'Bienvenue sur Six',
        html: page(
          p(
            "Bienvenue. Ton compte n'est pas encore actif : confirme d'abord que cette adresse est bien la tienne.",
          ) +
            '<p style="margin:0 0 8px">Entre ce code dans l\'app :</p>' +
            blocCode(d.token) +
            p("Il ne sert qu'une fois et expire dans 10 minutes. Ne le donne à personne.") +
            p(
              'Six t’aide à comprendre un message et à choisir quoi répondre. Tes conversations restent sur ton téléphone, sauf si tu choisis de les garder sur ton compte.',
            ),
          "Tu n'as pas créé de compte ? Ignore cet e-mail : sans ce code, rien ne sera activé.",
        ),
      };
    case 'magiclink':
    case 'email':
      return {
        objet: 'Ton code de connexion Six',
        html: page(
          '<p style="margin:0 0 8px">Voici ton code pour terminer ta connexion :</p>' +
            blocCode(d.token) +
            p(
              "Entre-le dans l'app. Il ne sert qu'une fois et expire dans 10 minutes. Ne le donne à personne : Six ne te le demandera jamais par message ou par téléphone.",
            ),
          "Ce n'est pas toi ? Quelqu'un connaît peut-être ton mot de passe : change-le dès que possible dans Réglages, Compte.",
        ),
      };
    case 'reauthentication':
      return {
        objet: 'Code pour changer ton mot de passe Six',
        html: page(
          '<p style="margin:0 0 8px">Voici ton code pour changer le mot de passe de ton compte :</p>' +
            blocCode(d.token) +
            p(
              "Entre-le dans l'app avec ton mot de passe actuel. Il ne sert qu'une fois et expire dans 10 minutes. Ne le donne à personne.",
            ),
          "Ce n'est pas toi ? Ne fais rien : sans ce code et sans ton mot de passe actuel, personne ne peut le changer.",
        ),
      };
    case 'recovery':
      return {
        objet: 'Changer ton mot de passe Six',
        html: page(
          p('Tu as demandé à changer le mot de passe de ton compte.') +
            `<p style="margin:0 0 20px"><a href="${echapper(lienVerification(urlSupabase, d, 'recovery'))}" style="color:#111;font-weight:600">Choisir un nouveau mot de passe</a></p>` +
            p("Ce lien ne sert qu'une fois et expire dans 10 minutes."),
          "Tu n'as rien demandé ? Ignore cet e-mail, ton mot de passe actuel reste valable.",
        ),
      };
    default:
      return null;
  }
}

/* ---------- Envoi par Resend ---------- */

export async function envoyerParResend(
  cle: string,
  a: string,
  objet: string,
  html: string,
): Promise<boolean> {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_EXPEDITEUR || 'Six by Seven AI <noreply@sixbysevenai.com>',
      to: [a],
      subject: objet,
      html,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  return r.ok;
}
