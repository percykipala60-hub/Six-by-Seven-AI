> **Monorepo SIXAI** : `apps/web` contient l'interface Six et ses trois jeux, Kin Rush (`/jeu`), Le jeu du ton juste (`/ton-juste`) et Coupe l'arnaque (`/coupe-arnaque`). Les clients mobiles sont des applications natives Capacitor pour Android et iOS ; Six n'est plus distribuée comme PWA.
> Dans le monorepo, utilise `pnpm install` et `pnpm --filter @six/web …`.

# Six — application mobile (Seven.AI)

Interface Next.js (App Router) + TypeScript, empaquetée dans les projets Android (Kotlin/Gradle) et iOS (Swift/Xcode) avec Capacitor. L'app utilise des fonctions natives et est préparée pour les formats de distribution Play Store et App Store.

Le jeu autonome Coupe l'arnaque est intégré depuis `public/coupe-arnaque/` et accessible dans le menu Jeux. Il comprend 24 enquêtes, trois modes de coupe, les missions, les étoiles et les sauvegardes locales.

## Lancer

1. `pnpm install`.
2. Copier `.env.example` vers `.env.local` et remplir `ANTHROPIC_API_KEY` (sans clé, l'app affiche le mode démonstration).
3. `pnpm --filter @six/web dev` puis ouvrir http://localhost:3000 pour le développement Web.
4. Tests : `pnpm --filter @six/web test`, `pnpm --filter @six/web typecheck` et `pnpm --filter @six/web build`.
5. La configuration native pointe par défaut vers `https://effulgent-jelly-177a12.netlify.app`. Pour lancer l'app native en développement, démarre Next.js puis synchronise Capacitor avec une URL accessible depuis l'appareil, par exemple `CAP_SERVER_URL=http://10.0.2.2:3000 pnpm --filter @six/web exec cap sync android` pour l'émulateur Android. Sur un téléphone, utilise l'adresse IP LAN du poste.
6. Pour distribuer sur Play Store, configure les secrets de signature Android dans l'environnement, puis lance `pnpm --filter @six/web android:store`. Dans PowerShell, définis d'abord `CAP_SERVER_URL` (origine HTTPS), `ANDROID_KEYSTORE_FILE` (chemin absolu), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` et `ANDROID_KEY_PASSWORD` avec `$env:NOM='valeur'`. L'AAB signé est généré sous `apps/web/android/app/build/outputs/bundle/release/app-release.aab`.
7. Pour App Store, sur macOS avec Xcode et le compte Apple Developer, lance `CAP_SERVER_URL=https://effulgent-jelly-177a12.netlify.app pnpm --filter @six/web exec cap sync ios`, ouvre `apps/web/ios/App/App.xcodeproj`, configure la signature de l'équipe, puis Archive > Distribute App.

Les applications sont natives au niveau du conteneur Capacitor, des plugins Swift/Kotlin et des icônes système. L'interface Next.js et les routes IA restent hébergées sur HTTPS : le serveur fourni par `CAP_SERVER_URL` doit être en ligne pour utiliser Six. Ne laisse jamais une URL `localhost` dans une archive de distribution.

## Parcours (écrans)

Interface « Six 3 » (2026-10-10, inspirée de Claude Mobile et Gemini) : accueil avec salutation au centre et barre de saisie en bas (« + » pour coller, importer des captures ou un export), menu latéral, bouton rond de profil (mode invité), Réglages en liste groupée. Jeux : Kin Rush (`/jeu`), Jeu du ton juste (`/ton-juste`) et Coupe l'arnaque (`/coupe-arnaque`). Système visuel : `DESIGN.md` ; produit : `PRODUCT.md`.

Parcours en 4 étapes : Coller (texte, fichier `.txt` ou `.zip`, captures, partage depuis WhatsApp) → Protéger (données masquées) → Comprendre (lecture, second degré, alerte arnaque, objectif) → Répondre (trois réponses, ton et longueur changés sur place, ajustement, copie).
Autres pages : Sujets (« Quoi dire ? »), Réglages (apparence, mon style d'écriture), Confidentialité, Conditions d'utilisation, Mentions légales.

## Import depuis WhatsApp

WhatsApp n'offre aucune interface permettant à Six de lire directement les discussions. L'utilisateur choisit lui-même la conversation, utilise Plus > Exporter la discussion > Sans médias, puis importe le fichier `.txt` dans Six. Les captures d'écran peuvent être choisies depuis la galerie. Six ne surveille pas le compte WhatsApp et n'envoie rien avant une action explicite de l'utilisateur.

## Notifications des autres apps (Android natif)

Dans Réglages > Notifications des apps, l'utilisateur choisit les apps à écouter. L'APK demande ensuite séparément l'accès Android aux notifications et, si la bulle Messenger-like est souhaitée, l'autorisation d'affichage par-dessus les autres apps. Le service natif ne lit que les notifications publiées par Android pour les apps cochées ; il ne se connecte pas aux comptes WhatsApp/Instagram et ne peut pas lire une conversation directement. Les apps doivent donc publier des aperçus de notification.

Les extraits restent dans le stockage privé local de l'APK (25 notifications maximum), ne sont pas synchronisés avec Supabase et ne partent pas vers l'IA à la réception ni à l'importation. L'utilisateur doit ensuite lancer l'analyse dans Six. Android ou l'app source peut masquer le contenu des aperçus. Ils peuvent être effacés dans Réglages > Notifications des apps. Les préférences de l'appareil et le contenu sont exclus des sauvegardes Android. L'accès aux notifications et la bulle peuvent être révoqués dans les réglages système.

Sur iPhone, iOS ne permet pas de lire les notifications des autres apps. L'utilisateur peut partager manuellement du texte ou un lien via la feuille de partage iOS vers l'extension Six ; il est stocké localement dans le groupe d'apps, puis chargé comme brouillon au retour dans Six. Aucune analyse n'est lancée automatiquement.

## Import

- **Masquage** (`lib/anonymize.ts`, prénoms dans `lib/prenoms.ts`) : e-mails, liens, pseudos @, codes PIN/OTP, numéros de compte, téléphones, adresses, noms des interlocuteurs, prénoms courants (même en minuscules), noms après un titre ou une salutation, noms complets en milieu de phrase. Détection automatique, donc imparfaite : l'écran « Données protégées » le dit et permet d'ajouter un nom.
- **Export WhatsApp `.txt` ou `.zip`** : formats Android et iPhone, derniers messages gardés dans la limite de 2000 caractères.
- **Captures d'écran** (jusqu'à 4) : lues sur le téléphone (OCR Tesseract.js, français), jamais envoyées. Le texte lu apparaît avec « Moi » (bulles à droite) et « Autre » (bulles à gauche), à relire et corriger. Les fichiers OCR (~4 Mo utiles) sont copiés dans `public/ocr` par `scripts/copy-ocr.mjs` (lancé par `npm run dev` et `npm run build`, dossier ignoré par Git).

## IA et clés d'API

- Deux fournisseurs : Claude (Anthropic) et ChatGPT (OpenAI), dans `lib/ai.ts`. `AI_PROVIDERS=claude,openai` fixe l'ordre : si le premier échoue, le suivant prend le relais. Sans aucune clé, un faux modèle répond (bandeau « Mode démonstration »).
- Les clés sont celles de Seven.AI, placées dans `.env.local` (ou dans les variables d'environnement de l'hébergeur). Elles ne vont jamais dans le code, le navigateur ni les logs. L'utilisateur final ne saisit jamais de clé.
- Enregistrer une clé sans la montrer (Windows) : `powershell -ExecutionPolicy Bypass -File scripts/set-key.ps1 claude` (ou `openai`). Alternative : `node scripts/set-key.mjs claude`. Ne pas passer par `npm run` pour cette étape : certaines versions de npm ne transmettent pas le clavier au script.
- `npm run check-ai` teste chaque clé et chaque nom de modèle avec une toute petite demande, sans afficher les clés.
- Claude : `CLAUDE_MODEL_ANALYSE` (défaut `claude-haiku-4-5-20251001`) pour l'analyse, les retouches et les sujets ; `CLAUDE_MODEL_REDACTION` (défaut `claude-sonnet-5-5`) pour les 3 réponses.
- ChatGPT : pas de modèle par défaut. Renseigner `OPENAI_MODEL_ANALYSE` et `OPENAI_MODEL_REDACTION` (ou `OPENAI_MODEL`) après lecture de la doc OpenAI.
- Coût maîtrisé par : limite de 2000 caractères, 20 requêtes/minute/IP, petit modèle pour l'analyse. Fixer aussi une limite de dépense dans la console de chaque fournisseur.
- Appels Claude par le SDK officiel `@anthropic-ai/sdk` (`lib/ai.ts`). Pour Sonnet 5.5, le repli serveur en cas de refus est activé (`fallbacks: "default"`, bêta `server-side-fallback-2026-07-01`).
- **Mise en cache du prompt** : `cache_control` est posé sur le bloc système, pas sur la conversation (qui change à chaque fois et ne serait jamais relue). Le prompt de rédaction (`REDACTION_SYSTEM` dans `lib/prompt.ts`) est identique pour toutes les requêtes et fait environ 1270 tokens, au-dessus du minimum de 512 de Sonnet 5.5 : il est relu depuis le cache pendant 5 minutes, à environ 0,1x du prix. Ne jamais y insérer de contenu variable (date, nom, ton, objectif) : tout ce qui varie va dans le message utilisateur. Les prompts d'analyse (Haiku 4.5) sont sous le minimum de 4096 tokens : le marqueur y est ignoré sans frais.
- `npm run check-cache` (payant, environ 1 à 2 centimes) vérifie avec de vrais appels que le prompt dépasse le minimum et que la seconde demande relit le cache. Le serveur journalise pour chaque appel les nombres de tokens (entrée, cache écrit, cache lu, sortie), jamais le contenu. À relancer après toute modification d'un prompt.
- L'alerte arnaque combine des règles locales (`lib/scam.ts`) et le score donné par l'IA : le plus élevé gagne.
- Le style d'écriture de l'utilisateur (Réglages) reste dans son navigateur et n'est envoyé que comme consigne de rédaction.

## Comptes et données synchronisées

Le compte reste facultatif. Pour activer la connexion et synchroniser la mémoire, configure `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, puis exécute `apps/web/supabase/migrations/20261017_memoires.sql` dans le SQL Editor Supabase. La migration active la RLS : chaque compte ne peut lire et modifier que sa propre ligne. Sans projet et variables Supabase, l’app reste utilisable en local.

L’écran Compte suit le modèle de Claude, Gemini et Snap :

- **Google et Apple** : boutons « Continuer avec Google / Apple » (`signInWithOAuth`). Ils ne fonctionnent qu’une fois les fournisseurs activés dans Supabase (Authentication → Providers) avec les identifiants OAuth du projet. Sinon, l’app affiche un message clair et laisse la connexion par e-mail disponible.
- **E-mail et mot de passe** : inscription avec prénom, mot de passe de 8 caractères minimum, indicateur de force et confirmation ; connexion classique ; mot de passe oublié ; changement de mot de passe depuis le compte connecté.
- **Code à usage unique** : connexion sans mot de passe par code reçu par e-mail.
- **Consentement** : l’inscription exige l’acceptation des conditions et de la politique de confidentialité. La date d’acceptation est conservée dans les métadonnées du compte Supabase, avec le prénom.
- **Confirmation** : si la confirmation d’e-mail est activée dans Supabase, l’écran propose de renvoyer l’e-mail de confirmation.

Dans Supabase → Authentication → URL Configuration, ajoute l’origine de l’application (production et `http://localhost:3000` en développement) aux Redirect URLs, sinon Google, Apple et les liens de réinitialisation reviennent sur une adresse refusée.

## Thèmes et icônes natives

Le choix de couleur est conservé sur l'appareil et colore toute l'interface. Dans les applications Android et iOS, l'icône du lanceur suit aussi le thème via les variantes natives précompilées. Après avoir modifié `lib/theme-colors.json`, régénère les assets avec `.\scripts\generate-theme-icons.ps1` depuis `apps/web`.

## Protection de l'API et du budget

- Les routes `/api/*` refusent les appels venant d'un autre site (en-tête `Origin` ou `Sec-Fetch-Site`) et les requêtes sans aucun des deux (403). `ALLOWED_ORIGINS` ajoute d'autres domaines du site.
- Limite de 20 requêtes par minute et par adresse, atomique et partagée via Upstash Redis REST (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`). L'adresse IP est hachée avec `RATE_LIMIT_HASH_SECRET` avant d'être stockée. `TRUST_PROXY` doit indiquer le nombre de relais de confiance qui ajoutent `X-Forwarded-For` (souvent 1 sur Netlify) ; sans configuration du magasin ou de la chaîne proxy, l'API échoue en 503 en production au lieu de désactiver silencieusement la limite. En développement, un compteur mémoire local reste disponible.
- Plafond quotidien d'appels à l'IA par serveur (`AI_DAILY_LIMIT`, 1000 par défaut).
- Le plafond quotidien `AI_DAILY_LIMIT` reste en mémoire par instance et doit être remplacé par un compteur partagé avant d'être considéré comme une limite de budget fiable. Un script peut aussi imiter un navigateur : garde une limite de dépense côté fournisseur.

## Où est quoi

- `lib/anonymize.ts` masquage ; `lib/whatsapp.ts` exports WhatsApp ; `lib/zip.ts` lecture `.zip` ; `lib/ocr.ts` + `lib/ocr-layout.ts` captures ; `lib/scam.ts` règles d'arnaque ; `lib/prompt.ts` prompts et validation JSON ; `lib/ai.ts` fournisseurs Claude et ChatGPT ; `lib/providers.ts` étapes IA et faux modèle ; `lib/style.ts` style local.
- `app/api/{analyze,replies,adjust,topics}` : routes serveur (2000 caractères max, 20 requêtes/minute/IP, aucun contenu journalisé).
- `android/` et `ios/` : projets natifs Capacitor, plugins et icônes du lanceur.

## État

Vérifié : typage, tests Web/API, build Web et compilation APK Android debug. Les anciennes inscriptions PWA et leurs caches sont retirés au lancement.
NON vérifié : archive iOS/App Store (nécessite macOS/Xcode et signature Apple), AAB signé Play Store (nécessite un keystore) et essais sur de vrais appareils.
Pas encore fait : quotas de compte, modèles locaux (Ollama), fiches contacts (décision en réunion) et compléter les passages [À compléter] des pages légales.
