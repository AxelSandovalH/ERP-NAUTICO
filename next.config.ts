import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La lectura de tickets recibe la foto ya reducida en el navegador (o un PDF de hasta ~3.5 MB)
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
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
