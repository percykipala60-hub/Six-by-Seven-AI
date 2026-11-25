export const SKILL_IDS = ['documents', 'code', 'web', 'donnees', 'images'] as const;
export type SkillId = (typeof SKILL_IDS)[number];
export type ChoixSkill = SkillId | 'auto';
export const SKILLS: {
  id: SkillId;
  nom: string;
  description: string;
  instructions: string;
  motifs: RegExp;
}[] = [
  {
    id: 'documents',
    nom: 'Documents',
    description: 'Rapports, lettres et synthèses structurés.',
    motifs: /rapport|document|lettre|synthèse|redige|rédige|mémoire|compte rendu/i,
    instructions:
      'Identifie le destinataire et le but. Organise le document en sections adaptées. Sépare faits, hypothèses et sources ; n’invente ni citation ni référence. Rédige le livrable complet, puis vérifie cohérence, orthographe et exigences. Fournis un artefact Markdown téléchargeable ; utilise les outils de conversion disponibles si un PDF ou Word est demandé, sans simuler de fichier binaire.',
  },
  {
    id: 'code',
    nom: 'Code',
    description: 'Créer, expliquer et corriger du code.',
    motifs: /code|bug|debug|débog|python|typescript|javascript|fonction|script|programme/i,
    instructions:
      'Lis le code fourni et identifie le comportement attendu avant de modifier. Produis une correction minimale et complète, avec noms de fichiers et blocs d’artefacts adaptés au langage. Évite secrets en clair et exécution de contenu non fiable. Propose des vérifications pertinentes. Distingue tests exécutés et tests conseillés ; ne prétends pas avoir exécuté du code sans résultat d’outil.',
  },
  {
    id: 'web',
    nom: 'Pages web',
    description: 'Pages HTML et aperçus visuels.',
    motifs: /site web|page web|landing|html|page html|interface|portfolio/i,
    instructions:
      'Construis un livrable HTML autonome avec styles intégrés, structure sémantique et mise en page responsive. Prévois labels, contraste lisible et navigation clavier. Fournis un artefact HTML complet. L’aperçu bloque JavaScript et ressources externes : rends le contenu essentiel visible sans eux. N’affirme pas que la page est publiée et ne crée pas de formulaire envoyant des données sans demande explicite.',
  },
  {
    id: 'donnees',
    nom: 'Données',
    description: 'Tableaux, CSV et calculs vérifiables.',
    motifs: /csv|tableau|données|statistique|calcul|excel|chiffres|budget/i,
    instructions:
      'Inspecte les colonnes, unités et valeurs manquantes des données réellement fournies. Explique les hypothèses et les étapes de calcul. Ne complète pas les valeurs manquantes par invention. Sépare observations et interprétations. Fournis les résultats tabulaires dans un artefact CSV avec échappement correct, et un résumé clair. Si tu ne peux pas effectuer un calcul fiable avec les outils disponibles, indique cette limite.',
  },
  {
    id: 'images',
    nom: 'Images',
    description: 'Comprendre des images et captures jointes.',
    motifs: /image|photo|capture|schéma|schema|visuel|illustration/i,
    instructions:
      'Analyse uniquement les images effectivement reçues. Décris les éléments visibles utiles à la demande. Signale le texte illisible et les détails incertains ; ne prétends pas lire une image absente. Pour une création graphique simple, fournis un SVG autonome en artefact. Ne prétends pas avoir généré une photographie ou retouché un fichier original sans outil capable de le faire.',
  },
];
export function choisirSkill(choix: ChoixSkill = 'auto', question = '', images = false) {
  if (choix !== 'auto') return SKILLS.find((s) => s.id === choix);
  return (
    SKILLS.find((s) => s.motifs.test(question)) ??
    (images ? SKILLS.find((s) => s.id === 'images') : undefined)
  );
}
export function consignesSkill(choix: ChoixSkill = 'auto', question = '', images = false): string {
  const skill = choisirSkill(choix, question, images);
  return skill
    ? `\n\nMéthode spécialisée : ${skill.nom}. Ces consignes guident le travail, sans ajouter d’outils ou de permissions. Respecte les demandes explicites de la personne.\n${skill.instructions}`
    : '';
}
