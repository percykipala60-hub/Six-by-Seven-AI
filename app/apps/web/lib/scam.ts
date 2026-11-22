import type { Arnaque } from './types';

interface Rule {
  re: RegExp;
  weight: number;
  raison: string;
}

// Signaux courants des arnaques par message. Liste de départ, à enrichir avec des cas réels collectés par l'équipe.
const RULES: Rule[] = [
  {
    re: /\b(code|pin|mot de passe|otp)\b[^.\n]{0,40}\b(envoie|envoyez|donne|donnez|communique|communiquez|partage|confirme)/i,
    weight: 45,
    raison: 'Demande de code ou de mot de passe',
  },
  {
    re: /\b(envoie|envoyez|donne|donnez)\b[^.\n]{0,25}\b(code|pin)\b/i,
    weight: 45,
    raison: 'Demande de code ou de mot de passe',
  },
  {
    re: /\b(compte|carte|numéro)\b[^.\n]{0,30}\b(bloqué|suspendu|désactivé|expiré)/i,
    weight: 30,
    raison: 'Compte présenté comme bloqué',
  },
  {
    re: /\b(urgent|immédiatement|dans les (?:\d+|dix|cinq) (?:minutes|heures)|dernier avertissement|sous 24 ?h)\b/i,
    weight: 20,
    raison: 'Urgence artificielle',
  },
  {
    re: /(transfert|dépôt|envoi)[^.\n]{0,40}(par erreur|erroné)|(rembourse|renvoie)[^.\n]{0,25}(argent|montant|somme)/i,
    weight: 40,
    raison: 'Faux transfert reçu par erreur',
  },
  {
    re: /\b(gagn[ée]|félicitations|tirage|loterie|bourse (?:offerte|gratuite))\b/i,
    weight: 30,
    raison: 'Gain ou bourse inattendu',
  },
  {
    re: /\b(recrut|offre d'emploi|travail à domicile)\b[^.\n]{0,60}\b(frais|payer|dépôt|avance)/i,
    weight: 40,
    raison: "Offre d'emploi avec frais à payer",
  },
  {
    re: /\b(?:bit\.ly|tinyurl|cutt\.ly|t\.co)\/\S+|\[LIEN \d+\]/i,
    weight: 15,
    raison: 'Lien à vérifier',
  },
  {
    re: /\b(mobile money|m-?pesa|airtel money|orange money|afrimoney)\b/i,
    weight: 10,
    raison: 'Argent mobile mentionné',
  },
];

export function heuristicScam(text: string): Arnaque {
  let score = 0;
  const raisons: string[] = [];
  for (const rule of RULES) {
    if (rule.re.test(text)) {
      score += rule.weight;
      if (!raisons.includes(rule.raison)) raisons.push(rule.raison);
    }
  }
  return { score: Math.min(100, score), raisons };
}

/** Garde le score le plus élevé : un signal de l'un ou de l'autre suffit à alerter. */
export function mergeScam(a: Arnaque, b: Arnaque): Arnaque {
  const raisons = [...new Set([...a.raisons, ...b.raisons])];
  return { score: Math.max(a.score, b.score), raisons };
}

export const SCAM_THRESHOLD = 50;
