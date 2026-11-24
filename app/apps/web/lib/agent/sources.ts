/**
 * Recherche de sources pour l'agent Cosinus : plusieurs bases savantes interrogées en même temps, résultats
 * fusionnés sans doublons (même DOI ou même titre). Pas de Wikipédia (trop informel pour un travail académique).
 * - academique : OpenAlex (catalogue ouvert, inclut Elsevier, Springer, Wiley, IEEE…), Crossref (registre des DOI de
 *   tous les éditeurs), Semantic Scholar, HAL (archive ouverte francophone) ; Scopus d'Elsevier si ELSEVIER_API_KEY.
 * - francophone : HAL seul (thèses, mémoires, articles en français).
 * - preprints : arXiv (prépublications en sciences, ingénierie, informatique).
 * - sante : PubMed (médecine, santé publique).
 * Google Scholar n'a pas d'accès pour les programmes et interdit les robots : on donne seulement un lien de
 * vérification à la personne.
 */

export type Source = {
  titre: string;
  auteurs: string[];
  annee?: number;
  revue?: string;
  editeur?: string;
  doi?: string;
  lien?: string;
  resume?: string;
  /** Type de document quand la base le donne (Thèse, Mémoire, Article, Prépublication…). */
  genre?: string;
  base: string;
};

const UA = 'Six-Cosinus/1.0 (assistant de recherche)';
const PAR_BASE = 4;
const MAX_RESULTATS = 6;

const nettoyer = (t: string) =>
  t
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function json<T>(url: string, entetes: Record<string, string> = {}): Promise<T | null> {
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'application/json', ...entetes },
      signal: AbortSignal.timeout(15_000),
    });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

async function texte(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(15_000),
    });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

// ---------- Bases ----------

async function openAlex(q: string): Promise<Source[]> {
  type O = {
    display_name?: string;
    publication_year?: number;
    doi?: string | null;
    id?: string;
    authorships?: { author?: { display_name?: string } }[];
    primary_location?: {
      landing_page_url?: string | null;
      source?: { display_name?: string; host_organization_name?: string } | null;
    };
    abstract_inverted_index?: Record<string, number[]> | null;
  };
  const d = await json<{ results?: O[] }>(
    `https://api.openalex.org/works?per-page=${PAR_BASE}&search=${encodeURIComponent(q)}&select=display_name,publication_year,doi,id,authorships,primary_location,abstract_inverted_index`,
  );
  return (d?.results ?? []).map((o) => {
    const mots: string[] = [];
    for (const [m, pos] of Object.entries(o.abstract_inverted_index ?? {}))
      for (const p of pos) mots[p] = m;
    return {
      titre: o.display_name ?? '',
      auteurs: (o.authorships ?? []).map((a) => a.author?.display_name ?? '').filter(Boolean),
      annee: o.publication_year,
      revue: o.primary_location?.source?.display_name,
      editeur: o.primary_location?.source?.host_organization_name,
      doi: o.doi ?? undefined,
      lien: o.primary_location?.landing_page_url ?? o.id,
      resume: mots.filter(Boolean).join(' '),
      base: 'OpenAlex',
    };
  });
}

async function crossref(q: string): Promise<Source[]> {
  type C = {
    DOI?: string;
    title?: string[];
    author?: { given?: string; family?: string; name?: string }[];
    issued?: { 'date-parts'?: number[][] };
    'container-title'?: string[];
    publisher?: string;
    abstract?: string;
    URL?: string;
  };
  const d = await json<{ message?: { items?: C[] } }>(
    `https://api.crossref.org/works?rows=${PAR_BASE}&query=${encodeURIComponent(q)}&select=DOI,title,author,issued,container-title,publisher,abstract,URL`,
  );
  return (d?.message?.items ?? []).map((c) => ({
    titre: c.title?.[0] ?? '',
    auteurs: (c.author ?? [])
      .map((a) => a.name ?? [a.given, a.family].filter(Boolean).join(' '))
      .filter(Boolean),
    annee: c.issued?.['date-parts']?.[0]?.[0],
    revue: c['container-title']?.[0],
    editeur: c.publisher,
    doi: c.DOI ? `https://doi.org/${c.DOI}` : undefined,
    lien: c.URL,
    resume: c.abstract ? nettoyer(c.abstract) : undefined,
    base: 'Crossref',
  }));
}

