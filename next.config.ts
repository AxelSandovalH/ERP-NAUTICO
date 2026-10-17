import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sin cacheComponents a propósito: toda la app depende de la sesión y del
  // tenant, así que no hay contenido estático que prerenderizar.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
