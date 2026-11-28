/** Les anciens historiques ne sont attribués qu'au compte déjà présent au démarrage. */
export function compteHistorique(): string {
  try {
    const session = JSON.parse(localStorage.getItem('six-session') ?? 'null');
    return typeof session?.id === 'string' ? session.id : '';
  } catch {
    return '';
  }
}

export function cleHistorique(cle: string): string {
  const id = compteHistorique();
  return id ? cle + ':' + id : cle;
}

export function reprendreHistoriqueExistant(): void {
  const id = compteHistorique();
  try {
    const marque = 'six-proprietaire-ancien-historique';
    if (localStorage.getItem(marque) === null) localStorage.setItem(marque, id || 'invite');
    if (!id || localStorage.getItem(marque) !== id) return;
    for (const cle of ['seven-ai-chats', 'seven-ai-chat', 'six-conversations']) {
      const ancienne = localStorage.getItem(cle);
      if (ancienne === null) continue;
      const cible = cleHistorique(cle);
      if (localStorage.getItem(cible) === null) localStorage.setItem(cible, ancienne);
      else if (localStorage.getItem(cible) !== ancienne) continue;
      localStorage.removeItem(cle);
    }
  } catch {
    /* Le stockage peut être indisponible. */
  }
}
