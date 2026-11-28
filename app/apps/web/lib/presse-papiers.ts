/**
 * Copie un texte. Le presse-papiers moderne peut être refusé (fenêtre pas au premier plan, app de bureau, iframe,
 * page non sécurisée) : on se rabat alors sur l'ancienne méthode du navigateur. Lève une erreur si rien n'a marché.
 */
export async function copierTexte(texte: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texte);
      return;
    }
  } catch {
    /* refusé : méthode de secours */
  }
  const zone = document.createElement('textarea');
  zone.value = texte;
  zone.setAttribute('readonly', '');
  zone.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.appendChild(zone);
  zone.select();
  const ok = document.execCommand('copy');
  zone.remove();
  if (!ok) throw new Error('Copie impossible.');
}
