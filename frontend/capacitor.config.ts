import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.omicron.app',
  appName: 'PubIQ',
  webDir: 'dist',
  // Remove the server block before releasing to the Play Store
  // server: {
  //   url: 'http://192.168.1.155:5173',
  //   cleartext: true,
  // },
};

export default config;
