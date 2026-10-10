import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { legalPages } from "./src/content/legal";

// Adresse publique du site, pour l'aperçu des liens partagés, le plan du site (sitemap.xml) et robots.txt.
// Elle est trouvée toute seule chez les hébergeurs courants ; ailleurs, ou avec un nom de domaine à soi,
// il suffit de définir la variable SITE_URL au moment du build (ex. SITE_URL=https://six.app).
function siteUrl() {
  const env = process.env;
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL && `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const url =
    env.SITE_URL || // choisie à la main : toujours prioritaire
    env.URL || // Netlify
    vercel || // Vercel
    env.RENDER_EXTERNAL_URL || // Render
    "https://six-by-sevenai.onrender.com";
  return url.replace(/\/+$/, "");
}

// Pages publiques listées dans le plan du site. Les pages légales sont reprises de content/legal.ts :
// une page ajoutée là apparaît ici sans rien toucher.
const PAGES: { path: string; freq: string; priority: string }[] = [
  { path: "/", freq: "weekly", priority: "1.0" },
  { path: "/telecharger", freq: "weekly", priority: "0.8" },
  ...legalPages.map((p) => ({ path: `/legal/${p.slug}`, freq: "monthly", priority: "0.3" })),
];

function siteFiles(): Plugin {
  const site = siteUrl();
  const today = new Date().toISOString().slice(0, 10);
  return {
    name: "six-site-files",
    // Dans index.html, __SITE_URL__ devient l'adresse du site.
    transformIndexHtml: (html) => html.replaceAll("__SITE_URL__", site),
    generateBundle() {
      const urls = PAGES.map(
        (p) => `  <url><loc>${site}${p.path}</loc><lastmod>${today}</lastmod><changefreq>${p.freq}</changefreq><priority>${p.priority}</priority></url>`,
      ).join("\n");
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      });
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: `# Tout le site peut être exploré. Le studio 3D n'existe qu'en développement.\nUser-agent: *\nAllow: /\nDisallow: /studio\n\nSitemap: ${site}/sitemap.xml\n`,
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), siteFiles()],
  // Port fourni par l'environnement (PORT) quand il existe, sinon 5173 par défaut.
  server: { port: Number(process.env.PORT) || 5173 },
});
