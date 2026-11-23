#!/bin/sh
# Démarre ZEUS (Mac, Linux, Termux). Exemples : ./demarrer-zeus.sh   ./demarrer-zeus.sh setup   ./demarrer-zeus.sh --lan
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then exec python3 zeus.py "$@"; fi
if command -v python >/dev/null 2>&1; then exec python zeus.py "$@"; fi
echo "Python 3.10+ est nécessaire : https://www.python.org/downloads/  (Termux : pkg install python)"
exit 1
