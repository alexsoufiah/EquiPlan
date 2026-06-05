import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "EquiPlan – Veranstaltungsplanung",
  description: "Interner Zeitplan für Pferdesport-Veranstaltungen",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className={`${geist.className} min-h-screen`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
