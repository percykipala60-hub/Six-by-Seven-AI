# Mettre Six en ligne sur votre domaine

Six tourne sur **un serveur à vous** (VPS), derrière **votre nom de domaine**. Netlify et Render ne sont plus utilisés.

```
Téléphone / navigateur ──HTTPS──> Cloudflare (DNS) ──> votre serveur : Caddy (HTTPS) ──> Six (Next.js, Docker)
                                                                                    └──> Supabase (comptes, Paris)
                                                                                    └──> fournisseur d'IA
```

- `sixbysevenai.com` : le site de présentation (dossier `site/`) ; `www` y renvoie.
- `app.sixbysevenai.com` : l'application, son API et la page `/rapide` (bulle et clavier Android) — dossier `app/`.

## 1. Le nom de domaine

1. Créer un compte Cloudflare (gratuit) et y acheter le domaine (Domain Registration).
2. Rien d'autre à faire côté DNS pour l'instant : on y revient à l'étape 3.

## 2. Le serveur

1. Créer un serveur chez DigitalOcean (Droplet) : **Ubuntu 24.04**, à Francfort (près de Supabase, à Paris), offre Regular à 1 Go (le script ajoute 2 Go de mémoire d'appoint).
2. Ajouter votre clé SSH à la création (pas de mot de passe root).
3. Se connecter en root, envoyer puis lancer le script :
   ```bash
   bash installer-serveur.sh
   ```

## 3. Relier le domaine au serveur (Cloudflare > DNS)

Créer trois enregistrements **A** vers l'adresse IP du serveur : `@`, `www`, `app`.
Mettre le nuage en **gris (DNS only)** au début : Caddy obtient ainsi ses certificats HTTPS. On pourra l'activer ensuite.

## 4. Lancer Six

En tant qu'utilisateur `six` sur le serveur :

```bash
git clone https://github.com/percykipala60-hub/Six-by-Seven-AI.git six && cd six/deploy
cp .env.example .env && nano .env      # DOMAINE, clés d'IA, Supabase
docker compose up -d --build
```

Ouvrir `https://sixbysevenai.com` (le site) et `https://app.sixbysevenai.com` (Six) : cadenas HTTPS sur les deux.

## 5. Mettre à jour

```bash
cd ~/six && git pull && cd deploy && docker compose up -d --build
```

Revenir à la version précédente : `git checkout <version>` puis la même commande.

## 6. Après la mise en ligne

- **Supabase** > Authentication > URL Configuration : Site URL `https://app.votredomaine`, et ajouter `https://app.votredomaine/**` aux Redirect URLs.
- **Google et Apple** (connexion) : ajouter le nouveau domaine dans les adresses de redirection autorisées.
- **App Android** : `CAP_SERVER_URL=https://app.votredomaine` lors de `npx cap sync android`, puis recompiler.
- **Pages juridiques** : indiquer l'hébergeur choisi et l'adresse de l'éditeur.

## Sécurité

- `deploy/.env` contient les secrets : il reste sur le serveur, jamais dans Git.
- Le pare-feu n'ouvre que SSH, HTTP et HTTPS ; les mises à jour de sécurité s'installent seules.
- Les journaux de Caddy ne gardent ni les paramètres d'adresse ni les en-têtes ; l'app ne journalise jamais le contenu des messages.
