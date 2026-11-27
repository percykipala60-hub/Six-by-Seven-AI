/**
 * Environnements de Cosinus, comme dans Claude Code : un environnement a un nom et un ou plusieurs dossiers de
 * l'ordinateur. Le premier dossier est le dossier de travail (Six y range ses résultats) ; les autres sont lisibles
 * par Six, jamais modifiés. Chaque environnement a ses propres discussions ; le menu latéral les groupe sous son nom.
 * Gardé sur l'appareil (localStorage).
 */

export type Environnement = {
  id: string;
  nom: string;
  dossiers: string[];
  maj: number;
  /** Absent : local (dossiers de cet ordinateur). « cloud » : environnement en ligne lié au compte. */
  type?: 'cloud';
  /** Cloud : identifiant côté serveur, ou « auto » (choisi selon le dépôt cité dans la demande). */
  cloud?: string;
  /** Cloud : dépôt GitHub lié (proprietaire/depot). */
  depot?: string;
  /** Cloud : environnement « Mon cloud » du compte. */
  parDefaut?: boolean;
};
export type GroupeEnvironnement<C> = {
  /** Identifiant du groupe (environnement, ou « d:<dossier> » pour une ancienne discussion sans environnement). */
  id: string;
  nom: string;
  /** Dossier de travail (vide : discussions sans dossier). */
  dossier: string;
  /** L'environnement existe (on peut y ouvrir une nouvelle discussion ou le retirer). */
  environnement?: Environnement;
  chats: C[];
};

const CLE = 'six-environnements';
const CLE_CLOUD = 'six-environnements-cloud';
export const ID_AUTO = 'cloud:auto';
const CLE_REPLIES = 'six-environnements-replies';
const CLE_MASQUES = 'six-environnements-masques';
const EVT = 'six-environnements';
const MAX_ENVIRONNEMENTS = 30;
const DOSSIERS_MAX = 8;
export const SANS_DOSSIER = 'Sans dossier';

/** Nom affiché d'un dossier : son dernier élément (« C:\Users\omen\Mémoire » → « Mémoire »). */
export function nomDossier(chemin: string): string {
  const morceaux = chemin.replace(/[\\/]+$/, '').split(/[\\/]/);
  return morceaux.at(-1) || chemin;
}

/** Même dossier, écrit différemment (barre finale, majuscules sous Windows). */
export function memeDossier(a: string, b: string): boolean {
  const n = (c: string) => c.replace(/[\\/]+$/, '').replace(/\\/g, '/');
  const windows = /^[a-z]:/i.test(a) || /^[a-z]:/i.test(b);
  return windows ? n(a).toLowerCase() === n(b).toLowerCase() : n(a) === n(b);
}

/** Ancien format ({ dossier, maj }) ou nouveau : toujours un environnement valide, ou null. */
export function normaliserEnvironnement(brut: unknown): Environnement | null {
  if (!brut || typeof brut !== 'object') return null;
  const e = brut as Record<string, unknown>;
  const maj = typeof e.maj === 'number' ? e.maj : 0;
  if (Array.isArray(e.dossiers)) {
    const dossiers = e.dossiers.filter((d): d is string => typeof d === 'string' && !!d);
    if (typeof e.id !== 'string' || !e.id) return null;
    const nom = typeof e.nom === 'string' && e.nom.trim() ? e.nom.trim() : nomParDefaut(dossiers);
    return { id: e.id, nom, dossiers: dossiers.slice(0, DOSSIERS_MAX), maj };
  }
  if (typeof e.dossier === 'string' && e.dossier)
    return { id: `d:${e.dossier}`, nom: nomDossier(e.dossier), dossiers: [e.dossier], maj };
  return null;
}

function nomParDefaut(dossiers: string[]): string {
  return dossiers[0] ? nomDossier(dossiers[0]) : 'Environnement';
}

/**
 * Discussions groupées par environnement, le plus récemment utilisé en tête. Un environnement sans discussion
 * apparaît quand même. Une ancienne discussion sans environnement rejoint celui dont c'est le dossier de travail,
 * sinon un groupe au nom de son dossier ; sans dossier du tout, elle va à la fin.
 */
export function grouperParEnvironnement<
  C extends { maj: number; dossier?: string; environnement?: string },
