/**
 * Détecteur d'arnaques par règles, sans IA : instantané, gratuit, hors ligne, et il ne
 * « hallucine » jamais. Il couvre les schémas connus à Kinshasa (faux agent Mobile Money,
 * code PIN, urgence, secret, faux recrutement, bourse fictive, lien raccourci). L'IA ne
 * vient qu'en complément, pour les cas nouveaux.
 */

export type ScamLevel = 'aucun' | 'faible' | 'moyen' | 'eleve';

export interface ScamReport {
  niveau: ScamLevel;
  /** Raisons lisibles par l'utilisateur, sans pourcentage. */
  raisons: string[];
  score: number;
  /** Identifiants des règles touchées (« code », « gain »…), pour choisir la bonne réponse. */
  regles: string[];
}

/** Minuscules, sans accents, espaces simplifiés : « Bloqué » et « bloque » se lisent pareil. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

interface Rule {
  id: string;
  poids: number;
  motif: RegExp;
  raison: string;
}

const RULES: Rule[] = [
  {
    id: 'code',
    poids: 3,
    motif:
      /\b(code ?pin|pin|code secret|code de (confirmation|validation|verification)|code (recu|envoye) par sms|otp|mot de passe|password)\b/,
    raison: 'Il demande ton code PIN ou un code secret.',
  },
  {
    id: 'argent-mobile',
    poids: 1,
    motif:
      /\b(mobile money|m-?pesa|airtel money|orange money|afri ?money|compte bancaire|carte bancaire)\b/,
    raison: 'Il parle de ton compte Mobile Money ou bancaire.',
  },
  {
    id: 'menace',
    poids: 1,
    motif:
      // Un compte, une carte ou une ligne menacés — pas « je suis bloqué au travail ».
      /\b(ton|votre|vos|tes) (compte|carte|numero|puce|sim|ligne|solde|argent|portefeuille)\b.{0,30}\b(bloque|bloquee|suspendu|suspendue|desactive|desactivee|ferme|fermee|supprime|supprimee)\b|\b(bloquer|suspendre|desactiver|fermer) (ton|votre|vos|tes)\b|argent sera perdu|perdre (ton|votre) argent/,
    raison: 'Il menace de bloquer ton compte ou ton argent.',
  },
  {
    id: 'urgence',
    poids: 1,
    motif:
      /\b(urgent|urgence|immediatement|tout de suite|faites vite|fais vite|derniere chance|dans \d+ ?(h|heures?|min|minutes))\b/,
    raison: 'Il te presse pour que tu agisses sans réfléchir.',
  },
  {
    id: 'secret',
    poids: 2,
    motif:
      /(ne (le )?(dis|dites) (rien )?a personne|n'en (parle|parlez) a personne|ne (parle|parlez) (de (ce|cela) message )?a personne|ne parlez de ce message a personne|garde[rz]? (le )?secret|strictement confidentiel)/,
    raison: 'Il te demande de garder le secret.',
  },
  {
    id: 'gain',
    poids: 2,
    motif:
      /\b(vous avez gagne|tu as gagne|tu es selectionne|vous etes selectionne|heureux gagnant|tirage au sort)\b/,
    raison: 'Il annonce un gain que tu n’attendais pas.',
  },
  {
    id: 'frais',
    poids: 2,
    motif:
      /\b(frais (de dossier|d'inscription|de traitement|de deblocage|d'activation|de retrait|de livraison)|(payer|payez|paie|envoyez|envoie[sz]?) (d'abord|avant)|caution)\b|\bd'abord\b.{0,30}\bde frais\b/,
    raison: 'Il demande de payer des frais avant de recevoir quelque chose.',
  },
  {
    id: 'offre',
    poids: 1,
    motif:
      /\b(recrutement|offre d'emploi|poste disponible|bourse d'etudes?|bourse a l'etranger|visa garanti)\b/,
    raison: 'Il propose un emploi, une bourse ou un visa.',
  },
  {
    id: 'envoi-argent',
    poids: 1,
    motif:
      /\b(envoie[sz]?|envoyez|transfere[sz]?|transferez|depose[sz]?|deposez|payez)\b.{0,40}(\b(argent|montant|somme|fc|francs?|usd|dollars?|unites|credit)\b|\d ?\$|\$ ?\d)/,
    raison: 'Il te demande d’envoyer de l’argent.',
  },
  {
    id: 'nouveau-numero',
    poids: 2,
    motif:
      /\b(j'ai change de (numero|puce)|c'est mon nouveau numero|mon nouveau numero|enregistre (ce|mon) (nouveau )?numero|c'est moi,? j'ai change)\b/,
    raison:
      'Il dit être un proche avec un nouveau numéro : appelle d’abord son ancien numéro pour vérifier.',
  },
  {
    id: 'lien-court',
    poids: 2,
    motif:
      /\b(bit\.ly|tinyurl\.com|cutt\.ly|t\.ly|is\.gd|shorturl\.at|rebrand\.ly|goo\.gl|wa\.link)\//,
    raison: 'Il contient un lien raccourci qui cache sa vraie adresse.',
  },
];

/** Un auteur qui s'affiche comme un numéro est inconnu du téléphone. */
export function looksLikePhoneNumber(author: string | undefined): boolean {
  // « [TEL 1] » : un numéro masqué sur le téléphone reste un expéditeur inconnu.
  return Boolean(
    author && (/^\+?[\d\s().•*-]{8,}$/.test(author.trim()) || /^\[TEL \d+\]$/.test(author.trim())),
  );
}

/**
 * Analyse les messages REÇUS (jamais ceux de l'utilisateur).
 * Combinaisons qui suffisent seules à un risque élevé : code + argent, menace ou urgence ;
 * frais + offre ou gain ; gain + envoi d'argent ; « nouveau numéro » + envoi d'argent.
 */
export function detectScam(messages: string[], fromUnknownNumber = false): ScamReport {
  const text = normalize(messages.join('\n'));
  const hits = RULES.filter((rule) => rule.motif.test(text));
  const ids = new Set(hits.map((hit) => hit.id));
  const raisons = hits.map((hit) => hit.raison);
  let score = hits.reduce((sum, hit) => sum + hit.poids, 0);

  if (fromUnknownNumber && score > 0) {
    score += 1;
    raisons.push('Le message vient d’un numéro que tu n’as pas enregistré.');
  }

  const critical =
    (ids.has('code') && (ids.has('argent-mobile') || ids.has('menace') || ids.has('urgence'))) ||
    (ids.has('frais') && (ids.has('offre') || ids.has('gain'))) ||
    (ids.has('gain') && ids.has('envoi-argent')) ||
    (ids.has('nouveau-numero') && ids.has('envoi-argent'));

  const niveau: ScamLevel =
    critical || score >= 5 ? 'eleve' : score >= 3 ? 'moyen' : score >= 1 ? 'faible' : 'aucun';
  return { niveau, raisons, score, regles: [...ids] };
}
