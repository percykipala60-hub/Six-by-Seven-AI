import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fichierCorpus } from './memoire-documents';

/**
 * Mise en forme d'un rapport de Six : une fiche par rapport (resultats/.six/<nom>.json), modifiable point par point
 * (« grossis ce titre », « table des matières à gauche », « justifie le texte »…), appliquée à la génération Word et
 * PDF. Deux styles de base :
 * - « personnel » : le gabarit appris sur les rapports de la personne (ia/corpus/gabarit, voir ia/outils/gabarit.py),
 *   seulement quand elle le demande ;
 * - « professionnel » : la base sobre par défaut, que Six adapte et varie selon le document (police, couleurs…).
 */

export type Alignement = 'gauche' | 'centre' | 'droite' | 'justifie';
export type StyleBloc = {
  taille?: number;
  couleur?: string;
  alignement?: Alignement;
  gras?: boolean;
  italique?: boolean;
  police?: string;
  majuscules?: boolean;
};
export type MiseEnForme = {
  style?: 'personnel' | 'professionnel';
  texte?: StyleBloc & { interligne?: number };
  titre_document?: StyleBloc;
  titres?: { '1'?: StyleBloc; '2'?: StyleBloc; '3'?: StyleBloc };
  /** Réglages d'une partie précise, par son intitulé (ex. « Conclusion »). */
  parties?: Record<string, StyleBloc>;
  sommaire?: { afficher?: boolean; alignement?: Alignement; titre?: string };
  page_de_garde?: {
    afficher?: boolean;
    sous_titre?: string;
    auteur?: string;
    etablissement?: string;
    encadrant?: string;
    date?: string;
  };
  marges_cm?: number;
  numeros_de_page?: boolean;
  /** Titres numérotés 1., 1.1, 1.1.1 (par défaut) ; false : titres tels qu'écrits. */
  numerotation?: boolean;
};

/** Gabarit Word appris sur les rapports de la personne. */
export type Gabarit = {
  stylesXml: string;
  themeXml?: string;
  policesXml?: string;
  ids: { titre1?: string; titre2?: string; titre3?: string; titre?: string; puce?: string };
  corps: { police: string; taille: number };
  titre1: { police: string; taille: number; couleur: string };
  titre2: { police: string; taille: number; couleur: string };
  justifie: boolean;
  margesTwips: number;
};

/** Mise en forme complète, une fois les réglages par défaut appliqués. */
export type Resolue = {
  style: 'personnel' | 'professionnel';
  texte: Required<Pick<StyleBloc, 'taille' | 'couleur' | 'alignement' | 'police'>> &
    StyleBloc & { interligne: number };
  titre_document: Required<Pick<StyleBloc, 'taille' | 'couleur' | 'alignement' | 'police'>> &
    StyleBloc;
  titres: Record<
    '1' | '2' | '3',
    Required<Pick<StyleBloc, 'taille' | 'couleur' | 'alignement' | 'police'>> & StyleBloc
  >;
  parties: Record<string, StyleBloc>;
  sommaire: { afficher: boolean; alignement: Alignement; titre: string };
  page_de_garde: NonNullable<MiseEnForme['page_de_garde']> & { afficher: boolean };
  marges_cm: number;
  numeros_de_page: boolean;
  numerotation: boolean;
};

const COULEURS: Record<string, string> = {
  noir: '000000',
  blanc: 'FFFFFF',
  bleu: '1F4E9A',
  'bleu fonce': '1F3864',
  'bleu clair': '4A86E8',
  rouge: 'C00000',
  vert: '2E7D32',
  gris: '595959',
  orange: 'E36C09',
  violet: '6A1B9A',
  marron: '6D4C41',
  jaune: 'BF9000',
};

const ALIGNEMENTS: Record<string, Alignement> = {
  gauche: 'gauche',
  left: 'gauche',
  centre: 'centre',
  center: 'centre',
  centrer: 'centre',
  centree: 'centre',
  droite: 'droite',
  right: 'droite',
  justifie: 'justifie',
  justify: 'justifie',
  justifier: 'justifie',
};

