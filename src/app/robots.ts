import type { MetadataRoute } from "next";

const sitio = process.env.NEXT_PUBLIC_SITE_URL || "https://www.fleetnautic.com";

// Solo la landing y el acceso son públicos; lo demás es la aplicación (con sesión)
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: ["/$", "/registro", "/login"], disallow: "/" }, sitemap: `${sitio}/sitemap.xml` };
}
