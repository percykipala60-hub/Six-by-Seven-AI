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
public/                 favicon, icône pour l'iPhone, APK Android (Six-test.apk), image d'aperçu des liens (og-image.png)
public/.well-known/     ai-catalog.json : catalogue (vide) des outils pour assistants IA, lu par PageSpeed et les agents IA
theme/chameleon.ts      couleurs du site qui changent avec le temps (ambiances, durées, intensité)
hooks/usePageMeta.ts    titre, description et adresse canonique de chaque page
```

## Mise en ligne

Le site est publié sur **https://sixbysevenai.com**, sur notre propre serveur (DigitalOcean, Francfort),
servi par Caddy à côté de l'application Six (**https://app.sixbysevenai.com**). Configuration du serveur :
dépôt SixSeven, dossier `deploy/` (Caddyfile : site statique, renvoi de toutes les adresses vers `index.html`,
en-têtes de sécurité, cache long pour `/assets` et `/fonts`).

```bash
SITE_URL=https://sixbysevenai.com npm run build   # génère dist/
```

Le contenu de `dist/` est ensuite copié sur le serveur, dans `deploy/site/`.

- Google Analytics (identifiant dans `src/content/site.ts`) fonctionne sur n'importe quelle adresse, sans rien changer.
  On peut seulement mettre à jour l'adresse du flux dans Analytics (Administration > Flux de données).

## Liens de l'application

- Renseigner `webUrl` et l'`url` de chaque plateforme dans `src/content/site.ts` : les boutons « Télécharger » et
  « Version web » pointeront dessus.
- Compléter les mentions légales (forme juridique, siège, responsable de la publication) dans `src/content/legal.ts`.

## Outils de développement

- `/studio` (en développement seulement) : affiche les modèles de téléphone 3D sous un angle donné, ex. `/studio?c=1&y=165&x=4`.

`site.SIX.html` est l'ancienne version statique, gardée comme référence (non publiée).
