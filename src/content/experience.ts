// Textes de la page « Découvrir » : une visite animée de Six, pilotée par le défilement.
// Les quatre appareils tournent en cercle ; un téléphone puis un ordinateur, tirés au hasard,
// s'avancent et la caméra entre dans leur écran pour un court guide de Six.

export const experience = {
  path: "/decouvrir",
  title: "Découvrir Six",
  intro: {
    title: "Une seule appli. Tous tes écrans.",
    text: "iPhone, Android, Mac ou Windows : Six t'aide à répondre à tes messages, partout.",
    cue: "Fais défiler pour entrer dans Six",
  },
  phone: {
    // Légendes affichées pendant que le téléphone s'avance.
    arrive: { title: "Un message arrive.", text: "Tu ne sais pas trop quoi répondre ?" },
    open: { title: "Ouvre Six.", text: "On entre dans l'appli." },
    done: { title: "Envoyé. Par toi.", text: "Six propose, tu décides. Il n'envoie jamais rien à ta place." },
  },
  laptop: {
    arrive: { title: "Sur ordinateur aussi.", text: "La même appli, avec plus de place pour tes conversations." },
    done: { title: "Ton téléphone, ton ordinateur.", text: "Les deux versions font exactement la même chose." },
  },
  // Guide sur téléphone : quatre étapes, chacune jouée au fil du défilement.
  phoneGuide: [
    {
      title: "Colle la discussion.",
      text: "Copie le texte, importe l'export WhatsApp ou ajoute une capture d'écran. Six reconnaît qui parle.",
    },
    {
      title: "Vérifie ce qui part.",
      text: "Noms, numéros et comptes sont masqués avant que l'IA ne lise quoi que ce soit.",
    },
    {
      title: "Six comprend, puis propose.",
      text: "Il te dit ce qu'il a compris, puis te donne trois réponses dans le ton que tu veux.",
    },
    {
      title: "Tu choisis. Tu envoies.",
      text: "Six copie ta réponse. Tu l'envoies toi-même, depuis ton appli habituelle.",
    },
  ],
  // Guide sur ordinateur : trois étapes.
  desktopGuide: [
    {
      title: "Toutes tes conversations.",
      text: "WhatsApp, Messenger, Telegram, Instagram, SMS : tout est réuni au même endroit.",
    },
    {
      title: "Le bon ton, à chaque fois.",
      text: "Une cliente mécontente ? Six passe en ton professionnel et propose trois réponses.",
    },
    {
      title: "Les arnaques, il les voit venir.",
      text: "Gain miracle, faux conseiller : Six te prévient avant de proposer quoi que ce soit.",
    },
  ],
  devices: {
    ios: "iPhone 18 Pro Max",
    android: "Galaxy S26 Ultra",
    mac: "MacBook Pro",
    windows: "PC Windows",
  },
  steps: "Étape",
  labels: {
    phone: "Six sur téléphone",
    mac: "Six sur Mac",
    windows: "Six sur Windows",
    empty: "Choisis une conversation",
    paste: "pour la coller dans",
  },
};
