/**
 * « Quoi dire ? » hors ligne : des idées prêtes, sans IA, pour lancer ou relancer une
 * conversation. L'IA les personnalise quand le réseau est là ; sinon, ces idées suffisent.
 */
export const SUJETS_LABELS = {
    'briser-la-glace': 'Briser la glace',
    'reprendre-contact': 'Reprendre contact',
    relancer: 'Relancer',
    souhaiter: 'Souhaiter',
    pro: 'Pro',
};
export const SUJETS_SECOURS = {
    'briser-la-glace': [
        { titre: 'Une question simple', message: 'Salut ! Ça va depuis la dernière fois ?' },
        { titre: 'Un point commun', message: 'Tu as suivi ce qui s’est passé au cours aujourd’hui ?' },
        { titre: 'Un compliment sincère', message: 'J’ai bien aimé ce que tu as dit tout à l’heure.' },
    ],
    'reprendre-contact': [
        {
            titre: 'Sans se justifier',
            message: 'Ça fait longtemps ! Je pensais à toi, tu deviens quoi ?',
        },
        {
            titre: 'Un souvenir commun',
            message: 'Je suis repassé devant notre ancien lieu, ça m’a fait penser à toi.',
        },
        {
            titre: 'Proposer de se voir',
            message: 'On se prend un moment pour discuter un de ces jours ?',
        },
    ],
    relancer: [
        { titre: 'Relance légère', message: 'Je me permets de revenir vers toi, tu as pu regarder ?' },
        {
            titre: 'Avec une date',
            message: 'Tu pourrais me répondre d’ici demain ? Ça m’aiderait beaucoup.',
        },
        {
            titre: 'Laisser une porte',
            message: 'Pas de souci si tu es occupé, dis-moi quand ça t’arrange.',
        },
    ],
    souhaiter: [
        {
            titre: 'Anniversaire',
            message: 'Joyeux anniversaire ! Je te souhaite une très belle année.',
        },
        { titre: 'Bonne chance', message: 'Bonne chance pour demain, tu vas assurer !' },
        { titre: 'Félicitations', message: 'Félicitations, tu le mérites vraiment !' },
    ],
    pro: [
        {
            titre: 'Demande polie',
            message: 'Bonjour, je me permets de vous écrire au sujet de ma demande.',
        },
        { titre: 'Remerciement', message: 'Merci pour votre retour, c’est bien noté.' },
        {
            titre: 'Proposer un rendez-vous',
            message: 'Seriez-vous disponible cette semaine pour en parler ?',
        },
    ],
};
//# sourceMappingURL=sujets.js.map