const sansAccents = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function couleurHex(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = sansAccents(v).replace(/^#/, '');
  if (/^[0-9a-f]{6}$/.test(t)) return t.toUpperCase();
  return COULEURS[t];
}

function alignement(v: unknown): Alignement | undefined {
  if (typeof v !== 'string') return undefined;
  const t = sansAccents(v).replace(/[^a-z]/g, '');
  if (ALIGNEMENTS[t]) return ALIGNEMENTS[t];
  if (t.includes('justif')) return 'justifie';
  if (t.includes('centr')) return 'centre';
  if (t.includes('gauch')) return 'gauche';
  if (t.includes('droit')) return 'droite';
  return undefined;
}

/** Nombre absolu, ou relatif (« +4 », « -2 ») appliqué à la valeur actuelle, borné. */
function nombre(
  v: unknown,
  actuel: number | undefined,
  min: number,
  max: number,
): number | undefined {
  let n: number | undefined;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string') {
    const m = /^\s*([+-])?\s*(\d+(?:[.,]\d+)?)/.exec(v);
    if (m) {
      const x = Number(m[2].replace(',', '.'));
      n = m[1] ? (actuel ?? 0) + (m[1] === '-' ? -x : x) : x;
    }
  }
  return n === undefined || !Number.isFinite(n)
    ? undefined
    : Math.min(max, Math.max(min, Math.round(n * 2) / 2));
}

function bloc(actuel: StyleBloc = {}, patch: unknown): StyleBloc {
  if (!patch || typeof patch !== 'object') return actuel;
  const p = patch as Record<string, unknown>;
  const r: StyleBloc = { ...actuel };
  const taille = nombre(p.taille, actuel.taille, 6, 72);
  if (taille !== undefined) r.taille = taille;
  const c = couleurHex(p.couleur);
  if (c) r.couleur = c;
  const a = alignement(p.alignement);
  if (a) r.alignement = a;
  for (const k of ['gras', 'italique', 'majuscules'] as const)
    if (typeof p[k] === 'boolean') r[k] = p[k] as boolean;
  if (typeof p.police === 'string' && p.police.trim()) r.police = p.police.trim().slice(0, 60);
  return r;
}

/**
 * Applique une modification de mise en forme demandée par Six (objet partiel) à la fiche actuelle. Valeurs relatives
 * acceptées pour les tailles (« +4 »), couleurs par nom (« bleu ») ou en hexadécimal, alignements en français.
 */
export function fusionner(actuelle: MiseEnForme, patch: unknown): MiseEnForme {
  if (!patch || typeof patch !== 'object') return actuelle;
  const p = patch as Record<string, unknown>;
  const r: MiseEnForme = JSON.parse(JSON.stringify(actuelle)) as MiseEnForme;
  if (p.style === 'personnel' || p.style === 'professionnel') r.style = p.style;
  if (p.texte) {
    r.texte = { ...bloc(r.texte, p.texte), interligne: r.texte?.interligne };
    const il = nombre(
      (p.texte as Record<string, unknown>).interligne,
      r.texte.interligne ?? 1.15,
      1,
      3,
    );
    if (il !== undefined) r.texte.interligne = il;
  }
  if (p.titre_document) r.titre_document = bloc(r.titre_document, p.titre_document);
  if (p.titres && typeof p.titres === 'object') {
    r.titres = { ...(r.titres ?? {}) };
    for (const n of ['1', '2', '3'] as const) {
      const v = (p.titres as Record<string, unknown>)[n];
      if (v) r.titres[n] = bloc(r.titres[n], v);
    }
  }
  if (p.parties && typeof p.parties === 'object') {
    r.parties = { ...(r.parties ?? {}) };
    for (const [nom, v] of Object.entries(p.parties as Record<string, unknown>).slice(0, 30))
      r.parties[nom.slice(0, 160)] = bloc(r.parties[nom.slice(0, 160)], v);
  }
  if (p.sommaire && typeof p.sommaire === 'object') {
    const s = p.sommaire as Record<string, unknown>;
    r.sommaire = { ...(r.sommaire ?? {}) };
    if (typeof s.afficher === 'boolean') r.sommaire.afficher = s.afficher;
    const a = alignement(s.alignement);
    if (a) r.sommaire.alignement = a;
    if (typeof s.titre === 'string' && s.titre.trim())
      r.sommaire.titre = s.titre.trim().slice(0, 80);
  }
  if (p.page_de_garde && typeof p.page_de_garde === 'object') {
    const g = p.page_de_garde as Record<string, unknown>;
    r.page_de_garde = { ...(r.page_de_garde ?? {}) };
    if (typeof g.afficher === 'boolean') r.page_de_garde.afficher = g.afficher;
    for (const k of ['sous_titre', 'auteur', 'etablissement', 'encadrant', 'date'] as const)
      if (typeof g[k] === 'string') r.page_de_garde[k] = (g[k] as string).slice(0, 200);
  }
  const m = nombre(p.marges_cm, r.marges_cm ?? 2.5, 0.5, 5);
  if (m !== undefined) r.marges_cm = m;
  if (typeof p.numeros_de_page === 'boolean') r.numeros_de_page = p.numeros_de_page;
  if (typeof p.numerotation === 'boolean') r.numerotation = p.numerotation;
  return r;
}

