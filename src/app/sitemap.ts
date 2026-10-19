import type { MetadataRoute } from "next";

const sitio = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.fleetnautic.com").replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${sitio}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${sitio}/registro`, changeFrequency: "yearly", priority: 0.6 },
    { url: `${sitio}/login`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${sitio}/privacidad`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${sitio}/terminos`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
