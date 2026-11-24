'use strict';
/** Pont du menu des espaces : recevoir l'espace actuel et le thème, renvoyer le choix. Rien d'autre. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sixMenu', {
  choisir: (chemin) => ipcRenderer.invoke('six:menu', chemin),
  surEtat: (rappel) => ipcRenderer.on('six:menu-etat', (_e, etat) => rappel(etat)),
});