/** Réglages complets : style de base (gabarit de la personne ou professionnel) puis réglages de la fiche. */
export function resoudre(mise: MiseEnForme, gabarit: Gabarit | null): Resolue {
  // Le style de la personne seulement quand il est demandé ; sinon la base sobre, que Six adapte (mise_en_forme).
  const perso = mise.style === 'personnel' && gabarit !== null;
  const g = perso ? gabarit : null;
  const police = g?.corps.police || 'Calibri';
  const base = {
    texte: {
      police,
      taille: g?.corps.taille || 11.5,
      couleur: '141822',
      alignement: (g ? (g.justifie ? 'justifie' : 'gauche') : 'justifie') as Alignement,
      interligne: 1.15,
    },
    titre_document: {
      police: g?.titre1.police || police,
      taille: g ? Math.max(24, g.titre1.taille + 6) : 24,
      couleur: g?.titre1.couleur || '1F3864',
      alignement: 'centre' as Alignement,
      gras: true,
    },
    titres: {
      '1': {
        police: g?.titre1.police || police,
        taille: g?.titre1.taille || 17,
        couleur: g?.titre1.couleur || '1F3864',
        alignement: 'gauche' as Alignement,
        gras: true,
      },
      '2': {
        police: g?.titre2.police || police,
        taille: g?.titre2.taille || 14,
        couleur: g?.titre2.couleur || '1F3864',
        alignement: 'gauche' as Alignement,
        gras: true,
      },
      '3': {
        police: g?.titre2.police || police,
        taille: Math.max(12, (g?.titre2.taille || 14) - 2),
        couleur: g?.titre2.couleur || '2F5496',
        alignement: 'gauche' as Alignement,
        gras: true,
      },
    },
  };
  return {
    style: perso ? 'personnel' : 'professionnel',
    texte: {
      ...base.texte,
      ...mise.texte,
      interligne: mise.texte?.interligne ?? base.texte.interligne,
    },
    titre_document: { ...base.titre_document, ...mise.titre_document },
    titres: {
      '1': { ...base.titres['1'], ...mise.titres?.['1'] },
      '2': { ...base.titres['2'], ...mise.titres?.['2'] },
      '3': { ...base.titres['3'], ...mise.titres?.['3'] },
    },
    parties: mise.parties ?? {},
    sommaire: {
      afficher: mise.sommaire?.afficher ?? true,
      alignement: mise.sommaire?.alignement ?? 'gauche',
      titre: mise.sommaire?.titre ?? 'Table des matières',
    },
    page_de_garde: { afficher: false, ...mise.page_de_garde },
    marges_cm: mise.marges_cm ?? (g ? Math.round((g.margesTwips / 567) * 10) / 10 : 2.5),
    numeros_de_page: mise.numeros_de_page ?? true,
    numerotation: mise.numerotation ?? true,
  };
}

/** Réglages propres à une partie (« Conclusion »), comparés sans accents ni numérotation. */
export function reglagesPartie(r: Resolue, intitule: string): StyleBloc | undefined {
  const cle = (t: string) =>
    sansAccents(t)
      .replace(/^[\divxlc]+[.)\-–:]\s*/i, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const c = cle(intitule);
  for (const [nom, s] of Object.entries(r.parties))
    if (cle(nom) === c || (cle(nom).length > 3 && c.includes(cle(nom)))) return s;
  return undefined;
}

// ---------- Fichiers : fiche par rapport et gabarit ----------

const DOSSIER_FICHES = path.join('resultats', '.six');

