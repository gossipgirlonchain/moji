import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Header } from "@/components/Header";
import { Shell } from "@/components/Shell";
import { NativeBridge } from "@/components/NativeBridge";

const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-fredoka",
  display: "swap",
});
const nunito = Nunito({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-nunito",
  display: "swap",
});

export const metadata: Metadata = {
  title: "moji · pick an emoji. pick a stock or token. launch.",
  description: "A dead-simple launcher. Claim a 1 to 3 emoji combo, pair it to a tokenized stock, launch on Doppler.",
  metadataBase: new URL("https://moji.wtf"),
  openGraph: { title: "moji", description: "pick an emoji. pick a stock or token. launch.", images: ["/moji.png"] },
  applicationName: "moji",
  // Home-screen install on iOS: standalone window, no Safari chrome. The manifest (manifest.ts) is linked automatically.
  appleWebApp: { capable: true, title: "moji", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};
// viewportFit cover lets the page run under the notch and home indicator; Shell pads with env(safe-area-inset-*).
export const viewport: Viewport = { themeColor: "#DCEEFB", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fredoka.variable} ${nunito.variable}`}>
      <body>
        <NativeBridge />
        <Providers>
          <Shell>
            <Header />
            {children}
          </Shell>
        </Providers>
      </body>
    </html>
  );
}
