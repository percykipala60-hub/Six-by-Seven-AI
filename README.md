# Six by Seven.AI

Un seul dépôt pour tout le projet :

| Dossier | Contenu | En ligne |
|---|---|---|
| [`site/`](site) | Site de présentation (React, Vite) | https://sixbysevenai.com |
| [`app/`](app) | Application Six : app web (Next.js), API, apps Android et iOS (Capacitor), jeux | https://six.sixbysevenai.com |
| [`deploy/`](deploy) | Hébergement sur notre serveur (Docker, Caddy, HTTPS) | serveur DigitalOcean, Francfort |

## Travailler sur une partie

```bash
cd site && npm install && npm run dev        # site : http://localhost:5173
cd app && pnpm install && pnpm dev           # application : http://localhost:3000
```

Chaque dossier a son propre README. Les tests automatiques (`.github/workflows/ci.yml`) vérifient l'application
et la construction du site à chaque envoi sur `main`.

## Mettre en ligne

Voir [`deploy/LISEZMOI.md`](deploy/LISEZMOI.md) : sur le serveur, `git pull` puis `docker compose up -d --build`
dans `deploy/` reconstruit le site et l'application.
