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
const clientHtmlRoutes = [
  "login",
  "claim",
  "book",
  "book-step-2",
  "book-confirm",
  "bookings",
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
      { source: "/app-clienti", destination: "/app-clienti/index.html" },
      { source: "/app-clienti/", destination: "/app-clienti/index.html" },
      ...clientHtmlRoutes.map((route) => ({
        source: `/app-clienti/${route}`,
        destination: `/app-clienti/${route}.html`,
      })),
      ...clientHtmlRoutes.map((route) => ({
        source: `/app-clienti/${route}/`,
        destination: `/app-clienti/${route}.html`,
      })),
    ];
  },
};

export default nextConfig;
