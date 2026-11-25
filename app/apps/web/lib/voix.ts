'use client';

/**
 * Réglages → Voix : comment Six parle et écoute en mode vocal. Gardé sur l'appareil.
 * - voix : une voix de l'appareil (vide : la plus naturelle trouvée pour la langue) ;
 * - langue : langue de la dictée et de la lecture (« auto » : la dictée reconnaît la langue, Six lit en français) ;
 * - vitesse : débit de lecture ;
 * - declenchement : « auto » (Six écoute dès qu'une voix est détectée, pas les bruits) ou « toucher » (on touche la
 *   sphère pour parler).
 */

export type LangueVoix = 'fr' | 'en' | 'ln' | 'sw' | 'auto';
export type Declenchement = 'auto' | 'toucher';
export type PreferencesVoix = {
  /** Micro choisi (identifiant de l'appareil) ; vide : le micro par défaut du système. */
  micro: string;
  voix: string;
  langue: LangueVoix;
  vitesse: number;
  declenchement: Declenchement;
};

export const LANGUES_VOIX: { id: LangueVoix; nom: string; bcp47: string }[] = [
  { id: 'fr', nom: 'Français', bcp47: 'fr-FR' },
  { id: 'en', nom: 'Anglais', bcp47: 'en-US' },
  { id: 'ln', nom: 'Lingala', bcp47: 'ln-CD' },
  { id: 'sw', nom: 'Swahili', bcp47: 'sw-KE' },
  { id: 'auto', nom: 'Automatique', bcp47: 'fr-FR' },
];

export const VITESSES: { valeur: number; nom: string }[] = [
  { valeur: 0.9, nom: 'Posée' },
  { valeur: 1.05, nom: 'Normale' },
  { valeur: 1.2, nom: 'Rapide' },
];

const CLE = 'six-voix';
const DEFAUT: PreferencesVoix = {
  micro: '',
  voix: '',
  langue: 'fr',
  vitesse: 1.05,
  declenchement: 'auto',
};

export function lirePreferencesVoix(): PreferencesVoix {
  try {
    const p = JSON.parse(localStorage.getItem(CLE) ?? '{}') as Partial<PreferencesVoix>;
    return {
      micro: typeof p.micro === 'string' ? p.micro.slice(0, 200) : DEFAUT.micro,
      voix: typeof p.voix === 'string' ? p.voix.slice(0, 200) : DEFAUT.voix,
      langue: LANGUES_VOIX.some((l) => l.id === p.langue)
        ? (p.langue as LangueVoix)
        : DEFAUT.langue,
      vitesse: VITESSES.some((v) => v.valeur === p.vitesse)
        ? (p.vitesse as number)
        : DEFAUT.vitesse,
      declenchement: p.declenchement === 'toucher' ? 'toucher' : 'auto',
    };
  } catch {
    return { ...DEFAUT };
  }
}

export function ecrirePreferencesVoix(p: PreferencesVoix): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(p));
  } catch {
    /* stockage bloqué : le choix vaut pour cette visite */
  }
}

/** Code de langue pour la dictée et la lecture (« fr-FR »…). */
export function bcp47(langue: LangueVoix): string {
  return LANGUES_VOIX.find((l) => l.id === langue)?.bcp47 ?? 'fr-FR';
}

/** Les voix de l'appareil pour une langue, les plus naturelles d'abord (« Natural », « Online », « Neural »…). */
export function voixPourLangue(
  toutes: SpeechSynthesisVoice[],
  langue: LangueVoix,
): SpeechSynthesisVoice[] {
  const prefixe = (langue === 'auto' ? 'fr' : langue).toLowerCase();
  const naturelle = (v: SpeechSynthesisVoice) =>
    /natural|online|neural|premium|enhanced|google/i.test(v.name) ? 0 : 1;
  return toutes
    .filter((v) => v.lang.toLowerCase().startsWith(prefixe))
    .sort((a, b) => naturelle(a) - naturelle(b) || a.name.localeCompare(b.name));
}

