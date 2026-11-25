// Pages légales. Version de départ : à faire relire avant la mise en ligne.
// À compléter dans les mentions légales lors de l'immatriculation : numéro RCCM et identification nationale.

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
  updated: "Dernière mise à jour : 25 novembre 2026",
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
          "L'utilisation de Six nécessite un compte. Les informations que tu fournis à l'inscription doivent être exactes. Tu es responsable de la confidentialité de tes identifiants et de ce qui est fait depuis ton compte.",
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
        title: "2. Notre principe et nos engagements",
        body: [
          "Vos données restent sur votre appareil. Elles ne sont copiées sur votre compte que si vous l'autorisez vous-même, et vous pouvez retirer cette autorisation à tout moment.",
          "Seven.AI s'engage à :",
          {
            list: [
              "ne pas vendre, louer ni échanger vos données personnelles ;",
              "ne pas utiliser vos conversations pour entraîner des modèles d'intelligence artificielle sans votre accord explicite ;",
              "ne pas exploiter vos données à des fins de publicité ciblée ;",
              "ne pas consulter le contenu de vos conversations, sauf à votre demande dans le cadre de l'assistance, ou lorsque la loi l'exige.",
            ],
          },
        ],
      },
      {
        title: "3. Messages et captures d'écran",
        body: [
          "Vous choisissez le texte ou l'image à analyser. Le texte des captures d'écran est lu sur votre appareil : l'image n'est jamais envoyée.",
          "Avant tout envoi, Six remplace sur votre appareil les noms, numéros de téléphone, adresses électroniques, liens, codes, numéros de compte, adresses et pseudonymes reconnus par des repères, et vous montre exactement le texte qui sera transmis. Les informations d'origine sont remises dans la réponse sur votre appareil, jamais sur nos serveurs.",
          "Pour l'analyse et la rédaction, ce texte masqué passe par notre serveur puis par un prestataire d'intelligence artificielle. Le masquage automatique peut manquer un élément : vérifiez le texte affiché avant de continuer.",
          "Notre serveur n'enregistre pas le contenu des messages. Seules des données techniques sans contenu (par exemple le nombre de demandes) sont journalisées pour le fonctionnement et la sécurité du service.",
        ],
      },
      {
        title: "4. Données conservées sur votre appareil",
        body: [
          {
            list: [
              "La mémoire de Six : habitudes d'écriture résumées en nombres, notes que vous ajoutez sur vos contacts, rappels de suivi. Ce que Six apprend est oublié après 90 jours.",
              "Lorsque la mémoire est activée : vos conversations terminées avec Six (un court extrait masqué et la réponse retenue) et vos échanges avec Seven AI, jusqu'à ce que vous les effaciez. Ils ne sont jamais envoyés à votre compte.",
              "Sur Android, si vous l'autorisez : les aperçus des notifications des applications que vous choisissez (25 au plus), dans le stockage privé de l'appareil. Rien n'est envoyé tant que vous ne lancez pas vous-même une analyse.",
            ],
          },
          "Vous pouvez consulter, effacer ou désactiver tout cela dans les Réglages de l'application.",
        ],
      },
      {
        title: "5. Compte et copie de la mémoire",
        body: [
          "Un compte est nécessaire pour utiliser Six. Seven.AI traite votre adresse électronique pour l'authentification, ainsi que votre prénom.",
          "Votre mémoire n'est copiée sur votre compte que si vous l'autorisez expressément (Réglages > Compte). Si vous retirez cette autorisation, la copie conservée sur le compte est effacée.",
          "Ces données sont hébergées par Supabase, dans une région située à Paris (Union européenne), avec des règles d'accès qui réservent chaque compte à son titulaire.",
        ],
      },
      {
        title: "6. Intelligence artificielle",
        body: [
          "L'analyse et la rédaction font appel à des prestataires d'intelligence artificielle, actuellement Anthropic et, en secours, OpenAI. Seul le texte masqué leur est transmis ; ils appliquent leurs propres règles de traitement à leurs services.",
          "Quand vous demandez un lieu en République démocratique du Congo, Six cherche ce lieu dans OpenStreetMap : seul le nom du lieu recherché est envoyé, par notre serveur, aux services publics d'OpenStreetMap (Nominatim et Overpass). La carte affichée sous la réponse est chargée depuis openstreetmap.org.",
        ],
      },
      {
        title: "7. Durée de conservation",
        body: [
          {
            list: [
              "Contenu des messages : aucune conservation sur nos serveurs.",
              "Données de compte (adresse électronique, prénom, copie de la mémoire si vous l'avez autorisée) : jusqu'à la suppression du compte.",
              "Journaux techniques sans contenu : durée limitée, strictement nécessaire à la sécurité et au bon fonctionnement du service.",
            ],
          },
        ],
      },
      {
        title: "8. Prestataires",
        body: [
          "Le service s'appuie sur des prestataires qui traitent uniquement les données nécessaires à leur prestation : hébergement du site et de l'application (DigitalOcean, serveur situé à Francfort), nom de domaine (Cloudflare), comptes (Supabase, Paris), envoi des e-mails de connexion (Resend), intelligence artificielle (Anthropic, OpenAI) et cartes (OpenStreetMap). Vos données ne sont jamais cédées à des tiers à des fins commerciales.",
        ],
      },
      {
        title: "9. Transferts de données",
        body: [
          "Certains prestataires sont établis aux États-Unis (intelligence artificielle, mesure d'audience du site). Seul le texte masqué est transmis aux prestataires d'intelligence artificielle.",
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
          "Le script de Google Analytics est chargé avec chaque page, mais la mesure y reste coupée tant que tu n'as pas accepté : aucun cookie n'est déposé et aucune visite n'est comptée. Ton navigateur contacte toutefois les serveurs de Google pour récupérer ce script, ce qui leur transmet ton adresse IP. Il est présent pour permettre à Google de vérifier que ce site nous appartient.",
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
    summary: "Les informations relatives à l'éditeur et à l'hébergeur du présent site.",
    sections: [
      {
        title: "Éditeur",
        body: [
          {
            list: [
              "Seven.AI, entreprise individuelle en cours d'immatriculation",
              "Siège : Kinshasa, République démocratique du Congo",
              `Contact : ${EMAIL}`,
            ],
          },
        ],
      },
      {
        title: "Responsable de la publication",
        body: [`Seven.AI, joignable à l'adresse ${EMAIL}.`],
      },
      {
        // À mettre à jour si le site change d'hébergeur.
        title: "Hébergement",
        body: [
          "Le présent site et l'application Six sont hébergés sur un serveur loué à DigitalOcean, LLC (New York, États-Unis), situé à Francfort (Allemagne). Le nom de domaine sixbysevenai.com est géré par Cloudflare, Inc.",
        ],
      },
      {
        title: "Propriété intellectuelle",
        body: [
          "Les marques Six et Seven.AI, leurs logos et l'ensemble des contenus du présent site sont la propriété de Seven.AI. Toute reproduction ou utilisation sans autorisation préalable est interdite.",
        ],
      },
      {
        title: "Données personnelles et cookies",
        body: [
          "Le traitement des données personnelles est décrit dans la politique de confidentialité, et l'usage des cookies dans la politique cookies.",
        ],
      },
      {
        title: "Contact",
        body: [`Pour toute question, ou pour signaler un contenu, vous pouvez écrire à ${EMAIL}.`],
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
