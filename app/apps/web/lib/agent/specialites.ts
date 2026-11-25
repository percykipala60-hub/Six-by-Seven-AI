/**
 * Spécialités de Cosinus. Cosinus est un agent de travail général (lire, chercher, analyser, produire des fichiers) ;
 * chaque spécialité ajoute un savoir-faire précis, avec ses consignes détaillées, seulement quand la tâche la
 * concerne (les consignes restent courtes pour le modèle local).
 *
 * Ajouter une spécialité = ajouter une entrée à SPECIALITES : un nom, une phrase pour la liste des domaines,
 * comment la reconnaître dans une demande, et ses consignes.
 */

export type Specialite = {
  id: string;
  nom: string;
  /** Une phrase, montrée à Six dans la liste de ses domaines. */
  resume: string;
  /** La demande (ou la discussion récente) relève de cette spécialité. */
  concerne: (demande: string, recent: string) => boolean;
  consignes: string;
};

const REDACTION =
  /(?<![\wÀ-ÿ])(plan|rapport|r[ée]dige|r[ée]diger|[ée]cris|[ée]crire|pr[ée]sentation|diapos?|diapositives?|powerpoint|m[ée]moire|tfc|synth[eè]se|introduction|conclusion|section|chapitre|cahier des charges|bibliographie|r[ée]f[ée]rences)(?![\wÀ-ÿ])/i;
const RETOUCHE =
  /\b(modifie|change|corrige|r[ée][ée]cris|ajoute|enl[eè]ve|supprime|renomme|grossis|agrandis|mets|aligne|justifie)\b[\s\S]{0,80}\b(rapport|document|titre|partie|conclusion|introduction|table des mati[eè]res|page de garde|police|couleur|sommaire)\b/i;

const RAPPORTS: Specialite = {
  id: 'rapports',
  nom: 'Rapports et documents académiques',
  resume:
    'rédiger, structurer, sourcer et mettre en forme des rapports, mémoires, TFC, synthèses et plans (Word et PDF), et les modifier ensuite.',
  concerne: (demande, recent) =>
    REDACTION.test(demande) ||
    RETOUCHE.test(demande) ||
    // Suite d'un rapport déjà produit dans la discussion (« mets-le en rouge »).
    (/\bresultats\/[^\s]+\.(md|docx|pdf)\b/i.test(recent) && demande.length < 400),
  consignes: `

Spécialité active : rapports et documents académiques.
- Rapports académiques : plan des universités francophones (introduction générale avec problématique, hypothèses, intérêt du sujet, méthodologie, délimitation et subdivision ; chapitres numérotés ; conclusion générale ; bibliographie).
- Avant de rédiger un rapport, un plan ou une présentation, relis les anciens documents de la personne (chercher_mes_documents) : reprends leur structure (numérotation, intitulés, ordre des parties), leur niveau de langue et leurs habitudes de mise en forme. Inspire-toi, ne recopie pas : aucun passage mot pour mot, aucun nom de personne, aucune donnée d'un autre projet.

Générer un rapport :
1. Sources : si le sujet demande des faits, des chiffres ou une bibliographie, cherche d'abord des publications (chercher_sources), une ou deux recherches bien ciblées.
2. Rédaction en Markdown : « # Titre du rapport », puis « ## » pour chaque partie (Introduction, parties du développement, Conclusion, Bibliographie) et « ### » pour les sous-parties.
3. Longueur : respecte la demande ; une page fait environ 450 mots. Développe chaque partie en plusieurs paragraphes argumentés (au moins trois par partie pour un rapport de deux pages ou plus), avec des transitions. Ne t'arrête pas à un résumé.
4. Chiffres et faits : seulement ceux des sources trouvées ou donnés par la personne ; sinon [SOURCE À TROUVER].
5. Bibliographie : seulement les sources renvoyées par les outils, au format Auteur(s) (année). Titre. Revue ou éditeur. DOI ou lien.
6. Enregistre avec ecrire_resultat : la version Word (.docx) est toujours générée ; le PDF seulement si la personne le demande. Choisis toi-même une mise en forme adaptée au document (police, couleurs, table des matières ou non) et varie-la d'un document à l'autre, dans mise_en_forme ; ce que la personne précise (page de garde, « dans mon style », « sans table des matières »…) prime.
7. Réponds en une ou deux lignes : ce que tu as produit et les chemins des fichiers créés.

Modifier un rapport existant :
- Quand la personne demande un changement sur un rapport déjà fait (texte ou mise en forme), utilise modifier_document sur CE rapport, avec seulement ce qui change ; n'utilise jamais ecrire_resultat pour une modification. Si elle ne précise pas le fichier, c'est le dernier rapport enregistré dans la discussion. La version précédente est toujours gardée.
- Exemples de mise_en_forme : « grossis le titre » → {"titre_document": {"taille": "+4"}} ; « titres des parties en rouge » → {"titres": {"1": {"couleur": "rouge"}}} ; « table des matières à gauche » → {"sommaire": {"alignement": "gauche"}} ; « enlève la table des matières » → {"sommaire": {"afficher": false}} ; « mets la conclusion en bleu et en gras » → {"parties": {"Conclusion": {"couleur": "bleu", "gras": true}}} ; « texte justifié, interligne 1,5 » → {"texte": {"alignement": "justifie", "interligne": 1.5}} ; « ajoute une page de garde au nom de Jean Mbala » → {"page_de_garde": {"afficher": true, "auteur": "Jean Mbala"}} ; « style plus professionnel » → {"style": "professionnel"}.
- Exemples de texte : « réécris la conclusion » → partie "Conclusion" + nouveau_texte ; « ajoute une partie sur les coûts après la partie 2 » → nouvelle_partie_titre + nouvelle_partie_texte + apres_partie.
- Un document enregistré se termine toujours par une section « Références » qui liste chaque source utilisée (auteurs, année, titre, lien ou DOI exactement comme les outils les ont donnés). N'ajoute aucun détail (lieu, chiffre, conclusion) que les sources ne contiennent pas.
- Quand on te demande de rédiger un texte (section, introduction, paragraphe), commence directement par ce texte : pas de phrase d'introduction sur ce que tu as lu ou ce que tu vas faire, pas de « je ». S'il manque une donnée, mets [Valeur] ou [SOURCE À TROUVER] dans le texte et signale-le en une seule ligne à la fin.`,
};

/** Les spécialités de Cosinus, dans l'ordre (d'autres viendront s'ajouter ici). */
export const SPECIALITES: Specialite[] = [RAPPORTS];

/** Liste courte des domaines, toujours donnée à Six. */
export function listeSpecialites(liste: Specialite[] = SPECIALITES): string {
  return liste.map((s) => `- ${s.nom} : ${s.resume}`).join('\n');
}

/** Spécialités concernées par la demande (et la fin de la discussion). */
export function specialitesPour(
  demande: string,
  recent = '',
  liste: Specialite[] = SPECIALITES,
): Specialite[] {
  return liste.filter((s) => s.concerne(demande, recent));
}
