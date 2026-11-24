import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Mémoire des documents de la personne : son corpus (ia/corpus/documents.jsonl, construit par ia/outils/corpus.py à
 * partir de ses propres Word et PowerPoint). Avant de rédiger, l'agent y cherche des documents proches et imite leur
 * plan et leur style : c'est l'apprentissage « classique », sans réentraîner le modèle.
 * Recherche par mots-clés (BM25), entièrement locale, sans index à télécharger. Local seulement, comme l'espace.
 */

type DocCorpus = {
  chemin?: string;
  titre: string;
  type: string;
  plan: string[];
  texte: string;
  mots: number;
  qualite?: number;
};
type Index = {
  docs: DocCorpus[];
  termes: Map<string, number>[];
  longueurs: number[];
  df: Map<string, number>;
};

const MOTS_VIDES = new Set(
  'les des une pour par sur dans avec que qui est sont aux ces ses son mes mon nos vos leur leurs plus moins entre sans sous cette elle ils elles nous vous être avoir fait faire comme mais donc car pas tout tous très the and for with this that from are was were have has into chapitre section partie'.split(
    ' ',
  ),
);

export function mots(t: string): string[] {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length >= 3 && !MOTS_VIDES.has(m));
}

export function fichierCorpus(): string {
  const v = (process.env.SIXTOUCH_CORPUS ?? '').trim();
  if (v) return path.resolve(/*turbopackIgnore: true*/ v);
  if (process.env.NODE_ENV === 'development')
    return path.resolve(
      /*turbopackIgnore: true*/ process.cwd(),
      '..',
      '..',
      '..',
      'ia',
      'corpus',
      'documents.jsonl',
    );
  return '';
}

let cache: { fichier: string; date: number; index: Index } | null = null;

export function indexer(docs: DocCorpus[]): Index {
  const termes = docs.map((d) => {
    const m = new Map<string, number>();
    // Le titre et le plan comptent davantage que le corps du texte.
    const ajouter = (t: string, poids: number) => {
      for (const x of mots(t)) m.set(x, (m.get(x) ?? 0) + poids);
    };
    ajouter(d.titre, 4);
    ajouter(d.plan.join(' '), 2);
    ajouter(d.texte.slice(0, 40000), 1);
    return m;
  });
  const df = new Map<string, number>();
  for (const t of termes) for (const k of t.keys()) df.set(k, (df.get(k) ?? 0) + 1);
  return {
    docs,
    termes,
    longueurs: termes.map((t) => [...t.values()].reduce((a, b) => a + b, 0)),
    df,
  };
}

async function charger(): Promise<Index | null> {
  const fichier = fichierCorpus();
  if (!fichier) return null;
  try {
    // Documents que Six ne doit pas consulter (vie privée, ou documents réservés au banc d'évaluation) :
    // ia/corpus/exclus-memoire.json, une liste de chemins. Sa modification recharge l'index.
    const fichierExclus = path.join(path.dirname(fichier), 'exclus-memoire.json');
    const s = await fs.stat(/*turbopackIgnore: true*/ fichier);
    const sExclus = await fs.stat(/*turbopackIgnore: true*/ fichierExclus).catch(() => null);
    const fichierQualite = path.join(path.dirname(fichier), 'meilleurs-rapports.json');
    const sQualite = await fs.stat(/*turbopackIgnore: true*/ fichierQualite).catch(() => null);
    const date = s.mtimeMs + (sExclus?.mtimeMs ?? 0) + (sQualite?.mtimeMs ?? 0);
    if (cache && cache.fichier === fichier && cache.date === date) return cache.index;
    const exclus = new Set<string>(
      sExclus
        ? (JSON.parse(
            await fs.readFile(/*turbopackIgnore: true*/ fichierExclus, 'utf8'),
          ) as string[])
        : [],
    );
    const docs = (await fs.readFile(/*turbopackIgnore: true*/ fichier, 'utf8'))
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as DocCorpus)
      .filter((d) => !d.chemin || !exclus.has(d.chemin));
    // Classement structurel, pas certification scientifique ; les exclusions restent prioritaires.
    const classement = await fs
      .readFile(/*turbopackIgnore: true*/ fichierQualite, 'utf8')
      .catch(() => '{}');
    const notes = new Map<string, number>(
      (JSON.parse(classement).rapports ?? []).map((r: { chemin: string; note: number }) => [
        r.chemin,
        r.note,
      ]),
    );
    for (const doc of docs) doc.qualite = notes.get(doc.chemin || '');
    cache = { fichier, date, index: indexer(docs) };
    return cache.index;
  } catch {
    return null;
  }
}

