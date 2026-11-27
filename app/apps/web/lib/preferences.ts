/**
 * Préférences personnelles gardées sur l'appareil (Réglages → Votre Six, Notifications, Confidentialité).
 * - Instructions : ce que Six doit savoir de vous ; envoyées avec chaque message du Chat et de Cosinus.
 * - Notifications : prévenir à la fin d'une réponse quand l'app est en arrière-plan.
 * - Export : un fichier avec tout ce que Six garde sur cet appareil (mémoire, style, préférences).
 */
import { lireMemoire } from './memoire';
import { loadStyle } from './style';

export const INSTRUCTIONS_MAX = 1500;
const CLE_INSTRUCTIONS = 'six-instructions';
const CLE_NOTIFS = 'six-notifications';

export type PrefsNotifications = {
  /** Fin d'une réponse de Six pendant que l'app est en arrière-plan. */
  finReponse: boolean;
};

const NOTIFS_DEFAUT: PrefsNotifications = { finReponse: false };

function lire(cle: string): string | null {
  try {
    return localStorage.getItem(cle);
  } catch {
    return null;
  }
}
function ecrire(cle: string, valeur: string | null) {
  try {
    if (valeur === null) localStorage.removeItem(cle);
    else localStorage.setItem(cle, valeur);
  } catch {
    /* stockage indisponible : réglage perdu à la fermeture */
  }
}

export function lireInstructions(): string {
  return (lire(CLE_INSTRUCTIONS) ?? '').slice(0, INSTRUCTIONS_MAX);
}
export function ecrireInstructions(texte: string): void {
  const t = texte.trim().slice(0, INSTRUCTIONS_MAX);
  ecrire(CLE_INSTRUCTIONS, t || null);
}

export function lirePrefsNotifications(): PrefsNotifications {
  try {
    const o = JSON.parse(lire(CLE_NOTIFS) ?? '{}') as Partial<PrefsNotifications>;
    return {
      finReponse: typeof o.finReponse === 'boolean' ? o.finReponse : NOTIFS_DEFAUT.finReponse,
    };
  } catch {
    return { ...NOTIFS_DEFAUT };
  }
}
export function ecrirePrefsNotifications(p: PrefsNotifications): void {
  ecrire(CLE_NOTIFS, JSON.stringify(p));
}

/** Autorisation des notifications du navigateur ou de l'app (demandée seulement après un choix de la personne). */
export async function autoriserNotifications(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

/** Prévient que Six a répondu, seulement si l'app est en arrière-plan et que la personne l'a demandé. */
export function notifierFinReponse(reponse: string): void {
  if (typeof document === 'undefined' || !document.hidden) return;
  if (!lirePrefsNotifications().finReponse) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const extrait = reponse.replace(/\s+/g, ' ').trim();
  try {
    new Notification('Six a répondu', {
      body: extrait.length > 120 ? `${extrait.slice(0, 119)}…` : extrait,
      icon: '/icon.png',
    });
  } catch {
    /* notifications refusées par l'appareil */
  }
}

/** Tout ce que Six garde sur cet appareil, en un fichier Markdown lisible. */
export function exporterDonneesLocales(): { nom: string; contenu: string } {
  const m = lireMemoire();
  const style = loadStyle();
  const date = new Date().toISOString().slice(0, 10);
  const ligne = (t: number) => new Date(t).toLocaleDateString('fr-FR');
  const parties = [
    `# Mes données Six (${date})`,
    'Ce fichier contient ce que Six garde sur cet appareil. Aucune conversation n’y figure.',
    '## Ce que Six doit savoir de vous',
    lireInstructions() || '_Rien d’écrit._',
    '## Style d’écriture',
    style
      ? [
          `- Registre : ${style.decontracte} / 100 (formel → décontracté)`,
          `- Longueur : ${style.detaille} / 100 (bref → détaillé)`,
          `- Emojis : ${style.emojis ? 'oui' : 'non'}`,
          `- Expressions : ${style.expressions.length ? style.expressions.map((e) => `« ${e} »`).join(', ') : 'aucune'}`,
        ].join('\n')
      : '_Réglages de départ._',
    '## Contacts',
    m.contacts.length
      ? m.contacts.map((c) => `- **${c.nom}** (${ligne(c.vu)}) : ${c.note}`).join('\n')
      : '_Aucune note._',
    '## À suivre',
    m.suivis.length
      ? m.suivis.map((s) => `- ${ligne(s.quand)} — ${s.qui} : ${s.quoi}`).join('\n')
      : '_Rien à suivre._',
    '## Habitudes',
    `${m.choix.length} réponse(s) choisie(s) retenue(s) (nombre de mots, emoji, tu ou vous ; jamais le texte).`,
  ];
  return { nom: `six-mes-donnees-${date}.md`, contenu: `${parties.join('\n\n')}\n` };
}

/** Télécharge un fichier texte créé dans la page. */
export function telechargerTexte(nom: string, contenu: string): void {
  const url = URL.createObjectURL(new Blob([contenu], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