async function semanticScholar(q: string): Promise<Source[]> {
  type S = {
    title?: string;
    year?: number;
    venue?: string;
    authors?: { name?: string }[];
    externalIds?: { DOI?: string };
    url?: string;
    abstract?: string | null;
  };
  const cle = (process.env.SEMANTIC_SCHOLAR_API_KEY ?? '').trim();
  const d = await json<{ data?: S[] }>(
    `https://api.semanticscholar.org/graph/v1/paper/search?limit=${PAR_BASE}&query=${encodeURIComponent(q)}&fields=title,year,venue,authors,externalIds,url,abstract`,
    cle ? { 'x-api-key': cle } : {},
  );
  return (d?.data ?? []).map((s) => ({
    titre: s.title ?? '',
    auteurs: (s.authors ?? []).map((a) => a.name ?? '').filter(Boolean),
    annee: s.year,
    revue: s.venue || undefined,
    doi: s.externalIds?.DOI ? `https://doi.org/${s.externalIds.DOI}` : undefined,
    lien: s.url,
    resume: s.abstract ?? undefined,
    base: 'Semantic Scholar',
  }));
}

/**
 * Mots qui décrivent le TYPE de source et pas le sujet (« thèse », « mémoire », « article », « francophone »…) : les
 * bases les cherchent tels quels dans les documents, ce qui vide les résultats. On les retire de la requête ; si la
 * personne veut des thèses ou des mémoires, HAL filtre plutôt par type de document.
 */
const MOTS_DE_TYPE =
  /(?<![\wÀ-ÿ])(th[eè]ses?|m[ée]moires?|articles?|publications?|sources?|r[ée]f[ée]rences?|francophones?|fran[cç]ais|scientifiques?|acad[ée]miques?|pdf|travaux|[ée]tudes?|recherches?|thesis|theses|papers?|articles?)(?![\wÀ-ÿ])/gi;

export function nettoyerRequete(q: string): { sujet: string; thesesMemoires: boolean } {
  const thesesMemoires =
    /(?<![\wÀ-ÿ])(th[eè]ses?|m[ée]moires?|thesis|theses|dissertations?)(?![\wÀ-ÿ])/i.test(q);
  const sujet = q.replace(MOTS_DE_TYPE, ' ').replace(/\s+/g, ' ').trim();
  return { sujet: sujet.length >= 3 ? sujet : q, thesesMemoires };
}

async function hal(q: string, thesesMemoires = false): Promise<Source[]> {
  const res = await halBrut(q, thesesMemoires);
  // Rien parmi les thèses et mémoires : on élargit à tous les types de documents.
  return res.length || !thesesMemoires ? res : halBrut(q, false);
}

async function halBrut(q: string, thesesMemoires: boolean): Promise<Source[]> {
  type H = {
    title_s?: string[];
    authFullName_s?: string[];
    producedDateY_i?: number;
    uri_s?: string;
    doiId_s?: string;
    journalTitle_s?: string;
    abstract_s?: string[];
    docType_s?: string;
  };
  const d = await json<{ response?: { docs?: H[] } }>(
    `https://api.archives-ouvertes.fr/search/?wt=json&rows=${PAR_BASE}&q=${encodeURIComponent(q)}&fl=title_s,authFullName_s,producedDateY_i,uri_s,doiId_s,journalTitle_s,abstract_s,docType_s${thesesMemoires ? `&fq=${encodeURIComponent('docType_s:(THESE OR MEM OR HDR)')}` : ''}`,
  );
  const genres: Record<string, string> = {
    THESE: 'Thèse',
    MEM: 'Mémoire',
    ART: 'Article',
    COMM: 'Communication',
  };
  return (d?.response?.docs ?? []).map((h) => ({
    titre: h.title_s?.[0] ?? '',
    auteurs: h.authFullName_s ?? [],
    annee: h.producedDateY_i,
    revue: h.journalTitle_s,
    genre: h.docType_s ? (genres[h.docType_s] ?? undefined) : undefined,
    doi: h.doiId_s ? `https://doi.org/${h.doiId_s}` : undefined,
    lien: h.uri_s,
    resume: h.abstract_s?.[0],
    base: 'HAL',
  }));
}

