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
