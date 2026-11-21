#!/usr/bin/env bash
# Compile Six pour Android (APK debug) et iOS (simulateur), puis ouvre Xcode.
# Lancer depuis n'importe où :  bash apps/web/scripts/build-mobile.sh
# L'app native charge Six depuis le serveur Next.js : lance ensuite `pnpm --filter @six/web dev` pour la voir.
set -u
WEB="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$WEB/../.." && pwd)"
CAP_VER="8.5.3"
ok()  { printf '\033[32m✔ %s\033[0m\n' "$1"; }
ko()  { printf '\033[31m✘ %s\033[0m\n' "$1"; }
etape() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

etape "0/5 Rangement de l'ancien design"
# L'ancien design (src/, test/, specs Playwright…) casse le contrôle des types de Next.js.
# On le DÉPLACE hors de apps/web, dans _ancien-web-avant-six-app/ à la racine : rien n'est supprimé.
ANCIEN="$ROOT/_ancien-web-avant-six-app"
mkdir -p "$ANCIEN/e2e" "$ANCIEN/scripts" "$ANCIEN/public"
deplace() { [ -e "$WEB/$1" ] && mv "$WEB/$1" "$ANCIEN/$1" && echo "  déplacé : $1"; return 0; }
deplace src; deplace test; deplace playwright.config.ts
deplace e2e/accueil.spec.ts; deplace e2e/repondre.spec.ts; deplace e2e/api-factice.ts
deplace scripts/generate-icons.mjs; deplace public/icons
if [ -d "$WEB/_ancien-avant-six-app" ]; then
  mv "$WEB/_ancien-avant-six-app" "$ANCIEN/configs-originales" && echo "  déplacé : _ancien-avant-six-app"
fi
mv "$WEB/.next" "$ANCIEN/next-cache-$(date +%s)" 2>/dev/null && echo "  ancien cache .next mis de côté"
ok "ancien design rangé dans $ANCIEN"

etape "1/5 Dépendances"
cd "$ROOT" || exit 1
if [ ! -d node_modules/@capacitor/android ]; then
  pnpm add -D -w "@capacitor/android@$CAP_VER" || { ko "installation de @capacitor/android"; exit 1; }
fi
pnpm install || { ko "pnpm install"; exit 1; }
ok "dépendances"

etape "2/5 Build Next.js (vérifie que l'app compile)"
pnpm --filter @six/web build || { ko "build Next.js"; exit 1; }
ok "build web"
cd "$WEB"

etape "3/5 Android"
ANDROID_OK=0
[ -d android ] || npx cap add android
if [ -d android ]; then
  CAP_SERVER_URL="http://10.0.2.2:3000" npx cap sync android
  SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
  if [ ! -d "$SDK" ]; then
    ko "SDK Android introuvable ($SDK). Installe Android Studio, puis relance ce script."
  else
    echo "sdk.dir=$SDK" > android/local.properties
    # Java 21 (exigé par Capacitor 8) : JAVA_HOME, sinon Java installé sur le Mac, Homebrew, ou Android Studio.
    if [ -z "${JAVA_HOME:-}" ]; then
      for J in "$(/usr/libexec/java_home -v 21 2>/dev/null)" \
               "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" \
               "/Applications/Android Studio.app/Contents/jbr/Contents/Home"; do
        if [ -n "$J" ] && [ -x "$J/bin/java" ]; then export JAVA_HOME="$J"; break; fi
      done
    fi
    if [ -z "${JAVA_HOME:-}" ]; then
      ko "Java 21 introuvable. Installe-le (voir le message de Claude), puis relance ce script."
    elif (cd android && ./gradlew assembleDebug); then
      ANDROID_OK=1
      ok "APK : $WEB/android/app/build/outputs/apk/debug/app-debug.apk"
    else
      ko "compilation Android (Gradle) : lis le message ci-dessus"
    fi
  fi
else
  ko "projet Android non créé"
fi

etape "4/5 iOS"
IOS_OK=0
npx cap sync ios
if xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
     -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
     CODE_SIGNING_ALLOWED=NO build -quiet 2>&1 | grep -v -e 'Stale file' -e 'Removed stale' -e '^$'; [ ${PIPESTATUS[0]} -eq 0 ]; then
  IOS_OK=1; ok "build iOS (simulateur)"
else
  ko "compilation iOS : lis le message ci-dessus"
fi

etape "5/5 Ouverture de Xcode"
open ios/App/App.xcodeproj && ok "Xcode ouvert"

echo
[ $ANDROID_OK = 1 ] && ok "Android : OK" || ko "Android : échec"
[ $IOS_OK = 1 ] && ok "iOS : OK" || ko "iOS : échec"
echo "Pour voir l'app : pnpm --filter @six/web dev  (dans un autre terminal), puis ▶ dans Xcode."
