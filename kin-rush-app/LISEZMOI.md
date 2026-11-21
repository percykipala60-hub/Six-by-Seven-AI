# Kin Rush : intégration dans l'application Six

Kin Rush est un jeu web autonome : un seul fichier HTML, sans serveur ni dépendance. Il fonctionne hors ligne, polices comprises.

```
kin-rush-app/
  index.html      le jeu complet (code, dessins, sons, défis malins)
  fonts.css       déclaration des polices
  fonts/          Bungee et Manrope (licence SIL Open Font License)
  LISEZMOI.md     ce fichier
```

Le jeu s'affiche dans une **WebView** (application mobile) ou une **iframe** (version web). Copie le dossier entier : `index.html` a besoin de `fonts.css` et de `fonts/` à côté de lui.

## Défis malins (devinettes et énigmes)

Le menu « Défis malins » propose 100 devinettes super difficiles (3 choix, +40 FC) et 50 énigmes (4 choix, +80 FC), partagées avec le jeu du ton juste du dépôt SixSeven. Trois défis par jour ; chaque bonne réponse verse les FC directement à la banque, chaque raté affiche l'explication. La progression est gardée dans la même sauvegarde `kinrush-save` (champs `quizDay`, `quizDone`, `quizOk`, `quizSolved`).

## Flutter (`webview_flutter`)

1. Copie le dossier dans `assets/kin-rush/`, puis déclare-le dans `pubspec.yaml` :

```yaml
flutter:
  assets:
    - assets/kin-rush/
    - assets/kin-rush/fonts/
dependencies:
  webview_flutter: ^4.0.0
```

2. Ouvre le jeu dans un écran :

```dart
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

class KinRushPage extends StatefulWidget {
  const KinRushPage({super.key});
  @override
  State<KinRushPage> createState() => _KinRushPageState();
}

class _KinRushPageState extends State<KinRushPage> {
  late final WebViewController controller = WebViewController()
    ..setJavaScriptMode(JavaScriptMode.unrestricted)
    ..setBackgroundColor(const Color(0xFF14161D))
    ..addJavaScriptChannel('KinRushChannel', onMessageReceived: (m) {
      final data = jsonDecode(m.message);
      // data['type'] : "run_start", "run_end" ou "monument"
      if (data['type'] == 'run_end') debugPrint('Score : ${data['score']}');
    })
    ..loadFlutterAsset('assets/kin-rush/index.html');

  @override
  void dispose() {
    controller.runJavaScript('window.kinRush && kinRush.pause()');
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      Scaffold(backgroundColor: const Color(0xFF14161D), body: WebViewWidget(controller: controller));
}
```

## React Native (`react-native-webview`)

- **Android** : copie le dossier dans `android/app/src/main/assets/kin-rush/`.
- **iOS** : ajoute le dossier au projet Xcode (« Create folder references ») sous le nom `kin-rush`.

```jsx
import { Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import RNFS from 'react-native-fs'; // pour trouver le dossier du bundle sur iOS

const source =
  Platform.OS === 'android'
    ? { uri: 'file:///android_asset/kin-rush/index.html' }
    : { uri: 'file://' + RNFS.MainBundlePath + '/kin-rush/index.html' };

export default function KinRush() {
  return (
    <WebView
      source={source}
      originWhitelist={['*']}
      allowFileAccess
      allowingReadAccessToURL={
        Platform.OS === 'ios' ? 'file://' + RNFS.MainBundlePath + '/kin-rush' : undefined
      }
      domStorageEnabled // nécessaire pour la sauvegarde (localStorage)
      mediaPlaybackRequiresUserAction={false}
      style={{ backgroundColor: '#14161d' }}
      onMessage={(e) => {
        const data = JSON.parse(e.nativeEvent.data); // { source: "kin-rush", type, ... }
        if (data.type === 'run_end') console.log('Score', data.score);
      }}
    />
  );
}
```

## Version web de Six

