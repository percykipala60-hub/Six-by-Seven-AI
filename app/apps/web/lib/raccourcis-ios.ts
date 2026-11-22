/**
 * Raccourcis de Six sur iPhone (App Intents : Siri, bouton Action, écran verrouillé, Centre de contrôle,
 * AssistiveTouch ; liens six://). Le code natif est dans ios/App/App/SixRaccourcis.swift.
 */

export async function surIPhoneNatif(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
}

/** Ouvre l'écran natif « Siri et raccourcis » (avec le bouton qui ajoute les raccourcis de Six). */
export async function ouvrirRaccourcisIOS(): Promise<void> {
  try {
    const { registerPlugin } = await import('@capacitor/core');
    const share = registerPlugin<{ openShortcuts(): Promise<void> }>('SixShare');
    await share.openShortcuts();
  } catch {
    // Ancienne version de l'app iPhone, sans cet écran : rien à ouvrir.
  }
}

/**
 * Capture d'écran reçue du raccourci iPhone « Analyser une capture avec Six ». Trop lourde pour le stockage de
 * session : elle attend ici, en mémoire, que l'écran Six la prenne (événement « six-shared-capture »).
 */
let captureEnAttente: File | null = null;
export const EVT_CAPTURE = 'six-shared-capture';

export function deposerCapture(base64: string, type: string): boolean {
  if (!base64 || (type !== 'image/png' && type !== 'image/jpeg')) return false;
  try {
    const binaire = atob(base64);
    const octets = new Uint8Array(binaire.length);
    for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
    captureEnAttente = new File([octets], type === 'image/png' ? 'capture.png' : 'capture.jpg', {
      type,
      lastModified: Date.now(),
    });
    window.dispatchEvent(new Event(EVT_CAPTURE));
    return true;
  } catch {
    return false;
  }
}

/** Prend la capture en attente (une seule fois). */
export function prendreCapture(): File | null {
  const f = captureEnAttente;
  captureEnAttente = null;
  return f;
}
