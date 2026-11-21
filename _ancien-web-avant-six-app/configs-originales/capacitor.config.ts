import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sevenai.six',
  appName: 'Six',
  webDir: '../out',
  server: {
    url: 'http://localhost:3000',
    cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: false,
      backgroundColor: '#0a0f1c',
      androidSplashResourceName: 'splash',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false
    }
  }
};

export default config;

/**
 * Mode « build finale » : dé-commenter pour produire une version native
 * autonome (pas de dépendance au dev server local).
 *
 * Pour l’activer :
 *   1) pnpm --filter @six/web build
 *   2) dé-commenter webDir/build et re-commenter server,
 *   3) capacitorSync + build iOS/Android.
 */
// const config: CapacitorConfig = {
//   appId: 'com.sevenai.six',
//   appName: 'Six',
//   webDir: '../.next',
//   // server: { url: 'http://localhost:3000', cleartext: true },
//   plugins: {
//     SplashScreen: {
//       launchShowDuration: 3000,
//       launchAutoHide: false,
//       backgroundColor: '#0a0f1c',
//       androidSplashResourceName: 'splash',
//       showSpinner: false,
//       splashFullScreen: true,
//       splashImmersive: false
//     }
//   }
// };