/** La voix à utiliser : celle choisie si elle existe encore, sinon la plus naturelle de la langue (ou du français). */
export function choisirVoix(
  toutes: SpeechSynthesisVoice[],
  p: PreferencesVoix,
): SpeechSynthesisVoice | undefined {
  return (
    toutes.find((v) => v.voiceURI === p.voix) ??
    voixPourLangue(toutes, p.langue)[0] ??
    voixPourLangue(toutes, 'fr')[0]
  );
}

/** Découpe un texte en phrases (sert à composer les passages lus). */
export function phrases(texte: string): string[] {
  return (
    texte
      .replace(/\s+/g, ' ')
      .match(/[^.!?…]+[.!?…]+["»”)]*|[^.!?…]+$/g)
      ?.map((p) => p.trim())
      .filter(Boolean) ?? []
  );
}

/**
 * Texte prêt à être lu : sans emoji, symbole, lien ni mise en forme, et ponctuation collée aux mots (les voix de
 * Windows lisent parfois « ? », « ! » ou les guillemets isolés comme des mots).
 */
export function texteALire(texte: string): string {
  return texte
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_#`>|~^]+/g, ' ')
    .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
    .replace(/[«»“”"]/g, '')
    .replace(/\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️/gu, '')
    .replace(/\s+([?!:;.,…])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Passages à lire : les phrases regroupées jusqu'à ~220 caractères. Moins de coupures entre deux lectures, donc une
 * voix plus fluide ; assez court pour que la lecture ne se coupe pas sur certains appareils.
 */
export function passagesALire(texte: string, max = 220): string[] {
  const passages: string[] = [];
  let courant = '';
  for (const p of phrases(texteALire(texte))) {
    if (courant && courant.length + p.length + 1 > max) {
      passages.push(courant);
      courant = p;
    } else courant = courant ? `${courant} ${p}` : p;
  }
  if (courant) passages.push(courant);
  return passages;
}

/** Phrases que Whisper invente parfois sur un silence ou un bruit (à ignorer, ce n'est pas la personne). */
const FANTOMES =
  /^(merci d'avoir regardé|sous-titr|sous titres|abonnez-vous|merci\.?$|you\.?$|thank you|thanks for watching|\.+$|…$)/i;

export function estPhraseFantome(texte: string): boolean {
  const t = texte.trim().replace(/[!.]+$/, '');
  return !t || FANTOMES.test(t) || /amara\.org|sous-titres? réalisés?/i.test(t);
}

/** Les voix de l'appareil (elles arrivent parfois après un court délai). */
export function chargerVoix(): Promise<SpeechSynthesisVoice[]> {
  const synthese = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synthese) return Promise.resolve([]);
  const deja = synthese.getVoices();
  if (deja.length) return Promise.resolve(deja);
  return new Promise((resolve) => {
    const fini = () => resolve(synthese.getVoices());
    synthese.addEventListener('voiceschanged', fini, { once: true });
    setTimeout(fini, 1500);
  });
}

/** Contraintes audio pour le micro choisi dans Réglages → Voix (le micro par défaut sinon). */
export function audioMicro(extra: MediaTrackConstraints = {}): MediaTrackConstraints | true {
  const micro = lirePreferencesVoix().micro;
  if (!micro && !Object.keys(extra).length) return true;
  return { ...extra, ...(micro ? { deviceId: { ideal: micro } } : {}) };
}

/** Les micros de l'ordinateur. Sans autorisation du micro, les noms restent vides : on la demande d'abord. */
export async function listerMicros(demander = false): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  let liste = (await navigator.mediaDevices.enumerateDevices()).filter(
    (d) => d.kind === 'audioinput',
  );
  if (demander && liste.every((d) => !d.label)) {
    const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
    flux.getTracks().forEach((piste) => piste.stop());
    liste = (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === 'audioinput',
    );
  }
  return liste.filter((d) => d.deviceId !== 'default' && d.deviceId !== 'communications');
}
