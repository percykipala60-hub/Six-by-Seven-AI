// Pages légales. Version de départ : à faire relire avant la mise en ligne.
// Les passages entre crochets sont des informations à compléter.

type Block = string | { list: string[] };
export type LegalPage = {
  slug: string;
  title: string;
  summary: string;
  sections: { title: string; body: Block[] }[];
};

export const legalMeta = {
  eyebrow: "Informations légales",
  updated: "Dernière mise à jour : 5 octobre 2026",
  draft: "Version provisoire, susceptible d'évoluer avant le lancement officiel de Six.",
  otherPages: "Autres documents",
  back: "Retour à l'accueil",
};

export const legalPages: LegalPage[] = [
  {
    slug: "conditions-utilisation",
    title: "Conditions d'utilisation",
    summary: "Les règles qui encadrent l'utilisation de Six, l'assistant de réponse édité par Seven.AI.",
    sections: [
      {
        title: "1. Objet",
        body: [
          "Les présentes conditions encadrent l'accès et l'utilisation de Six, une application qui aide à rédiger des réponses à des messages. En utilisant Six, tu acceptes ces conditions.",
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
        title: "3. Compte et quotas",
        body: [
          "Certaines fonctionnalités nécessitent un compte. Tu es responsable de la confidentialité de tes identifiants.",
          "L'utilisation de Six peut être limitée par des quotas, indiqués dans l'application.",
        ],
      },
      {
        title: "4. Ce que tu t'engages à faire",
        body: [
          { list: [
            "Ne transmettre que des conversations que tu es en droit de partager.",
            "Ne pas utiliser Six pour harceler, tromper, menacer ou escroquer qui que ce soit.",
            "Ne pas tenter de contourner les protections ou les quotas du service.",
          ] },
        ],
      },
      {
        title: "5. Réponses proposées par l'IA",
        body: [
          "Les réponses sont générées automatiquement et peuvent contenir des erreurs ou mal interpréter une situation. Tu restes seul responsable des messages que tu envoies.",
          "La détection d'arnaques est une aide, pas une garantie. En cas de doute, contacte directement l'organisme concerné par un canal officiel.",
        ],
      },
      {
        title: "6. Propriété intellectuelle",
        body: [
          "Six, son logo, son interface et ses contenus appartiennent à Seven.AI. Tu peux utiliser librement les réponses que tu choisis d'envoyer.",
        ],
      },
      {
        title: "7. Disponibilité et évolution",
        body: [
          "Six est fourni en l'état. Nous faisons notre possible pour qu'il soit disponible et fiable, sans pouvoir garantir l'absence d'interruption. Le service et ces conditions peuvent évoluer ; les changements importants te seront signalés dans l'application.",
        ],
      },
      {
        title: "8. Contact",
        body: ["Pour toute question : sevenai.dc@gmail.com."],
      },
    ],
  },
  {
    slug: "politique-confidentialite",
    title: "Politique de confidentialité",
    summary: "Ce que Six traite, ce qu'il conserve, et ce qu'il ne conserve jamais.",
    sections: [
      {
        title: "1. Ce que nous conservons",
        body: [
          "Uniquement ce qui est nécessaire au fonctionnement de ton compte : tes identifiants et tes quotas d'utilisation.",
          "Aucune conversation n'est conservée, ni sur nos serveurs, ni chez nos prestataires.",
        ],
      },
      {
        title: "2. Ce qui est traité sans être conservé",
        body: [
          "Pour proposer des réponses, le texte de la conversation est transmis à un modèle d'IA après masquage des informations personnelles. Le texte n'est utilisé que le temps de générer les réponses.",
        ],
      },
      {
        title: "3. Le masquage",
        body: [
          "Avant tout envoi, Six remplace sept types d'informations : noms, prénoms, numéros de téléphone, codes, numéros de compte, adresses et pseudos. Elles sont remises à leur place dans la réponse, sur notre serveur.",
          "Un écran de vérification te montre ce qui sera envoyé. Le masquage automatique n'est pas infaillible : tu peux masquer toi-même ce qui aurait échappé.",
        ],
      },
      {
        title: "4. Les captures d'écran",
        body: ["Le texte d'une capture est lu directement sur ton téléphone. L'image n'est jamais envoyée."],
      },
      {
        title: "5. Prestataires",
        body: ["Le modèle d'IA est fourni par un prestataire tiers : [nom du prestataire et pays de traitement]."],
      },
      {
        title: "6. Tes droits",
        body: [
          "Tu peux à tout moment demander l'accès à tes données, leur correction ou la suppression de ton compte en écrivant à sevenai.dc@gmail.com.",
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
          { list: [
            "Seven.AI",
            "Forme juridique : [à compléter]",
            "Siège : [à compléter]",
            "Contact : sevenai.dc@gmail.com · +243 985 002 388",
            "Responsable de la publication : [à compléter]",
          ] },
        ],
      },
      {
        title: "Hébergement",
        body: ["[Nom, adresse et contact de l'hébergeur]"],
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
          { list: [
            "Elle résume ce qu'elle a compris de la conversation.",
            "Elle signale les messages qui ressemblent à une arnaque.",
            "Elle rédige trois propositions de réponse dans le ton choisi.",
          ] },
        ],
      },
      {
        title: "Ce qu'elle ne fait pas",
        body: [
          { list: [
            "Elle n'envoie aucun message à ta place.",
            "Elle ne décide pas de l'objectif de ta réponse : c'est toi qui le confirmes.",
            "Elle ne conserve pas tes conversations.",
          ] },
        ],
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
