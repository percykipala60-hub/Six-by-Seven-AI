# Six sur ordinateur, téléphone et web : où mettre quoi

Il n'y a **qu'une seule app** : `apps/web` (Next.js). Les autres versions l'emballent sans la recopier.

| Version    | Dossier            | Ce qu'il contient                                                                               | Comment elle se publie                           |
| ---------- | ------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Web        | `apps/web`         | toute l'app (écrans, IA, Cosinus, Cloud…)                                                       | serveur (`deploy/`, Docker)                      |
| Ordinateur | `apps/bureau`      | seulement la fenêtre Electron : barre du haut, navigateur natif de Cosinus, retour de connexion | à construire à part (pas publiée pour l'instant) |
| iPhone     | `apps/web/ios`     | l'emballage Capacitor + le code Swift propre à l'iPhone (raccourcis, partage)                   | GitHub Actions > TestFlight (à la main)          |
| Android    | `apps/web/android` | l'emballage Capacitor + le code Java propre à Android (bulle, clavier)                          | Android Studio                                   |

## Ajouter une fonctionnalité

- **Pour toutes les versions** : on l'écrit une fois dans `apps/web`. Elle apparaît partout au prochain déploiement
  (l'app de bureau et les apps téléphone chargent la même app).
- **Pour une seule version** : on l'écrit quand même dans `apps/web`, derrière un test de plateforme
  (`lib/plateforme.ts`) :
  ```ts
  if (estBureau()) { … }                       // ordinateur seulement
  if ((await plateforme()) === 'android') { … } // Android seulement
  ```
  Rien n'est recopié dans les autres versions.
- **Besoin du système** (fenêtre, fichiers, notifications natives…) : le code natif va dans le dossier de la
  version concernée (`apps/bureau`, `apps/web/ios`, `apps/web/android`), et l'app web s'en sert par son pont
  (`window.sixBureau` pour l'ordinateur, plugins Capacitor pour les téléphones).

## Lancer la version ordinateur

```powershell
Set-Location C:\Users\omen\Downloads\SIX\app; corepack pnpm --dir apps/web dev
```

```powershell
Set-Location C:\Users\omen\Downloads\SIX\app; corepack pnpm bureau
```
