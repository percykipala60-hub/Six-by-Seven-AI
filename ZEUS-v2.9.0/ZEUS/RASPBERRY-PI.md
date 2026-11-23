# ZEUS sur Raspberry Pi 4 : allumé jour et nuit

Le Pi fait tourner ZEUS 24 h sur 24 pour quelques watts : rappels, brief du matin, tâches planifiées,
Telegram/WhatsApp/SMS/e-mail, surveillance du téléphone. Le cerveau reste en ligne (Groq, Claude) : le Pi l'appelle,
il ne réfléchit pas lui-même. Compte **45 minutes** la première fois.

**Il te faut** : le Pi 4, sa carte mémoire (32 Go suffit ; idéalement marquée A1 ou A2), l'alimentation USB-C
officielle (5,1 V / 3 A), un lecteur de carte pour ton PC, ton Wi-Fi. Pas besoin d'écran ni de clavier pour le Pi.

---

## Étape 1 : préparer la carte mémoire (sur ton PC, 15 min)

1. Sur ton PC, télécharge et installe **Raspberry Pi Imager** depuis raspberrypi.com/software.
2. Mets la carte mémoire dans le lecteur du PC. ⚠️ Tout ce qu'elle contient sera effacé.
3. Dans Imager :
   - **Modèle** : Raspberry Pi 4 ;
   - **Système** : *Raspberry Pi OS (other)* → **Raspberry Pi OS Lite (64-bit)** (sans bureau : plus léger) ;
   - **Stockage** : ta carte mémoire.
4. Quand Imager propose de **personnaliser** le système, remplis :
   - nom de l'appareil (hostname) : `zeus` ;
   - nom d'utilisateur : `damien` et un mot de passe **que tu notes** ;
   - Wi-Fi : le nom et le mot de passe de ton Wi-Fi, et ton pays ;
   - fuseau horaire : le tien (par exemple Africa/Kinshasa ou Europe/Amsterdam) ;
   - onglet **Services** : coche **Activer SSH** avec authentification par mot de passe.
5. Écris la carte. Quand c'est fini, retire-la.

**Tu dois voir** : « Écriture réussie ».

## Étape 2 : allumer le Pi (2 min)

1. Mets la carte dans le Pi (fente sous la carte, côté opposé aux ports USB).
2. Branche l'alimentation. Attends **3 minutes** : au premier démarrage, il se configure et rejoint le Wi-Fi.

## Étape 3 : se connecter au Pi depuis ton PC (2 min)

Dans **PowerShell** sur ton PC :

```
ssh damien@zeus.local
```

- La première fois, il demande `Are you sure you want to continue connecting?` : tape `yes`, puis Entrée.
- Tape ton mot de passe (rien ne s'affiche quand tu tapes, c'est normal), puis Entrée.

**Tu dois voir** une ligne qui finit par `damien@zeus:~ $`. Tu es maintenant *dans* le Pi.
Pour revenir à ton PC : `exit`.

**Si `zeus.local` n'est pas trouvé** : ouvre la page de ta box internet (souvent 192.168.1.1), cherche l'appareil
« zeus » et son adresse (par exemple 192.168.1.42), puis `ssh damien@192.168.1.42`.

## Étape 4 : copier ZEUS sur le Pi (2 min)

Ouvre un **deuxième** PowerShell sur ton PC (sans fermer le premier) et colle :

```
scp -r "C:\Users\Damien\Documents\cours B1\PROJET PERSO\ZEUS-v2.1\ZEUS" damien@zeus.local:~/
```

Mot de passe du Pi, puis attends la fin de la copie (quelques secondes).

## Étape 5 : installer ZEUS sur le Pi (5 min)

Dans le **premier** PowerShell (celui qui est dans le Pi, `damien@zeus:~ $`) :

```
cd ~/ZEUS
sed -i 's/\r$//' installer-raspberry.sh
bash installer-raspberry.sh
```

(La 2e ligne retire d'éventuelles fins de ligne Windows qui empêcheraient le script de tourner.)

Le script demande le mot de passe du Pi une fois. Il installe l'outil du téléphone (adb), fait démarrer ZEUS
tout seul à l'allumage, programme une sauvegarde chaque nuit à 3 h 30, puis lance ZEUS.

**Tu dois voir** 6 étapes avec des ✓, puis une adresse comme `https://zeus.local:7777/?token=…`.
**Note cette adresse** (avec le jeton) : c'est la clé d'entrée de ton ZEUS.

## Étape 6 : brancher le cerveau (3 min)

Toujours dans le Pi :

```
nano ~/ZEUS/.env
```

Avec les flèches, va sur la ligne `GROQ_API_KEY=` et colle ta clé Groq juste après le `=` (clic droit pour coller).
Pareil pour `ANTHROPIC_API_KEY=` si tu as une clé Claude. Enregistre : **Ctrl+O**, Entrée, puis quitte : **Ctrl+X**.

Puis redémarre ZEUS :

```
sudo systemctl restart zeus
```

## Étape 7 : utiliser ZEUS (depuis ton téléphone ou ton PC)

Ouvre l'adresse notée à l'étape 5 dans Chrome ou Edge, sur un appareil **connecté au même Wi-Fi**.
Au premier accès : avertissement de certificat → **Paramètres avancés** → **Continuer**. Le micro et le mode
Jarvis marchent ensuite. Sur le téléphone : menu ⋮ → **Ajouter à l'écran d'accueil** pour avoir l'icône ZEUS.

**Test final** : débranche le Pi, rebranche-le, attends 2 minutes, recharge la page : ZEUS doit répondre tout seul.

---

## Au quotidien (dans le Pi, après `ssh damien@zeus.local`)

| Pour… | Tape |
|---|---|
| voir ce que fait ZEUS en direct | `journalctl -u zeus -f` (Ctrl+C pour sortir) |
| redémarrer ZEUS | `sudo systemctl restart zeus` |
| arrêter ZEUS | `sudo systemctl stop zeus` |
| sauvegarder maintenant | `python3 ~/ZEUS/sauvegarde-zeus.py ~/zeus-data` |
| voir les sauvegardes | `ls ~/zeus-sauvegardes` |
| éteindre le Pi proprement | `sudo shutdown now` (attends 20 s avant de débrancher) |

**Mettre ZEUS à jour** : depuis ton PC, refais l'étape 4 (la copie remplace le code, pas tes données ni ton `.env`),
puis dans le Pi : `sudo systemctl restart zeus`.

**Restaurer une sauvegarde** :
`sudo systemctl stop zeus`, puis
`tar -xzf ~/zeus-sauvegardes/zeus-AAAA-MM-JJ_HHMM.tar.gz -C ~ && rm -rf ~/zeus-data && mv ~/data ~/zeus-data`,
puis `sudo systemctl start zeus`.

## Si ça ne marche pas : ce que tu m'envoies

- l'étape où ça bloque et le message affiché ;
- les 40 dernières lignes de `journalctl -u zeus -n 40 --no-pager` (ZEUS n'y écrit jamais tes clés, relis quand même).

## Bon à savoir

- **Sans internet**, le Pi garde les rappels, l'agenda et les commandes simples, mais pas les vraies conversations.
- **Ton `.env` n'est pas dans les sauvegardes** : garde une copie de tes clés ailleurs (gestionnaire de mots de passe).
- **Le Pi chauffe un peu** : un boîtier avec dissipateur ou petit ventilateur est conseillé s'il tourne jour et nuit.
- **Plus tard** : un micro USB et une petite enceinte branchés au Pi permettront un vrai Jarvis dans la pièce
  (chantier à part : mot de réveil « ZEUS »).