Mets le dossier en ligne (par exemple dans `public/jeu/` d'un site Vite), puis affiche-le dans une iframe :

```html
<iframe
  src="/jeu/index.html"
  title="Kin Rush"
  style="width:100%;height:100dvh;border:0"
  allow="autoplay"
></iframe>
<script>
  window.addEventListener('message', (e) => {
    let data;
    try {
      data = JSON.parse(e.data);
    } catch {
      return;
    }
    if (data.source === 'kin-rush' && data.type === 'run_end') console.log('Score', data.score);
  });
</script>
```

## Messages envoyés par le jeu

Le jeu envoie des messages JSON au canal Flutter `KinRushChannel`, à `ReactNativeWebView` ou à la page parente (iframe) :

| type        | quand                      | champs                                                                                      |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------- |
| `run_start` | début d'une course         | aucun                                                                                       |
| `run_end`   | fin d'une course           | `score`, `distance` (m), `fc`, `record` (nouveau record ?), `best`, `communes`, `monuments` |
| `monument`  | nouveau monument découvert | `id`, `name`                                                                                |

## Commandes que l'app peut appeler

Avec `runJavaScript` (Flutter), `injectJavaScript` (React Native) ou `iframe.contentWindow` (web) :

```js
kinRush.pause(); // met la course en pause (à appeler quand l'écran du jeu est quitté)
kinRush.resume();
kinRush.menu(); // retour au menu du jeu
kinRush.setMuted(true); // coupe le son
kinRush.stats(); // { best, bestDistance, fc, communes, monuments, streak }
```

## Musique

Le bouton 📻 (menu, pause et pendant la course) fait défiler les sources :

| Source                                        | Contenu                                                                                                                      |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Kin Drill**, **Afro Kin**, **Rumba Sebene** | Musiques originales générées en direct par le jeu. Aucun morceau existant n'est copié, donc aucun droit à payer.             |
| **Playlist Six**                              | Les titres que vous ajoutez dans le dossier `musique/` (voir ci-dessous). Cette source n'apparaît que si la playlist existe. |
| **Ma musique**                                | Le bouton 🎧 ouvre les fichiers audio du téléphone : chacun écoute ses propres morceaux. Rien n'est envoyé ni stocké.        |

### Ajouter de vrais titres (Himra, La Fouine, Booba, Aya Nakamura…)

Les morceaux d'artistes sont protégés par le droit d'auteur. Pour les inclure dans l'app, il faut d'abord **une licence** :

- l'autorisation de la maison de disques (droits sur l'enregistrement) ;
- celle de l'éditeur ou de la société d'auteurs, comme la SACEM, pour les droits sur l'œuvre.

Sans cette licence, l'app risque d'être retirée des stores. Le bouton « Ma musique » reste possible dans tous les cas : chaque joueur y écoute ses propres fichiers.

Une fois les droits obtenus :

1. Copiez les fichiers audio (`.mp3`, `.m4a`, `.ogg`) dans `musique/`.
2. Renommez `musique/playlist.exemple.json` en `musique/playlist.json` et remplissez-le :

```json
{
  "default": true,
  "tracks": [
    { "artist": "Nom de l'artiste", "title": "Titre du morceau", "file": "nom-du-fichier.mp3" }
  ]
}
```

`"default": true` fait démarrer le jeu sur cette playlist, tant que le joueur n'a pas choisi une autre source.

La playlist est lue avec `fetch`. Sur Android, si le jeu est chargé depuis les fichiers locaux de l'app, activez l'accès aux fichiers (`setAllowFileAccessFromFileURLs`), ou mettez le jeu en ligne (voir « Version web de Six »). Pour « Ma musique » dans une WebView Android, l'app doit gérer le choix de fichiers : `setOnShowFileSelector` avec `webview_flutter_android`, déjà géré par `react-native-webview`.

Commande ajoutée : `kinRush.nextStation()` passe à la source suivante.

## À savoir

- **Sauvegarde** : la progression (FC, motos, rues, communes, monuments, flamme) est stockée dans le `localStorage` de la WebView. Elle reste sur le téléphone. Si elle doit suivre le compte Six d'un téléphone à l'autre, il faudra l'envoyer au serveur à partir des messages `run_end`.
- **Son** : il démarre après la première touche à l'écran, comme l'exigent les navigateurs.
- **Vibrations** : actives sur Android. iOS ignore l'API de vibration du web.
- **Écran** : le jeu est fait pour le mode portrait et gère les encoches (safe areas).
- **Mise à jour** : pour changer le jeu, remplace `index.html`. Les réglages (vitesse, prix, rues, monuments) sont regroupés en haut du script.
