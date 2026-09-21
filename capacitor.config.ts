import type { CapacitorConfig } from "@capacitor/cli";

/**
 * iOS shell for moji. The native app is a WKWebView that loads the hosted site, so the App Router,
 * API routes, Privy and wallets all keep working unchanged and the app never needs a resubmission for
 * a web-only change. `native/www` only holds the offline page the shell shows when the site is unreachable.
 *
 *   npm run ios:sync    copies native/www + the config into ios/
 *   npm run ios:open    opens ios/App/App.xcodeproj in Xcode
 *
 * MOJI_NATIVE_URL points the shell at a preview deployment or `http://<your-mac-ip>:3000` (with
 * MOJI_NATIVE_CLEARTEXT=1) while developing. Default is production.
 */
const url = process.env.MOJI_NATIVE_URL ?? "https://moji.wtf";

const config: CapacitorConfig = {
  appId: "wtf.moji.app",
  appName: "moji",
  webDir: "native/www",
  backgroundColor: "#DCEEFB",
  server: {
    url,
    cleartext: process.env.MOJI_NATIVE_CLEARTEXT === "1",
    // Top-level navigations to any other host open in Safari and never come back, so the X login
    // round trip (moji.wtf -> auth.privy.io -> x.com -> auth.privy.io -> moji.wtf) must stay in the web view.
    allowNavigation: ["auth.privy.io", "*.privy.io", "x.com", "*.x.com", "twitter.com", "*.twitter.com"],
    errorPath: "index.html",
  },
  ios: {
    // The web view runs edge to edge; the site pads with env(safe-area-inset-*) (see Shell.tsx / globals.css).
    contentInset: "never",
    allowsLinkPreview: false,
    preferredContentMode: "mobile",
  },
};

export default config;
