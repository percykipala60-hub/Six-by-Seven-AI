#!/usr/bin/env bash
# Lance Six (version de production) accessible aux téléphones du même Wi-Fi.
#   bash apps/web/scripts/serve-lan.sh
set -u
WEB="$(cd "$(dirname "$0")/.." && pwd)"
IP="$(bash "$WEB/scripts/lan-ip.sh")" || { echo "Pas d'adresse Wi-Fi : connecte le Mac au Wi-Fi."; exit 1; }
cd "$WEB"
[ -f .next/BUILD_ID ] || pnpm build || exit 1
# L'API refuse les appels d'une autre origine : on autorise l'adresse Wi-Fi du Mac (et l'ajoute aux origines déjà réglées).
export ALLOWED_ORIGINS="${ALLOWED_ORIGINS:+$ALLOWED_ORIGINS,}http://$IP:3000"
echo "Six est servi sur http://$IP:3000  (Ctrl+C pour arrêter)"
echo "Si macOS demande d'accepter les connexions entrantes pour « node », clique sur Autoriser."
exec npx next start --hostname 0.0.0.0 --port 3000
