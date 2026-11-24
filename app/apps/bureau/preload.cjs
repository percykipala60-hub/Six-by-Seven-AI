'use strict';
/**
 * Pont entre l'app Six (page web) et l'application de bureau : quelques commandes pour le navigateur de Cosinus,
 * la connexion par le navigateur, rien d'autre (pas d'accès aux fichiers ni à Node). Disponible dans la page sous window.sixBureau.
 */
const { contextBridge, ipcRenderer } = require('electron');

const piloter = (commande) => ipcRenderer.invoke('six:navigateur', commande);

contextBridge.exposeInMainWorld('sixBureau', {
  version: 1,
  /** État de Cosinus pour la barre du haut (volet ouvert). */
  signaler: (etat) => ipcRenderer.invoke('six:app-etat', etat),
  /** Connexion Google ou Apple dans le navigateur de l'ordinateur ; renvoie le lien six://auth du retour. */
  connexion: {
    ouvrir: (url) => ipcRenderer.invoke('six:connexion', url),
    premierPlan: () => ipcRenderer.invoke('six:premier-plan'),
  },
  navigateur: {
    afficher: (bornes) => piloter({ action: 'afficher', bornes }),
    cacher: () => piloter({ action: 'cacher' }),
    ouvrir: (url) => piloter({ action: 'ouvrir', url }),
    retour: () => piloter({ action: 'retour' }),
    avant: () => piloter({ action: 'avant' }),
    recharger: () => piloter({ action: 'recharger' }),
    etat: () => piloter({ action: 'etat' }),
    /** Abonnement aux changements (adresse, titre, chargement) ; renvoie de quoi se désabonner. */
    surEtat: (rappel) => {
      const f = (_e, etat) => rappel(etat);
      ipcRenderer.on('six:navigateur-etat', f);
      return () => ipcRenderer.removeListener('six:navigateur-etat', f);
    },
  },
});
