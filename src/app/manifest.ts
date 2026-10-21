import type { MetadataRoute } from "next";
import { resolveConfig } from "@/config/runtime";

/** Served at /manifest.webmanifest; names come from config.brand. */
export default function manifest(): MetadataRoute.Manifest {
  const { brand } = resolveConfig();
  return {
    name: brand.appName,
    short_name: brand.shortName,
    start_url: "/",
    display: "standalone",
    background_color: "#111214",
    theme_color: "#111214",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
