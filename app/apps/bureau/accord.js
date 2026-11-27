'use strict';
/* Demande d'accord (accord.html) : affiche la question, renvoie la réponse de la personne (window.sixAccord). */
(() => {
  const a = window.sixAccord;
  const $ = (id) => document.getElementById(id);
  a.surDemande((d) => {
    $('titre').textContent = d.titre || '';
    $('texte').textContent = d.texte || '';
    $('garanties').hidden = !d.garanties;
    if (d.theme) {
      const s = document.documentElement.style;
      for (const [cle, valeur] of Object.entries(d.theme))
        if (valeur) s.setProperty(`--${cle}`, valeur);
    }
    // Par sécurité, le focus va sur « Refuser » : Entrée ne donne jamais l'accord par mégarde.
    $('refuser').focus();
  });
  $('toujours').addEventListener('click', () => a.repondre('toujours'));
  $('autoriser').addEventListener('click', () => a.repondre('une-fois'));
  $('refuser').addEventListener('click', () => a.repondre('non'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') a.repondre('non');
  });
})();