export async function corpusDisponible(): Promise<boolean> {
  return Boolean(await charger());
}

/** Les documents les plus proches de la requête (BM25), du plus pertinent au moins pertinent. */
export function classer(index: Index, requete: string, n = 3): { doc: DocCorpus; score: number }[] {
  const q = [...new Set(mots(requete))];
  const N = index.docs.length;
  const moyenne = index.longueurs.reduce((a, b) => a + b, 0) / Math.max(1, N);
  const k1 = 1.4;
  const b = 0.75;
  return index.docs
    .map((doc, i) => {
      let score = 0;
      for (const t of q) {
        const f = index.termes[i].get(t) ?? 0;
        if (!f) continue;
        const idf = Math.log(
          1 + (N - (index.df.get(t) ?? 0) + 0.5) / ((index.df.get(t) ?? 0) + 0.5),
        );
        score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * index.longueurs[i]) / moyenne));
      }
      return { doc, score: score * (1 + Math.max(0, (doc.qualite ?? 50) - 50) / 100) };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, n);
}

/** Passage du texte le plus riche en mots de la requête (pour montrer le style d'écriture). */
function meilleurPassage(texte: string, requete: string, taille = 900): string {
  const q = new Set(mots(requete));
  const paras = texte.split('\n').filter((p) => p.length > 80 && !p.startsWith('#'));
  let meilleur = paras[0] ?? '';
  let max = -1;
  for (const p of paras) {
    const s = mots(p).filter((m) => q.has(m)).length;
    if (s > max) {
      max = s;
      meilleur = p;
    }
  }
  return meilleur.length > taille ? `${meilleur.slice(0, taille)}…` : meilleur;
}

export async function chercherMesDocuments(requete: unknown): Promise<string> {
  const q = typeof requete === 'string' ? requete.trim().slice(0, 200) : '';
  if (!q) return 'Requête vide.';
  const index = await charger();
  if (!index) return 'Les documents de la personne ne sont pas disponibles ici.';
  const res = classer(index, q);
  if (!res.length)
    return `Aucun document de la personne ne ressemble à « ${q} ». Rédige avec le plan académique habituel.`;
  return res
    .map(({ doc }, i) => {
      const plan = doc.plan
        .slice(0, 22)
        .map((t) => `   - ${t}`)
        .join('\n');
      return `${i + 1}. « ${doc.titre} » (${doc.type}, ${doc.mots} mots${doc.qualite ? `, qualité structurelle ${doc.qualite}/100, contenu non certifié` : ''})\n${plan ? `   Plan :\n${plan}\n` : ''}   Extrait (style d'écriture) : ${meilleurPassage(doc.texte, q)}`;
    })
    .join('\n\n');
}

/**
 * Fiche de style de la personne (ia/corpus/style.md, calculée par ia/outils/style.py sur ses propres documents) :
 * ajoutée aux consignes de l'agent pour qu'il écrive comme elle. Chaîne vide si elle n'existe pas.
 */
export async function ficheStyle(): Promise<string> {
  const corpus = fichierCorpus();
  if (!corpus) return '';
  try {
    return (
      await fs.readFile(
        /*turbopackIgnore: true*/ path.join(path.dirname(corpus), 'style.md'),
        'utf8',
      )
    )
      .trim()
      .slice(0, 2000);
  } catch {
    return '';
  }
}
