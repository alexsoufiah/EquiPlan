import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.soufiah.equiplan",
  appName: "EquiPlan",
  webDir: "out",
  server: {
    // Railway-URL hier eintragen, sobald deployed (z.B. https://equiplan.up.railway.app)
    url: "https://equiplan-production.up.railway.app",  // deine echte URL
    cleartext: false,
  },
  ios: {
    contentInset: "always",
    backgroundColor: "#1e1b4b",
    preferredContentMode: "mobile",
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#1e1b4b",
      showSpinner: false,
      spinnerColor: "#a5b4fc",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#1e1b4b",
      overlaysWebView: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