>(chats: C[], environnements: Environnement[]): GroupeEnvironnement<C>[] {
  const groupes: (GroupeEnvironnement<C> & { recent: number })[] = environnements.map((e) => ({
    id: e.id,
    nom: e.nom,
    dossier: e.dossiers[0] ?? '',
    environnement: e,
    chats: [],
    recent: e.maj,
  }));
  const sans: C[] = [];
  for (const c of [...chats].sort((a, b) => b.maj - a.maj)) {
    let g =
      (c.environnement && groupes.find((x) => x.id === c.environnement)) ||
      (c.dossier && groupes.find((x) => x.dossier && memeDossier(x.dossier, c.dossier ?? '')));
    if (!g && c.dossier) {
      g = {
        id: `d:${c.dossier}`,
        nom: nomDossier(c.dossier),
        dossier: c.dossier,
        chats: [],
        recent: c.maj,
      };
      groupes.push(g);
    }
    if (!g) {
      sans.push(c);
      continue;
    }
    g.chats.push(c);
    g.recent = Math.max(g.recent, c.maj);
  }
  const tries = groupes.sort((a, b) => b.recent - a.recent).map(({ recent: _r, ...g }) => g);
  return sans.length ? [...tries, { id: '-', nom: SANS_DOSSIER, dossier: '', chats: sans }] : tries;
}

/** Dossiers déjà utilisés (tous environnements), pour la liste « Ajouter un dossier ». */
export function dossiersConnus(environnements: Environnement[]): string[] {
  environnements = environnements.filter((e) => e.type !== 'cloud');
  const vus: string[] = [];
  for (const e of [...environnements].sort((a, b) => b.maj - a.maj))
    for (const d of e.dossiers) if (!vus.some((v) => memeDossier(v, d))) vus.push(d);
  return vus;
}

function lireJson<T>(cle: string, defaut: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(cle) ?? 'null') as unknown;
    return (v ?? defaut) as T;
  } catch {
    return defaut;
  }
}

function ecrireJson(cle: string, v: unknown) {
  try {
    localStorage.setItem(cle, JSON.stringify(v));
  } catch {
    /* stockage bloqué : vaut pour cette visite */
  }
  window.dispatchEvent(new Event(EVT));
}

export function lireEnvironnements(): Environnement[] {
  if (typeof window === 'undefined') return [];
  const brut = lireJson<unknown>(CLE, []);
  const locaux = (Array.isArray(brut) ? brut : [])
    .map(normaliserEnvironnement)
    .filter((e): e is Environnement => e !== null);
  return [...locaux, ...lireEnvironnementsCloud()].sort((a, b) => b.maj - a.maj);
}

/** Environnements cloud gardés sur l'appareil (dernière liste reçue du serveur), avec « Auto ». */
export function lireEnvironnementsCloud(): Environnement[] {
  if (typeof window === 'undefined') return [];
  const brut = lireJson<unknown>(CLE_CLOUD, []);
  return (Array.isArray(brut) ? brut : []).filter(
    (e): e is Environnement =>
      !!e &&
      typeof e === 'object' &&
      (e as Environnement).type === 'cloud' &&
      typeof (e as Environnement).id === 'string',
  );
}

/** Environnement cloud reçu du serveur → environnement de l'app. */
export function versEnvironnementCloud(e: {
  id: string;
  nom: string;
  depot_github: string | null;
  par_defaut: boolean;
  maj: string;
}): Environnement {
  return {
    id: `cloud:${e.id}`,
    nom: e.nom,
    dossiers: [],
    maj: Date.parse(e.maj) || 0,
    type: 'cloud',
    cloud: e.id,
    ...(e.depot_github ? { depot: e.depot_github } : {}),
    ...(e.par_defaut ? { parDefaut: true } : {}),
  };
}

/** Garde la liste cloud reçue du serveur (les dates d'utilisation locales sont conservées). */
export function memoriserEnvironnementsCloud(envs: Environnement[]): void {
  const avant = lireEnvironnementsCloud();
  const auto = avant.find((e) => e.id === ID_AUTO);
  const garder = (e: Environnement) => ({
    ...e,
    maj: Math.max(e.maj, avant.find((x) => x.id === e.id)?.maj ?? 0),
  });
  ecrireJson(CLE_CLOUD, [
    {
      id: ID_AUTO,
      nom: 'Auto',
      dossiers: [],
      maj: auto?.maj ?? 0,
      type: 'cloud',
      cloud: 'auto',
    } satisfies Environnement,
    ...envs.map(garder),
  ]);
}

