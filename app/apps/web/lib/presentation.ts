/**
 * Présentations (artefact de type « presentation », lib/artefacts.ts) : Six écrit les diapositives en JSON, l'app les
 * met en page dans un thème (lib/presentation-mise-en-page.ts), les montre dans le panneau et les exporte en .pptx
 * (lib/pptx.ts). Une seule mise en page sert à l'aperçu et au fichier : ce qu'on voit est ce qu'on télécharge.
 *
 * Les vingt-trois thèmes sont des créations de Six inspirées de styles courants (éditorial sombre, minimal, vagues,
 * sépia, lilas, aquarelle, acier, académique, losanges, bordeaux, sauge, rose poudré, sable, graphite, hexagones,
 * corporate, olive, noir et or, marine, cercles, émeraude, forêt, prestige).
 */

export type TypeDiapo =
  | 'titre'
  | 'sommaire'
  | 'section'
  | 'texte'
  | 'colonnes'
  | 'chiffres'
  | 'etapes'
  | 'graphique'
  | 'tableau'
  | 'citation'
  | 'equipe'
  | 'fin';

export type Diapositive = {
  type: TypeDiapo;
  titre: string;
  sous_titre?: string;
  texte?: string;
  numero?: string;
  auteur?: string;
  points?: string[];
  colonnes?: { titre: string; texte: string }[];
  chiffres?: { valeur: string; libelle: string }[];
  etapes?: { titre: string; texte: string }[];
  series?: { libelle: string; valeur: number }[];
  lignes?: string[][];
  membres?: { nom: string; role: string }[];
};

export type Presentation = {
  theme: IdTheme;
  titre: string;
  diapositives: Diapositive[];
};

export type IdTheme =
  | 'editorial'
  | 'ardoise'
  | 'vague'
  | 'sepia'
  | 'lilas'
  | 'aquarelle'
  | 'acier'
  | 'academique'
  | 'prune'
  | 'bordeaux'
  | 'sauge'
  | 'poudre'
  | 'sable'
  | 'graphite'
  | 'hexagone'
  | 'corporate'
  | 'olive'
  | 'juridique'
  | 'marine'
  | 'cercles'
  | 'emeraude'
  | 'foret'
  | 'prestige';

/** Décor propre au thème (formes dessinées par la mise en page). */
export type Decor =
  | 'editorial'
  | 'ardoise'
  | 'vague'
  | 'arche'
  | 'blob'
  | 'points'
  | 'acier'
  | 'cadre'
  | 'losanges'
  | 'bandeau'
  | 'anneaux'
  | 'arches'
  | 'cartes'
  | 'diagonale'
  | 'emeraude'
  | 'foret'
  | 'graphite'
  | 'marine'
  | 'or'
  | 'poudre'
  | 'prestige'
  | 'sauge'
  | 'traits';

export type Theme = {
  id: IdTheme;
  nom: string;
  /** Fond des diapositives de contenu. */
  fond: string;
  /** Fond des diapositives fortes (titre, section, fin) ; null : même fond, décor plus présent. */
  fondFort: string | null;
  encre: string;
  /** Texte sur le fond fort. */
  encreFort: string;
  accent: string;
  accent2: string;
  /** Surfaces douces (cartes, pastilles). */
  doux: string;
  /** Texte secondaire. */
  discret: string;
  policeTitre: string;
  policeCorps: string;
  majuscules: boolean;
  decor: Decor;
};

