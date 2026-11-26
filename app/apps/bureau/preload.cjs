'use strict';
/**
 * Pont entre l'app Six (page web) et l'application de bureau : quelques commandes pour le navigateur de Cosinus,
 * la connexion par le navigateur, rien d'autre (pas d'accès aux fichiers ni à Node). Disponible dans la page sous window.sixBureau.
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const piloter = (commande) => ipcRenderer.invoke('six:navigateur', commande);

contextBridge.exposeInMainWorld('sixBureau', {
  version: 1,
  /** Volet Fichiers : montre un fichier dans l'Explorateur de Windows (ou le Finder). */
  montrerFichier: (chemin) => ipcRenderer.invoke('six:montrer-fichier', chemin),
  /** Cosinus : sélecteur de dossier de l'ordinateur ; renvoie le chemin choisi, ou null. */
  choisirDossier: () => ipcRenderer.invoke('six:choisir-dossier'),
  /** Chemin complet d'un fichier glissé, collé ou choisi (affiché sur la carte de la pièce jointe). */
  cheminFichier: (fichier) => {
    try {
      return webUtils.getPathForFile(fichier) || '';
    } catch {
      return '';
    }
  },
  /** État de Cosinus pour la barre du haut (volet ouvert). */
  signaler: (etat) => ipcRenderer.invoke('six:app-etat', etat),
  /** Connexion Google ou Apple dans le navigateur de l'ordinateur ; renvoie le lien six://auth du retour. */
  connexion: {
    ouvrir: (url) => ipcRenderer.invoke('six:connexion', url),
    premierPlan: () => ipcRenderer.invoke('six:premier-plan'),
  },
  navigateur: {
    /** Discussion affichée (« chat:… » ou « cosinus:… ») : ses propres onglets et son propre profil. */
    contexte: (contexte) => piloter({ action: 'contexte', contexte }),
    /** Premier message d'une discussion : son brouillon de navigation (« …:nouvelle ») devient le sien. */
    adopter: (de, vers) => piloter({ action: 'contexte-adopter', de, vers }),
    afficher: (bornes) => piloter({ action: 'afficher', bornes }),
    cacher: () => piloter({ action: 'cacher' }),
    ouvrir: (url) => piloter({ action: 'ouvrir', url }),
    retour: () => piloter({ action: 'retour' }),
    avant: () => piloter({ action: 'avant' }),
    recharger: () => piloter({ action: 'recharger' }),
    etat: () => piloter({ action: 'etat' }),
    nouvelOnglet: (url) => piloter({ action: 'onglet-nouveau', url }),
    choisirOnglet: (id) => piloter({ action: 'onglet-choisir', id }),
    fermerOnglet: (id) => piloter({ action: 'onglet-fermer', id }),
    rechercher: (texte, options) => piloter({ action: 'rechercher', texte, ...(options ?? {}) }),
    arreterRecherche: () => piloter({ action: 'arreter-recherche' }),
    zoom: (sens) => piloter({ action: 'zoom', sens }),
    menu: (x, y) => piloter({ action: 'menu', x, y }),
    /** Onglets ouverts et onglet actif. */
    surOnglets: (rappel) => {
      const f = (_e, etat) => rappel(etat);
      ipcRenderer.on('six:navigateur-onglets', f);
      return () => ipcRenderer.removeListener('six:navigateur-onglets', f);
    },
    /** Commandes venues du menu ⋯ ou du clavier (rechercher, historique). */
    surCommande: (rappel) => {
      const f = (_e, c) => rappel(c);
      ipcRenderer.on('six:navigateur-commande', f);
      return () => ipcRenderer.removeListener('six:navigateur-commande', f);
    },
    /** Résultat de la recherche dans la page. */
    surRecherche: (rappel) => {
      const f = (_e, r) => rappel(r);
      ipcRenderer.on('six:navigateur-recherche', f);
      return () => ipcRenderer.removeListener('six:navigateur-recherche', f);
    },
    /** Abonnement aux changements (adresse, titre, chargement) ; renvoie de quoi se désabonner. */
    surEtat: (rappel) => {
      const f = (_e, etat) => rappel(etat);
      ipcRenderer.on('six:navigateur-etat', f);
      return () => ipcRenderer.removeListener('six:navigateur-etat', f);
    },
  },
});
