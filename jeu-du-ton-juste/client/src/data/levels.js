// data/levels.js — Les 15 niveaux du jeu
//
// `minScore` est le plancher à atteindre pour que le niveau puisse être réussi (sinon échec
// automatique). Valeurs du cahier des charges, volontairement hautes : le jeu doit être TRÈS DUR.
// Avec le moteur réel, un joueur constant à 80/100 reste bloqué au niveau 8, il faut 85 pour
// atteindre le niveau 14, 88 pour ouvrir le niveau légendaire et 92 pour le réussir. Le test
// « difficulté » verrouille ces paliers.

export const LEVELS = [
  {
    id: 1,
    difficulty: 'Initiation',
    successRate: 90,
    minScore: 40,
    unlockStars: 0,
    title: "La salle d'attente",
    scenario: `Tu attends depuis 20 minutes dans la salle d'attente d'un cabinet médical. Assis à côté de toi se trouve une personne d'une cinquantaine d'années qui semble nerveuse — elle regarde sa montre toutes les deux minutes et soupire. Vos regards se croisent brièvement. Tu as envie de briser la glace et de lui parler.\nQue dis-tu pour engager la conversation de manière naturelle et bienveillante ?`,
    criteria: `Pour obtenir un excellent score :\n• Engager la conversation de façon légère et non intrusive\n• Reconnaître subtilement la situation partagée (l'attente)\n• Éviter les questions trop personnelles ou intrusives\n• Ton détendu, chaleureux, qui invite à répondre sans obliger`,
  },
  {
    // Seuil à 0 : le niveau 2 ne doit pas rester fermé si le joueur franchit le niveau 1 sans étoile
    // (audit du 17/10/2026 — les réponses soignées au niveau 1 recevaient 66 à 68/100, soit 0 étoile
    // sous l'ancien seuil de 70, et le jeu se bloquait dès la deuxième marche).
    id: 2,
    difficulty: 'Débutant',
    successRate: 70,
    minScore: 55,
    unlockStars: 1,
    title: 'Small talk à la cuisine',
    scenario: `C'est lundi matin, 9h. Tu arrives dans la cuisine de ton bureau pour te faire un café. Un collègue que tu connais de vue — Lucas, 30 ans, nouveau dans le service depuis un mois — est déjà là, fixant sa tasse d'un air fatigué. Il ne t'a pas encore parlé de sa vie personnelle. Le silence est légèrement gênant.\nComment démarres-tu une conversation authentique qui pourrait créer un vrai lien ?`,
    criteria: `Pour obtenir un excellent score :\n• Ouvrir avec une observation sincère, pas un cliché ("bon week-end ?")\n• Montrer de la curiosité réelle pour l'autre\n• Donner un espace pour que l'autre réponde ou non sans malaise\n• Créer une connexion légère, pas superficielle`,
  },
  {
    id: 3,
    difficulty: 'Piégé',
    successRate: 50,
    minScore: 65,
    unlockStars: 2,
    piege: true,
    title: "L'accusation injuste",
    scenario: `Camille, ton amie proche depuis 5 ans, t'accuse brusquement de ne jamais être là pour elle. Elle dit : "Tu n'as pas répondu à mes messages pendant 3 jours — tu t'en fous complètement de moi. C'est toujours pareil avec toi, tu disparais dès que j'ai besoin de toi." Tu avais en réalité une urgence familiale grave et tu as prévenu par message, mais elle affirme ne jamais avoir reçu ce message. Elle est en colère, de mauvaise foi, et coupe la parole si tu essaies de te défendre.\nComment réponds-tu face à cette accusation injuste, sans perdre ta dignité ni blesser l'amitié ?`,
    criteria: `Pour obtenir un excellent score dans cette situation PIÉGÉE :\n• Valider la douleur de Camille SANS valider l'accusation injuste\n• Défendre calmement la réalité des faits sans t'excuser de ce que tu n'as pas fait\n• Maintenir la relation sans te soumettre ni t'écraser\n• Proposer d'aller au fond de la situation sans escalade\n• NB : Même une réponse excellente peut échouer (tirage 50%)`,
  },
  {
    id: 4,
    difficulty: 'Débutant+',
    successRate: 60,
    minScore: 60,
    unlockStars: 3,
    title: "L'ami qui a perdu son emploi",
    scenario: `Ton ami Théo, 28 ans, t'appelle à 18h. Sa voix est éteinte. Il t'annonce qu'il vient d'être licencié après 4 ans dans son entreprise — "ils m'ont viré par email". Il est visiblement anéanti et tu entends qu'il lutte pour ne pas pleurer. Il ne t'a rien demandé explicitement, mais il t'a appelé toi.\nComment réponds-tu pour pratiquer l'écoute active et lui apporter un vrai soutien émotionnel ?`,
    criteria: `Pour obtenir un excellent score :\n• Écoute active : refléter ce qu'il ressent AVANT tout conseil ou solution\n• Éviter les phrases consolatrices banales ("tu vas t'en sortir", "c'est leur perte")\n• Créer un espace sûr où il peut s'exprimer sans être jugé\n• Ne pas minimiser la douleur ni chercher à la "réparer" trop vite\n• Offrir ta présence concrète, pas juste des mots`,
  },
  {
    id: 5,
    difficulty: 'Intermédiaire',
    successRate: 55,
    minScore: 65,
    unlockStars: 5,
    title: 'Désaccord en réunion',
    scenario: `Lors d'une réunion d'équipe de 8 personnes, ton chef de projet Marc présente une décision stratégique qu'il a déjà prise : recentrer toute la communication sur Instagram en abandonnant LinkedIn et le blog. Tu as des données solides qui montrent que 60% de vos leads viennent de LinkedIn. Marc est enthousiaste et l'équipe semble acquiescer par habitude. Il t'a dit avant la réunion qu'il "n'aimait pas les contradicteurs en public".\nComment exprimes-tu ton désaccord de manière professionnelle et efficace, sans te faire des ennemis ?`,
    criteria: `Pour obtenir un excellent score :\n• S'opposer avec des faits, pas des opinions ("nos données montrent que...")\n• Respecter l'autorité de Marc tout en maintenant sa position\n• Formuler le désaccord comme une contribution, pas une attaque\n• Proposer une alternative concrète plutôt que de juste bloquer\n• Gérer la dynamique de groupe sans chercher à humilier`,
  },
  {
    id: 6,
    difficulty: 'Intermédiaire',
    successRate: 65,
    minScore: 65,
    unlockStars: 7,
    title: 'Refus sans blesser',
    scenario: `Ton ami Romain t'envoie un message le vendredi soir : "Samedi prochain, j'ai besoin d'aide pour déménager. Tu es dispo ? C'est pour toute la journée, au moins 8h de boulot. J'ai pas trop d'autres personnes à qui demander." Or tu as déjà prévu depuis 3 semaines une journée importante en famille — la première qu'on organise depuis longtemps. Tu ne veux pas aider Romain ce jour-là, mais tu tiens à lui.\nComment refuses-tu sans blesser l'amitié, sans mentir, et sans te retrouver à annuler ta journée famille ?`,
    criteria: `Pour obtenir un excellent score :\n• Refuser clairement, sans ambiguïté, sans fausse promesse\n• Expliquer sans surjustifier (une raison suffit)\n• Exprimer de la considération réelle pour la situation de Romain\n• Proposer une aide alternative concrète si possible\n• Ne pas culpabiliser ni te flageller pour ce refus légitime`,
  },
  {
    id: 7,
    difficulty: 'Intermédiaire+',
    successRate: 68,
    minScore: 68,
    unlockStars: 9,
    title: "L'ami toujours en retard",
    scenario: `Ton amie Julie est systématiquement en retard — jamais moins de 25 minutes. La dernière fois, tu as attendu 45 minutes sous la pluie. Tu lui as déjà fait remarquer deux fois, mais ça ne change pas. Aujourd'hui vous vous retrouvez pour un café. Elle arrive 30 minutes en retard, souriante, comme si de rien n'était, avec juste un "désolée !" rapide avant de commencer à parler d'autre chose.\nComment lui parles-tu de ce problème maintenant, de façon à ce que ça change vraiment, sans briser l'amitié ?`,
    criteria: `Pour obtenir un excellent score :\n• Aborder le sujet maintenant, sans attendre\n• Utiliser le "je" pour exprimer l'impact concret sur toi\n• Éviter les généralisations ("tu fais toujours...") qui mettent sur la défensive\n• Formuler une demande claire et actionnable pour la suite\n• Maintenir un ton ferme ET bienveillant simultanément`,
  },
  {
    id: 8,
    difficulty: 'Difficile',
    successRate: 70,
    minScore: 70,
    unlockStars: 11,
    title: 'La critique humiliante',
    scenario: `En pleine réunion d'équipe de 12 personnes, ton manager Éric dit devant tout le monde en regardant ton rapport : "C'est... comment dire... décevant. Je m'attendais à mieux de ta part. Franchement, ce niveau, c'est du travail de stagiaire." Deux collègues échangent des regards gênés. Tu ressens une vague de honte et de colère.\nComment réponds-tu sur le moment, sans exploser, sans te soumettre, et en protégeant ta dignité professionnelle ?`,
    criteria: `Pour obtenir un excellent score :\n• Répondre calmement mais fermement — ne pas absorber l'humiliation en silence\n• Recadrer la critique vers quelque chose de constructif\n• Ne pas attaquer Éric personnellement ni perdre son professionnalisme\n• Protéger sa dignité sans créer un incident diplomatique\n• Montrer qu'on peut s'affirmer sous pression sans agressivité`,
  },
  {
    id: 9,
    difficulty: 'Difficile',
    successRate: 72,
    minScore: 72,
    unlockStars: 13,
    title: "L'anniversaire oublié",
    scenario: `Tu réalises ce soir, à 22h, que c'est l'anniversaire de ta meilleure amie Léa — et tu l'as complètement oublié. Vous vous voyez normalement toutes les semaines. Léa fête ses 30 ans, une date qu'elle considérait importante. Tu sais qu'elle a vu que tu étais en ligne plusieurs fois aujourd'hui. Elle ne t'a rien dit, mais son silence lui-même est éloquent.\nComment lui parles-tu maintenant, de façon sincère et réparatrice ?`,
    criteria: `Pour obtenir un excellent score :\n• S'excuser sincèrement, sans excuse fallacieuse\n• Reconnaître l'importance de la date (ses 30 ans) et de la relation\n• Ne pas minimiser ("c'est juste un anniversaire")\n• Proposer quelque chose de concret pour réparer — pas juste des mots\n• Montrer que tu comprends l'impact émotionnel de cet oubli`,
  },
  {
    id: 10,
    difficulty: 'Difficile+',
    successRate: 75,
    minScore: 75,
    unlockStars: 15,
    title: 'Le feedback délicat',
    scenario: `Tu es chef d'équipe. Nina, 24 ans, vient de rendre un livrable important avec des erreurs factuelles, un plan désorganisé et un niveau rédactionnel insuffisant pour un client majeur. Ce n'est pas la première fois. Tu dois retravailler le document toi-même ce soir. Demain matin, tu dois lui faire un feedback qui l'aide à progresser vraiment, sans la démolir, sans minimiser le problème, et sans la perdre.\nQue lui dis-tu ?`,
    criteria: `Pour obtenir un excellent score :\n• Feedback concret sur le TRAVAIL, jamais sur la PERSONNE\n• Nommer les erreurs spécifiques sans généraliser\n• Créer un plan d'amélioration, pas juste une liste de critiques\n• Maintenir la confiance de Nina dans ses capacités à progresser\n• Être honnête sur la gravité sans être cruel`,
  },
  {
    id: 11,
    difficulty: 'Expert',
    successRate: 80,
    minScore: 78,
    unlockStars: 17,
    title: 'La remarque blessante en famille',
    scenario: `Pendant le repas de Noël, ta tante Martine dit devant toute la famille : "Tu as un peu grossi depuis la dernière fois, non ? Fais attention, à ton âge ça ne pardonne pas." Tout le monde a entendu. Certains regardent leur assiette. Tu ressens une mortification profonde et une colère froide.\nComment réagis-tu sur le moment, en protégeant ta dignité, sans déclencher une scène de famille, mais sans laisser passer ?`,
    criteria: `Pour obtenir un excellent score :\n• Répondre — ne pas laisser passer en silence\n• Recadrer avec humour ou fermeté, mais sans cruauté\n• Préserver l'atmosphère familiale tout en posant une limite claire\n• Réponse calibrée : ni explosion, ni soumission totale\n• Idéalement : retourner la gêne vers son auteur de façon élégante`,
  },
  {
    id: 12,
    difficulty: 'Expert',
    successRate: 85,
    minScore: 82,
    unlockStars: 20,
    title: "La négociation d'augmentation",
    scenario: `Tu as un entretien avec ta RH, Sophie, pour demander une augmentation. Tu n'as pas eu de revalorisation depuis 2 ans malgré d'excellentes performances et des responsabilités élargies. Sophie t'annonce dès le début : "Le budget est malheureusement gelé cette année, je suis désolée, on ne peut rien faire." Tu sais qu'une collègue avec moins d'ancienneté vient d'être augmentée.\nComment replies-tu pour ne pas te laisser clore la négociation dès l'ouverture ?`,
    criteria: `Pour obtenir un excellent score :\n• Ne pas accepter le premier refus comme définitif\n• Utiliser des faits concrets (performances, responsabilités, marché)\n• Explorer d'autres formes de compensation si l'argent est bloqué\n• Maintenir un ton professionnel et non émotionnel\n• Formuler une demande précise, pas une plainte vague`,
  },
  {
    id: 13,
    difficulty: 'Expert+',
    successRate: 88,
    minScore: 85,
    unlockStars: 23,
    title: "L'amie en crise à 2h du matin",
    scenario: `Il est 2h15 du matin. Tu travailles demain à 7h. Ton téléphone sonne : c'est Emma, ton amie proche. Elle sanglote et parle de façon décousue. Tu comprends qu'elle vient de rompre avec son compagnon de 4 ans après une dispute violente. Elle est seule chez elle et répète : "Je sais pas quoi faire, je peux pas rester ici." Tu es épuisé, tu as un trajet long, mais tu entends sa détresse réelle.\nComment gères-tu cette situation pour être vraiment là pour elle, dans tes limites réelles ?`,
    criteria: `Pour obtenir un excellent score :\n• Évaluer d'abord si elle est en sécurité (priorité absolue)\n• Être présent émotionnellement, même à distance, même fatigué\n• Ne pas promettre ce que tu ne peux pas tenir\n• Trouver des solutions concrètes adaptées à 2h du matin\n• Honorer à la fois son besoin ET tes limites réelles sans culpabilité excessive`,
  },
  {
    id: 14,
    difficulty: 'Maître',
    successRate: 92,
    minScore: 88,
    unlockStars: 26,
    title: 'La réconciliation avec le frère',
    scenario: `Ton frère Antoine et toi ne vous êtes pas parlé depuis 6 mois, suite à une dispute sur l'héritage de vos parents. Des mots durs ont été échangés. La relation était déjà fragilisée depuis des années. Aujourd'hui, à l'occasion de l'anniversaire de votre mère, tu te retrouves face à lui lors d'un repas familial. Ta mère vous regarde avec espoir et tristesse. C'est toi qui décides de prendre l'initiative.\nQue lui dis-tu pour ouvrir une réconciliation sincère sans nier la douleur passée ?`,
    criteria: `Pour obtenir un excellent score :\n• Ouvrir sans accuser, sans se victimiser, sans nier ce qui s'est passé\n• Reconnaître ta part dans le conflit (même si elle est partielle)\n• Parler de la relation et de ce qu'elle compte pour toi\n• Ne pas forcer une réconciliation totale — ouvrir une porte\n• Trouver les mots qui peuvent toucher Antoine sans le braquer`,
  },
  {
    id: 15,
    difficulty: 'Légendaire',
    successRate: 100,
    minScore: 92,
    unlockStars: 30,
    legendaire: true,
    title: 'Le pardon sincère',
    scenario: `Marie, une personne que tu considères comme une amie proche, est venue te voir. Il y a 8 mois, tu l'as profondément blessée : tu as révélé un secret qu'elle t'avait confié, qui a eu des conséquences réelles sur sa vie. Tu n'avais pas réalisé la gravité sur le moment. Elle a coupé le contact. Aujourd'hui elle t'a écrit pour te demander de la rencontrer. Elle s'assoit en face de toi. Elle attend. Elle ne dit rien.\nComment lui demandes-tu pardon de façon sincère, sans chercher à te justifier, sans attendre qu'elle te pardonne ?`,
    criteria: `Pour obtenir un excellent score dans ce défi légendaire :\n• Reconnaître la faute précisément — pas de généralité\n• Aucune justification, aucune excuse voilée\n• Montrer que tu comprends l'impact concret de tes actes sur elle\n• Ne pas demander le pardon comme si tu y avais droit\n• Laisser l'espace à Marie pour répondre comme elle le souhaite\n• Atteindre un niveau de vulnérabilité et d'authenticité rare`,
  },
];

