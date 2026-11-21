/**
 * Signaux lisibles par du code, sur le téléphone comme sur le serveur : ils fixent un plancher
 * que l'IA ne peut pas contredire, et l'app peut les montrer sans réseau.
 */
import { normalize } from './scam.js';

export type TonPercu = 'chaleureux' | 'neutre' | 'sec' | 'agressif';

/** Signaux de tension lisibles par du code : ils fixent un minimum, l'IA ne peut pas les ignorer. */
export function tensionSignals(texts: string[]): 'calme' | 'pressant' | 'tendu' {
  const text = normalize(texts.join('\n'));
  const tendu =
    /\b(serieux|n'importe quoi|j'en ai marre|ras le bol|tu te moques|c'est grave|t'es (nul|pas serieux)|degage)\b/.test(
      text,
    ) || /[!?]{3,}/.test(text);
  if (tendu) return 'tendu';
  const pressant =
    /\b(urgent|vite|maintenant|tout de suite|ce soir|avant \d|asap|depeche|tu reponds|tu ne reponds plus|j'attends)\b/.test(
      text,
    ) || /[!?]{2}/.test(text);
  return pressant ? 'pressant' : 'calme';
}

export const INSULTES =
  /\b(con|conne|connard|idiot|idiote|imbecile|stupide|bete|abruti|debile|nul|nulle|ferme[- ]la|tais[- ]toi|degage|va te faire)\b/;

/** Signaux de ton lisibles par du code, montrés à l'utilisateur. */
export function toneSignals(texte: string): { signaux: string[]; minimum: TonPercu } {
  const signaux: string[] = [];
  let minimum: TonPercu = 'neutre';
  const letters = texte.replace(/[^\p{L}]/gu, '');
  const upper = texte.replace(/[^\p{Lu}]/gu, '');
  if (letters.length >= 8 && upper.length / letters.length > 0.6) {
    signaux.push('Écrit en MAJUSCULES : ça se lit comme si tu criais.');
    minimum = 'agressif';
  }
  if (/[!?]{2,}/.test(texte)) {
    signaux.push('Plusieurs « ! » ou « ? » d’affilée renforcent l’agacement.');
    if (minimum === 'neutre') minimum = 'sec';
  }
  const t = normalize(texte);
  if (INSULTES.test(t)) {
    signaux.push('Un mot peut blesser : il risque de fermer la discussion.');
    minimum = 'agressif';
  }
  if (
    /\btu (ne )?\w+ (toujours|jamais)\b|\b(toujours|jamais) (en retard|pareil|la meme chose)\b/.test(
      t,
    )
  ) {
    signaux.push('« Toujours » ou « jamais » sonne comme un reproche général.');
    if (minimum === 'neutre') minimum = 'sec';
  }
  return { signaux, minimum };
}
