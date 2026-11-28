/**
 * Actions de Six, dans un format commun : l'agent les émet pendant le travail, Six les affiche en lignes
 * compactes et repliables (« 3 fichiers lus », « Modifié rapport.docx +12 −3 », « 2 recherches (1 échec) »),
 * et le remote les enverra telles quelles au téléphone.
 */
export type GenreAction =
  'lecture' | 'modification' | 'recherche' | 'ordinateur' | 'commande' | 'autre';

export type ActionAgent = {
  genre: GenreAction;
  /** Phrase lisible (« Six lit « plan.docx » »). */
  texte: string;
  /** Fichier touché, pour une modification. */
  fichier?: string;
  ajout?: number;
  retrait?: number;
  echec?: boolean;
  /** Le code réellement lancé : l'appel d'outil et ses paramètres (comme une commande dans un terminal). */
  code?: string;
  /** Ce que l'outil a renvoyé (début seulement). */
  sortie?: string;
};

const CODE_MAX = 2000;
const SORTIE_MAX = 1500;

/** L'appel tel qu'il est exécuté : « outil(paramètres) », paramètres en JSON lisible, longues valeurs coupées. */
export function codeDe(nom: string, args: Record<string, unknown>): string {
  const court = Object.fromEntries(
    Object.entries(args).map(([k, v]) => [
      k,
      typeof v === 'string' && v.length > 600 ? v.slice(0, 600) + `… (${v.length} caractères)` : v,
    ]),
  );
  const texte = `${nom}(${JSON.stringify(court, null, 2)})`;
  return texte.length > CODE_MAX ? texte.slice(0, CODE_MAX) + '…' : texte;
}

const GENRES: Record<string, GenreAction> = {
  lire_fichier: 'lecture',
  lister_espace: 'lecture',
  lister_dossier: 'lecture',
  chercher_mes_documents: 'lecture',
  ecrire_resultat: 'modification',
  modifier_document: 'modification',
  chercher_sources: 'recherche',
  lire_page: 'recherche',
  naviguer: 'recherche',
  chercher_lieu_rdc: 'recherche',
  lieux_proches_rdc: 'recherche',
  ordinateur: 'ordinateur',
  executer_commande: 'commande',
};

const ECHEC =
  /^(erreur|échec|impossible|refus|introuvable|fichier introuvable|outil indisponible|délai|pas de réponse)/i;

const lignes = (v: unknown) =>
  typeof v === 'string' && v.trim() ? v.replace(/\r\n/g, '\n').trimEnd().split('\n').length : 0;

export function actionDe(
  nom: string,
  args: Record<string, unknown>,
  texte: string,
  resultat: string,
): ActionAgent {
  const genre = GENRES[nom] ?? 'autre';
  // Une commande se montre telle qu'elle a été lancée, comme dans un terminal.
  const code =
    nom === 'executer_commande' && typeof args.commande === 'string'
      ? args.commande.slice(0, CODE_MAX)
      : codeDe(nom, args);
  const action: ActionAgent = { genre, texte, code };
  const sortie = resultat.trim();
  if (sortie)
    action.sortie = sortie.length > SORTIE_MAX ? sortie.slice(0, SORTIE_MAX) + '…' : sortie;
  if (ECHEC.test(resultat.trim())) action.echec = true;
  // Commande : échec si le code de sortie n'est pas 0 (ou si elle n'a pas pu se lancer).
  if (genre === 'commande' && /"code":\s*(null|[1-9]|-)/.test(resultat)) action.echec = true;
  if (genre === 'modification') {
    const fichier = args.nom ?? args.chemin;
    if (typeof fichier === 'string') action.fichier = fichier.split(/[\\/]/).pop();
    const nouveau = lignes(args.contenu ?? args.texte ?? args.nouveau);
    const ancien = lignes(args.ancien);
    if (nouveau) action.ajout = nouveau;
    if (ancien) action.retrait = ancien;
  }
  return action;
}

export type GroupeActions = { resume: string; actions: ActionAgent[]; echecs: number };

const NOMS: Record<Exclude<GenreAction, 'modification'>, [string, string]> = {
  lecture: ['lecture', 'lectures'],
  recherche: ['recherche', 'recherches'],
  ordinateur: ["action sur l'ordinateur", "actions sur l'ordinateur"],
  commande: ['commande', 'commandes'],
  autre: ['étape', 'étapes'],
};

/** Regroupe les actions qui se suivent et vont ensemble ; chaque modification de fichier reste seule. */
export function grouperActions(actions: ActionAgent[]): GroupeActions[] {
  const groupes: GroupeActions[] = [];
  for (const a of actions) {
    const dernier = groupes.at(-1);
    if (a.genre !== 'modification' && dernier && dernier.actions[0].genre === a.genre)
      dernier.actions.push(a);
    else groupes.push({ resume: '', actions: [a], echecs: 0 });
  }
  for (const g of groupes) {
    g.echecs = g.actions.filter((a) => a.echec).length;
    const a = g.actions[0];
    if (a.genre === 'modification') {
      const chiffres = [a.ajout ? `+${a.ajout}` : '', a.retrait ? `−${a.retrait}` : '']
        .filter(Boolean)
        .join(' ');
      g.resume = `Modifié ${a.fichier ?? 'un fichier'}${chiffres ? ' ' + chiffres : ''}`;
    } else {
      const [un, plusieurs] = NOMS[a.genre];
      g.resume = g.actions.length === 1 ? a.texte : `${g.actions.length} ${plusieurs}`;
      if (g.actions.length === 1 && !a.texte) g.resume = `1 ${un}`;
    }
    if (g.echecs) g.resume += ` (${g.echecs} échec${g.echecs > 1 ? 's' : ''})`;
  }
  return groupes;
}
