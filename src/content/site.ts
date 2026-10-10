// Tout le texte du site vit ici. Les composants ne font que l'afficher :
// on peut refaire le design sans toucher au contenu, et inversement.
// Ton : simple, concret, à la deuxième personne. Pas de slogans en cascade.

export const brand = {
  product: "Six",
  company: "Seven.AI",
  tagline: "L'IA propose. Tu décides.",
};

// Liens de l'application. À remplir le jour du lancement :
// tant qu'ils sont vides, les boutons mènent à la section « Télécharger » avec la date de sortie.
export type PlatformId = "ios" | "android" | "mac" | "windows";

// Version bêta, ouverte avant la sortie officielle.
// Colle ici l'adresse de la bêta : tous les boutons « Essayer la bêta » pointeront dessus.
export const beta = {
  url: "",
  tag: "Bêta",
  label: "Essayer la bêta web",
  short: "Bêta web",
  open: "Ouvrir la bêta web",
  finalRelease: "Dans ton navigateur, rien à installer. La version finale sort le 15 octobre.",
  title: "La bêta web est ouverte",
  text: "Essaie Six dès maintenant dans ton navigateur, avant la sortie officielle. Certaines fonctions peuvent encore changer, et tes retours nous aident à les améliorer.",
  pending: "Lien de la bêta bientôt disponible",
};

export const app = {
  webUrl: "", // adresse de la version web, ex. https://app.exemple.com
  // Liens de téléchargement par plateforme : vides tant que les versions ne sont pas publiées.
  platforms: [
    { id: "ios", name: "iPhone", system: "iOS", url: "" },
    { id: "android", name: "Android", system: "Téléphones Android", url: "" },
    { id: "mac", name: "Mac", system: "macOS", url: "" },
    { id: "windows", name: "Windows", system: "PC Windows", url: "" },
  ] satisfies { id: PlatformId; name: string; system: string; url: string }[],
  downloadPage: "/telecharger",
  sectionId: "telecharger",
  release: "Disponible le 15 octobre",
  releaseShort: "15 oct.",
  download: {
    short: "Télécharger",
    long: "Télécharger l'application",
    title: "L'application",
    text: "Installe Six sur ton téléphone depuis un simple lien. Elle s'ouvre même quand le réseau coupe.",
    platforms: "iPhone, Android, Mac et Windows",
  },
  web: {
    short: "Version web",
    long: "Ouvrir la version web",
    title: "La version web",
    text: "Utilise Six directement dans ton navigateur, sur téléphone comme sur ordinateur. Rien à installer.",
    platforms: "Tous les navigateurs",
  },
};

// Coordonnées de Seven.AI : utilisées dans le pied de page et les pages légales.
export const contact = {
  email: "sevenai.dc@gmail.com",
  // Espaces insécables : le numéro ne se coupe jamais en fin de ligne.
  phone: "+243 985 002 388",
  phoneHref: "tel:+243985002388",
};

export const nav = {
  links: [
    { href: "/#comment", label: "Comment ça marche" },
    { href: "/#securite", label: "Arnaques" },
    { href: "/#confidentialite", label: "Confidentialité" },
    { href: "/#seven-ai", label: "Seven.AI" },
    { href: "/#questions", label: "Questions" },
  ],
};

export const hero = {
  title: "L'IA propose. Tu décides.",
  lead: "Un message auquel tu ne sais pas quoi répondre ? Colle-le dans Six. Il te propose trois réponses, tu prends celle qui te ressemble et tu l'envoies toi-même.",
  meta: "Bêta ouverte dès maintenant. Version finale le 15 octobre sur iPhone, Android, Mac et Windows.",
};

// Exemple de masquage : chaque segment sensible a sa version originale et sa version masquée.
export type MaskSegment = string | { original: string; masked: string };

export const maskExample = {
  toggle: { original: "Reçu", masked: "Envoyé à l'IA" },
  segments: [
    "Salut ",
    { original: "Patrick", masked: "[PRÉNOM]" },
    ", appelle-moi au ",
    { original: "+243 81 234 5678", masked: "[NUMÉRO]" },
    ". Mon compte est ",
    { original: "0123-4567", masked: "[COMPTE]" },
    ", mais ne le dis à personne.",
  ] satisfies MaskSegment[],
};

// Remarque affichée à l'étape « arnaques » du guide.
export const security = {
  note: "Une alerte reste une aide. En cas de doute, appelle l'organisme concerné par son numéro officiel.",
};

