import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TestModeBanner } from "@/components/layout/test-mode-banner";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: "Kinetic Ledger — Payment Gateway",
  description: "Enterprise payment-gateway dashboard (TEST MODE)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen bg-[var(--surface-canvas)] font-[var(--font-inter)] antialiased">
        <TestModeBanner />
        {children}
      </body>
    </html>
  );
}
