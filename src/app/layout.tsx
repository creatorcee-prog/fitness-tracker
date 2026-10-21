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
