#!/bin/bash
# Installe ZEUS sur un Raspberry Pi (Raspberry Pi OS 64 bits, Pi 4 ou Pi 5).
#   - ZEUS démarre tout seul à l'allumage et redémarre s'il plante ;
#   - accessible depuis ton téléphone et ton PC sur le même Wi-Fi, en HTTPS (micro et mode Jarvis) ;
#   - sauvegarde des données chaque nuit à 3 h 30 (7 jours gardés).
# Lancement : bash installer-raspberry.sh   (sans sudo : le mot de passe sera demandé quand il faut)
set -euo pipefail

ZEUS_DIR="$(cd "$(dirname "$0")" && pwd)"
ME="$(id -un)"
DATA_DIR="${ZEUS_HOME:-$HOME/zeus-data}"
BACKUP_DIR="$HOME/zeus-sauvegardes"
PORT="${ZEUS_PORT:-7777}"
PY="$(command -v python3 || true)"

say()  { printf '\n\033[1;33m⚡ %s\033[0m\n' "$*"; }
ok()   { printf '   \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '   \033[33m!\033[0m %s\n' "$*"; }

if [ "$(id -u)" -eq 0 ]; then echo "Lance ce script sans sudo : bash installer-raspberry.sh"; exit 1; fi
if [ ! -f "$ZEUS_DIR/zeus.py" ]; then echo "zeus.py introuvable à côté de ce script."; exit 1; fi
case "$ZEUS_DIR$DATA_DIR" in *" "*) echo "Le chemin contient une espace ($ZEUS_DIR). Déplace ZEUS dans un dossier sans espace, par exemple : mv \"$ZEUS_DIR\" ~/ZEUS"; exit 1;; esac

say "1/6  Python"
if [ -z "$PY" ]; then sudo apt-get update && sudo apt-get install -y python3; PY="$(command -v python3)"; fi
if ! "$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'; then
  echo "ZEUS demande Python 3.10 ou plus récent ; installe Raspberry Pi OS « Bookworm » ou plus récent."; exit 1
fi
ok "$("$PY" --version)"

say "2/6  Outil de pilotage du téléphone (adb, facultatif)"
if command -v adb >/dev/null 2>&1; then ok "adb déjà présent"
elif sudo apt-get install -y adb >/dev/null 2>&1 || { sudo apt-get update >/dev/null && sudo apt-get install -y adb >/dev/null; }; then ok "adb installé"
else warn "adb non installé : le pilotage du téléphone attendra (sudo apt-get install adb)"; fi

say "3/6  Clés et dossier des données"
mkdir -p "$DATA_DIR" "$BACKUP_DIR"
if [ ! -f "$ZEUS_DIR/.env" ]; then
  cp "$ZEUS_DIR/.env.example" "$ZEUS_DIR/.env"
  warn "Fichier .env créé : ajoute ta clé Groq et/ou Claude avec : nano \"$ZEUS_DIR/.env\""
else ok ".env déjà présent (non modifié)"; fi
chmod 600 "$ZEUS_DIR/.env"
ok "Données : $DATA_DIR"

say "4/6  Démarrage automatique (service zeus)"
sudo tee /etc/systemd/system/zeus.service >/dev/null <<EOF
[Unit]
Description=ZEUS, assistant IA personnel
After=network-online.target
Wants=network-online.target

[Service]
User=$ME
WorkingDirectory=$ZEUS_DIR
Environment=PYTHONUNBUFFERED=1
ExecStart=$PY $ZEUS_DIR/zeus.py serve --lan --https --no-browser --home $DATA_DIR --port $PORT
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
ok "service écrit"

say "5/6  Sauvegarde chaque nuit"
sudo tee /etc/systemd/system/zeus-sauvegarde.service >/dev/null <<EOF
[Unit]
Description=Sauvegarde des données de ZEUS

[Service]
Type=oneshot
User=$ME
ExecStart=$PY $ZEUS_DIR/sauvegarde-zeus.py $DATA_DIR $BACKUP_DIR 7
EOF
sudo tee /etc/systemd/system/zeus-sauvegarde.timer >/dev/null <<EOF
[Unit]
Description=Sauvegarde de ZEUS chaque nuit

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true

[Install]
WantedBy=timers.target
EOF
ok "sauvegarde programmée à 3 h 30 dans $BACKUP_DIR"

say "6/6  Lancement"
sudo systemctl daemon-reload
sudo systemctl enable --now zeus.service zeus-sauvegarde.timer >/dev/null
for _ in $(seq 1 30); do [ -f "$DATA_DIR/zeus.json" ] && break; sleep 1; done
if ! systemctl is-active --quiet zeus.service; then
  warn "ZEUS ne démarre pas. Regarde pourquoi : journalctl -u zeus -n 40 --no-pager"; exit 1
fi
ok "ZEUS tourne"

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
TOKEN="$("$PY" -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8")).get("web", {}).get("token", ""))' "$DATA_DIR/zeus.json" 2>/dev/null || true)"
echo
echo "   Ouvre ZEUS depuis ton téléphone ou ton PC (même Wi-Fi) :"
echo "     https://$(hostname).local:$PORT/?token=$TOKEN"
[ -n "$IP" ] && echo "     https://$IP:$PORT/?token=$TOKEN"
echo "   Au premier accès, le navigateur affiche un avertissement de certificat : « Paramètres avancés » → « Continuer »."
echo
echo "   Commandes utiles :"
echo "     sudo systemctl restart zeus         redémarrer (après avoir changé .env)"
echo "     journalctl -u zeus -f               voir ce que fait ZEUS"
echo "     sudo systemctl stop zeus            arrêter"
echo "     $PY $ZEUS_DIR/sauvegarde-zeus.py \"$DATA_DIR\"   sauvegarder maintenant"
echo
