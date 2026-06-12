import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "EquiPlan – Veranstaltungsplanung",
  description: "Interner Zeitplan für Pferdesport-Veranstaltungen",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "EquiPlan",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#4f46e5" />
      </head>
      <body className={`${geist.className} min-h-screen bg-indigo-950`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
