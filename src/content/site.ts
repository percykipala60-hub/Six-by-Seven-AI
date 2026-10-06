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

export const nav = {
  links: [
    { href: "/#comment", label: "Comment ça marche" },
    { href: "/#securite", label: "Sécurité" },
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

export const how = {
  id: "comment",
  title: "Comment ça marche",
  intro: "Six ne lit pas tes messages tout seul et n'envoie rien à ta place. Tu lui montres une conversation, il t'aide à y répondre.",
  steps: [
    {
      short: "Coller",
      title: "Colle la discussion",
      text: "Copie le texte, importe l'export d'une conversation WhatsApp ou ajoute une capture d'écran. Six reconnaît qui parle et à quel moment.",
    },
    {
      short: "Vérifier",
      title: "Vérifie ce qui part",
      text: "Avant l'analyse, les noms, numéros, codes et adresses sont remplacés. Tu vois le texte tel que l'IA va le lire, et tu peux masquer ce qui serait passé à travers.",
    },
    {
      short: "Choisir",
      title: "Choisis ta réponse",
      text: "Six te dit ce qu'il a compris, puis te propose trois réponses dans le ton voulu. Tu prends la tienne, tu la copies, tu l'envoies depuis ton appli habituelle.",
    },
  ],
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

// Cartes « ce que fait Six », chacune montrée par une petite interface.
export const features = {
  id: "fonctions",
  title: "Pensé pour tes vraies conversations.",
  intro: "Famille, clients, amis, inconnus : Six t'aide à répondre juste, sans jamais parler à ta place.",
  replies: { title: "Trois réponses, à ton image.", text: "Choisis le ton ou l'objectif. Six propose, tu gardes celle qui te ressemble." },
  mask: { title: "Tes infos restent chez toi.", text: "Les noms, numéros et comptes sont remplacés avant que l'IA ne lise quoi que ce soit." },
  apps: { title: "Toutes tes messageries.", text: "Colle une discussion, importe un export ou ajoute une capture d'écran." },
  send: { title: "Tu envoies toi-même.", text: "Six copie la réponse. C'est toi qui l'envoies, depuis ton appli habituelle." },
  light: { title: "Léger, même sans réseau.", text: "Il s'installe depuis un simple lien et s'ouvre même quand la connexion coupe." },
};

export const security = {
  id: "securite",
  title: "Les arnaques, il les voit venir.",
  text: "Faux conseiller bancaire, gain miracle, proche qui écrit soudain depuis un nouveau numéro. Quand un message y ressemble, Six te prévient avant de proposer quoi que ce soit.",
  note: "Une alerte reste une aide. En cas de doute, appelle l'organisme concerné par son numéro officiel.",
};

export const privacy = {
  id: "confidentialite",
  title: "Tes conversations restent les tiennes.",
  text: "Avant d'envoyer quoi que ce soit à l'IA, Six remplace les informations personnelles. Les vraies sont remises à leur place dans la réponse, sur notre serveur. Ensuite, la conversation est effacée.",
  points: [
    { title: "Rien n'est conservé", text: "Seuls ton compte et ton quota d'utilisation sont enregistrés." },
    { title: "Les captures restent sur ton téléphone", text: "Le texte est lu sur l'appareil. L'image n'est jamais envoyée." },
    { title: "Sept types d'informations masquées", text: "Noms, prénoms, numéros, codes, comptes, adresses et pseudos." },
    { title: "Tu as le dernier mot", text: "Le masquage n'est pas parfait. Si un nom passe, tu le masques toi-même avant l'envoi." },
  ],
};

export const everywhere = {
  title: "Léger, même sur un vieux téléphone.",
  text: "Six s'installe depuis un simple lien, sans passer par un store. L'appli s'ouvre même quand le réseau coupe, et elle a été pensée pour les petits écrans.",
  apps: [
    { id: "whatsapp", name: "WhatsApp" },
    { id: "messenger", name: "Messenger" },
    { id: "telegram", name: "Telegram" },
    { id: "instagram", name: "Instagram" },
    { id: "sms", name: "SMS" },
    { id: "email", name: "E-mail" },
  ] as const,
  appsLabel: "Fonctionne avec les conversations de",
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
  { id: "linkedin", name: "LinkedIn" },
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
      q: "Six envoie-t-il des messages à ma place ?",
      a: "Non. Six te propose des réponses, tu choisis celle qui te convient, tu la copies et tu l'envoies toi-même depuis ton appli habituelle.",
    },
    {
      q: "Six lit-il mes conversations tout seul ?",
      a: "Non. Six ne voit que ce que tu lui montres : un texte collé, l'export d'une conversation ou une capture d'écran.",
    },
    {
      q: "Que deviennent mes données ?",
      a: "Avant l'analyse, les noms, numéros, codes et adresses sont remplacés. La conversation est effacée une fois la réponse prête. Seuls ton compte et ton quota d'utilisation sont enregistrés.",
    },
    {
      q: "Et si un message ressemble à une arnaque ?",
      a: "Six te prévient avant de proposer quoi que ce soit. Une alerte reste une aide : en cas de doute, appelle l'organisme concerné par son numéro officiel.",
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
        { label: "Fonctions", href: "/#fonctions" },
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
    { label: "Mentions légales", href: "/legal/mentions-legales" },
  ],
  locale: "Français",
  follow: "Rejoignez-nous sur",
  soon: "Bientôt",
  copyright: "Copyright © 2026 Seven.AI. Tous droits réservés.",
};
