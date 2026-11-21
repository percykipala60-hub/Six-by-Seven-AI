#!/usr/bin/env bash
# Affiche l'adresse IP du Mac sur le Wi-Fi (ou le câble). Utilisé par build-android-apk.sh et serve-lan.sh.
for itf in en0 en1 en2 en3 en4 en5; do
  ip="$(ipconfig getifaddr "$itf" 2>/dev/null)"
  if [ -n "$ip" ]; then echo "$ip"; exit 0; fi
done
exit 1
