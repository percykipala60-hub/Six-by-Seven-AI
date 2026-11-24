'use strict';
/* Menu des espaces (menu.html) : choisir un espace ferme le menu et y emmène l'app (window.sixMenu). */
(() => {
  const m = window.sixMenu;
  const boutons = [...document.querySelectorAll('.espace')];
  m.surEtat((e) => {
    for (const b of boutons)
      b.setAttribute('aria-checked', String(e.actuel.startsWith(b.dataset.chemin)));
    if (e.theme) {
      const s = document.documentElement.style;
      for (const [cle, valeur] of Object.entries(e.theme))
        if (valeur) s.setProperty(`--${cle}`, valeur);
    }
    (boutons.find((b) => b.getAttribute('aria-checked') === 'true') ?? boutons[0]).focus();
  });
  for (const b of boutons) b.addEventListener('click', () => m.choisir(b.dataset.chemin));
  document.addEventListener('keydown', (e) => {
    const i = boutons.indexOf(document.activeElement);
    if (e.key === 'Escape') m.choisir(null);
    else if (e.key === 'ArrowDown') boutons[(i + 1) % boutons.length].focus();
    else if (e.key === 'ArrowUp') boutons[(i - 1 + boutons.length) % boutons.length].focus();
  });
})();
