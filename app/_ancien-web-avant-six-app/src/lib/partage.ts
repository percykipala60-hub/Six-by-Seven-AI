/**
 * Partage d'une conversation terminée. Deux usages :
 *
 * 1. Partage WhatsApp (Android, PWA installée) : le service worker reçoit le texte,
 *    le dépose dans le cache du téléphone, puis l'app ouvre /repondre?partage=1.
 *    Le texte ne passe jamais par l'URL ni par nos serveurs.
 * 2. Partage par code OTP : une fois la réponse copiée, l'app génère un code court
 *    « six-xxxxxxxx ». L'appelant le donne ou le scanne ; le destinataire ouvre
 *    /repondre?otp=<code> et l'app charge la conversation masquée correspondante
 *    depuis sessionStorage (hors ligne).
 */
export const SHARE_CACHE = 'six-partage';
export const SHARE_KEY = '/__partage-en-attente';
export const OTP_SESSION = 'six-otp-conversation';

export async function takeSharedConversation(): Promise<string | undefined> {
  if (typeof caches === 'undefined') return undefined;
  try {
    const cache = await caches.open(SHARE_CACHE);
    const response = await cache.match(SHARE_KEY);
    if (!response) return undefined;
    await cache.delete(SHARE_KEY);
    const type = response.headers.get('content-type') ?? '';
    if (type.includes('zip')) {
      const { readZipTexts } = await import('./zip');
      const texts = await readZipTexts(await response.arrayBuffer());
      return (texts.find((t) => /chat/i.test(t.name)) ?? texts[0])?.text;
    }
    return await response.text();
  } catch {
    return undefined;
  }
}

/** Enregistre, côté émetteur, la version masquée de la conversation associée à un OTP.
 * Chaque nouveau code écrase le précédent ; jamais de persistance entre les sessions.
 * Le stockage contient uniquement le texte masqué, jamais les vrais noms ni le fichier source.
 */
export function associerOTP(code: string, texteMasqué: string): void {
  try {
    const net = code.trim();
    if (!net) return;
    sessionStorage.setItem(OTP_SESSION + '|' + net, texteMasqué);
  } catch {
    // sessionStorage indisponible : le code reste utilisable, le chargement échouera et
    // l'utilisateur pourra copier-coller.
  }
}

/** Lit la conversation masquée pour un OTP. Retourne undefined si le code est inconnu,
 * expiré, ou si le stockage n'est pas accessible.
 */
export function conversationPourOTP(code: string): string | undefined {
  try {
    return sessionStorage.getItem(OTP_SESSION + '|' + code.trim()) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Efface la conversation associée à un code (par exemple quand on partage une autre fois).
 * Pas obligatoire : le stockage expire à la fermeture de l'onglet.
 */
export function dissocierOTP(code: string): void {
  try {
    sessionStorage.removeItem(OTP_SESSION + '|' + code.trim());
  } catch {
    /* ignore */
  }
}
