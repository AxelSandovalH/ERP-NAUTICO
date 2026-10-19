import type { MetadataRoute } from "next";

const sitio = process.env.NEXT_PUBLIC_SITE_URL || "https://www.fleetnautic.com";

// La landing, el acceso y las páginas legales son públicos; el resto es la aplicación (con sesión)
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/", "/registro", "/login", "/privacidad", "/terminos", "/opengraph-image", "/twitter-image"], disallow: ["/dashboard", "/configuracion", "/api/", "/auth/"] },
    sitemap: `${sitio}/sitemap.xml`,
  };
}
