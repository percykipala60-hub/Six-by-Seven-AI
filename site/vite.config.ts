import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { legalPages } from "./src/content/legal";
import { app, brand, downloadPage, faq, hero, notFound, privacy, relations } from "./src/content/site";

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

// --- Une vraie page HTML par adresse, pour les moteurs de recherche ---
// Le site s'affiche avec JavaScript : sans ça, chaque adresse recevait le même index.html (même titre, même
// description, adresse canonique = l'accueil) et une page vide. Google s'en sortait en lisant le JavaScript,
// mais Bing (le moteur d'Edge), Applebot (Safari) et les aperçus de liens lisent surtout le HTML reçu.
// Après le build, on écrit donc dist/<adresse>/index.html avec ses propres balises et son texte lisible.
// React remplace ce texte dès qu'il démarre (createRoot) : le visiteur voit la page habituelle.

const echapper = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type PageStatique = { path: string; title: string; description: string; corps: string; noindex?: boolean };

function pagesStatiques(): PageStatique[] {
  const p = (t: string) => `<p>${echapper(t)}</p>`;
  const liste = (items: string[]) => `<ul>${items.map((i) => `<li>${echapper(i)}</li>`).join("")}</ul>`;
  const lien = (href: string, label: string) => `<a href="${echapper(href)}">${echapper(label)}</a>`;
  const nav = `<nav>${[
    lien("/", "Accueil"),
    lien(app.downloadPage, downloadPage.title),
    ...legalPages.map((l) => lien(`/legal/${l.slug}`, l.title)),
  ].join(" · ")}</nav>`;
  const accueil: PageStatique = {
    path: "/",
    title: `${hero.title} · ${brand.product} by ${brand.company}`, // comme usePageMeta
    description:
      "Colle une discussion. Six comprend la situation, repère les arnaques et te propose trois réponses dans ton ton. Tu choisis, tu ajustes, tu envoies.",
    corps: [
      `<h1>${echapper(hero.title)}</h1>`,
      p(hero.lead),
      p(hero.meta),
      `<h2>${echapper(relations.title)}</h2>`,
      p(relations.text),
      liste(relations.points.map((x) => `${x.title} : ${x.text}`)),
      `<h2>${echapper(privacy.title)}</h2>`,
      p(privacy.text),
      liste(privacy.points.map((x) => `${x.title} : ${x.text}`)),
      `<h2>${echapper(faq.title)}</h2>`,
      ...faq.items.map((x) => `<h3>${echapper(x.q)}</h3>${p(x.a)}`),
      `<p>${lien(app.downloadPage, app.download.label)} · ${lien(app.webUrl, app.web.label)}</p>`,
    ].join("\n"),
  };
  const telecharger: PageStatique = {
    path: app.downloadPage,
    title: `${downloadPage.title} · Six by Seven.AI`,
    description: downloadPage.intro,
    corps: [
      `<h1>${echapper(downloadPage.title)}</h1>`,
      p(downloadPage.intro),
      liste(app.platforms.map((x) => `${x.name} (${x.system})`)),
      p(app.web.text),
    ].join("\n"),
  };
  const legales: PageStatique[] = legalPages.map((l) => ({
    path: `/legal/${l.slug}`,
    title: `${l.title} · Six by Seven.AI`,
    description: l.summary,
    corps: [
      `<h1>${echapper(l.title)}</h1>`,
      p(l.summary),
      ...l.sections.map(
        (s) =>
          `<h2>${echapper(s.title)}</h2>` +
          s.body.map((b) => (typeof b === "string" ? p(b) : liste(b.list))).join(""),
      ),
    ].join("\n"),
  }));
  const introuvable: PageStatique = {
    path: "/404",
    title: `${notFound.title} · Six by Seven.AI`,
    description: notFound.text,
    noindex: true,
    corps: [`<h1>${echapper(notFound.title)}</h1>`, p(notFound.text)].join("\n"),
  };
  return [accueil, telecharger, ...legales, introuvable].map((x) => ({ ...x, corps: `${x.corps}\n${nav}` }));
}

function pagesHtml(): Plugin {
  const site = siteUrl();
  let outDir = "dist";
  return {
    name: "six-pages-html",
    apply: "build",
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      const modele = readFileSync(join(outDir, "index.html"), "utf8");
      const remplacer = (html: string, avant: RegExp, apres: string) => {
        if (!avant.test(html)) throw new Error(`pages HTML : balise introuvable (${avant})`);
        return html.replace(avant, apres);
      };
      for (const page of pagesStatiques()) {
        const url = `${site}${page.path === "/" ? "/" : page.path}`;
        let html = modele;
        html = remplacer(html, /<title>[^<]*<\/title>/, `<title>${echapper(page.title)}</title>`);
        html = remplacer(html, /<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${echapper(page.description)}" />`);
        html = remplacer(html, /<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${echapper(page.title)}" />`);
        html = remplacer(html, /<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${echapper(page.description)}" />`);
        html = remplacer(html, /<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`);
        html = page.noindex
          ? remplacer(html, /\s*<link rel="canonical" href="[^"]*" \/>/, `\n    <meta name="robots" content="noindex" />`)
          : remplacer(html, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`);
        html = remplacer(html, /<div id="root"><\/div>/, `<div id="root">\n${page.corps}\n</div>`);
        const fichier =
          page.path === "/" ? join(outDir, "index.html") : page.path === "/404" ? join(outDir, "404.html") : join(outDir, page.path, "index.html");
        mkdirSync(dirname(fichier), { recursive: true });
        writeFileSync(fichier, html);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), siteFiles(), pagesHtml()],
  build: {
    rolldownOptions: {
      output: {
        // Sans ces groupes, React et les icônes, partagés par la page et la 3D, étaient rangés dans le même
        // fichier que three.js : chaque visiteur téléchargeait et exécutait toute la 3D (près de 700 Ko) dès
        // l'ouverture, même sur un téléphone qui ne l'affiche pas. La 3D ne se charge plus que si elle sert.
        codeSplitting: {
          groups: [
            { name: "three", test: /node_modules[\\/](three|three-bvh-csg|three-mesh-bvh)[\\/]/ },
            { name: "vendor", test: /node_modules[\\/](react|react-dom|react-router|scheduler|lucide-react)[\\/]/ },
          ],
        },
      },
    },
  },
  // Port fourni par l'environnement (PORT) quand il existe, sinon 5173 par défaut.
  server: { port: Number(process.env.PORT) || 5173 },
});
