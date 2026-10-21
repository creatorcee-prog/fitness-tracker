import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Frames may only show this app (and Vercel's preview toolbar). Custom widgets are
          // sandboxed srcdoc frames; this stops one from navigating itself to another site,
          // which is the one way it could otherwise send data out.
          { key: "Content-Security-Policy", value: "frame-src 'self' https://vercel.live" },
        ],
      },
    ];
  },
};

export default nextConfig;