// Trente défis courts prolongent la carte après les quinze situations initiales.
const SOUS_NIVEAUX = [
  [
    'Écouter sans interrompre',
    "Un collègue te confie qu'il doute de ses compétences après une erreur. Il s'arrête souvent et cherche ses mots. Montre que tu l'écoutes sans prendre toute la place.",
  ],
  [
    'Demander avant de conseiller',
    "Une amie raconte une journée pénible. Tu as des idées pour l'aider, mais elle n'a rien demandé. Comment vérifies-tu ce dont elle a besoin ?",
  ],
  [
    'Poser une limite au travail',
    "Ton responsable t'ajoute une tâche urgente alors que tu dois déjà terminer deux livrables aujourd'hui. Réponds sans agressivité et sans promettre l'impossible.",
  ],
  [
    'Réparer un retard',
    "Tu as oublié un rendez-vous important avec une personne qui comptait sur toi. Elle t'écrit qu'elle est blessée. Reconnais l'impact et propose une réparation réaliste.",
  ],
  [
    'Accueillir une critique',
    "Un ami te dit que tu l'as interrompu plusieurs fois pendant le dîner. Tu ne l'avais pas remarqué. Réponds sans nier son expérience.",
  ],
  [
    'Désamorcer un malentendu',
    "Un message bref que tu as envoyé a été compris comme froid. L'autre personne te demande si tu lui en veux. Clarifie sans lui reprocher son interprétation.",
  ],
  [
    'Refuser une invitation',
    "Une connaissance t'invite à une sortie qui ne te tente pas. Tu veux décliner clairement tout en gardant une relation cordiale.",
  ],
  [
    "Demander de l'aide",
    'Tu accumules du retard sur un projet partagé et tu ne peux pas tout terminer seul. Demande un soutien précis sans rejeter la responsabilité.',
  ],
  [
    'Répondre à une remarque blessante',
    "À table, un proche fait une plaisanterie sur ton apparence qui te met mal à l'aise. Pose une limite sans humilier la personne.",
  ],
  [
    'Faire un compliment sincère',
    'Une nouvelle collègue a facilité une réunion tendue grâce à une question pertinente. Dis-lui ce que tu as apprécié sans exagérer.',
  ],
  [
    'Gérer un désaccord familial',
    "Ta sœur veut organiser les vacances d'une façon qui ne te convient pas. Explique ton désaccord et cherche une option qui respecte vos contraintes.",
  ],
  [
    'Clarifier une attente',
    "Un ami suppose que tu peux l'héberger plusieurs semaines, mais tu n'en as jamais parlé. Demande des précisions et expose tes limites.",
  ],
  [
    'Soutenir sans minimiser',
    "Ton partenaire est déçu par un résultat important. Tu sais qu'il existe d'autres occasions, mais il a besoin d'être entendu maintenant.",
  ],
  [
    'Signaler une erreur',
    "Tu remarques une erreur dans le travail d'un collègue juste avant son envoi au client. Préviens-le avec tact et propose une vérification commune.",
  ],
  [
    'Demander un changement',
    'Ton colocataire laisse souvent la cuisine en désordre après avoir cuisiné. Décris le problème et formule une demande concrète.',
  ],
  [
    'Répondre à un silence',
    'Après une conversation difficile, une amie ne répond plus depuis deux jours. Envoie un message qui laisse une porte ouverte sans exiger de réponse.',
  ],
  [
    'Partager une bonne nouvelle',
    "Tu viens d'obtenir une opportunité dont tu es fier, mais un proche traverse une période difficile. Partage ta joie avec sensibilité.",
  ],
  [
    'Rester calme sous pression',
    "Dans une file d'attente, quelqu'un t'accuse à tort d'avoir doublé. Réponds fermement sans alimenter la dispute.",
  ],
  [
    'Exprimer un besoin de repos',
    'Tes amis veulent prolonger une soirée alors que tu es épuisé. Dis ce dont tu as besoin sans les culpabiliser.',
  ],
  [
    'Demander des excuses',
    "Un membre de ton équipe a présenté ton idée comme la sienne en réunion. Demande une clarification en privé et explique l'effet sur toi.",
  ],
  [
    'Accueillir une différence',
    "Une personne de ton groupe a une façon de communiquer très différente de la tienne. Vérifie ce qu'elle veut dire avant de conclure.",
  ],
  [
    'Négocier une répartition',
    'Dans un projet de groupe, tu portes presque tout le travail. Propose une répartition claire sans attaquer les autres.',
  ],
  [
    'Dire non à un proche',
    'Un cousin te demande de lui prêter une somme que tu ne peux pas perdre. Refuse avec honnêteté et respect.',
  ],
  [
    'Réagir à une confidence',
    "Une amie te révèle qu'elle a honte d'une décision passée. Accueille sa confidence sans juger ni détourner la conversation vers toi.",
  ],
  [
    'Faire un retour utile',
    "Un apprenti a fait des efforts mais son dossier comporte encore des erreurs importantes. Donne un retour précis qui l'aide à progresser.",
  ],
  [
    'Mettre fin à une conversation',
    "Une personne monopolise la conversation alors que tu dois partir. Interromps poliment et indique clairement que tu t'en vas.",
  ],
  [
    'Répondre à une demande floue',
    "Ton responsable te demande de 't'occuper du dossier' sans préciser le résultat attendu ni le délai. Pose les questions utiles.",
  ],
  [
    'Reprendre contact après un conflit',
    'Tu veux renouer avec un ami après une dispute où vous avez tous les deux dit des choses dures. Écris une ouverture sincère sans forcer sa réponse.',
  ],
  [
    'Protéger un temps personnel',
    "Un collègue t'envoie régulièrement des demandes tard le soir. Explique tes disponibilités et la façon de te joindre en urgence.",
  ],
  [
    'Reconnaître un effort',
    'Un proche a fait un pas difficile pour améliorer votre relation. Remercie-le en nommant précisément ce que tu as remarqué.',
  ],
];