export function lireEnvironnement(id: string): Environnement | undefined {
  return lireEnvironnements().find((e) => e.id === id);
}

/** Environnement dont c'est le dossier de travail (anciennes discussions). */
export function environnementDuDossier(dossier: string): Environnement | undefined {
  return lireEnvironnements().find((e) => e.dossiers[0] && memeDossier(e.dossiers[0], dossier));
}

/** Crée un environnement (nom vide : celui du premier dossier) et le place en tête. */
export function creerEnvironnement(nom: string, dossiers: string[]): Environnement {
  const propres: string[] = [];
  for (const d of dossiers) if (d && !propres.some((p) => memeDossier(p, d))) propres.push(d);
  const env: Environnement = {
    id: `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    nom: nom.trim().slice(0, 60) || nomParDefaut(propres),
    dossiers: propres.slice(0, DOSSIERS_MAX),
    maj: Date.now(),
  };
  ecrireJson(
    CLE,
    [env, ...lireEnvironnements().filter((e) => e.type !== 'cloud')].slice(0, MAX_ENVIRONNEMENTS),
  );
  return env;
}

/** Remonte l'environnement en tête (dernier utilisé). */
export function utiliserEnvironnement(id: string): void {
  if (id.startsWith('cloud:')) {
    const cloud = lireEnvironnementsCloud();
    ecrireJson(
      CLE_CLOUD,
      cloud.map((e) => (e.id === id ? { ...e, maj: Date.now() } : e)),
    );
    return;
  }
  const envs = lireEnvironnements().filter((e) => e.type !== 'cloud');
  const e = envs.find((x) => x.id === id);
  if (!e) return;
  ecrireJson(CLE, [{ ...e, maj: Date.now() }, ...envs.filter((x) => x.id !== id)]);
}

export function retirerEnvironnement(id: string): void {
  ecrireJson(
    CLE,
    lireEnvironnements().filter((e) => e.id !== id && e.type !== 'cloud'),
  );
}

/**
 * Groupes retirés du menu latéral (environnement ou dossier) : seulement leur affichage, jamais le dossier ni ses
 * fichiers. Clé = identifiant du groupe, valeur = date du retrait ; une discussion plus récente le fait revenir.
 */
export function lireMasques(): Record<string, number> {
  const m = lireJson<Record<string, number>>(CLE_MASQUES, {});
  return m && typeof m === 'object' ? m : {};
}

/** Retire un groupe de la liste : l'environnement (s'il y en a un) et les dossiers de ses discussions. */
export function masquerGroupe(g: {
  id: string;
  dossier?: string;
  environnement?: Environnement;
}): void {
  const quand = Date.now();
  const m = { ...lireMasques(), [g.id]: quand };
  // Les discussions de l'environnement ne doivent pas revenir sous le nom de leur dossier.
  for (const d of g.environnement?.dossiers ?? (g.dossier ? [g.dossier] : [])) m[`d:${d}`] = quand;
  if (g.environnement && g.environnement.type !== 'cloud') retirerEnvironnement(g.environnement.id);
  ecrireJson(CLE_MASQUES, m);
}

/** Un groupe retiré reste caché, sauf s'il a une discussion plus récente que son retrait. */
export function groupeVisible(
  g: { id: string; dossier?: string; chats: { maj: number }[] },
  masques: Record<string, number> = lireMasques(),
): boolean {
  const quand = masques[g.id] ?? (g.dossier ? masques[`d:${g.dossier}`] : undefined);
  if (quand === undefined) return true;
  return g.chats.some((c) => c.maj > quand);
}

/** Groupes repliés dans le menu latéral. */
export function lireReplies(): string[] {
  if (typeof window === 'undefined') return [];
  const v = lireJson<unknown>(CLE_REPLIES, []);
  return Array.isArray(v) ? v.filter((d): d is string => typeof d === 'string') : [];
}

export function basculerReplie(id: string): void {
  const replies = lireReplies();
  ecrireJson(
    CLE_REPLIES,
    replies.includes(id) ? replies.filter((d) => d !== id) : [...replies, id],
  );
}

export function ecouterEnvironnements(fn: () => void): () => void {
  window.addEventListener(EVT, fn);
  window.addEventListener('storage', fn);
  return () => {
    window.removeEventListener(EVT, fn);
    window.removeEventListener('storage', fn);
  };
}