/** Nom de base d'un rapport (« resultats/rapport.md » → « rapport »), sans risque de chemin. */
export function baseRapport(chemin: string): string {
  return (chemin.split(/[\\/]/).pop() ?? chemin)
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w\-. ]+/g, '-')
    .slice(0, 80);
}

export async function lireFiche(espace: string, chemin: string): Promise<MiseEnForme> {
  try {
    const t = await fs.readFile(
      /*turbopackIgnore: true*/ path.join(espace, DOSSIER_FICHES, `${baseRapport(chemin)}.json`),
      'utf8',
    );
    return JSON.parse(t) as MiseEnForme;
  } catch {
    return {};
  }
}

export async function ecrireFiche(
  espace: string,
  chemin: string,
  mise: MiseEnForme,
): Promise<void> {
  const dossier = path.join(espace, DOSSIER_FICHES);
  await fs.mkdir(/*turbopackIgnore: true*/ dossier, { recursive: true });
  await fs.writeFile(
    /*turbopackIgnore: true*/ path.join(dossier, `${baseRapport(chemin)}.json`),
    JSON.stringify(mise, null, 2),
    'utf8',
  );
}

/** Garde une copie d'une version avant modification (resultats/.six/versions/), pour pouvoir revenir en arrière. */
export async function garderVersion(
  espace: string,
  chemin: string,
  contenu: string,
): Promise<void> {
  const dossier = path.join(espace, DOSSIER_FICHES, 'versions');
  await fs.mkdir(/*turbopackIgnore: true*/ dossier, { recursive: true });
  const horodatage = new Date().toISOString().replace(/[:.]/g, '-');
  await fs.writeFile(
    /*turbopackIgnore: true*/ path.join(dossier, `${baseRapport(chemin)}-${horodatage}.md`),
    contenu,
    'utf8',
  );
}

function lirePolice(t: string, defaut: { police: string; taille: number; couleur: string }) {
  const m = /^(.*?)\s+(\d+(?:\.\d+)?)(?:\s+#([0-9A-Fa-f]{6}))?$/.exec(t.trim());
  if (!m) return defaut;
  return {
    police: m[1] === 'thème' ? defaut.police : m[1],
    taille: Number(m[2]) || defaut.taille,
    couleur: (m[3] ?? defaut.couleur).toUpperCase(),
  };
}

let cacheGabarit: { date: number; g: Gabarit | null } | null = null;

/** Gabarit appris sur les rapports de la personne (local), ou null. */
export async function chargerGabarit(): Promise<Gabarit | null> {
  const corpus = fichierCorpus();
  if (!corpus) return null;
  const dossier = path.join(path.dirname(corpus), 'gabarit');
  try {
    const s = await fs.stat(/*turbopackIgnore: true*/ path.join(dossier, 'gabarit.json'));
    if (cacheGabarit && cacheGabarit.date === s.mtimeMs) return cacheGabarit.g;
    const j = JSON.parse(
      await fs.readFile(/*turbopackIgnore: true*/ path.join(dossier, 'gabarit.json'), 'utf8'),
    ) as {
      corps: string;
      titre1: string;
      titre2: string;
      justifie: boolean;
      marges_twips: number[];
      styles: Gabarit['ids'];
    };
    const lire = (nom: string) =>
      fs.readFile(/*turbopackIgnore: true*/ path.join(dossier, nom), 'utf8').catch(() => undefined);
    const stylesXml = await lire('styles.xml');
    if (!stylesXml) return null;
    const corps = lirePolice(j.corps, { police: 'Times New Roman', taille: 11, couleur: '000000' });
    const g: Gabarit = {
      stylesXml,
      themeXml: await lire('theme1.xml'),
      policesXml: await lire('fontTable.xml'),
      ids: j.styles ?? {},
      corps: { police: corps.police, taille: corps.taille },
      titre1: lirePolice(j.titre1, { police: corps.police, taille: 20, couleur: '0F4761' }),
      titre2: lirePolice(j.titre2, { police: corps.police, taille: 16, couleur: '0F4761' }),
      justifie: Boolean(j.justifie),
      margesTwips: j.marges_twips?.[3] ?? 1417,
    };
    cacheGabarit = { date: s.mtimeMs, g };
    return g;
  } catch {
    return null;
  }
}
