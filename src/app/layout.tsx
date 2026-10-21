import type { Metadata, Viewport } from "next";
import { AppProvider } from "@/components/AppProvider";
import { DebugPanel } from "@/components/DebugPanel";
import { NavBar } from "@/components/NavBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fitness Tracker",
  description: "Fast set logging, automatic PRs and a split that always knows what day it is.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#2f6fed" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap" />
      </head>
      <body>
        <AppProvider>
          {children}
          <NavBar />
          <DebugPanel />
        </AppProvider>
      </body>
    </html>
  );
}
