# Six sur l'App Store : fiche et préparation

Tout se fait depuis un navigateur (Windows ou Linux) sur [App Store Connect](https://appstoreconnect.apple.com) et le
[portail Apple Developer](https://developer.apple.com/account). Seule la compilation (Archive) demande un Mac avec Xcode.

## 1. Identifiants (portail Apple Developer > Certificates, Identifiers & Profiles)

| Quoi                  | Valeur                  | Capacités à cocher |
| --------------------- | ----------------------- | ------------------ |
| App ID de l'app       | `com.sevenai.six`       | App Groups         |
| App ID de l'extension | `com.sevenai.six.share` | App Groups         |
| App Group             | `group.com.sevenai.six` | à lier aux deux    |

Les raccourcis Siri (App Intents) ne demandent aucune capacité en plus. La connexion Google et Apple passe par
Supabase dans la page web : pas de capacité « Sign in with Apple » à cocher pour l'app.

## 2. Fiche de l'app (App Store Connect > Apps > + Nouvelle app)

- **Nom** (30 caractères max) : `Six : répondre au ton juste`
- **Sous-titre** (30 max) : `Comprendre et bien répondre`
- **Langue principale** : Français
- **Identifiant de lot** : `com.sevenai.six` ; **SKU** : `six-ios`
- **Catégorie** : Productivité ; secondaire : Utilitaires
- **Prix** : Gratuit (aucun achat intégré tant que Six Premium est en veille, voir `docs/premium.md`)
- **URL de confidentialité** : https://sixbysevenai.com/legal/politique-confidentialite
- **URL d'assistance** : https://sixbysevenai.com
- **Copyright** : `2026 Seven.AI`

**Texte promotionnel** (170 max, modifiable sans nouvelle version) :

> Copie un message, dis « Répondre avec Six » à Siri ou appuie sur le bouton Action : Six t'explique ce que
> l'autre veut dire et te propose trois réponses.

**Mots-clés** (100 max, séparés par des virgules, sans espace ; pas de noms d'autres apps, Apple le refuse) :

```
réponse,message,arnaque,ton,sms,écrire,assistant,ia,conversation,texto,poli,congo,chat,ami
```

**Description** :

```
Tu as reçu un message et tu ne sais pas quoi répondre, ni sur quel ton ? Six t'aide, sans jamais parler à ta place.

COMPRENDRE
Colle une conversation, partage-la depuis une autre app ou importe des captures d'écran. Six t'explique ce que l'autre veut vraiment dire, y compris le second degré.

REPÉRER LES ARNAQUES
Faux agent Mobile Money, code PIN demandé, urgence, faux recrutement, lien raccourci : Six te prévient et te propose des réponses sûres.

RÉPONDRE AU TON JUSTE
Trois réponses au choix : amicale, professionnelle, ferme, chaleureuse ou courte. Change le ton ou la longueur sur place, ajuste, copie. C'est toi qui envoies.

TA VIE PRIVÉE D'ABORD
Avant tout envoi, Six masque sur ton téléphone les noms, numéros et adresses, et te montre exactement ce qui part. Tes conversations ne sont jamais conservées sur nos serveurs.

D'UN SEUL GESTE
« Dis Siri, répondre avec Six », le bouton Action, l'écran verrouillé, le Centre de contrôle ou AssistiveTouch : Six s'ouvre avec le message que tu as copié.

AUSSI DANS SIX
Seven AI, l'assistant pour discuter de tout. « Quoi dire ? » pour lancer une conversation. Des jeux : Le jeu du ton juste, Coupe l'arnaque et Kin Rush.

Six est édité par Seven.AI, à Kinshasa.
```

**Classification par âge** : répondre au questionnaire. Seven AI génère du texte libre : déclarer le contenu
généré par l'IA ; prévoir **12+**.

## 3. Confidentialité de l'app (App Store Connect > Confidentialité de l'app)

Pour Apple, une donnée est « collectée » si elle quitte l'appareil et reste accessible plus longtemps que le
temps de répondre à la demande. Le texte des conversations est envoyé masqué à l'IA puis oublié : il n'est **pas**
collecté au sens d'Apple.

| Type de donnée (Apple)                                         | Collectée | Liée à l'identité | Suivi | Finalité                |
| -------------------------------------------------------------- | --------- | ----------------- | ----- | ----------------------- |
| Coordonnées > Adresse e-mail                                   | Oui       | Oui               | Non   | Fonctionnalité de l'app |
| Coordonnées > Nom (prénom)                                     | Oui       | Oui               | Non   | Fonctionnalité de l'app |
| Identifiants > Identifiant utilisateur                         | Oui       | Oui               | Non   | Fonctionnalité de l'app |
| Contenu utilisateur > Autre (mémoire, si copiée sur le compte) | Oui       | Oui               | Non   | Fonctionnalité de l'app |
| Messages, photos, audio                                        | Non       | —                 | —     | —                       |
| Données d'usage, diagnostics, publicité                        | Non       | —                 | —     | —                       |

**Suivi (tracking)** : Non. L'app n'a pas de mesure d'audience (Google Analytics n'est que sur le site).

## 4. Informations pour la vérification (App Review)

- **Compte de démonstration obligatoire** (Six demande un compte à l'ouverture) : créer un compte dédié, par exemple
  `review@…`, et donner son e-mail et son mot de passe **dans App Store Connect seulement**, jamais dans le dépôt.
  La connexion demande aussi un code par e-mail : utiliser une adresse que l'équipe consulte pendant la vérification,
  ou l'expliquer dans les notes.
- **Notes** : « Six aide à répondre à un message. Pour tester : copiez un message, puis dites "Répondre avec Six"
  à Siri ou ouvrez Six et collez-le. La suppression du compte est dans Réglages > Compte. »
- La **suppression du compte dans l'app** est obligatoire : elle existe (Réglages > Compte).
- La connexion Google est proposée, donc la **connexion Apple** aussi : c'est déjà le cas.

## 5. Captures d'écran

- iPhone 6,9 pouces (1320 × 2868) : obligatoire, 3 à 10 captures.
- iPad 13 pouces (2064 × 2752) : obligatoire tant que l'app accepte l'iPad (`TARGETED_DEVICE_FAMILY = "1,2"`).
  Pour publier sur iPhone seulement, passer ce réglage à `1` dans Xcode.

Idées : l'accueil, l'analyse d'une conversation (avec les noms masqués), l'alerte arnaque, les trois réponses,
Seven AI, l'écran « Siri et raccourcis ».

## 6. Compiler et envoyer (sur un Mac)

```bash
cd app && pnpm install
CAP_SERVER_URL=https://app.sixbysevenai.com pnpm --filter @six/web exec cap sync ios
open apps/web/ios/App/App.xcodeproj
```

Dans Xcode : choisir l'équipe (Signing & Capabilities) pour les cibles App et ShareExtension, vérifier que
`SixRaccourcis.swift` compile, monter `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`, puis Product > Archive >
Distribute App > App Store Connect. Tester ensuite avec TestFlight : « Dis Siri, répondre avec Six », le bouton
Action, et un lien `six://seven-ai` dans Safari.

## 7. Plus tard : Six Premium sur iPhone

Un pass numérique utilisé dans l'app doit être vendu par l'achat intégré d'Apple (StoreKit) si on le propose dans
l'app. Le choix actuel : aucun achat ni lien vers le paiement dans l'app iPhone ; un premium acheté sur le site
s'active par le compte (règle 3.1.3(b) des services multiplateformes). À revoir avec le lancement du premium.

## 8. Capture d'écran en un geste

iOS ne laisse pas une app réagir à un double toucher sur son icône, ni capturer l'écran d'une autre app. Six
propose donc l'action **« Analyser une capture avec Six »**, à utiliser dans un raccourci de deux étapes :

1. App Raccourcis > + > « Prendre une capture d'écran » ;
2. puis « Analyser une capture avec Six ».

Ce raccourci se place sur le bouton Action, le double toucher d'AssistiveTouch, Toucher le dos (Accessibilité >
Toucher) ou le Centre de contrôle. Six s'ouvre et lit la capture sur le téléphone (comme une capture importée) ;
rien n'est envoyé avant que l'utilisateur lance l'analyse.

## 9. Compilation automatique (GitHub Actions)

`.github/workflows/ios.yml` compile l'app sur un Mac de GitHub (simulateur, sans signature) à chaque changement
du dossier `ios/`, ou à la demande (Actions > iOS > Run workflow). En cas d'échec, le journal `xcodebuild-log`
est joint à l'exécution. Il ne produit pas d'app à installer : pour TestFlight et l'App Store, il faut signer avec
le compte Apple Developer (Xcode sur un Mac, ou un Mac loué).