async function arxiv(q: string): Promise<Source[]> {
  const xml = await texte(
    `https://export.arxiv.org/api/query?max_results=${PAR_BASE}&search_query=all:${encodeURIComponent(q)}`,
  );
  if (!xml) return [];
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => {
    const champ = (n: string) =>
      nettoyer(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`).exec(e)?.[1] ?? '');
    return {
      titre: champ('title'),
      auteurs: [...e.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => nettoyer(m[1])),
      annee: Number(champ('published').slice(0, 4)) || undefined,
      revue: 'arXiv (prépublication, non évaluée par les pairs)',
      lien: champ('id'),
      resume: champ('summary'),
      base: 'arXiv',
    };
  });
}

async function pubmed(q: string): Promise<Source[]> {
  const ids = await json<{ esearchresult?: { idlist?: string[] } }>(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=${PAR_BASE}&term=${encodeURIComponent(q)}`,
  );
  const liste = ids?.esearchresult?.idlist ?? [];
  if (!liste.length) return [];
  type P = {
    title?: string;
    pubdate?: string;
    fulljournalname?: string;
    authors?: { name?: string }[];
    articleids?: { idtype?: string; value?: string }[];
  };
  const d = await json<{ result?: Record<string, P> }>(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${liste.join(',')}`,
  );
  return liste.flatMap((id) => {
    const p = d?.result?.[id];
    if (!p) return [];
    const doi = p.articleids?.find((a) => a.idtype === 'doi')?.value;
    return [
      {
        titre: p.title ?? '',
        auteurs: (p.authors ?? []).map((a) => a.name ?? '').filter(Boolean),
        annee: Number(p.pubdate?.slice(0, 4)) || undefined,
        revue: p.fulljournalname,
        doi: doi ? `https://doi.org/${doi}` : undefined,
        lien: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        base: 'PubMed',
      },
    ];
  });
}

/** Scopus (Elsevier) : seulement avec une clé ELSEVIER_API_KEY (dev.elsevier.com). */
async function scopus(q: string): Promise<Source[]> {
  const cle = (process.env.ELSEVIER_API_KEY ?? '').trim();
  if (!cle) return [];
  type E = {
    'dc:title'?: string;
    'dc:creator'?: string;
    'prism:coverDate'?: string;
    'prism:publicationName'?: string;
    'prism:doi'?: string;
    'prism:url'?: string;
  };
  const d = await json<{ 'search-results'?: { entry?: E[] } }>(
    `https://api.elsevier.com/content/search/scopus?count=${PAR_BASE}&query=${encodeURIComponent(`TITLE-ABS-KEY(${q})`)}`,
    { 'x-els-apikey': cle },
  );
  return (d?.['search-results']?.entry ?? []).map((e) => ({
    titre: e['dc:title'] ?? '',
    auteurs: e['dc:creator'] ? [e['dc:creator']] : [],
    annee: Number(e['prism:coverDate']?.slice(0, 4)) || undefined,
    revue: e['prism:publicationName'],
    editeur: 'Elsevier (Scopus)',
    doi: e['prism:doi'] ? `https://doi.org/${e['prism:doi']}` : undefined,
    lien: e['prism:url'],
    base: 'Scopus',
  }));
}

// ---------- Fusion ----------

const cleTitre = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 80);

