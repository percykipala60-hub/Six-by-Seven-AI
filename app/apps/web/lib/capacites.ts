import { z } from 'zod';

/**
 * Réglages → Capacités : ce que Six a le droit de faire dans Cosinus. Gardé sur l'appareil, envoyé avec chaque demande
 * de Cosinus, appliqué par le serveur (lib/agent/boucle.ts) : un outil désactivé n'est pas proposé à Six, et un appel
 * à un outil non proposé est refusé.
 */
export const CapacitesSchema = z.object({
  /** Documents, présentations et pages ouverts dans un panneau à côté de la discussion. */
  artefacts: z.boolean(),
  /** Graphiques et diagrammes (SVG) dans la discussion. */
  graphiques: z.boolean(),
  /** Créer et modifier des fichiers dans l'environnement (Word, PDF, présentations, tableurs…). */
  fichiers: z.boolean(),
  /** Internet pendant la création de fichiers : recherche de sources, lecture de pages, navigateur interne. */
  internet: z.boolean(),
});
export type Capacites = z.infer<typeof CapacitesSchema>;

export const CAPACITES_DEFAUT: Capacites = {
  artefacts: true,
  graphiques: true,
  fichiers: true,
  internet: true,
};

const CLE = 'six-capacites';
export const EVT_CAPACITES = 'six-capacites';

/**
 * Capacités effectives, comme dans les réglages de Claude : les fichiers exigent les artéfacts, Internet exige les
 * fichiers. Les choix enregistrés restent tels quels : réactiver les fichiers retrouve le réglage d'Internet.
 */
export function normaliserCapacites(c: Capacites): Capacites {
  return {
    ...c,
    artefacts: c.artefacts || c.fichiers,
    internet: c.fichiers && c.internet,
  };
}

export function lireCapacites(): Capacites {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) ?? 'null') as unknown;
    const r = CapacitesSchema.partial().safeParse(brut);
    return { ...CAPACITES_DEFAUT, ...(r.success ? r.data : {}) };
  } catch {
    return CAPACITES_DEFAUT;
  }
}

export function ecrireCapacites(c: Capacites): Capacites {
  try {
    localStorage.setItem(CLE, JSON.stringify(c));
    window.dispatchEvent(new Event(EVT_CAPACITES));
  } catch {
    /* stockage bloqué : le réglage vaut pour cette page seulement */
  }
  return c;
}

/** Outils retirés à Six selon les capacités (côté serveur). */
export function outilsRetires(c: Capacites): Set<string> {
  const retires = new Set<string>();
  if (!c.fichiers) ['ecrire_resultat', 'modifier_document'].forEach((n) => retires.add(n));
  if (!c.fichiers || !c.internet)
    ['chercher_sources', 'lire_page', 'naviguer'].forEach((n) => retires.add(n));
  return retires;
}

/** Consignes ajoutées au système de Six quand une capacité est coupée. */
export function consignesCapacites(c: Capacites): string {
  const l: string[] = [];
  if (!c.fichiers)
    l.push(
      'La personne a désactivé la création de fichiers : n’enregistre ni ne modifie aucun fichier, réponds dans la discussion.',
    );
  else if (!c.internet)
    l.push(
      'La personne a désactivé Internet : ne cherche ni ne lis rien en ligne, travaille avec ce qui est fourni et dis-le si une information manque.',
    );
  if (!c.artefacts)
    l.push(
      'Les artéfacts sont désactivés : n’utilise aucun bloc d’artefact, écris le contenu directement dans ta réponse.',
    );
  if (!c.graphiques)
    l.push(
      'Les graphiques et diagrammes sont désactivés : n’en dessine pas (ni SVG ni schéma), décris les données en texte ou en tableau.',
    );
  return l.length ? `\nCapacités : ${l.join(' ')}` : '';
}
