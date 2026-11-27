'use strict';
/* Barre du haut de l'app de bureau : boutons vers l'app (par window.sixBarre, voir barre-preload.cjs). */
(() => {
  const b = window.sixBarre;
  const $ = (id) => document.getElementById(id);
  const ESPACES = {
    '/chat': 'Chat',
    '/cosinus': 'Cosinus',
    '/responsive': 'Responsive',
    '/reglages': 'Réglages',
  };

  $('retour').addEventListener('click', () => b.commande({ action: 'retour' }));
  $('avant').addEventListener('click', () => b.commande({ action: 'avant' }));
  $('recharger').addEventListener('click', () => b.commande({ action: 'recharger' }));
  $('reglages').addEventListener('click', () =>
    b.commande({ action: 'aller', chemin: '/reglages' }),
  );
  $('navigateur').addEventListener('click', () =>
    b.commande({ action: 'volet', onglet: 'navigateur' }),
  );
  $('fichiers').addEventListener('click', () =>
    b.commande({ action: 'volet', onglet: 'fichiers' }),
  );
  $('terminal').addEventListener('click', () =>
    b.commande({ action: 'volet', onglet: 'terminal' }),
  );
  $('espace').addEventListener('click', () => {
    const r = $('espace').getBoundingClientRect();
    b.commande({ action: 'menu-espaces', x: Math.round(r.left), y: Math.round(r.bottom + 4) });
  });

  b.surEtat((e) => {
    $('retour').disabled = !e.retour;
    $('avant').disabled = !e.avant;
    $('nom-espace').textContent = ESPACES[e.chemin] ?? '';
    $('reglages').setAttribute('aria-pressed', String(e.chemin === '/reglages'));
    // Pas connecté (écran de connexion) : aucun bouton d'outil ni de réglages dans la barre.
    $('reglages').hidden = !e.connecte;
    for (const onglet of ['navigateur', 'fichiers', 'terminal']) {
      $(onglet).hidden = !e.cosinus || !e.connecte;
      const ouvert = e.volet === onglet || (onglet === 'terminal' && e.terminal === true);
      $(onglet).setAttribute('aria-pressed', String(ouvert));
    }
    if (e.logo) $('logo').src = e.logo;
    if (e.theme) {
      const s = document.documentElement.style;
      for (const [cle, valeur] of Object.entries(e.theme))
        if (valeur) s.setProperty(`--${cle}`, valeur);
    }
  });
})();
