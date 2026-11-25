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
const DEFAUT: PreferencesVoix = { voix: '', langue: 'fr', vitesse: 1.05, declenchement: 'auto' };

export function lirePreferencesVoix(): PreferencesVoix {
  try {
    const p = JSON.parse(localStorage.getItem(CLE) ?? '{}') as Partial<PreferencesVoix>;
    return {
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

/** Découpe un texte en phrases pour une lecture fluide (une longue lecture d'un bloc hache ou se coupe). */
export function phrases(texte: string): string[] {
  return (
    texte
      .replace(/\s+/g, ' ')
      .match(/[^.!?…]+[.!?…]+["»”)]*|[^.!?…]+$/g)
      ?.map((p) => p.trim())
      .filter(Boolean) ?? []
  );
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
