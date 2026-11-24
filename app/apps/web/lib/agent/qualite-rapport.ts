import { lireMarkdown, type Bloc } from './documents';

/**
 * Contrôle qualité d'un rapport rédigé par Six, avant son enregistrement en Word et PDF. Les règles viennent des
 * meilleurs rapports de la personne (ia/corpus/meilleurs-rapports.json) et des guides de rédaction reconnus
 * (ia/corpus/normes-rapport.md) : parties attendues dans le bon ordre, développement argumenté, références vérifiables,
 * citations dans le texte.
 * - grave : à corriger avant d'enregistrer (Six reçoit la liste et réécrit le rapport une fois) ;
 * - mineur : signalé, le rapport est enregistré quand même.
 */

export type Probleme = { grave: boolean; texte: string };

const sansAccents = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Intitulé sans numérotation (« 2.1 », « II. », « Partie 1 : ») ni accents. */
export function cleTitre(t: string): string {
  return sansAccents(t)
    .replace(/\*\*/g, '')
    .replace(/^\s*((chapitre|partie|section)\s+)?([ivxlc]+|\d+(\.\d+)*|[a-z])\s*[.):\-–]\s*/i, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type Role =
  'liminaire' | 'introduction' | 'developpement' | 'conclusion' | 'references' | 'annexe';

/** Rôle d'une partie d'après son intitulé. */
export function rolePartie(titre: string): Role {
  const c = cleTitre(titre);
  if (/^(introduction|introduction generale)\b/.test(c)) return 'introduction';
  if (
    /^(conclusions?|conclusion generale|conclusion et perspectives?|conclusions? et recommandations?)\b/.test(
      c,
    )
  )
    return 'conclusion';
  if (
    /^(references?( bibliographiques)?|bibliographie|webographie|sources?( consultees| documentaires| bibliographiques)?|ouvrages cites)\b/.test(
      c,
    )
  )
    return 'references';
  if (/^annexes?\b/.test(c)) return 'annexe';
  if (
    /^(resume|abstract|remerciements?|dedicace|epigraphe|avant propos|sommaire|table des matieres|liste des|sigles|abreviations|glossaire)\b/.test(
      c,
    )
  )
    return 'liminaire';
  return 'developpement';
}

type Partie = { titre: string; role: Role; blocs: Bloc[] };

/** Découpe le rapport en parties de premier niveau (après le titre du document). */
export function parties(md: string): Partie[] {
  let blocs = lireMarkdown(md);
  if (blocs[0]?.type === 'titre' && blocs[0].niveau === 1) blocs = blocs.slice(1);
  const niveaux = blocs
    .filter((b) => b.type === 'titre')
    .map((b) => (b as { niveau: number }).niveau);
  const haut = niveaux.length ? Math.min(...niveaux) : 2;
  const res: Partie[] = [];
  for (const b of blocs) {
    if (b.type === 'titre' && b.niveau === haut)
      res.push({ titre: b.texte, role: rolePartie(b.texte), blocs: [] });
    else if (res.length) res[res.length - 1].blocs.push(b);
  }
  return res;
}

const ANNEE = /\b(1[89]\d{2}|20\d{2})[a-z]?\b|\b(s\.\s?d\.|n\.\s?d\.)/i;
const LIEN = /(https?:\/\/[^\s)>\]]+|\b10\.\d{4,9}\/[^\s)>\]]+)/gi;
const CITATION =
  /\(([A-ZÀ-Ý][\p{L}'’\- ]+(et al\.)?|[A-ZÀ-Ý][\p{L}'’\- ]+ (et|&) [A-ZÀ-Ý][\p{L}'’\- ]+),? (1[89]\d{2}|20\d{2})[a-z]?\)|\[\d+(?:\s*[,–-]\s*\d+)*\]|[A-ZÀ-Ý][\p{L}'’-]+ (et al\. )?\((1[89]\d{2}|20\d{2})\)/u;

const nettoyerLien = (u: string) =>
  u
    .replace(/[.,;:]+$/, '')
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .toLowerCase();

/** Entrées de la liste de références (une par puce ou par paragraphe). */
export function entreesReferences(p: Partie): string[] {
  return p.blocs
    .filter((b) => b.type === 'puce' || b.type === 'paragraphe')
    .map((b) => (b as { texte: string }).texte.trim())
    .filter((t) => t.length > 12 && !/scholar\.google/i.test(t));
}

const motsTexte = (t: string) => t.split(/\s+/).filter((m) => /[\p{L}\d]/u.test(m)).length;

/**
 * Contrôle un rapport. `vus` : tout ce que les outils ont renvoyé pendant la tâche (sources trouvées, pages et
 * fichiers lus) plus la demande de la personne ; une référence dont le lien ou le DOI n'y figure pas est inventée.
 */
export function controlerRapport(md: string, vus: string): Probleme[] {
  const pb: Probleme[] = [];
  const ps = parties(md);
  const roles = ps.map((p) => p.role);
  const dev = ps.filter((p) => p.role === 'developpement');

  if (!roles.includes('introduction'))
    pb.push({
      grave: true,
      texte:
        "Il manque l'Introduction (contexte, problématique, objectifs, démarche suivie, annonce du plan).",
    });
  if (!roles.includes('conclusion'))
    pb.push({
      grave: true,
      texte:
        'Il manque la Conclusion (réponse à la problématique, principaux résultats, limites, perspectives).',
    });
  if (dev.length < 2)
    pb.push({
      grave: true,
      texte:
        "Le développement doit compter au moins deux parties entre l'Introduction et la Conclusion (par exemple : analyse du problème, démarche, résultats, discussion).",
    });
  const iIntro = roles.indexOf('introduction');
  const iConcl = roles.lastIndexOf('conclusion');
  const iRef = roles.indexOf('references');
  if (iIntro > 0 && roles.slice(0, iIntro).some((r) => r === 'developpement'))
    pb.push({
      grave: true,
      texte: "L'Introduction doit venir avant les parties du développement.",
    });
  if (iConcl >= 0 && roles.slice(iConcl + 1).some((r) => r === 'developpement'))
    pb.push({
      grave: true,
      texte:
        'La Conclusion doit venir après tout le développement ; seules les Références et les Annexes la suivent.',
    });
  if (iRef >= 0 && iConcl > iRef)
    pb.push({ grave: true, texte: 'Les Références se placent après la Conclusion.' });

  // Développement argumenté : une partie d'un seul paragraphe court n'est pas développée.
  const minces = dev.filter((p) => {
    const paras = p.blocs.filter((b) => b.type === 'paragraphe');
    const n = p.blocs
      .filter((b) => b.type === 'paragraphe' || b.type === 'puce')
      .reduce((s, b) => s + motsTexte((b as { texte: string }).texte), 0);
    return paras.length < 2 || n < 120;
  });
  if (dev.length >= 2 && minces.length * 2 > dev.length)
    pb.push({
      grave: true,
      texte: `Parties trop minces (${minces
        .map((p) => `« ${p.titre} »`)
        .slice(0, 4)
        .join(
          ', ',
        )}) : développe chacune en plusieurs paragraphes argumentés (idée, explication, donnée ou source, conséquence).`,
    });
  else if (minces.length)
    pb.push({
      grave: false,
      texte: `À étoffer : ${minces.map((p) => `« ${p.titre} »`).join(', ')}.`,
    });

  // Rédaction en paragraphes, pas en listes.
  const corps = ps
    .filter((p) => p.role !== 'references' && p.role !== 'annexe')
    .flatMap((p) => p.blocs);
  const puces = corps.filter((b) => b.type === 'puce').length;
  const paras = corps.filter((b) => b.type === 'paragraphe').length;
  if (puces > 6 && puces > paras)
    pb.push({
      grave: true,
      texte:
        'Trop de listes à puces : un rapport se rédige en paragraphes ; garde les puces pour de courtes énumérations.',
    });
  const texteCorps = corps
    .filter((b) => b.type === 'paragraphe' || b.type === 'puce')
    .map((b) => (b as { texte: string }).texte)
    .join('\n');
  if (/(?<![\p{L}])(je\s|j['’]\p{L})/iu.test(texteCorps))
    pb.push({
      grave: false,
      texte: 'Évite « je » : tournures impersonnelles ou « nous ».',
    });

  // Références : présentes, datées, et toutes renvoyées par les outils (jamais inventées).
  const refs = ps.find((p) => p.role === 'references');
  const entrees = refs ? entreesReferences(refs) : [];
  const citations = CITATION.test(texteCorps);
  if (!refs || !entrees.length) {
    if (citations || /\b(selon|d['’]apr[eè]s)\s+[A-ZÀ-Ý]/u.test(texteCorps))
      pb.push({
        grave: true,
        texte:
          'Le texte cite des auteurs mais il n’y a pas de partie « Références » qui les liste.',
      });
    else
      pb.push({
        grave: false,
        texte:
          'Pas de références : ajoute une partie « Références » avec les sources trouvées, ou signale qu’aucune source n’a été utilisée.',
      });
  } else {
    const connus = new Set((vus.match(LIEN) ?? []).map(nettoyerLien));
    const vusPlat = sansAccents(vus);
    const inventees = entrees.filter((e) => {
      const liens = (e.match(LIEN) ?? []).map(nettoyerLien);
      if (liens.length) return !liens.some((l) => connus.has(l) || vusPlat.includes(l));
      // Sans lien : le titre (mots longs) doit se retrouver dans ce que les outils ont renvoyé.
      const mots = sansAccents(e)
        .split(/[^a-z0-9]+/)
        .filter((m) => m.length >= 6);
      if (mots.length < 3) return false;
      return mots.filter((m) => vusPlat.includes(m)).length / mots.length < 0.5;
    });
    if (inventees.length)
      pb.push({
        grave: true,
        texte: `Références non vérifiées dans les documents consultés : ${inventees
          .slice(0, 4)
          .map((e) => `« ${e.slice(0, 90)} »`)
          .join(
            ' ; ',
          )}. Retire-les, ou remplace-les par des sources que la recherche a vraiment renvoyées (et mets [SOURCE À TROUVER] dans le texte si besoin).`,
      });
    const sansAnnee = entrees.filter((e) => !ANNEE.test(e));
    if (sansAnnee.length)
      pb.push({
        grave: false,
        texte: `Références sans année : ${sansAnnee.length}. Format attendu : Auteur, A. (année). Titre. Revue ou éditeur. DOI ou lien.`,
      });
    if (!citations)
      pb.push({
        grave: true,
        texte:
          'Aucune citation dans le texte : chaque source de la liste doit être citée là où elle est utilisée, sous la forme (Auteur, année).',
      });
  }
  return pb;
}

/** Message rendu à Six quand le rapport doit être corrigé avant d'être enregistré. */
export function consigneCorrection(pb: Probleme[]): string {
  const graves = pb.filter((p) => p.grave);
  return `Pas encore enregistré : le contrôle qualité demande de corriger d'abord :\n${graves
    .map((p) => `- ${p.texte}`)
    .join(
      '\n',
    )}\nCorrige ces points puis rappelle ecrire_resultat avec le rapport COMPLET corrigé (même nom). Garde tout ce qui était bon.`;
}
