#!/usr/bin/env bash
# Prépare un serveur neuf (Ubuntu 24.04, 1 Go de mémoire suffit) pour héberger Six. À lancer une seule fois, en root :
#   bash installer-serveur.sh
# Il installe Docker, ferme tout sauf SSH et le web, active les mises à jour de sécurité automatiques,
# puis crée l'utilisateur « six » qui fera tourner l'application.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Lance ce script en root (sudo bash installer-serveur.sh)." >&2
  exit 1
fi

echo "0/5 Mémoire d'appoint (2 Go sur le disque)"
# Un petit serveur (1 Go de mémoire) a besoin de cette réserve pour construire l'app sans s'arrêter.
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-six-swap.conf
  sysctl -p /etc/sysctl.d/99-six-swap.conf
fi

echo "1/5 Mise à jour du système"
apt-get update -y
apt-get upgrade -y

echo "2/5 Docker (dépôt officiel)"
apt-get install -y ca-certificates curl gnupg git ufw unattended-upgrades
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "3/5 Pare-feu : SSH, HTTP et HTTPS seulement"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "4/5 Mises à jour de sécurité automatiques"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "5/5 Utilisateur « six »"
if ! id six >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" six
fi
usermod -aG docker six

echo
echo "Serveur prêt. Suite : se connecter en « six », cloner le dépôt, remplir deploy/.env,"
echo "puis lancer : cd deploy && docker compose up -d --build   (voir deploy/LISEZMOI.md)"
