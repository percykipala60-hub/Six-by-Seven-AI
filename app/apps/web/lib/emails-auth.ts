import { createHmac, timingSafeEqual } from 'node:crypto';
import { ENTREPRISE, PRODUIT } from '@/lib/marque';

/**
 * E-mails de connexion de Six, envoyés par l'app elle-même (« Send Email Hook » de Supabase) :
 * Supabase nous transmet chaque demande signée, on vérifie la signature, on applique la limite
 * par personne, puis on envoie par Resend depuis noreply@sixbysevenai.com.
 */

export type ActionEmail =
  | 'signup'
  | 'magiclink'
  | 'recovery'
  | 'reauthentication'
  | 'invite'
  | 'email_change'
  | 'email'
  | 'password_changed_notification';

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

/*
 * Ton : vouvoiement, phrases courtes et claires, une seule action par e-mail. Les e-mails de code ne contiennent
 * aucun lien (on n'apprend pas aux gens à cliquer sur des liens reçus) ; seul l'e-mail de réinitialisation en a un.
 */

/** Logo de l'app, en PNG hébergé sur le site (beaucoup de boîtes mail n'affichent pas le SVG). */
const LOGO = 'https://app.sixbysevenai.com/icon-192.png';

const POLICE = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const echapper = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const p = (texte: string) =>
  `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1f2430">${texte}</p>`;

function page(titre: string, contenu: string, securite: string): string {
  return (
    `<div style="background:#f3f5fa;padding:32px 12px;font-family:${POLICE}">` +
    `<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px 28px;border:1px solid #e3e7f0">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px"><tr>` +
    `<td style="padding:0 10px 0 0;vertical-align:middle"><img src="${LOGO}" width="36" height="36" alt="${PRODUIT}" ` +
    `style="display:block;width:36px;height:36px;border:0;border-radius:9px"></td>` +
    `<td style="vertical-align:middle;font-size:16px;font-weight:700;letter-spacing:0.02em;color:#0f1a3a">${PRODUIT}</td>` +
    `</tr></table>` +
    `<h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;color:#0f1a3a">${titre}</h1>` +
    p('Bonjour,') +
    contenu +
    `<p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #e3e7f0;font-size:13px;line-height:1.55;color:#5b6375">${securite}</p>` +
    `</div>` +
    `<p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#8a91a3;text-align:center">` +
    `Cet e-mail a été envoyé automatiquement par ${PRODUIT} (${ENTREPRISE}). Merci de ne pas y répondre.</p>` +
    `</div>`
  );
}

function blocCode(code: string): string {
  return (
    `<p style="margin:4px 0 20px;padding:16px;border-radius:12px;background:#f3f5fa;text-align:center;` +
    `font-size:30px;font-weight:700;letter-spacing:8px;color:#0f1a3a">${echapper(code)}</p>`
  );
}

const VALIDITE_CODE = p(
  'Ce code est valable 10 minutes et ne peut être utilisé qu’une seule fois.',
);
const CONFIDENTIEL =
  'Pour votre sécurité, ne communiquez ce code à personne. Six ne vous le demandera jamais par message ou par téléphone.';

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
        objet: 'Confirmez votre adresse e-mail',
        html: page(
          'Confirmez votre adresse e-mail',
          p(
            'Merci d’avoir créé votre compte Six. Pour l’activer, saisissez le code de vérification suivant dans l’application :',
          ) +
            blocCode(d.token) +
            VALIDITE_CODE,
          `${CONFIDENTIEL} Si vous n’êtes pas à l’origine de cette inscription, vous pouvez ignorer cet e-mail : aucun compte ne sera activé.`,
        ),
      };
    case 'magiclink':
    case 'email':
      return {
        objet: 'Votre code de connexion',
        html: page(
          'Votre code de connexion',
          p('Pour terminer votre connexion à Six, saisissez le code suivant dans l’application :') +
            blocCode(d.token) +
            VALIDITE_CODE,
          `${CONFIDENTIEL} Si vous n’avez pas essayé de vous connecter, nous vous recommandons de modifier votre mot de passe dans Réglages, rubrique Compte.`,
        ),
      };
    case 'reauthentication':
      return {
        objet: 'Confirmez la modification de votre mot de passe',
        html: page(
          'Confirmez la modification de votre mot de passe',
          p(
            'Vous avez demandé à modifier le mot de passe de votre compte Six. Pour confirmer, saisissez le code suivant dans l’application :',
          ) +
            blocCode(d.token) +
            VALIDITE_CODE,
          `${CONFIDENTIEL} Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre mot de passe ne sera pas modifié.`,
        ),
      };
    case 'recovery':
      return {
        objet: 'Réinitialisation de votre mot de passe',
        html: page(
          'Réinitialisez votre mot de passe',
          p(
            'Nous avons reçu une demande de réinitialisation du mot de passe de votre compte Six. Pour choisir un nouveau mot de passe, utilisez le bouton ci-dessous :',
          ) +
            `<p style="margin:4px 0 20px"><a href="${echapper(lienVerification(urlSupabase, d, 'recovery'))}" ` +
            `style="display:inline-block;padding:12px 22px;border-radius:10px;background:#0f1a3a;color:#ffffff;` +
            `font-weight:700;font-size:15px;text-decoration:none">Choisir un nouveau mot de passe</a></p>` +
            p('Ce lien est valable 10 minutes et ne peut être utilisé qu’une seule fois.'),
          'Si vous n’avez pas demandé cette réinitialisation, ignorez cet e-mail : votre mot de passe actuel reste inchangé.',
        ),
      };
    case 'password_changed_notification':
      return {
        objet: 'Votre mot de passe Six a été modifié',
        html: page(
          'Mot de passe modifié',
          p('Le mot de passe de votre compte Six vient d’être modifié.'),
          'Si vous n’êtes pas à l’origine de cette modification, réinitialisez immédiatement votre mot de passe depuis l’application et contactez notre équipe.',
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
      from: process.env.EMAIL_EXPEDITEUR || `${PRODUIT} <noreply@sixbysevenai.com>`,
      to: [a],
      subject: objet,
      html,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) {
    // Raison du refus dans le journal du serveur (domaine non vérifié, clé invalide…), sans clé ni adresse e-mail.
    const d = (await r.json().catch(() => ({}))) as { name?: string; message?: string };
    const raison = `${d.name ?? ''} ${d.message ?? ''}`
      .replace(/[^\s@]+@[^\s@]+/g, '[e-mail]')
      .slice(0, 200);
    console.warn(`[e-mail] Resend a refusé l'envoi (${r.status}) : ${raison.trim()}`);
  }
  return r.ok;
}

