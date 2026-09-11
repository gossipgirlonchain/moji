import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Header } from "@/components/Header";

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
  title: "moji · pick an emoji. pick a stock. launch.",
  description: "A dead-simple launcher. Claim a 1 to 3 emoji combo, pair it to a tokenized stock, launch on Doppler.",
  metadataBase: new URL("https://moji.wtf"),
  openGraph: { title: "moji", description: "pick an emoji. pick a stock. launch.", images: ["/moji.png"] },
};
export const viewport: Viewport = { themeColor: "#DCEEFB", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fredoka.variable} ${nunito.variable}`}>
      <body>
        <Providers>
          <div className="mx-auto w-full max-w-[460px] px-5 pb-28 pt-4 min-h-screen">
            <Header />
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
