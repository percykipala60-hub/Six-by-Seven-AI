# Six by Seven.AI — site

React + TypeScript, Vite, React Router.

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # vérifie les types puis génère dist/
```

## Organisation

```
src/
  content/site.ts       tout le texte de l'accueil, les réseaux sociaux, le pied de page
  content/legal.ts      conditions, confidentialité, mentions légales, utilisation de l'IA
  styles/tokens.css     couleurs (tirées des planches de logo), polices, rayons, thème sombre
  components/brand/     logos Six et Seven.AI en SVG, icônes des réseaux
  components/layout/    navigation, pied de page, gestion du défilement
  components/ui/        boutons, cadre de téléphone, apparition au défilement
  sections/             une section de l'accueil = un composant + son .module.css
  pages/                accueil, pages légales (/legal/:slug), page 404
public/                 favicon, icônes d'application, image d'aperçu des liens (og-image.png), sitemap.xml, robots.txt
theme/chameleon.ts      couleurs du site qui changent avec le temps (ambiances, durées, intensité)
hooks/usePageMeta.ts    titre, description et adresse canonique de chaque page
```

## Mise en ligne (Render)

Le site est publié sur **https://six-by-sevenai.onrender.com** (site statique Render).
Toute la configuration est dans `render.yaml` : à chaque `git push` sur `main`, Render reconstruit et publie le site.

## Déployer ailleurs que sur Render

Le site fonctionne tel quel chez Netlify, Vercel et Cloudflare Pages (fichiers `public/_redirects`, `public/_headers`
et `vercel.json`) : commande de build `npm run build`, dossier publié `dist`.

- L'adresse du site (aperçu des liens partagés, `sitemap.xml`, `robots.txt`) est trouvée toute seule chez ces
  hébergeurs. Avec un nom de domaine à soi, définir la variable `SITE_URL` au moment du build
  (ex. `SITE_URL=https://six.app`) : tout le reste suit.
- Google Analytics (identifiant dans `src/content/site.ts`) fonctionne sur n'importe quelle adresse, sans rien changer.
  On peut seulement mettre à jour l'adresse du flux dans Analytics (Administration > Flux de données).

## Liens de l'application

- Renseigner `webUrl` et l'`url` de chaque plateforme dans `src/content/site.ts` : les boutons « Télécharger » et
  « Version web » pointeront dessus.
- Compléter les mentions légales (forme juridique, siège, responsable de la publication) dans `src/content/legal.ts`.

## Outils de développement

- `/studio` (en développement seulement) : affiche les modèles de téléphone 3D sous un angle donné, ex. `/studio?c=1&y=165&x=4`.

`site.SIX.html` est l'ancienne version statique, gardée comme référence (non publiée).