/* ---------- Alerte de connexion (envoyée par Six lui-même, pas par Supabase) ---------- */

/** Deux boutons de même largeur, côte à côte (tableau : rendu identique dans les messageries). */
function deuxBoutons(
  gauche: { lien: string; texte: string },
  droite: { lien: string; texte: string },
): string {
  const cellule = (b: { lien: string; texte: string }, danger: boolean) =>
    `<td width="50%" style="padding:0 6px" align="center">` +
    `<a href="${echapper(b.lien)}" style="display:block;padding:14px 10px;border-radius:12px;text-align:center;` +
    (danger
      ? 'background:#c62828;color:#ffffff;border:1px solid #c62828;'
      : 'background:#ffffff;color:#0f1a3a;border:1px solid #c9cfdd;') +
    `font-weight:700;font-size:15px;line-height:1.2;text-decoration:none">${b.texte}</a></td>`;
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="margin:4px 0 8px;border-collapse:separate;table-layout:fixed"><tr>` +
    cellule(gauche, true) +
    cellule(droite, false) +
    `</tr></table>`
  );
}

/**
 * Alerte « Nouvelle connexion à votre compte » : bandeau d'alerte, méthode, appareil, date. Deux boutons de même
 * taille : « Ce n'était pas moi » (bloque cet appareil et coupe sa session) et « C'était moi ». Sans réponse, la
 * connexion reste valable.
 */
export function composerAlerteConnexion(a: {
  methode: string;
  appareil: string;
  quand: Date;
  lienReponse: string;
}): { objet: string; html: string } {
  const date = a.quand.toLocaleString('fr-FR', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Africa/Kinshasa',
  });
  const ligne = (titre: string, valeur: string) =>
    `<tr><td style="padding:8px 12px 8px 0;font-size:14px;color:#5b6375;white-space:nowrap;vertical-align:top">${titre}</td>` +
    `<td style="padding:8px 0;font-size:14px;color:#1f2430;font-weight:600">${echapper(valeur)}</td></tr>`;
  const bandeau =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px">` +
    `<tr><td style="padding:14px 16px;border-radius:12px;background:#fff4e5;border:1px solid #f5c26b;` +
    `font-size:15px;line-height:1.5;color:#7a4100"><strong>⚠ Alerte de sécurité.</strong> ` +
    `Quelqu’un vient de se connecter à votre compte Six. Vérifiez que c’est bien vous.</td></tr></table>`;
  return {
    objet: '⚠ Alerte de sécurité : nouvelle connexion à votre compte Six',
    html: page(
      'Nouvelle connexion à votre compte',
      bandeau +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
        `style="margin:0 0 22px;padding:8px 16px;border-radius:12px;background:#f3f5fa;border-collapse:separate">` +
        ligne('Appareil', a.appareil || 'Appareil inconnu') +
        ligne('Méthode', a.methode) +
        ligne('Date', `${date} (heure de Kinshasa)`) +
        `</table>` +
        p(
          '<strong>Ce n’est pas vous ?</strong> Bloquez cet appareil : il sera déconnecté immédiatement. Si c’est bien vous, confirmez-le (ou ne faites rien).',
        ) +
        deuxBoutons(
          { lien: `${a.lienReponse}&r=non`, texte: 'Ce n’était pas moi' },
          { lien: `${a.lienReponse}&r=oui`, texte: 'C’était moi' },
        ),
      'Si vous n’êtes pas à l’origine de cette connexion, changez aussi votre mot de passe depuis l’écran de connexion (« Mot de passe oublié »). Ce lien ne fonctionne qu’une fois.',
    ),
  };
}