export const THEMES: Theme[] = [
  {
    id: 'editorial',
    nom: 'Éditorial',
    fond: '#E6DED0',
    fondFort: '#262626',
    encre: '#1E1E1E',
    encreFort: '#E6DED0',
    accent: '#1E1E1E',
    accent2: '#8C8273',
    doux: '#D9CFBE',
    discret: '#5B554C',
    policeTitre: 'Impact',
    policeCorps: 'Arial',
    majuscules: true,
    decor: 'editorial',
  },
  {
    id: 'ardoise',
    nom: 'Minimal ardoise',
    fond: '#FFFFFF',
    fondFort: null,
    encre: '#2B3245',
    encreFort: '#2B3245',
    accent: '#3F4A6B',
    accent2: '#8E97B3',
    doux: '#EEF0F5',
    discret: '#6B7286',
    policeTitre: 'Arial',
    policeCorps: 'Arial',
    majuscules: false,
    decor: 'ardoise',
  },
  {
    id: 'vague',
    nom: 'Vague bleue',
    fond: '#FFFFFF',
    fondFort: null,
    encre: '#0B2E52',
    encreFort: '#0B2E52',
    accent: '#1565C0',
    accent2: '#0B3D6E',
    doux: '#E3EEF9',
    discret: '#4A6380',
    policeTitre: 'Arial Black',
    policeCorps: 'Arial',
    majuscules: false,
    decor: 'vague',
  },
  {
    id: 'sepia',
    nom: 'Nuit sépia',
    fond: '#D9CFC1',
    fondFort: '#2B2824',
    encre: '#2B2824',
    encreFort: '#E8DFD2',
    accent: '#6E6257',
    accent2: '#A89A89',
    doux: '#CBBFAE',
    discret: '#5E554B',
    policeTitre: 'Arial',
    policeCorps: 'Arial',
    majuscules: true,
    decor: 'arche',
  },
  {
    id: 'lilas',
    nom: 'Lilas campus',
    fond: '#F6EEEA',
    fondFort: null,
    encre: '#1F1426',
    encreFort: '#1F1426',
    accent: '#3B1650',
    accent2: '#C9A7D8',
    doux: '#E7D3EE',
    discret: '#5C4A66',
    policeTitre: 'Arial Black',
    policeCorps: 'Arial',
    majuscules: true,
    decor: 'blob',
  },
  {
    id: 'aquarelle',
    nom: 'Aquarelle',
    fond: '#FBF4FD',
    fondFort: null,
    encre: '#2A2235',
    encreFort: '#2A2235',
    accent: '#9B85B8',
    accent2: '#2A2235',
    doux: '#E9DDF2',
    discret: '#5E536B',
    policeTitre: 'Georgia',
    policeCorps: 'Georgia',
    majuscules: true,
    decor: 'points',
  },
  {
    id: 'acier',
    nom: 'Acier',
    fond: '#FFFFFF',
    fondFort: '#2E2E2E',
    encre: '#222222',
    encreFort: '#FFFFFF',
    accent: '#4A7FA7',
    accent2: '#9CC3DE',
    doux: '#E8EEF3',
    discret: '#5F6B75',
    policeTitre: 'Arial',
    policeCorps: 'Arial',
    majuscules: false,
    decor: 'acier',
  },
  {
    id: 'academique',
    nom: 'Académique',
    fond: '#FFFFFF',
    fondFort: null,
    encre: '#1B2A4E',
    encreFort: '#1B2A4E',
    accent: '#1F3C88',
    accent2: '#3D6DD8',
    doux: '#EAF0FB',
    discret: '#56617A',
    policeTitre: 'Arial',
    policeCorps: 'Arial',
    majuscules: false,
    decor: 'cadre',
  },
  {
    id: 'prune',
    nom: 'Prune géométrique',
    fond: '#FFFFFF',
    fondFort: null,
    encre: '#2A0F26',
    encreFort: '#2A0F26',
    accent: '#4A1942',
    accent2: '#B48AA8',
    doux: '#ECE4EA',
    discret: '#6A5465',
    policeTitre: 'Arial Black',
    policeCorps: 'Arial',
    majuscules: true,
    decor: 'losanges',
  },
  {
    id: 'bordeaux',
    nom: 'Bordeaux classique',
    fond: '#FBF7EE',
    fondFort: null,
    encre: '#3A1414',
    encreFort: '#3A1414',
    accent: '#7A1E1E',
    accent2: '#B8857F',
    doux: '#F1E6DC',
    discret: '#6B5250',
    policeTitre: 'Georgia',
    policeCorps: 'Georgia',
    majuscules: true,
    decor: 'bandeau',
  },
  {
    id: 'sauge',
    nom: 'Sauge',
    fond: '#FFFFFF',
    fondFort: null,
    encre: '#33402F',
    encreFort: '#33402F',
    accent: '#7F9A74',
    accent2: '#C9D6C0',
    doux: '#EEF3EA',
    discret: '#66735F',
    policeTitre: 'Arial',
    policeCorps: 'Arial',
    majuscules: true,
    decor: 'sauge',
  },
  {
    id: 'poudre',
    nom: 'Rose poudré',
    fond: '#FFFFFF',
    fondFort: null,
    encre: '#3B3333',
    encreFort: '#3B3333',
    accent: '#B98E88',
    accent2: '#D9C5C1',
    doux: '#F4ECEA',
    discret: '#7A6E6C',
    policeTitre: 'Arial',
    policeCorps: 'Arial',
    majuscules: false,
    decor: 'poudre',
  },
  {
    id: 'sable',
    nom: 'Sable et arches',
    fond: '#FFFFFF',
    fondFort: null,
    encre: '#1E1A14',
    encreFort: '#1E1A14',
    accent: '#B89C72',
    accent2: '#D9C3A0',
    doux: '#F3EBDD',
    discret: '#6A5F50',
    policeTitre: 'Arial Black',
    policeCorps: 'Arial',
    majuscules: false,
    decor: 'arches',
  },
  {
    id: 'graphite',
    nom: 'Graphite',
    fond: '#FFFFFF',
    fondFort: null,
    encre: '#2F3035',
    encreFort: '#2F3035',
    accent: '#3A3A3F',
    accent2: '#A7A8AD',
    doux: '#ECECEE',
    discret: '#6B6C72',
    policeTitre: 'Arial',
    policeCorps: 'Arial',
    majuscules: true,
    decor: 'graphite',
  },
  {
    id: 'hexagone',
    nom: 'Hexagones marine',
    fond: '#FFFFFF',
    fondFort: null,
    encre: '#16224D',
    encreFort: '#16224D',
    accent: '#22337A',
    accent2: '#7F8FC4',
    doux: '#E8ECF7',
    discret: '#55608A',
    policeTitre: 'Arial',
    policeCorps: 'Arial',
    majuscules: false,
    decor: 'diagonale',
  },
  {
    id: 'corporate',
    nom: 'Corporate gris',
    fond: '#FFFFFF',
    fondFort: '#3D3D3D',
    encre: '#2B2B2B',
    encreFort: '#FFFFFF',
    accent: '#3D3D3D',
    accent2: '#9A9A9A',
    doux: '#EFEFEF',
    discret: '#6E6E6E',
    policeTitre: 'Arial',
    policeCorps: 'Arial',
    majuscules: false,
    decor: 'traits',
  },
  {
    id: 'olive',
    nom: 'Olive vintage',
    fond: '#F4EFE1',
    fondFort: null,
    encre: '#3B3A2A',
    encreFort: '#3B3A2A',
    accent: '#7E9470',
    accent2: '#B9C7A9',
    doux: '#E6E6D2',
    discret: '#6C6B57',
    policeTitre: 'Georgia',
    policeCorps: 'Georgia',
    majuscules: true,
    decor: 'cartes',
  },
  {
    id: 'juridique',
    nom: 'Noir et or',
    fond: '#FFFFFF',
    fondFort: '#1C1D24',
    encre: '#1C1D24',
    encreFort: '#F3EEE2',
    accent: '#BFA77A',
    accent2: '#8C7A52',
    doux: '#F2EEE6',
    discret: '#5D5E66',
    policeTitre: 'Georgia',
    policeCorps: 'Arial',
    majuscules: false,
    decor: 'or',
  },
  {
    id: 'marine',
    nom: 'Marine',
    fond: '#F7F4EE',
    fondFort: '#1E2A47',
    encre: '#1E2A47',
    encreFort: '#F7F4EE',
    accent: '#1E2A47',
    accent2: '#8A9BB8',
    doux: '#E4E8F0',
    discret: '#55607A',
    policeTitre: 'Impact',
    policeCorps: 'Arial',
    majuscules: true,
    decor: 'marine',
  },
  {
    id: 'cercles',
    nom: 'Cercles bleus',
    fond: '#FFFFFF',
    fondFort: null,
    encre: '#1D2F45',
    encreFort: '#1D2F45',
    accent: '#2E5A8A',
    accent2: '#9FB4CC',
    doux: '#E6EDF5',
    discret: '#58697C',
    policeTitre: 'Arial',
    policeCorps: 'Arial',
    majuscules: false,
    decor: 'anneaux',
  },
  {
    id: 'emeraude',
    nom: 'Émeraude',
    fond: '#FFFFFF',
    fondFort: '#1F4D3F',
    encre: '#17352C',
    encreFort: '#FFFFFF',
    accent: '#1F4D3F',
    accent2: '#6FA88E',
    doux: '#E4EFE9',
    discret: '#557066',
    policeTitre: 'Arial Black',
    policeCorps: 'Arial',
    majuscules: true,
    decor: 'emeraude',
  },
  {
    id: 'foret',
    nom: 'Forêt',
    fond: '#FFFFFF',
    fondFort: null,
    encre: '#173322',
    encreFort: '#173322',
    accent: '#1E6B3A',
    accent2: '#9CC5A8',
    doux: '#E3F0E7',
    discret: '#4F6A58',
    policeTitre: 'Arial Black',
    policeCorps: 'Arial',
    majuscules: true,
    decor: 'foret',
  },
  {
    id: 'prestige',
    nom: 'Prestige or',
    fond: '#FFFFFF',
    fondFort: '#0E1E3A',
    encre: '#0E1E3A',
    encreFort: '#FFFFFF',
    accent: '#0E1E3A',
    accent2: '#D4A93C',
    doux: '#EEF1F6',
    discret: '#4E5A70',
    policeTitre: 'Arial Black',
    policeCorps: 'Arial',
    majuscules: true,
    decor: 'prestige',
  },
];

