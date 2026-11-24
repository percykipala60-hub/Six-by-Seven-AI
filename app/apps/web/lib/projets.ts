/**
 * Projets de Six : un nom, des consignes et des documents qui servent de contexte à chaque réponse, et les
 * discussions (Chat, Cosinus) rangées dedans (lib/seven-chats.ts, champ `projet`).
 *
 * Gardés sur l'appareil (localStorage). Copiés sur le compte seulement si la personne a autorisé la synchronisation
 * de sa mémoire (lib/compte.ts, lib/projets-sync.ts), comme la mémoire.
 * Les projets restent même quand la mémoire est coupée : c'est la personne qui les crée et les efface elle-même.
 */

export type DocumentProjet = { id: string; nom: string; texte: string; ajoute: number };
export type Projet = {
  id: string;
  nom: string;
  instructions: string;
  documents: DocumentProjet[];
  cree: number;
  maj: number;
};
/** Ce qui part vers l'IA avec chaque message d'une discussion du projet (voir ProjetBodySchema). */
export type ContexteProjet = {
  nom: string;
  instructions?: string;
  documents?: { nom: string; texte: string }[];
};

const CLE = 'six-projets';
const CLE_SUPPRIMES = 'six-projets-supprimes';
export const EVT_PROJETS = 'six-projets';
export const NOM_MAX = 60;
export const INSTRUCTIONS_MAX = 4000;
export const DOC_NOM_MAX = 120;
export const DOC_TEXTE_MAX = 12_000;
export const DOCS_MAX = 10;
/** Texte des documents envoyé avec un message, en tout (les plus récents d'abord tronqués en dernier). */
export const CONTEXTE_DOCS_MAX = 24_000;
const MAX_PROJETS = 50;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const nombre = (v: unknown, defaut: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : defaut;

export function nouvelIdProjet(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Garde seulement des valeurs du bon type et de taille bornée (stockage local ou copie du compte). */
export function curerProjet(o: unknown): Projet | null {
  if (!o || typeof o !== 'object') return null;
  const p = o as Record<string, unknown>;
  const id = str(p.id, 40);
  const nom = str(p.nom, NOM_MAX).trim();
  if (!/^[\w-]+$/.test(id) || !nom) return null;
  const maj = nombre(p.maj, 0);
  const documents = (Array.isArray(p.documents) ? p.documents : [])
    .map((d) => (d && typeof d === 'object' ? (d as Record<string, unknown>) : {}))
    .filter((d) => str(d.nom, DOC_NOM_MAX).trim() && str(d.texte, DOC_TEXTE_MAX).trim())
    .map((d) => ({
      id: str(d.id, 40) || nouvelIdProjet(),
      nom: str(d.nom, DOC_NOM_MAX).trim(),
      texte: str(d.texte, DOC_TEXTE_MAX),
      ajoute: nombre(d.ajoute, maj),
    }))
    .slice(0, DOCS_MAX);
  return {
    id,
    nom,
    instructions: str(p.instructions, INSTRUCTIONS_MAX),
    documents,
    cree: nombre(p.cree, maj),
    maj,
  };
}

function annoncer() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVT_PROJETS));
}

/** Projets, les plus récemment modifiés d'abord. */
export function lireProjets(): Projet[] {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) ?? '[]') as unknown;
    if (!Array.isArray(brut)) return [];
    return brut
      .map(curerProjet)
      .filter((p): p is Projet => p !== null)
      .sort((a, b) => b.maj - a.maj)
      .slice(0, MAX_PROJETS);
  } catch {
    return [];
  }
}

export function lireProjet(id: string): Projet | undefined {
  return id ? lireProjets().find((p) => p.id === id) : undefined;
}

/** Remplace toute la liste (fusion avec le compte). */
export function ecrireProjets(projets: Projet[]): boolean {
  try {
    localStorage.setItem(CLE, JSON.stringify(projets.slice(0, MAX_PROJETS)));
    annoncer();
    return true;
  } catch {
    return false; // stockage plein ou bloqué
  }
}

function modifier(id: string, f: (p: Projet) => Projet): Projet | undefined {
  const projets = lireProjets();
  const i = projets.findIndex((p) => p.id === id);
  if (i < 0) return undefined;
  const p = { ...f(projets[i]), maj: Date.now() };
  projets.splice(i, 1);
  return ecrireProjets([p, ...projets]) ? p : undefined;
}

export function creerProjet(nom: string, maintenant = Date.now()): Projet | null {
  const propre = nom.replace(/\s+/g, ' ').trim().slice(0, NOM_MAX);
  if (!propre) return null;
  const p: Projet = {
    id: nouvelIdProjet(),
    nom: propre,
    instructions: '',
    documents: [],
    cree: maintenant,
    maj: maintenant,
  };
  return ecrireProjets([p, ...lireProjets()]) ? p : null;
}

