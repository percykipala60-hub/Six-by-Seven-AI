import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sevenai.six',
  appName: 'Six',
  webDir: 'out',
  server: {
    url: 'http://localhost:3000',
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: false,
      backgroundColor: '#ffffff',
      androidSplashResourceName: 'splash',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
  },
};

export default config;