export const privacy = {
  id: "confidentialite",
  title: "Tes conversations restent les tiennes.",
  text: "Avant d'envoyer quoi que ce soit à l'IA, Six remplace les informations personnelles. Les vraies sont remises à leur place dans la réponse, sur notre serveur. Tes données servent à faire marcher Six et à ne rien perdre, jamais à autre chose.",
  points: [
    { title: "Jamais vendues", text: "Tes données ne sont ni vendues ni utilisées pour entraîner l'IA. Elles servent à faire fonctionner ton compte." },
    { title: "Sauvegardées pour ne rien perdre", text: "Ton compte et tes données sont sauvegardés, pour être restaurés en cas de panne." },
    { title: "Les captures restent sur ton téléphone", text: "Le texte est lu sur l'appareil. L'image n'est jamais envoyée." },
    { title: "Sept types d'informations masquées", text: "Noms, prénoms, numéros, codes, comptes, adresses et pseudos. Si un nom passe, tu le masques toi-même." },
  ],
};

export const sevenAi = {
  id: "seven-ai",
  label: "Seven.AI",
  title: "Deux traits côte à côte.",
  text: "Le blanc, c'est l'humain qui trace. Le bleu, c'est l'IA qui l'accompagne sans jamais passer devant. C'est l'idée derrière Seven.AI, et derrière chacun de ses produits.",
  sixStory: "Six naît du 7 : la barre du 7 descend et s'enroule en 6. Le trait bleu marche à côté.",
};

// Un réseau sans `href` s'affiche grisé : ajoute le lien ici dès qu'il existe.
export type SocialId = "whatsapp" | "instagram" | "linkedin" | "tiktok" | "facebook";
export const socials: { id: SocialId; name: string; handle?: string; href?: string }[] = [
  { id: "whatsapp", name: "WhatsApp", handle: "Chaîne Seven.AI", href: "https://whatsapp.com/channel/0029Vb9blFv4o7qVCCbRPi1Y" },
  { id: "instagram", name: "Instagram", handle: "@sevenai.dc", href: "https://www.instagram.com/sevenai.dc/" },
  { id: "linkedin", name: "LinkedIn", handle: "Seven.AI", href: "https://lnkd.in/p/dM_ZkJfP" },
  { id: "tiktok", name: "TikTok", handle: "@sevenai..dc", href: "https://www.tiktok.com/@sevenai..dc" },
  { id: "facebook", name: "Facebook", handle: "Seven.AI", href: "https://www.facebook.com/profile.php?id=61595213814728" },
];

// Questions fréquentes : réponses tirées de ce que le site dit déjà, sans promesse nouvelle.
export const faq = {
  id: "questions",
  title: "Questions fréquentes",
  intro: "Ce qu'on nous demande le plus souvent avant d'essayer Six.",
  items: [
    {
      q: "Six lit-il mes conversations tout seul ?",
      a: "Non. Six ne voit que ce que tu lui montres : un texte collé, l'export d'une conversation ou une capture d'écran.",
    },
    {
      q: "Que deviennent mes données ?",
      a: "Avant l'analyse, les noms, numéros, codes et adresses sont remplacés. Tes données sont enregistrées et sauvegardées pour faire fonctionner ton compte et ne rien perdre en cas de panne. Elles ne sont jamais vendues ni utilisées pour entraîner l'IA, et tu peux demander leur suppression à tout moment.",
    },
    {
      q: "Faut-il une bonne connexion ?",
      a: "Non. Six s'installe depuis un simple lien, sans passer par un store, et s'ouvre même quand le réseau coupe. Il a été pensé pour les petits écrans et les vieux téléphones.",
    },
    {
      q: "Sur quels appareils fonctionne Six ?",
      a: "Sur iPhone, Android, Mac et Windows, et dans n'importe quel navigateur avec la version web. Toutes les versions font la même chose.",
    },
    {
      q: "Quand sort Six ?",
      a: "La version finale sort le 15 octobre. La bêta web est déjà ouverte : tu peux l'essayer dès maintenant dans ton navigateur.",
    },
  ],
};

// Mesure d'audience : identifiant de mesure Google Analytics 4 (« G-… »), visible dans Analytics sous
// Administration > Flux de données > le flux du site. Vide : aucune mesure.
export const analytics = {
  gaMeasurementId: "G-8PXSQH45JG",
};

// Bandeau et panneau de consentement aux cookies.
export const cookies = {
  title: "Tes choix sur les cookies",
  text: "Nous utilisons des cookies nécessaires au site. Avec ton accord, nous mesurons aussi l'audience et activons Google Traduction si tu changes de langue. Tu peux changer d'avis à tout moment, en bas de page.",
  policy: "Politique cookies",
  policyHref: "/legal/cookies",
  refuseAll: "Tout refuser",
  acceptAll: "Tout accepter",
  customize: "Personnaliser",
  save: "Enregistrer mes choix",
  close: "Fermer",
  panelTitle: "Gérer mes cookies",
  panelIntro: "Choisis ce que tu autorises. Les cookies nécessaires ne peuvent pas être désactivés : sans eux, le site ne fonctionne pas correctement.",
  alwaysOn: "Toujours actifs",
  manage: "Gérer les cookies",
  categories: [
    {
      id: "necessary",
      title: "Nécessaires",
      text: "Retenir tes choix de cookies, la langue du site et l'étape atteinte dans la visite animée. Rien n'est utilisé pour te suivre.",
    },
    {
      id: "audience",
      title: "Mesure d'audience",
      text: "Compter les visites et les pages consultées avec Google Analytics, pour savoir ce qui est utile et améliorer le site. Aucune donnée n'est utilisée pour de la publicité.",
    },
    {
      id: "translation",
      title: "Traduction automatique",
      text: "Quand tu choisis une autre langue que le français, la page est traduite par Google Traduction, qui peut alors déposer ses propres cookies. Sans ton accord, le site reste en français.",
    },
  ] as const,
};