/**
 * Fusionne les résultats de plusieurs bases : un même travail (même DOI ou même titre) n'apparaît qu'une fois, en
 * gardant les champs les plus complets, et on alterne les bases pour garder des sources variées.
 */
export function fusionner(listes: Source[][], max = MAX_RESULTATS): Source[] {
  const vus = new Map<string, Source>();
  const ordre: Source[] = [];
  const longueur = Math.max(0, ...listes.map((l) => l.length));
  for (let i = 0; i < longueur; i++) {
    for (const l of listes) {
      const s = l[i];
      if (!s?.titre.trim()) continue;
      const doi = s.doi?.toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
      const cles = [doi ? `doi:${doi}` : '', `t:${cleTitre(s.titre)}`].filter(Boolean);
      const deja = cles.map((k) => vus.get(k)).find(Boolean);
      if (deja) {
        for (const champ of ['revue', 'editeur', 'doi', 'lien', 'resume', 'annee'] as const)
          if (!deja[champ] && s[champ]) Object.assign(deja, { [champ]: s[champ] });
        if (!deja.base.includes(s.base)) deja.base += `, ${s.base}`;
        continue;
      }
      const copie = { ...s };
      for (const k of cles) vus.set(k, copie);
      ordre.push(copie);
    }
  }
  return ordre.slice(0, max);
}

export function formaterSources(sources: Source[], requete: string): string {
  const scholar = `https://scholar.google.com/scholar?q=${encodeURIComponent(requete)}`;
  if (!sources.length)
    return `Aucune publication trouvée pour « ${requete} ». Essaie d'autres mots-clés (souvent en anglais). Vérification manuelle possible : ${scholar}`;
  const lignes = sources.map((s, i) => {
    const auteurs = s.auteurs.slice(0, 3).join(', ') + (s.auteurs.length > 3 ? ' et al.' : '');
    const ou = [s.genre ? `Type : ${s.genre}` : '', s.revue, s.editeur].filter(Boolean).join(' — ');
    const resume = s.resume ? `\n   Résumé : ${nettoyer(s.resume).slice(0, 180)}…` : '';
    return `${i + 1}. ${nettoyer(s.titre)} (${s.annee ?? 's. d.'})${auteurs ? ` — ${auteurs}` : ''}${ou ? `\n   ${ou}` : ''}\n   ${s.doi ?? s.lien ?? ''} [via ${s.base}]${resume}`;
  });
  return `${lignes.join('\n')}\n\nPour vérifier ou compléter, la personne peut chercher sur Google Scholar : ${scholar}`;
}

export type TypeRecherche = 'academique' | 'francophone' | 'preprints' | 'sante';
export const TYPES_RECHERCHE: TypeRecherche[] = ['academique', 'francophone', 'preprints', 'sante'];

export const BASES_PAR_TYPE: Record<TypeRecherche, string> = {
  academique: 'OpenAlex, Crossref, Semantic Scholar, HAL',
  francophone: 'HAL',
  preprints: 'arXiv',
  sante: 'PubMed',
};

export async function chercherSources(requete: unknown, type: unknown): Promise<string> {
  const q = typeof requete === 'string' ? requete.trim().slice(0, 200) : '';
  if (!q) return 'Requête vide.';
  const t: TypeRecherche = TYPES_RECHERCHE.includes(type as TypeRecherche)
    ? (type as TypeRecherche)
    : 'academique';
  const { sujet, thesesMemoires } = nettoyerRequete(q);
  const appels: Promise<Source[]>[] =
    t === 'francophone'
      ? [hal(sujet, thesesMemoires)]
      : t === 'preprints'
        ? [arxiv(sujet)]
        : t === 'sante'
          ? [pubmed(sujet), openAlex(sujet)]
          : [
              scopus(sujet),
              openAlex(sujet),
              crossref(sujet),
              semanticScholar(sujet),
              hal(sujet, thesesMemoires),
            ];
  const listes = await Promise.all(appels.map((p) => p.catch(() => [] as Source[])));
  return formaterSources(fusionner(listes), sujet);
}
