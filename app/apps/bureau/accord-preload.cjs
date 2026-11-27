'use strict';
/** Pont de la demande d'accord : recevoir la question et le thème, renvoyer la réponse. Rien d'autre. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sixAccord', {
  repondre: (choix) => ipcRenderer.invoke('six:accord', choix),
  surDemande: (rappel) => ipcRenderer.on('six:accord-demande', (_e, d) => rappel(d)),
});
