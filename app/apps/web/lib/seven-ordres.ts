/**
 * Pilotage de Six par ordres dans Seven AI.
 *
 * Quand l'utilisateur écrit un ordre (« ouvre les réglages », « lance Kin Rush »,
 * « va dans le jeu du ton juste »), Seven AI reconnaît la destination et Six navigue
 * directement vers la page — sans appel à l'IA, donc même hors-ligne. Seven AI
 * confirme par un message local, puis l'app exécute.
 */

export interface OrdrePilotage {
  cible: string; // route Next.js de Six
  nom: string; // nom lisible de la destination, pour la confirmation
  reponse: string; // message de confirmation affiché par Seven AI
}

interface Destination {
  mots: RegExp;
  cible: string;
  nom: string;
}

// Ordre de test : du plus spécifique au plus général (« jeu du ton juste » avant « jeux »).
const DESTINATIONS: Destination[] = [
  { mots: /cosinus|six ?touch/i, cible: '/cosinus', nom: 'Cosinus' },
  { mots: /responsive/i, cible: '/responsive', nom: 'Responsive' },
  { mots: /ton juste/, cible: '/ton-juste', nom: 'le jeu du ton juste' },
  { mots: /kin[- ]?rush|kinshasa/i, cible: '/jeu', nom: 'Kin Rush' },
  { mots: /arnaque/, cible: '/coupe-arnaque', nom: 'Coupe l’arnaque' },
  {
    mots: /défis|defis|devinette|énigme|enigme/,
    cible: '/ton-juste',
    nom: 'les devinettes et énigmes',
  },
  { mots: /espace jeu|page des jeux/, cible: '/espace-jeu', nom: 'l’espace jeu' },
  { mots: /jeux?/, cible: '/espace-jeu', nom: 'l’espace jeu' },
  { mots: /sujets?/, cible: '/sujets', nom: 'les sujets' },
  { mots: /mémoire|memoire/, cible: '/reglages?v=memoire', nom: 'la mémoire de Six' },
  { mots: /compte|profil/, cible: '/reglages?v=compte', nom: 'ton compte' },
  { mots: /notification/, cible: '/reglages?v=notifications', nom: 'les notifications' },
  { mots: /police|style d[’']écriture/, cible: '/reglages?v=police', nom: 'la police d’écriture' },
  { mots: /thème|theme|couleurs?/, cible: '/reglages?v=theme', nom: 'les réglages de thème' },
  { mots: /confidentialité/, cible: '/confidentialite', nom: 'la politique de confidentialité' },
  { mots: /conditions|mentions légales/, cible: '/conditions', nom: 'les mentions légales' },
  { mots: /réglages|reglages|paramètres|parametres/, cible: '/reglages', nom: 'les réglages' },
  { mots: /accueil/, cible: '/', nom: 'l’accueil' },
];

// Verbes d'action qui font d'un message un ordre de pilotage.
const VERBE_ORDRE =
  /^(ouvre|ouvrir|va|aller|vas-y|lance|lancer|montre|montrer|affiche|afficher|joue|jouer|accède|accede|rejoins|retourne|emmène|emmene|navigue|redirige)\b|\b(ouvre|va dans|va sur|lance|lancer|montre|montre-moi|affiche|accède à|rejoins|emmène-moi|redirige-moi|joue|jouer)\b/;

/** Reconnaît un ordre de pilotage. Renvoie null quand le message est une simple question. */
export function detecterOrdre(texte: string): OrdrePilotage | null {
  const t = texte.toLowerCase().trim();
  if (t.length > 140) return null; // un ordre est court ; au-delà, c'est une vraie question
  if (!VERBE_ORDRE.test(t)) return null;
  for (const d of DESTINATIONS) {
    if (d.mots.test(t)) {
      return { cible: d.cible, nom: d.nom, reponse: `C'est parti : j'ouvre ${d.nom} dans Six.` };
    }
  }
  return null; // verbe d'action mais destination inconnue : Seven AI répond normalement
}
