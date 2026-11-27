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

type PontVoix = {
  disponible: () => Promise<boolean>;
  transcrire: (
    audio: Uint8Array,
    langue: string,
  ) => Promise<{ texte: string; langue?: string } | null>;
};

export function ouvrirVSCodeBureau() {
  return typeof window !== 'undefined'
    ? (
        window as Window & {
          sixBureau?: {
            ouvrirVSCode?: (dossier: string) => Promise<'ouvert' | 'annule' | 'indisponible'>;
          };
        }
      ).sixBureau?.ouvrirVSCode
    : undefined;
}

export function pontVoixBureau(): PontVoix | undefined {
  return typeof window !== 'undefined'
    ? (window as Window & { sixBureau?: { voix?: PontVoix } }).sixBureau?.voix
    : undefined;
}

export async function transcrireSurBureau(audio: Blob, langue: string): Promise<Response | null> {
  const pont = pontVoixBureau();
  if (!pont) return null;
  try {
    if (audio.size > 10 * 1024 * 1024) {
      return Response.json({ error: 'Le message vocal dépasse 10 Mo.' }, { status: 413 });
    }
    const r = await pont.transcrire(new Uint8Array(await audio.arrayBuffer()), langue);
    if (r) return Response.json(r);
  } catch {
    /* Le moteur local est indisponible. */
  }
  return Response.json(
    { error: 'Le moteur de transcription local est indisponible.' },
    { status: 503 },
  );
}

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
