#!/usr/bin/env bash
# Compile l'APK Android de test de Six et le copie dans SIXAI-main/Six-test.apk.
#   bash apps/web/scripts/build-android-apk.sh
# L'APK charge Six depuis ton Mac par le Wi-Fi (http://<IP du Mac>:3000).
# Autre adresse (site déployé, etc.) : CAP_SERVER_URL=https://... bash apps/web/scripts/build-android-apk.sh
set -u
WEB="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$WEB/../.." && pwd)"
ok() { printf '\033[32m✔ %s\033[0m\n' "$1"; }
ko() { printf '\033[31m✘ %s\033[0m\n' "$1"; }
etape() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

etape "1/5 Java 21"
if [ -z "${JAVA_HOME:-}" ]; then
  for J in "$(/usr/libexec/java_home -v 21 2>/dev/null)" \
           "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" \
           "/Applications/Android Studio.app/Contents/jbr/Contents/Home"; do
    if [ -n "$J" ] && [ -x "$J/bin/java" ]; then export JAVA_HOME="$J"; break; fi
  done
fi
if [ -z "${JAVA_HOME:-}" ] && command -v brew >/dev/null 2>&1; then
  echo "Java 21 absent : installation par Homebrew (ton mot de passe du Mac peut être demandé)…"
  brew install --cask temurin@21 && export JAVA_HOME="$(/usr/libexec/java_home -v 21 2>/dev/null)"
fi
if [ -z "${JAVA_HOME:-}" ] || [ ! -x "$JAVA_HOME/bin/java" ]; then
  ko "Java 21 introuvable. Installe « Temurin 21 » (macOS, aarch64, .pkg) depuis adoptium.net, puis relance."
  exit 1
fi
ok "Java : $JAVA_HOME"

etape "2/5 Kit Android"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
[ -d "$SDK" ] || { ko "SDK Android introuvable ($SDK)"; exit 1; }
export ANDROID_HOME="$SDK"
ok "SDK : $SDK"

etape "3/5 Adresse du serveur"
if [ -z "${CAP_SERVER_URL:-}" ]; then
  IP="$(bash "$WEB/scripts/lan-ip.sh")" || { ko "Pas d'adresse Wi-Fi : connecte le Mac au Wi-Fi."; exit 1; }
  export CAP_SERVER_URL="http://$IP:3000"
fi
ok "L'APK chargera Six depuis : $CAP_SERVER_URL"

etape "4/5 Build web + projet Android"
cd "$ROOT" || exit 1
pnpm install || { ko "pnpm install"; exit 1; }
pnpm --filter @six/web build || { ko "build Next.js"; exit 1; }
cd "$WEB"
[ -d android ] || npx cap add android
npx cap sync android || { ko "cap sync android"; exit 1; }
echo "sdk.dir=$SDK" > android/local.properties

etape "5/5 Compilation Gradle (la 1re fois : plusieurs minutes de téléchargement)"
if (cd android && ./gradlew assembleDebug); then
  APK="$WEB/android/app/build/outputs/apk/debug/app-debug.apk"
  cp "$APK" "$ROOT/Six-test.apk"
  echo "$CAP_SERVER_URL" > "$ROOT/Six-test.apk.serveur.txt"
  ok "APK prêt : $ROOT/Six-test.apk ($(du -h "$ROOT/Six-test.apk" | cut -f1))"
  echo
  echo "Pour tester sur le téléphone (même Wi-Fi que le Mac) :"
  echo "  1) bash apps/web/scripts/serve-lan.sh      (laisse ce terminal ouvert)"
  echo "  2) installe Six-test.apk sur le téléphone et ouvre Six"
else
  ko "compilation Gradle : lis le message ci-dessus"; exit 1
fi
