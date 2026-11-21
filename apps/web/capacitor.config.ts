import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAP_SERVER_URL ?? 'https://effulgent-jelly-177a12.netlify.app';

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
