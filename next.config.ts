import type { NextConfig } from "next";

/**
 * Team App (Expo Web PWA) is exported into public/team/*.html.
 * Clean routes (/team/login) must map to the static .html files.
 */
const teamHtmlRoutes = [
  "login",
  "home",
  "appointments",
  "attendance",
  "stats",
  "_sitemap",
] as const;

const nextConfig: NextConfig = {
  trailingSlash: false,
  async rewrites() {
    return [
      { source: "/team", destination: "/team/index.html" },
      { source: "/team/", destination: "/team/index.html" },
      ...teamHtmlRoutes.map((route) => ({
        source: `/team/${route}`,
        destination: `/team/${route}.html`,
      })),
      ...teamHtmlRoutes.map((route) => ({
        source: `/team/${route}/`,
        destination: `/team/${route}.html`,
      })),
    ];
  },
};

export default nextConfig;