export const THEME_PAR_DEFAUT: IdTheme = 'editorial';
export const theme = (id: string): Theme => THEMES.find((t) => t.id === id) ?? THEMES[0];

export const DIAPOS_MAX = 30;
const TYPES: TypeDiapo[] = [
  'titre',
  'sommaire',
  'section',
  'texte',
  'colonnes',
  'chiffres',
  'etapes',
  'graphique',
  'tableau',
  'citation',
  'equipe',
  'fin',
];

const txt = (v: unknown, max = 600) =>
  typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : '';
const liste = <T>(v: unknown, max: number, f: (x: unknown) => T | null): T[] =>
  (Array.isArray(v) ? v : [])
    .map(f)
    .filter((x): x is T => x !== null)
    .slice(0, max);
const objet = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function curerDiapo(v: unknown): Diapositive | null {
  const o = objet(v);
  const type = (TYPES as string[]).includes(String(o.type)) ? (o.type as TypeDiapo) : 'texte';
  const d: Diapositive = { type, titre: txt(o.titre, 160) };
  const sous = txt(o.sous_titre ?? o.sousTitre, 240);
  if (sous) d.sous_titre = sous;
  const texte = txt(o.texte, 900);
  if (texte) d.texte = texte;
  const numero = txt(o.numero, 6);
  if (numero) d.numero = numero;
  const auteur = txt(o.auteur, 120);
  if (auteur) d.auteur = auteur;
  const points = liste(o.points, 8, (p) => txt(p, 200) || null);
  if (points.length) d.points = points;
  const paire = (a: string, b: string) => (x: unknown) => {
    const p = objet(x);
    const t = txt(p[a], 120);
    return t ? { t, u: txt(p[b], 300) } : null;
  };
  const colonnes = liste(o.colonnes, 4, paire('titre', 'texte'));
  if (colonnes.length) d.colonnes = colonnes.map(({ t, u }) => ({ titre: t, texte: u }));
  const chiffres = liste(o.chiffres, 4, paire('valeur', 'libelle'));
  if (chiffres.length) d.chiffres = chiffres.map(({ t, u }) => ({ valeur: t, libelle: u }));
  const etapes = liste(o.etapes, 6, paire('titre', 'texte'));
  if (etapes.length) d.etapes = etapes.map(({ t, u }) => ({ titre: t, texte: u }));
  const membres = liste(o.membres, 6, paire('nom', 'role'));
  if (membres.length) d.membres = membres.map(({ t, u }) => ({ nom: t, role: u }));
  const series = liste(o.series, 12, (x) => {
    const p = objet(x);
    const valeur = Number(p.valeur);
    const libelle = txt(p.libelle, 40);
    return libelle && Number.isFinite(valeur) ? { libelle, valeur } : null;
  });
  if (series.length) d.series = series;
  const lignes = liste(o.lignes, 9, (l) => {
    const cellules = liste(l, 6, (c) => txt(c, 80));
    return cellules.length ? cellules : null;
  });
  if (lignes.length) d.lignes = lignes;
  // Une diapositive sans rien à montrer est écartée.
  const vide =
    !d.titre &&
    !d.texte &&
    !d.points &&
    !d.colonnes &&
    !d.chiffres &&
    !d.etapes &&
    !d.series &&
    !d.lignes &&
    !d.membres;
  return vide ? null : d;
}

/**
 * Lit le JSON d'une présentation (tolérant : clôture ```json, texte autour, champs manquants). Null si rien
 * d'utilisable : le panneau montre alors le texte brut.
 */
export function lirePresentation(contenu: string): Presentation | null {
  const debut = contenu.indexOf('{');
  const fin = contenu.lastIndexOf('}');
  if (debut < 0 || fin <= debut) return null;
  let brut: unknown;
  try {
    brut = JSON.parse(contenu.slice(debut, fin + 1));
  } catch {
    return null;
  }
  const o = objet(brut);
  const diapositives = liste(o.diapositives ?? o.slides, DIAPOS_MAX, curerDiapo);
  if (!diapositives.length) return null;
  return {
    theme: theme(txt(o.theme, 20)).id,
    titre: txt(o.titre, 160) || diapositives[0].titre || 'Présentation',
    diapositives,
  };
}