export function renommerProjet(id: string, nom: string): Projet | undefined {
  const propre = nom.replace(/\s+/g, ' ').trim().slice(0, NOM_MAX);
  if (!propre) return undefined;
  return modifier(id, (p) => ({ ...p, nom: propre }));
}

export function ecrireInstructions(id: string, instructions: string): Projet | undefined {
  return modifier(id, (p) => ({ ...p, instructions: instructions.slice(0, INSTRUCTIONS_MAX) }));
}

/** Ajoute un document lu sur l'appareil. Renvoie un message d'erreur, ou null si tout va bien. */
export function ajouterDocument(id: string, nom: string, texte: string): string | null {
  const p = lireProjet(id);
  if (!p) return 'Ce projet n’existe plus.';
  if (p.documents.length >= DOCS_MAX)
    return `Un projet garde ${DOCS_MAX} documents au plus. Retires-en un d’abord.`;
  const propre = texte.trim();
  if (!propre) return 'Ce fichier ne contient pas de texte lisible.';
  const tronque =
    propre.length > DOC_TEXTE_MAX
      ? `${propre.slice(0, DOC_TEXTE_MAX - 30)}\n\n[… document tronqué]`
      : propre;
  const ok = modifier(id, (x) => ({
    ...x,
    documents: [
      ...x.documents,
      {
        id: nouvelIdProjet(),
        nom: nom.trim().slice(0, DOC_NOM_MAX) || 'Document',
        texte: tronque,
        ajoute: Date.now(),
      },
    ],
  }));
  return ok ? null : 'L’appareil n’a plus de place pour ce document.';
}

export function retirerDocument(id: string, docId: string): Projet | undefined {
  return modifier(id, (p) => ({ ...p, documents: p.documents.filter((d) => d.id !== docId) }));
}

/** Efface le projet de l'appareil (et du compte à la prochaine synchronisation). */
export function supprimerProjet(id: string): void {
  ecrireProjets(lireProjets().filter((p) => p.id !== id));
  noterSuppression(CLE_SUPPRIMES, id);
}

/* ---------- Suppressions à reporter sur le compte ---------- */

export function lireSuppressions(cle = CLE_SUPPRIMES): string[] {
  try {
    const l = JSON.parse(localStorage.getItem(cle) ?? '[]') as unknown;
    return Array.isArray(l) ? l.filter((x): x is string => typeof x === 'string').slice(-200) : [];
  } catch {
    return [];
  }
}

export function noterSuppression(cle: string, id: string): void {
  try {
    const l = lireSuppressions(cle).filter((x) => x !== id);
    localStorage.setItem(cle, JSON.stringify([...l, id].slice(-200)));
  } catch {
    /* rien de plus à faire : la copie du compte reviendra peut-être à la prochaine fusion */
  }
}

export function oublierSuppressions(cle: string, ids: string[]): void {
  try {
    const restants = lireSuppressions(cle).filter((x) => !ids.includes(x));
    localStorage.setItem(cle, JSON.stringify(restants));
  } catch {
    /* stockage bloqué */
  }
}

export const SUPPRESSIONS_PROJETS = CLE_SUPPRIMES;

/* ---------- Contexte envoyé à l'IA ---------- */

/**
 * Consignes et documents du projet, bornés : les documents passent dans l'ordre jusqu'à CONTEXTE_DOCS_MAX
 * caractères en tout ; le dernier qui dépasse est tronqué, les suivants ne partent pas.
 */
export function contexteProjet(p: Projet): ContexteProjet {
  let reste = CONTEXTE_DOCS_MAX;
  const documents: { nom: string; texte: string }[] = [];
  for (const d of p.documents) {
    if (reste <= 200) break;
    const texte = d.texte.length > reste ? `${d.texte.slice(0, reste - 30)}\n[… tronqué]` : d.texte;
    documents.push({ nom: d.nom, texte });
    reste -= texte.length;
  }
  const instructions = p.instructions.trim();
  return {
    nom: p.nom,
    ...(instructions ? { instructions } : {}),
    ...(documents.length ? { documents } : {}),
  };
}

export function ecouterProjets(fn: () => void): () => void {
  const surStockage = (e: StorageEvent) => e.key === CLE && fn();
  window.addEventListener(EVT_PROJETS, fn);
  window.addEventListener('storage', surStockage);
  return () => {
    window.removeEventListener(EVT_PROJETS, fn);
    window.removeEventListener('storage', surStockage);
  };
}
