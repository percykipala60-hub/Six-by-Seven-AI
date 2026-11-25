import { modifierTravail } from './travail-serveur';
import { contexteDuProjet, prochaineOccurrence, type Tache } from './travail';

/** La réservation est persistée avant l'appel IA. Une exécution interrompue n'est pas relancée automatiquement. */
export async function executerProchaine(
  generer: (tache: Tache, contexte: string) => Promise<string>,
  maintenant = Date.now(),
) {
  const reservation = await modifierTravail((e) => {
    e.battement = new Date(maintenant).toISOString();
    for (const t of e.taches) {
      if (t.execution && !t.execution.fin && maintenant - Date.parse(t.execution.debut) > 900000) {
        t.execution.fin = new Date(maintenant).toISOString();
        t.execution.erreur = 'Exécution interrompue. Vérifie la tâche avant de la reprendre.';
        t.etat = 'pause';
      }
    }
    if (e.taches.some((t) => t.execution && !t.execution.fin)) return null;
    const t = e.taches
      .filter((t) => t.etat === 'active' && Date.parse(t.prochaine) <= maintenant)
      .sort((a, b) => a.prochaine.localeCompare(b.prochaine))[0];
    if (!t) return null;
    t.execution = { debut: new Date(maintenant).toISOString() };
    const p = e.projets.find((p) => p.id === t.projetId && p.proprietaire === t.proprietaire);
    return { tache: structuredClone(t), contexte: p ? contexteDuProjet(p) : '' };
  });
  if (!reservation) return false;
  let resultat = '',
    erreur = '';
  try {
    resultat = await generer(reservation.tache, reservation.contexte);
    if (!resultat.trim()) throw new Error('vide');
  } catch {
    erreur = 'La tâche a échoué. Vérifie le service IA et tes limites, puis reprends-la.';
  }
  await modifierTravail((e) => {
    const t = e.taches.find((t) => t.id === reservation.tache.id);
    if (
      !t ||
      !t.execution ||
      t.execution.debut !== reservation.tache.execution?.debut ||
      t.execution.fin
    )
      return;
    t.execution = {
      debut: t.execution.debut,
      fin: new Date().toISOString(),
      ...(erreur ? { erreur } : { resultat: resultat.slice(0, 100000) }),
    };
    if (erreur) t.etat = 'pause';
    else if (t.repetition === 'unique') t.etat = 'terminee';
    else t.prochaine = prochaineOccurrence(t.prochaine, t.repetition, Date.now());
  });
  return true;
}
