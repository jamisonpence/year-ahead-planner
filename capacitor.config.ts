import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.mylifos.app",
  appName: "MyLifos",
  webDir: "dist/public",
  // When CAPACITOR_SERVER_URL is set (local dev), load from that URL.
  // Leave unset for production App Store builds — uses bundled assets.
  ...(process.env.CAPACITOR_SERVER_URL
    ? { server: { url: process.env.CAPACITOR_SERVER_URL, cleartext: true } }
    : {}),
  ios: {
    contentInset: "automatic",
    backgroundColor: "#1e2d4d",
    preferredContentMode: "mobile",
    allowNavigation: ["*.railway.app", "*.up.railway.app"],
  },
  plugins: {
    StatusBar: {
      style: "Dark",
      backgroundColor: "#1e2d4d",
    },
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#1e2d4d",
      showSpinner: false,
    },
  },
};

export default config;
