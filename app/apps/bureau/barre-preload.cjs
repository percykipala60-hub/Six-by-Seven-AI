'use strict';
/** Pont de la barre du haut : envoyer une commande à l'app, recevoir son état. Rien d'autre. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sixBarre', {
  commande: (c) => ipcRenderer.invoke('six:barre', c),
  surEtat: (rappel) => {
    ipcRenderer.on('six:barre-etat', (_e, etat) => rappel(etat));
    void ipcRenderer.invoke('six:barre', { action: 'etat' });
  },
});
