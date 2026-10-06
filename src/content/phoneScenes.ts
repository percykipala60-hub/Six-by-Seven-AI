// Scènes jouées en boucle par le téléphone de l'accueil.
// Chaque scène : un message arrive dans une appli, on passe dans Six, on choisit une réponse, on revient l'envoyer.

export type AppId = "whatsapp" | "messenger" | "telegram" | "instagram" | "sms";

export type ChatMessage = { from: "me" | "them"; text: string; time: string };

export type Scene = {
  app: AppId;
  appName: string;
  contact: { name: string; initials: string; color: string; status: string };
  history: ChatMessage[];
  incoming: ChatMessage;
  /** Réglage affiché comme une ligne de réglages iOS : « Ton · Chaleureux ». */
  setting?: { label: string; value: string };
  understood?: string;
  suggestions?: string[];
  pick?: number;
  scam?: { title: string; text: string; actions: string[] };
};

export const scenes: Scene[] = [
  {
    app: "whatsapp",
    appName: "WhatsApp",
    contact: { name: "Maman", initials: "M", color: "#e8a33d", status: "en ligne" },
    history: [{ from: "me", text: "Je finis tard ce soir, je t'appelle demain", time: "18:02" }],
    incoming: { from: "them", text: "Tu passes dimanche ? Ta tante sera là aussi 😊", time: "19:40" },
    setting: { label: "Ton", value: "Chaleureux" },
    understood: "Invitation en famille, dimanche midi.",
    suggestions: [
      "Oui je viens ! Je peux apporter le dessert ?",
      "Dimanche c'est bon, j'arrive vers midi.",
      "Je fais tout pour venir, je te confirme samedi.",
    ],
    pick: 0,
  },
  {
    app: "messenger",
    appName: "Messenger",
    contact: { name: "Junior K.", initials: "JK", color: "#7c5cf0", status: "Actif maintenant" },
    history: [
      { from: "them", text: "Bien rentré hier ?", time: "10:12" },
      { from: "me", text: "Oui t'inquiète 👍", time: "10:15" },
    ],
    incoming: { from: "them", text: "Frérot tu peux me dépanner 50 000 FC jusqu'à vendredi ?", time: "14:31" },
    setting: { label: "Objectif", value: "Refuser poliment" },
    understood: "Demande d'argent, à refuser sans le vexer.",
    suggestions: [
      "Désolé, ce mois-ci je suis vraiment juste. Je ne peux pas cette fois.",
      "J'aimerais t'aider mais là ce n'est pas possible, vraiment.",
      "Pas cette semaine. On en reparle si c'est encore compliqué ?",
    ],
    pick: 0,
  },
  {
    app: "telegram",
    appName: "Telegram",
    contact: { name: "Mme Ilunga", initials: "MI", color: "#3d9be9", status: "vu récemment" },
    history: [{ from: "them", text: "Bonjour, j'ai passé commande lundi.", time: "09:05" }],
    incoming: {
      from: "them",
      text: "Toujours rien reçu. C'est la deuxième fois, je commence à perdre patience.",
      time: "16:48",
    },
    setting: { label: "Ton", value: "Professionnel" },
    understood: "Cliente mécontente, livraison en retard.",
    suggestions: [
      "Bonjour Madame, je vérifie votre commande et je reviens vers vous avant 17h.",
      "Toutes nos excuses pour ce retard. Je m'en occupe aujourd'hui.",
      "Désolé. Pouvez-vous me renvoyer votre numéro de commande ?",
    ],
    pick: 0,
  },
  {
    app: "instagram",
    appName: "Instagram",
    contact: { name: "nadia.mbuyi", initials: "N", color: "#d94f8a", status: "En ligne il y a 5 min" },
    history: [{ from: "them", text: "a répondu à ta story", time: "21:03" }],
    incoming: { from: "them", text: "Ta story m'a tellement fait rire 😂 on se voit quand ?", time: "21:04" },
    setting: { label: "Ton", value: "Drôle" },
    understood: "Elle propose de se voir, ton léger.",
    suggestions: [
      "Quand tu veux, mais c'est toi qui paies les jus 😄",
      "Samedi ? Je promets d'être moins drôle en vrai.",
      "Dès que tu arrêtes de rire. Donc jamais ?",
    ],
    pick: 0,
  },
  {
    app: "sms",
    appName: "SMS",
    contact: { name: "+243 89 000 1234", initials: "#", color: "#8e8e93", status: "SMS" },
    history: [],
    incoming: {
      from: "them",
      text: "FÉLICITATIONS ! Vous avez gagné 500 000 FC. Envoyez 5 000 FC de frais pour recevoir votre gain.",
      time: "11:20",
    },
    scam: {
      title: "Arnaque probable",
      text: "Personne ne demande de payer des frais pour recevoir un gain.",
      actions: ["Ignorer", "Répondre prudemment"],
    },
  },
];

// Durée de chaque étape d'une scène, en millisecondes :
// message reçu → ouverture de Six → propositions → choix → retour et envoi.
export const stepDurations = [1900, 1300, 1700, 1400, 2600];
export const sceneDuration = (s: Scene) =>
  (s.scam ? stepDurations.slice(0, 4) : stepDurations).reduce((a, b) => a + b, 0) + (s.scam ? 1200 : 0);

// Écrans de Six montrés dans « Comment ça marche ».
export const howScreens = {
  import: {
    title: "Nouvelle réponse",
    sources: ["Texte", "Export .zip", "Capture"],
    transcript: [
      "[19:38] Maman : Tu as mangé ?",
      "[19:39] Moi : Oui oui",
      "[19:40] Maman : Tu passes dimanche ? Ta tante sera là aussi 😊",
    ],
    meta: "3 messages · conversation WhatsApp détectée",
    action: "Continuer",
  },
  verify: {
    title: "Vérifie avant l'envoi",
    sub: "Voici ce que l'IA va lire.",
    toggle: "Afficher l'original",
    count: "3 informations masquées : prénom, numéro, compte.",
    add: "+ Masquer un autre mot",
    action: "Envoyer à l'analyse",
  },
};
