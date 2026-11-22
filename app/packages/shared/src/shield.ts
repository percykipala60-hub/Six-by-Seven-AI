/**
 * Bouclier anti-arnaque : quand le risque est élevé, les réponses sont écrites ici, sans IA.
 * Partagé avec l'application : une arnaque certaine se traite sur le téléphone, sans réseau.
 */
import type { ReplySuggestions } from './replies.js';

export const SAFE_SCAM_DRAFTS: ReplySuggestions['reponses'] = [
  {
    style: 'Prudente',
    texte:
      'Je ne donne jamais mes codes par message. Je vais vérifier directement auprès de mon opérateur.',
  },
  { style: 'Courte', texte: 'Je ne communique pas mes codes.' },
  { style: 'Ferme', texte: 'Ça ne m’intéresse pas, merci de ne plus m’écrire.' },
];

/** Réponses sûres choisies selon le type d'arnaque, pour qu'elles aient l'air humaines. */
export function shieldDrafts(regles: string[]): ReplySuggestions {
  const has = (id: string) => regles.includes(id);
  if (has('nouveau-numero'))
    return {
      resume:
        'Quelqu’un se présente comme un proche avec un nouveau numéro et demande de l’argent : appelle d’abord son ancien numéro.',
      reponses: [
        {
          style: 'Vérifier',
          texte: 'Je t’appelle sur ton ancien numéro pour vérifier que c’est bien toi.',
        },
        { style: 'Courte', texte: 'Avant d’envoyer quoi que ce soit, je t’appelle.' },
        { style: 'Ferme', texte: 'Je n’envoie pas d’argent à un numéro que je ne connais pas.' },
      ],
    };
  if (has('code'))
    return {
      resume: 'On te demande un code secret : aucun service sérieux ne le demande par message.',
      reponses: SAFE_SCAM_DRAFTS,
    };
  if (has('gain') || has('frais') || has('offre'))
    return {
      resume:
        'On te promet un gain, un emploi ou une bourse contre des frais : c’est le schéma classique de l’arnaque.',
      reponses: [
        {
          style: 'Prudente',
          texte:
            'Je ne paie jamais de frais pour recevoir un gain. Je vérifie auprès du service officiel.',
        },
        { style: 'Courte', texte: 'Pas intéressé, merci.' },
        { style: 'Ferme', texte: 'Je n’envoie rien. Merci de ne plus m’écrire.' },
      ],
    };
  return {
    resume: 'Ce message ressemble à une arnaque : ne donne ni code, ni argent, ni information.',
    reponses: SAFE_SCAM_DRAFTS,
  };
}
