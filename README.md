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
public/                 favicon, icônes d'application, image d'aperçu des liens (og-image.png)
```

## Mise en ligne (Render)

Le site est publié sur **https://six-by-sevenai.onrender.com** (site statique Render).
Toute la configuration est dans `render.yaml` : à chaque `git push` sur `main`, Render reconstruit et publie le site.

## Le jour du lancement

- Renseigner `webUrl` et `downloadUrl` dans `src/content/site.ts` : tous les boutons « Télécharger » et « Version web » pointeront dessus.
- Ajouter le lien LinkedIn dans `socials` (même fichier).
- Compléter les passages entre crochets dans `src/content/legal.ts` et faire relire les textes.
- En cas de nom de domaine, remplacer `six-by-sevenai.onrender.com` dans `index.html` (aperçu des liens partagés).

## Outils de développement

- `/studio` (en développement seulement) : affiche les modèles de téléphone 3D sous un angle donné, ex. `/studio?c=1&y=165&x=4`.

`site.SIX.html` est l'ancienne version statique, gardée comme référence (non publiée).