// Page introuvable (404).
export const notFound = {
  code: "404",
  title: "Cette page s'est perdue en route.",
  text: "L'adresse est peut-être mal écrite, ou la page a changé de place. Voici où tu voulais sans doute aller.",
  home: "Retour à l'accueil",
  links: [
    { label: "Comment ça marche", href: "/#comment" },
    { label: "Télécharger Six", href: "/telecharger" },
    { label: "Questions fréquentes", href: "/#questions" },
    { label: "Politique de confidentialité", href: "/legal/politique-confidentialite" },
  ],
  contact: "Toujours perdu ? Écris-nous :",
};

// Page « Télécharger ».
export const downloadPage = {
  title: "Télécharger Six",
  intro: "Sur ton téléphone, ton ordinateur ou dans le navigateur. Les versions font toutes la même chose.",
  others: "Toutes les plateformes",
  otherLink: "Autres plateformes et version web",
  download: "Télécharger",
  open: "Ouvrir",
  available: "Disponible maintenant",
  help: "Une question sur la façon dont Six utilise l'IA ?",
  helpLink: "Lire notre page dédiée",
};

export const launch = {
  title: "Six sort le 15 octobre.",
  text: "Choisis comment tu veux l'utiliser. Les deux versions font exactement la même chose.",
  date: "Le 15 octobre",
  follow: "Suis Seven.AI pour être prévenu le jour du lancement.",
};

export const footer = {
  columns: [
    {
      title: "Six",
      links: [
        { label: "Télécharger", href: "/telecharger" },
        { label: "Version web", href: "/telecharger#web" },
        { label: "Bêta web", href: "/telecharger#beta" },
        { label: "Comment ça marche", href: "/#comment" },
      ],
    },
    {
      title: "Sécurité et vie privée",
      links: [
        { label: "Arnaques", href: "/#securite" },
        { label: "Confidentialité", href: "/#confidentialite" },
        { label: "Utilisation de l'IA", href: "/legal/utilisation-ia" },
        { label: "Politique de confidentialité", href: "/legal/politique-confidentialite" },
      ],
    },
    {
      title: "Assistance",
      links: [
        { label: "Questions fréquentes", href: "/#questions" },
        { label: "Plateformes disponibles", href: "/telecharger#plateformes" },
        { label: "Chaîne WhatsApp", href: "https://whatsapp.com/channel/0029Vb9blFv4o7qVCCbRPi1Y" },
        { label: `Nous écrire : ${contact.email}`, href: `mailto:${contact.email}` },
        { label: `Appeler : ${contact.phone}`, href: contact.phoneHref },
      ],
    },
    {
      title: "Seven.AI",
      links: [
        { label: "À propos", href: "/#seven-ai" },
        { label: "Lancement du 15 octobre", href: "/#telecharger" },
        { label: "Mentions légales", href: "/legal/mentions-legales" },
      ],
    },
  ],
  legal: [
    { label: "Conditions d'utilisation", href: "/legal/conditions-utilisation" },
    { label: "Confidentialité", href: "/legal/politique-confidentialite" },
    { label: "Utilisation de l'IA", href: "/legal/utilisation-ia" },
    { label: "Cookies", href: "/legal/cookies" },
    { label: "Mentions légales", href: "/legal/mentions-legales" },
  ],
  // Choix de la langue : le site est écrit en français, les autres langues sont traduites
  // automatiquement par Google Traduction. Chaque langue est écrite dans sa propre langue.
  languages: [
    { code: "fr", label: "Français" },
    { code: "en", label: "English" },
    { code: "ln", label: "Lingala" },
    { code: "sw", label: "Kiswahili" },
    { code: "pt", label: "Português" },
    { code: "es", label: "Español" },
    { code: "ar", label: "العربية" },
    { code: "zh-CN", label: "中文" },
  ],
  languageLabel: "Langue du site",
  follow: "Rejoignez-nous sur",
  soon: "Bientôt",
  copyright: "Copyright © 2026 Seven.AI. Tous droits réservés.",
};
