import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const serverUrl = process.env.CAP_SERVER_URL ?? 'https://app.sixbysevenai.com';

/** App native Capacitor de Six. CAP_SERVER_URL peut viser un serveur local en développement. */
const config: CapacitorConfig = {
  appId: 'com.sevenai.six',
  appName: 'Six',
  webDir: 'capacitor-www',
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
  },
  ios: {
    // La page passe sous la barre d'état ; le CSS gère les zones sûres (env(safe-area-inset-*), app/globals.css).
    contentInset: 'never',
    // Pas d'aperçu de lien au toucher long, comme dans une app native.
    allowsLinkPreview: false,
  },
  plugins: {
    // Clavier comme une appli native : la vue se raccourcit au-dessus du clavier (barre du haut fixe,
    // contenu recentré, barre de saisie posée sur le clavier) au lieu que toute la page glisse vers le haut.
    Keyboard: {
      resize: KeyboardResize.Native,
      resizeOnFullScreen: true,
    },
    SplashScreen: {
      launchShowDuration: 3000,
      // true : l'écran de démarrage se ferme seul. Avec false, il faudrait appeler SplashScreen.hide() dans l'app,
      // sinon il resterait affiché pour toujours une fois le plugin @capacitor/splash-screen installé.
      launchAutoHide: true,
      backgroundColor: '#0a0f1c',
      androidSplashResourceName: 'splash',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
  },
};

export default config;
