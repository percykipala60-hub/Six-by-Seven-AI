// Chaque bonne réponse se joue une seule fois et rapporte des points d'indice.
import { DEVINETTES_DIFFICILES } from './devinettes-difficiles.js';
import { DEVINETTES_EXPERTES } from './devinettes-expertes.js';

const CLASSIQUES = [
  [
    'Plus tu en prends, plus tu en laisses derrière toi. Que sont-ils ?',
    ['Des pas', 'Des photos', 'Des livres'],
    0,
  ],
  [
    'Qu’est-ce qui a des aiguilles sans pouvoir coudre ?',
    ['Un cactus', 'Une horloge', 'Un sapin'],
    1,
  ],
  ['Je peux être cassé sans être touché. Qui suis-je ?', ['Un silence', 'Un verre', 'Un œuf'], 0],
  ['Quel mois compte 28 jours ?', ['Février seulement', 'Tous les mois', 'Aucun'], 1],
  ['Qu’est-ce qui monte mais ne redescend jamais ?', ['Un ballon', 'L’âge', 'La fumée'], 1],
  [
    'Je démêle tes cheveux avec mes dents sans jamais mordre. Qui suis-je ?',
    ['Un peigne', 'Un requin', 'Une fermeture éclair'],
    0,
  ],
  [
    'Qu’est-ce qui devient plus mouillé en séchant la vaisselle ?',
    ['Le soleil', 'Une serviette', 'Un ventilateur'],
    1,
  ],
  [
    'Je fais le tour du monde en restant dans un coin. Qui suis-je ?',
    ['Un timbre', 'Une boussole', 'Un avion'],
    0,
  ],
  [
    'Combien d’animaux Moïse a-t-il emmenés dans son arche ?',
    ['Deux de chaque', 'Aucun', 'Tous'],
    1,
  ],
  ['Qu’est-ce qui a un cou mais pas de tête ?', ['Une bouteille', 'Une girafe', 'Un manteau'], 0],
  [
    'Je remplis une pièce sans prendre de place. Qui suis-je ?',
    ['La lumière', 'Un meuble', 'La fumée'],
    0,
  ],
  [
    'Quel mot s’écrit toujours « incorrectement » dans le dictionnaire ?',
    ['Faux', 'Incorrectement', 'Erreur'],
    1,
  ],
  [
    'Qu’est-ce qui a des touches mais n’ouvre aucune porte ?',
    ['Un piano', 'Un trousseau', 'Un clavier de serrure'],
    0,
  ],
  [
    'Je cours sans jambes et j’ai un lit sans dormir. Qui suis-je ?',
    ['Une rivière', 'Un chien', 'Un train'],
    0,
  ],
  [
    'Qu’est-ce qui a des villes sans maisons et des routes sans voitures ?',
    ['Un rêve', 'Une carte', 'Un tableau'],
    1,
  ],
  [
    'Avant qu’on découvre l’Everest, quelle était la plus haute montagne ?',
    ['Le K2', 'L’Everest', 'Le Kilimandjaro'],
    1,
  ],
  [
    'Qu’est-ce qui peut être plein de trous et retenir l’eau ?',
    ['Une éponge', 'Un filet', 'Une passoire'],
    0,
  ],
  [
    'Je parle toutes les langues sans les apprendre. Qui suis-je ?',
    ['Un écho', 'Un traducteur', 'Une radio'],
    0,
  ],
  [
    'Qu’est-ce qui a une tête et une queue mais pas de corps ?',
    ['Une pièce', 'Un serpent', 'Un cerf-volant'],
    0,
  ],
  [
    'Un coq pond un œuf sur un toit. De quel côté roule-t-il ?',
    ['À gauche', 'À droite', 'Un coq ne pond pas d’œufs'],
    2,
  ],
  [
    'Je suis léger comme une plume, mais personne ne me retient longtemps. Qui suis-je ?',
    ['Le souffle', 'Un nuage', 'Le papier'],
    0,
  ],
  [
    'Qu’est-ce qui a quatre doigts et un pouce sans être vivant ?',
    ['Un gant', 'Une main', 'Une tasse'],
    0,
  ],
  ['Que trouve-t-on au milieu de Paris ?', ['La tour Eiffel', 'La lettre R', 'La Seine'], 1],
  [
    'Qu’est-ce qui grandit à mesure qu’on lui retire de la matière ?',
    ['Un trou', 'Une boule de neige', 'Un arbre'],
    0,
  ],
  ['Qu’est-ce qui a un œil mais ne voit pas ?', ['Une aiguille', 'Un cyclope', 'Une caméra'], 0],
  [
    'Je te suis au soleil et disparais dans l’obscurité. Qui suis-je ?',
    ['Une ombre', 'Un chemin', 'Un rêve'],
    0,
  ],
  [
    'Qu’est-ce qui a des branches mais ni feuilles ni fruits ?',
    ['Une banque', 'Un arbre mort', 'Un parapluie'],
    0,
  ],
  [
    'Quel est le seul endroit où aujourd’hui vient avant hier ?',
    ['Dans un calendrier', 'Dans le dictionnaire', 'Dans un miroir'],
    1,
  ],
  [
    'Je suis toujours devant toi, mais tu ne peux jamais me voir. Qui suis-je ?',
    ['Ton avenir', 'Ton nez', 'L’horizon'],
    0,
  ],
  [
    'Qu’est-ce qui peut voyager autour du monde en restant immobile ?',
    ['Un timbre', 'Une valise', 'Un satellite'],
    0,
  ],
  [
    'Une mère a quatre filles et chaque fille a un frère. Combien d’enfants ?',
    ['Huit', 'Cinq', 'Quatre'],
    1,
  ],
  ['Qu’est-ce qui a des feuilles sans être un arbre ?', ['Un livre', 'Un jardin', 'Une forêt'], 0],
  [
    'Quel est le début de l’éternité et la fin du temps et de l’espace ?',
    ['La lettre E', 'La lettre T', 'Le silence'],
    0,
  ],
  [
    'Je peux être servi mais jamais mangé. Qui suis-je ?',
    ['Un repas', 'Une balle au tennis', 'Un plat'],
    1,
  ],
  ['Qu’est-ce qui tombe sans jamais se faire mal ?', ['La pluie', 'Un arbre', 'Un fruit'], 0],
  [
    'Je n’ai pas de vie, mais je peux mourir. Qui suis-je ?',
    ['Une batterie', 'Une pierre', 'Une montagne'],
    0,
  ],
  [
    'Je suis une partie soignée par un dentiste et je porte un nom royal. Qui suis-je ?',
    ['Une dent', 'Un château', 'Un chapeau'],
    0,
  ],
  [
    'Qu’est-ce qui est à toi, mais que les autres utilisent davantage que toi ?',
    ['Ton nom', 'Ton téléphone', 'Ton manteau'],
    0,
  ],
  [
    'Je commence la nuit et termine le matin. Qui suis-je ?',
    ['La lettre N', 'Le soleil', 'Le sommeil'],
    0,
  ],
  ['Qu’est-ce qui répond sans poser de question ?', ['Un écho', 'Un téléphone', 'Un miroir'], 0],
].map(([question, choix, bonneReponse], index) => ({
  id: index + 1,
  question,
  choix,
  bonneReponse,
  reward: ((index % 10) + 1) * 5,
  difficulte: 'classique',
}));

const DIFFICILES = DEVINETTES_DIFFICILES.map(
  ([question, choix, bonneReponse, explication], index) => ({
    id: CLASSIQUES.length + index + 1,
    question,
    choix,
    bonneReponse,
    explication,
    reward: 25 + (index % 6) * 5,
    difficulte: 'difficile',
  }),
);

// Les expertes récompensent davantage : elles ne tolèrent qu'une seule tentative.
const EXPERTES = DEVINETTES_EXPERTES.map(([question, choix, bonneReponse, explication], index) => ({
  id: CLASSIQUES.length + DEVINETTES_DIFFICILES.length + index + 1,
  question,
  choix,
  bonneReponse,
  explication,
  reward: 60 + (index % 5) * 10,
  difficulte: 'experte',
}));

export const RIDDLES = [...CLASSIQUES, ...DIFFICILES, ...EXPERTES];
export const TOTAL_DEVINETTES = RIDDLES.length;
