/**
 * Sur quelle plateforme tourne l'app : une seule app (apps/web) sert partout, emballée différemment.
 * - « bureau » : app de bureau Electron (apps/bureau), qui ajoute window.sixBureau ;
 * - « ios » / « android » : apps téléphone Capacitor (apps/web/ios, apps/web/android) ;
 * - « web » : navigateur ordinaire.
 *
 * Règle (voir docs/plateformes.md) : une fonctionnalité s'écrit une seule fois dans apps/web. Si elle ne doit
 * exister que sur une plateforme, on la garde derrière plateforme() ou estBureau() ; on ne la recopie jamais.
 */
export type Plateforme = 'bureau' | 'ios' | 'android' | 'web';

export function estBureau(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { sixBureau?: unknown }).sixBureau)
  );
}

export async function plateforme(): Promise<Plateforme> {
  if (estBureau()) return 'bureau';
  try {
    const { Capacitor } = await import('@capacitor/core');
    const p = Capacitor.getPlatform();
    return p === 'ios' || p === 'android' ? p : 'web';
  } catch {
    return 'web';
  }
}
