// Pages légales. Version de départ : à faire relire avant la mise en ligne.
// À ajouter dans les mentions légales dès que connus : forme juridique, siège, responsable de la publication.

type Block = string | { list: string[] };
export type LegalPage = {
  slug: string;
  title: string;
  summary: string;
  sections: { title: string; body: Block[] }[];
  // Bouton affiché en fin de page : « cookies » ouvre le panneau de réglage des cookies.
  action?: "cookies";
};

export const legalMeta = {
  eyebrow: "Informations légales",
  updated: "Dernière mise à jour : 10 octobre 2026",
  otherPages: "Autres documents",
  back: "Retour à l'accueil",
  manageCookies: "Gérer mes cookies",
};

const EMAIL = "sevenai.dc@gmail.com";

export const legalPages: LegalPage[] = [
  {
    slug: "conditions-utilisation",
    title: "Conditions d'utilisation",
    summary: "Les règles qui encadrent l'utilisation de Six, l'assistant de réponse édité par Seven.AI.",
    sections: [
      {
        title: "1. Objet",
        body: [
          "Les présentes conditions encadrent l'accès et l'utilisation de Six, une application éditée par Seven.AI qui aide à rédiger des réponses à des messages. En créant un compte ou en utilisant Six, tu acceptes ces conditions.",
        ],
      },
      {
        title: "2. Le service",
        body: [
          "Six analyse une conversation que tu lui transmets, en résume la situation, signale les arnaques probables et propose plusieurs réponses dans le ton de ton choix.",
          "Six n'envoie jamais de message à ta place. C'est toi qui choisis, modifies et envoies la réponse, dans l'application de ton choix.",
        ],
      },
      {
        title: "3. Ton compte",
        body: [
          "Certaines fonctionnalités nécessitent un compte. Les informations que tu fournis à l'inscription doivent être exactes. Tu es responsable de la confidentialité de tes identifiants et de ce qui est fait depuis ton compte.",
          "L'utilisation de Six peut être limitée par des quotas, indiqués dans l'application.",
        ],
      },
      {
        title: "4. Ce que tu t'engages à faire",
        body: [
          {
            list: [
              "Ne transmettre que des conversations que tu es en droit de partager.",
              "Ne pas utiliser Six pour harceler, tromper, menacer ou escroquer qui que ce soit.",
              "Ne pas tenter de contourner les protections ou les quotas du service, ni de perturber son fonctionnement.",
            ],
          },
        ],
      },
      {
        title: "5. Tes contenus",
        body: [
          "Les conversations que tu transmets restent les tiennes. Tu nous autorises seulement à les traiter pour te fournir le service, à les conserver et à les sauvegarder pour ton compte, et à les utiliser pour la sécurité de Six.",
          "Nous ne vendons pas tes contenus et ne les utilisons pas pour entraîner nos modèles d'IA.",
        ],
      },
      {
        title: "6. Réponses proposées par l'IA",
        body: [
          "Les réponses sont générées automatiquement et peuvent contenir des erreurs ou mal interpréter une situation. Tu restes seul responsable des messages que tu envoies.",
          "La détection d'arnaques est une aide, pas une garantie. En cas de doute, contacte directement l'organisme concerné par un canal officiel.",
        ],
      },
      {
        title: "7. Données personnelles",
        body: [
          "La façon dont nous collectons, utilisons, conservons et protégeons tes données est détaillée dans notre politique de confidentialité, qui fait partie de ces conditions.",
        ],
      },
      {
        title: "8. Propriété intellectuelle",
        body: [
          "Six, son logo, son interface et ses contenus appartiennent à Seven.AI. Tu peux utiliser librement les réponses que tu choisis d'envoyer.",
        ],
      },
      {
        title: "9. Disponibilité et responsabilité",
        body: [
          "Six est fourni en l'état. Nous faisons notre possible pour qu'il soit disponible et fiable, et sauvegardons régulièrement les données, sans pouvoir garantir l'absence d'interruption ou d'erreur.",
          "Seven.AI ne peut être tenue responsable des conséquences des messages que tu choisis d'envoyer, ni d'une décision prise sur la seule base d'une alerte ou d'une réponse proposée par Six.",
        ],
      },
      {
        title: "10. Suspension et suppression du compte",
        body: [
          "Tu peux supprimer ton compte à tout moment, depuis l'application ou en nous écrivant. Nous pouvons suspendre ou fermer un compte en cas de manquement grave à ces conditions, après t'avoir prévenu lorsque c'est possible.",
        ],
      },
      {
        title: "11. Évolution des conditions",
        body: [
          "Le service et ces conditions peuvent évoluer. Les changements importants te seront signalés dans l'application ou sur ce site avant de s'appliquer.",
        ],
      },
      {
        title: "12. Contact",
        body: [`Pour toute question : ${EMAIL}.`],
      },
    ],
  },
  {
    slug: "politique-confidentialite",
    title: "Politique de confidentialité",
    summary:
      "La présente politique décrit les données personnelles collectées par Seven.AI dans le cadre du service Six, les finalités de leur traitement, leur durée de conservation et les droits dont vous disposez.",
    sections: [
      {
        title: "1. Responsable du traitement",
        body: [
          "Seven.AI, éditeur de l'application Six, est responsable du traitement des données personnelles décrit dans la présente politique. Seven.AI accorde une importance particulière à la protection de vos données et s'engage à les traiter de manière licite, loyale et transparente.",
          `Pour toute question relative à vos données personnelles, vous pouvez nous contacter à l'adresse suivante : ${EMAIL}.`,
        ],
      },
      {
        title: "2. Données collectées",
        body: [
          "Dans le cadre de l'utilisation de Six, Seven.AI est susceptible de collecter les catégories de données suivantes :",
          {
            list: [
              "Données d'identification et de compte : identifiant de connexion (adresse électronique ou numéro de téléphone), nom ou pseudonyme, paramètres de l'application.",
              "Contenus transmis : conversations, exports et textes que vous soumettez au service, ainsi que les propositions de réponse générées.",
              "Données d'utilisation : quota, date et nombre de demandes, informations techniques (type d'appareil, version de l'application, journaux d'erreurs).",
              "Correspondance : échanges avec notre service d'assistance, le cas échéant.",
            ],
          },
          "Les captures d'écran ne sont pas collectées : leur texte est extrait directement sur votre appareil et l'image n'est jamais transmise à nos serveurs.",
        ],
      },
      {
        title: "3. Finalités et bases légales du traitement",
        body: [
          "Vos données sont traitées pour les finalités suivantes :",
          {
            list: [
              "Fourniture du service : analyse des conversations que vous soumettez et génération de propositions de réponse (exécution du contrat).",
              "Gestion des comptes utilisateurs : authentification, suivi des quotas, paramètres et assistance (exécution du contrat).",
              "Sauvegarde des données, afin de permettre leur restauration en cas de panne, de perte ou d'incident technique (intérêt légitime).",
              "Sécurité du service : prévention des abus, de la fraude et des usages contraires aux conditions d'utilisation (intérêt légitime).",
              "Amélioration du service : correction des erreurs et établissement de statistiques d'usage agrégées, ne permettant pas de vous identifier (intérêt légitime). La fréquentation du site est mesurée au moyen de Google Analytics, uniquement avec votre consentement.",
              "Respect des obligations légales et réglementaires applicables à Seven.AI (obligation légale).",
            ],
          },
        ],
      },
      {
        title: "4. Engagements de Seven.AI",
        body: [
          "Seven.AI s'engage à :",
          {
            list: [
              "ne pas vendre, louer ni échanger vos données personnelles ;",
              "ne pas utiliser vos conversations pour entraîner ses modèles d'intelligence artificielle ;",
              "ne pas exploiter vos données à des fins de publicité ciblée ;",
              "ne pas consulter le contenu de vos conversations, sauf à votre demande dans le cadre de l'assistance, ou lorsque la loi l'exige.",
            ],
          },
        ],
      },
      {
        title: "5. Masquage des informations sensibles",
        body: [
          "Préalablement à toute analyse par le modèle d'intelligence artificielle, Six remplace automatiquement sept catégories d'informations : noms, prénoms, numéros de téléphone, codes, numéros de compte, adresses et pseudonymes. Le modèle ne reçoit que la version masquée ; les informations d'origine sont réintégrées dans la réponse sur nos serveurs.",
          "Un écran de vérification vous présente le contenu avant son envoi. Le masquage automatique n'étant pas infaillible, il vous appartient de masquer manuellement toute information qui n'aurait pas été détectée.",
        ],
      },
      {
        title: "6. Modèle d'intelligence artificielle",
        body: ["Le modèle d'intelligence artificielle utilisé par Six est fourni par Seven.AI."],
      },
      {
        title: "7. Durée de conservation",
        body: [
          {
            list: [
              "Les données de compte et les contenus transmis sont conservés pendant toute la durée d'activité de votre compte.",
              "En cas de suppression du compte, ces données sont effacées de nos systèmes actifs, puis de nos sauvegardes au terme de leur cycle de renouvellement.",
              "Les journaux techniques sont conservés pour une durée limitée, strictement nécessaire à la sécurité et au bon fonctionnement du service.",
              "Certaines données peuvent être conservées au-delà de ces durées lorsqu'une obligation légale l'impose.",
            ],
          },
        ],
      },
      {
        title: "8. Destinataires des données",
        body: [
          "Vos données sont accessibles aux seules personnes habilitées de Seven.AI, dans la limite de ce qui est nécessaire à l'exercice de leurs fonctions, ainsi qu'à nos prestataires techniques (hébergement, stockage, sauvegarde), qui agissent exclusivement sur nos instructions et pour les besoins du service.",
          "Elles peuvent être communiquées aux autorités compétentes lorsque la loi l'exige. Elles ne sont en aucun cas cédées à des tiers à des fins commerciales.",
        ],
      },
      {
        title: "9. Transferts de données",
        body: [
          "Certains de nos prestataires sont susceptibles d'être établis hors de votre pays de résidence, notamment aux États-Unis s'agissant de l'hébergement du présent site et de la mesure d'audience. Seven.AI veille, dans ce cas, à ce que vos données bénéficient d'un niveau de protection conforme aux principes énoncés dans la présente politique.",
        ],
      },
      {
        title: "10. Sécurité des données",
        body: [
          "Seven.AI met en œuvre des mesures techniques et organisationnelles appropriées pour protéger vos données : chiffrement des échanges (HTTPS), restriction des accès aux seules personnes habilitées, protection des sauvegardes.",
          "Aucun système n'étant totalement infaillible, Seven.AI s'engage à vous informer dans les meilleurs délais de toute violation de données susceptible de vous concerner.",
        ],
      },
      {
        title: "11. Vos droits",
        body: [
          "Conformément à la réglementation applicable en matière de protection des données personnelles, vous disposez des droits suivants :",
          {
            list: [
              "droit d'accès à vos données et d'en obtenir une copie ;",
              "droit de rectification des données inexactes ou incomplètes ;",
              "droit à l'effacement de vos données et à la suppression de votre compte ;",
              "droit d'opposition et droit à la limitation du traitement ;",
              "droit de retirer votre consentement à tout moment, notamment pour les cookies, au moyen du lien « Gérer les cookies » situé en bas de chaque page.",
            ],
          },
          `Pour exercer ces droits, il vous suffit d'adresser votre demande à ${EMAIL}. Une réponse vous sera apportée dans un délai d'un mois à compter de sa réception. Vous disposez également du droit d'introduire une réclamation auprès de l'autorité de protection des données compétente dans votre pays.`,
        ],
      },
      {
        title: "12. Cookies et traceurs",
        body: [
          "Le présent site utilise des cookies strictement nécessaires à son fonctionnement et, sous réserve de votre consentement, des cookies de mesure d'audience et de traduction. Leur fonctionnement est détaillé dans notre politique cookies.",
        ],
      },
      {
        title: "13. Modification de la présente politique",
        body: [
          "Seven.AI se réserve le droit de modifier la présente politique. Toute modification substantielle vous sera notifiée dans l'application ou sur le présent site avant son entrée en vigueur.",
        ],
      },
    ],
  },
  {
    slug: "cookies",
    title: "Politique cookies",
    summary: "Les cookies utilisés sur ce site, à quoi ils servent, et comment changer tes choix.",
    action: "cookies",
    sections: [
      {
        title: "1. Qu'est-ce qu'un cookie ?",
        body: [
          "Un cookie est un petit fichier enregistré sur ton appareil quand tu visites un site. Par simplicité, nous appelons aussi « cookies » les autres façons d'enregistrer des informations sur ton appareil, comme le stockage du navigateur.",
        ],
      },
      {
        title: "2. Cookies nécessaires (toujours actifs)",
        body: [
          {
            list: [
              "« six:consent » (stockage local, 6 mois) : retient tes choix sur les cookies.",
              "« googtrans » (cookie, jusqu'à la fermeture du navigateur, seulement si tu changes de langue) : retient la langue choisie pour le site.",
              "« six:tour-step » (stockage de session, jusqu'à la fermeture de l'onglet) : retient l'étape atteinte dans la visite animée.",
              "« six:scroll-after-language » (stockage de session, quelques secondes) : te ramène au même endroit de la page après un changement de langue.",
            ],
          },
          "Ces informations restent sur ton appareil et ne servent pas à te suivre. Elles ne demandent pas ton accord, car le site ne fonctionne pas correctement sans elles.",
        ],
      },
      {
        title: "3. Mesure d'audience (avec ton accord)",
        body: [
          "Elle sert à compter les visites et les pages consultées, pour savoir ce qui est utile et améliorer le site. Nous utilisons Google Analytics, uniquement si tu l'acceptes :",
          {
            list: [
              "« _ga » et « _ga_… » (cookies, 13 mois) : distinguent les visites, sans révéler qui tu es.",
            ],
          },
          "Les signaux publicitaires de Google sont désactivés : ces mesures ne servent jamais à de la publicité. Les statistiques sont traitées par Google, y compris aux États-Unis. Si tu retires ton accord, la mesure s'arrête et ces cookies sont effacés.",
        ],
      },
      {
        title: "4. Traduction automatique (avec ton accord)",
        body: [
          "Si tu choisis une autre langue que le français, le site charge Google Traduction. Google peut alors déposer ses propres cookies, régis par sa propre politique de confidentialité.",
          "Choisir une langue vaut accord pour cette catégorie. Si tu la refuses, le site reste en français.",
        ],
      },
      {
        title: "5. Changer d'avis",
        body: [
          "Tu peux modifier tes choix à tout moment avec le bouton ci-dessous, ou le lien « Gérer les cookies » en bas de chaque page. Tes choix sont gardés 6 mois, puis nous te reposons la question.",
          "Tu peux aussi supprimer les cookies depuis les réglages de ton navigateur.",
        ],
      },
    ],
  },
  {
    slug: "mentions-legales",
    title: "Mentions légales",
    summary: "Les informations sur l'éditeur et l'hébergeur de ce site.",
    sections: [
      {
        title: "Éditeur",
        body: [
          {
            list: ["Seven.AI", `Contact : ${EMAIL}`],
          },
        ],
      },
      {
        title: "Hébergement",
        body: ["Ce site est hébergé par Render Services, Inc. (render.com), aux États-Unis."],
      },
      {
        title: "Propriété intellectuelle",
        body: [
          "Les marques Six et Seven.AI, leurs logos et l'ensemble des contenus de ce site sont la propriété de Seven.AI. Toute reproduction sans autorisation est interdite.",
        ],
      },
    ],
  },
  {
    slug: "utilisation-ia",
    title: "Utilisation de l'IA",
    summary: "Comment Six utilise l'intelligence artificielle, et où s'arrête son rôle.",
    sections: [
      {
        title: "Ce que fait l'IA",
        body: [
          {
            list: [
              "Elle résume ce qu'elle a compris de la conversation.",
              "Elle signale les messages qui ressemblent à une arnaque.",
              "Elle rédige trois propositions de réponse dans le ton choisi.",
            ],
          },
        ],
      },
      {
        title: "Ce qu'elle ne fait pas",
        body: [
          {
            list: [
              "Elle n'envoie aucun message à ta place.",
              "Elle ne décide pas de l'objectif de ta réponse : c'est toi qui le confirmes.",
              "Elle n'apprend pas de tes conversations : elles ne servent pas à entraîner nos modèles.",
            ],
          },
        ],
      },
      {
        title: "Le modèle",
        body: ["Le modèle d'IA utilisé par Six est fourni par Seven.AI. Il ne reçoit que la version masquée de tes conversations."],
      },
      {
        title: "Ses limites",
        body: [
          "Une IA peut se tromper : mal comprendre l'ironie, un contexte ou une relation entre deux personnes. Relis toujours la réponse avant de l'envoyer, et ajuste-la si elle ne te ressemble pas.",
        ],
      },
    ],
  },
];