const CRITERES_SOUS_NIVEAU = `Pour obtenir un excellent score :\n• Nommer clairement le fait ou le ressenti sans accusation\n• Formuler une demande ou une réponse concrète\n• Respecter les limites et le choix de l'autre\n• Garder un ton naturel, précis et bienveillant`;

const niveauxAjoutes = SOUS_NIVEAUX.map(([title, scenario], index) => ({
  id: 16 + index,
  kind: 'sublevel',
  sequence: index + 1,
  difficulty: index < 10 ? 'Pratique' : index < 20 ? 'Approfondissement' : 'Maîtrise',
  successRate: Math.max(65, 88 - Math.floor(index / 5) * 3),
  minScore: Math.min(82, 62 + Math.floor(index / 6) * 3),
  unlockStars: 30 + Math.floor(index / 2),
  title,
  scenario,
  criteria: CRITERES_SOUS_NIVEAU,
}));

const QUETES = [
  [
    'Le pont de confiance',
    'Une personne proche ne te fait plus confiance après plusieurs promesses non tenues. Elle accepte une conversation, mais reste méfiante. Reconstruis le lien sans réclamer une confiance immédiate.',
  ],
  [
    'La médiation impossible',
    'Deux collègues en conflit te demandent de prendre parti. Leur coopération est nécessaire pour terminer un projet urgent. Aide-les à parler sans devenir leur juge.',
  ],
  [
    'Le courage de dire stop',
    'Un groupe se moque régulièrement d’un nouveau membre. Tout le monde rit pour éviter d’être la prochaine cible. Interviens clairement et protège la personne visée.',
  ],
  [
    'La vérité délicate',
    'Tu dois annoncer à un ami que tu ne peux pas tenir un engagement important pris par enthousiasme. Dis la vérité, reconnais ta responsabilité et propose une suite réaliste.',
  ],
  [
    'La réparation durable',
    'Après une dispute, une personne accepte de te revoir mais dit qu’elle ne veut pas reprendre la relation comme avant. Ouvre une voie de réparation qui respecte son rythme.',
  ],
];

const niveauxQuetes = QUETES.map(([title, scenario], index) => ({
  id: 46 + index,
  kind: 'quest',
  sequence: index + 1,
  difficulty: 'Quête spéciale',
  successRate: 75,
  minScore: 75 + index,
  unlockStars: 45 + index * 4,
  title,
  scenario,
  criteria: `Pour terminer cette quête :\n• Écouter et reconnaître l'effet de la situation\n• Prendre ta part de responsabilité sans t'écraser\n• Proposer une action précise, réalisable et respectueuse\n• Laisser à l'autre la liberté de choisir la suite`,
  questReward: 10,
}));

export const ALL_LEVELS = [...LEVELS, ...niveauxAjoutes, ...niveauxQuetes];

export const TOTAL_LEVELS = ALL_LEVELS.length;
// Étoiles à réunir pour ouvrir la quête finale : le seuil du dernier défi, défini une seule fois.
export const STARS_TO_WIN = ALL_LEVELS.at(-1).unlockStars;
