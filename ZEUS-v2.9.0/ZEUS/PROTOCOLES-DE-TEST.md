# Protocoles de test à faire sur ton PC — ZEUS 2.9

Ces tests ne peuvent pas se faire sans tes vraies clés, ton réseau et ton PC. Compte environ 20 minutes.
Pour chaque test : ce que tu fais, ce que tu dois voir, ce que tu me renvoies si ça échoue.

Les journaux sont dans `data\logs\zeus.log`. ZEUS n'y écrit jamais tes clés, mais relis l'extrait avant de me
l'envoyer.

---

## 0. Installer la mise à jour sans rien perdre (5 min)

1. Ferme ZEUS (Ctrl+C dans sa fenêtre noire).
2. **Sauvegarde** : copie tout le dossier `ZEUS-v2.1` et colle-le à côté sous le nom `ZEUS-v2.1-sauvegarde-0911`.
   Ne touche pas à `ZEUS-v1.1`.
3. Ouvre `ZEUS-v2.1-maj-2.4.0.zip`. Il contient un dossier `ZEUS` avec seulement les fichiers modifiés depuis la
   v2.1 : il inclut aussi les mises à jour 2.1.1, 2.2.0 et 2.3.0, que tu les aies installées ou non.
   Copie **le contenu** de ce dossier `ZEUS` dans ton dossier `ZEUS-v2.1`, là où se trouve `zeus.py`.
   Windows demande s'il faut remplacer : réponds **Remplacer**.
   Ton `.env` et ton dossier `data` ne sont pas dans le zip : ils ne bougent pas.

**Si ça échoue** : remets le dossier de sauvegarde en le renommant `ZEUS-v2.1`.

---

## 1. Les tests automatiques sous Windows (3 min)

Dans le dossier `ZEUS-v2.1`, ouvre un terminal (clic droit → « Ouvrir dans le terminal ») et tape :

```
python zeus.py test
```

**Tu dois voir**, au bout de 2 à 3 minutes : `Ran 278 tests` puis `OK` (parfois `OK (skipped=1)` sous Windows).

**Si ça échoue** : renvoie-moi les 40 dernières lignes affichées (elles commencent par `FAIL:` ou `ERROR:`).

---

## 2. Groq et Claude répondent vraiment (1 min, quelques centimes)

```
python zeus.py doctor
```

**Tu dois voir**, sous « Modèles », une ligne ✓ par modèle, par exemple
`✓ groq (openai · …) : répond en 0.4 s` et `✓ claude (anthropic · claude-opus-5-5) : répond en 1.8 s`.

**Si une ligne est ✗** : renvoie-moi cette ligne telle quelle. Les cas connus :
- `[auth] HTTP 401` : clé refusée (recopie-la) ;
- `[billing]` : crédits Claude épuisés ;
- `workspace` : la clé Claude n'est liée à aucun workspace (voir le README, Dépannage) ;
- `[connection]` : internet ou pare-feu.

---

## 3. La vitesse réelle, en chiffres (5 min, moins de 0,30 $ avec Claude)

```
python zeus.py mesure
```

ZEUS affiche d'abord le **coût maximal estimé** et te demande « Continuer ? ». Réponds `o`.

**Tu dois voir**, pour chaque modèle en ligne :
- `réseau vers api.groq.com : 0.35 s` : le temps pour joindre le serveur. Ça dépend de ta connexion, pas du modèle ;
- `question courte : premier mot … total …` : le temps de réponse minimal ;
- `vraie requête ZEUS à froid` puis `à chaud` : une vraie demande avec toutes les consignes. « À chaud »
  doit être plus rapide avec Claude, grâce au cache ;
- à la fin, `De bout en bout dans ZEUS` : 2 messages réels, avec le modèle qui a répondu.

Ensuite, uniquement si tu veux le chiffre du modèle local (compte 10 à 20 minutes) :

```
python zeus.py mesure --local --modele local --repetitions 2 --sans-bout-en-bout
```

**À me renvoyer dans tous les cas** : le fichier `data\logs\mesure-AAAAMMJJ-HHMM.json` indiqué à la fin.
C'est avec lui que je te donnerai les vrais chiffres.

**Si ça échoue** : la dernière ligne affichée, plus les 30 dernières lignes de `data\logs\zeus.log`.

---

## 4. La bascule quand internet coupe (3 min)

1. Lance ZEUS normalement (`DEMARRER-ZEUS.bat`), ouvre une conversation et envoie « Bonjour » : il répond.
2. **Coupe le Wi-Fi** du PC (ou débranche le câble).
3. Envoie : « Quelle est la capitale du Kenya ? »

**Tu dois voir**, en quelques secondes, dans la réponse en cours et dans un bandeau en bas, une ligne par
modèle en ligne essayé (l'ordre dépend de ton cerveau principal), par exemple :
- `⚠️ groq (…) : injoignable (internet coupé ?). Je passe à claude (…).`
- puis, si Ollama est installé : `🐢 Bascule sur le modèle local (mistral:7b) : … plusieurs minutes. Tu peux
  arrêter avec ⏹️.`
- sans Ollama : `📡 Aucun modèle d'IA n'a répondu : ta connexion internet semble coupée ou très lente.`

4. Si le modèle local travaille, clique **⏹️ Stop**. **Tu dois voir** « ⏹️ Tâche arrêtée. » en une seconde
   environ, et non plusieurs minutes plus tard.
5. Rallume le Wi-Fi, attends quelques secondes, puis renvoie un message. ZEUS doit répondre **avec Groq ou
   Claude, sans repasser par le modèle local**. Le nom du modèle s'affiche sous la réponse.
   Exception : si le Wi-Fi était allumé mais sans internet, la panne prend la forme d'un délai dépassé. Le modèle
   reste alors en pause 45 s.

**Si ça échoue** : une capture d'écran de la conversation, plus les lignes de `data\logs\zeus.log` qui
contiennent `modèle` ou `Bascule` (environ 20 lignes).

---

## 5. La bascule Groq → Claude avec internet (2 min, facultatif)

Ce test ne marche que si ta clé Groq est dans `.env` (ligne `GROQ_API_KEY=`). Si tu l'as collée dans
l'interface (« Groq en un clic »), passe ce test.

Dans un terminal, ouvert dans le dossier de ZEUS :

```
set GROQ_API_KEY=gsk_cle_volontairement_fausse
python zeus.py
```

`set` ne vaut que pour cette fenêtre : ton `.env` n'est pas modifié.
Envoie « Bonjour ».

**Tu dois voir** : `⚠️ groq (…) : clé refusée. Je passe à claude (…).`, puis la réponse de Claude.
Sous la réponse, le nom du modèle doit être `claude`.
Si Groq répond normalement, c'est que ta clé est enregistrée dans les réglages et non dans `.env` : ce test
ne s'applique pas, ce n'est pas un échec.

Ferme ensuite cette fenêtre : la prochaine fois, ZEUS reprendra ta vraie clé.

**Si ça échoue** : capture d'écran, plus les 20 dernières lignes de `zeus.log`.

---

## 6. La nouvelle interface « Olympus Arc » (5 min)

1. Lance ZEUS (`DEMARRER-ZEUS.bat`). Si l'ancienne interface s'affiche, appuie sur **Ctrl+F5** une fois.
   **Tu dois voir** : un trait cyan balaie l'écran une fois, puis le réacteur tourne sur l'écran d'accueil.
2. **Thèmes** : Réglages → Toi et ZEUS → Thème → « Marbre (clair) », puis « Orage (sombre) ». Les deux doivent
   rester lisibles partout.
3. **Mode Jarvis** : bouton **Jarvis** (ou Alt+J), puis autorise le micro.
   **Tu dois voir** : un éclair frappe le centre, un flash, puis le réacteur se déploie. Quand tu parles, la
   couronne cyan suit ta voix ; quand ZEUS répond, des éclairs jaillissent du cœur. Échap : le réacteur
   s'effondre en une ligne.
4. **Argent** : demande « envoie 1 000 FC à Patrick par M-Pesa » (refuse ensuite).
   **Tu dois voir** une plaque rouge à bandes. Un simple clic sur « Maintenir pour autoriser » ne fait rien ;
   il faut garder le bouton appuyé une seconde. Clique **Refuser**.
5. **Téléphone** (si branché) : coche « Suivi en direct ». Le cadre s'illumine en cyan avec l'étiquette « En direct ».
6. **Sur le téléphone** (`python zeus.py --lan --https`) : la barre du bas, l'accueil et Jarvis doivent tenir dans
   l'écran sans défilement de côté.

**Si quelque chose est cassé ou illisible** : une capture d'écran et le nom de la vue. Si un bouton ne réagit
pas, appuie sur F12 → onglet « Console » et envoie-moi les lignes rouges.

---

## 7. Mes documents (5 min)

1. Onglet **Documents** (sur le téléphone : **Plus → Documents**).
2. Colle le chemin d'un dossier de cours ou de notes, par exemple `C:\Users\Damien\Documents\cours B1`, puis
   **Ajouter**. **Tu dois voir** « Indexation en cours : … / … fichiers », puis la liste des documents à droite.
3. Cherche un mot que tu sais présent dans un de tes PDF ou Word, **sans les accents** (ex. « theoreme »).
   **Tu dois voir** le bon document, la page pour un PDF, et le mot surligné. « Lire le passage » affiche le texte.
4. Clique **Demander à ZEUS** avec une vraie question sur ce cours.
   **Tu dois voir** une réponse qui cite `[nom du document, p. X]`, et le relevé de mission « Recherche dans mes
   documents ».
5. Note les documents marqués « illisible » (souvent des PDF scannés).

**Si ça échoue** : le nombre de fichiers du dossier, le type des fichiers non trouvés, et les lignes
`bibliothèque` de `zeus.log`.

---

## 8. Test de niveau (5 min)

1. **Apprendre → Test de niveau → Anglais**. Réponds honnêtement, sans chercher.
   **Tu dois voir** : une correction expliquée après chaque réponse, une barre d'avancement, et un résultat après
   10 à 16 questions.
2. Le niveau te semble-t-il juste ? Note-le (trop haut, juste, trop bas).
3. Clique **Commencer le cours …**. **Tu dois voir** le rôle « Professeur de langue » avec ce niveau en haut de la
   conversation, et des exercices adaptés.
4. Facultatif : refais le test en répondant au hasard. Le résultat doit tomber en A1 ou A2.

**Si ça échoue** : capture d'écran du résultat ; dis-moi quelle question te semblait fausse ou ambiguë (je les
corrige une par une).

---

## 9. Google Agenda et Outlook (5 min)

1. Google Agenda sur ordinateur → ⚙️ Paramètres → clique ton agenda dans la colonne de gauche → « Intégrer
   l'agenda » → copie l'**Adresse secrète au format iCal**.
2. ZEUS → **Agenda** → en bas, « Google Agenda et Outlook » : colle l'adresse, nom « Google », rappel 15 min,
   **Brancher**. **Tu dois voir** « Agenda branché : N rendez-vous importés », puis tes rendez-vous avec une barre
   cyan et « Depuis Google (lecture seule) ».
3. Vérifie trois choses : un rendez-vous **récurrent** (cours hebdomadaire…), un rendez-vous **toute la journée**,
   et les **heures** (identiques à Google ?).
4. Dans Google, déplace un rendez-vous, puis clique **Synchroniser** dans ZEUS : il doit bouger.
5. Dans la conversation : « ajoute dentiste demain à l'heure de mon rendez-vous Google ». **Tu dois voir** un
   avertissement de conflit et les liens Google / Outlook ; clique **+ Google** sous le rendez-vous dans l'onglet
   Agenda : Google s'ouvre avec le rendez-vous prérempli.

**Si ça échoue** : une capture du rendez-vous dans Google et dans ZEUS (heure comprise). Ne m'envoie **pas**
l'adresse secrète.

---

## 10. La qualité du professeur de langue (5 à 10 min, quelques centimes avec Groq)

```
python zeus.py pedagogie
```

ZEUS affiche le coût maximal estimé et te demande « Continuer ? ». Réponds `o`. Pour une seule langue :
`python zeus.py pedagogie --langue en` (ou `es`, `de`, `fr`).

ZEUS envoie 31 phrases d'élève à son professeur : des phrases avec des fautes connues (« She don't like… »,
« Hoy soy muy cansado… », « Ich bin mit der Bus gefahren… »), des phrases **pièges sans faute** (il ne doit rien
corriger) et des questions posées en français (il ne doit pas corriger non plus). Tout se passe dans un ZEUS
temporaire : tes cartes mémoire et ton journal d'erreurs ne bougent pas.

**Tu dois voir** une ligne par phrase (✅ ou ❌ avec la raison : erreur manquée, fausse correction…), puis un bilan :
- `erreurs trouvées et bien corrigées` : vise **au moins 17 sur 20** ;
- `fausses corrections` : vise **0 ou 1** ;
- `phrases pièges laissées tranquilles` (phrases sans faute et questions en français) : vise **13 sur 13**.

**À me renvoyer dans tous les cas** : le fichier `data\logs\pedagogie-AAAAMMJJ-HHMM.json` indiqué à la fin. Avec lui,
je corrige les consignes du professeur là où il se trompe, puis on relance pour comparer.

**Si ça échoue** : la dernière ligne affichée, plus les 30 dernières lignes de `data\logs\zeus.log`.

---

## 11. ZEUS sur lui-même et « ZEUS s'est trompé » (3 min, gratuit avec Groq)

1. Dans l'interface, demande : « Qu'est-ce que tu voudrais améliorer chez toi ? ».
   **Tu dois voir** une réponse qui cite la version 2.5.0, Groq et sa limite de 200 000 jetons par jour, le fait
   que le modèle en ligne ne voit pas les images, et le dernier score du professeur (15/20 si tu n'as pas relancé
   le banc d'essai). S'il répond « ma rapidité et ma précision » sans aucun chiffre, la fiche n'est pas arrivée.
2. Sous cette réponse, clique sur **ZEUS s'est trompé**, choisis « Incomplet ou vague », écris « je voulais un
   exemple » puis **Enregistrer l'erreur**. **Tu dois voir** « Merci, c'est noté (cas n° 1) » et un fichier
   `data\cas\AAAAMMJJ-1.json`.
3. Dans un terminal : `python zeus.py cas`. **Tu dois voir** le cas n° 1 avec la question, la réponse et
   « attendu : je voulais un exemple ». Puis `python zeus.py cas --statut 1 ignore` → « Cas n° 1 : ignore. »
4. Sur Telegram (si branché) : après une réponse de ZEUS, envoie `/erreur la bonne réponse`.
   **Tu dois voir** « 📝 Merci, c'est noté (cas n° 2) ».

**Si ça échoue** : une capture de l'écran, plus les 30 dernières lignes de `data\logs\zeus.log`.

---

## 12. Le mini-cerveau local et les réflexes (10 min, gratuit)

1. **Réflexes** : dans une conversation avec le rôle « Assistant », écris « Quelle heure est-il ? », puis
   « combien font 12 x 7 ? ». **Tu dois voir** la réponse tout de suite, avec l'étiquette « réflexe instantané,
   sans IA » sous le nom de ZEUS.
2. **Vitesse du mini-cerveau** (Ollama lancé) : `python zeus.py mesure --mini`.
   **Tu dois voir** le préchauffage, puis 3 questions avec « premier mot » et « total ». Objectif : moins d'une
   minute par réponse après le préchauffage. Au-dessus, essaie un modèle plus petit : `ollama pull llama3.2:3b`,
   puis mets-le comme modèle local dans Réglages → Modèles.
3. **Bascule réelle** : coupe le Wi-Fi, écris « Raconte-moi une blague » dans ZEUS. **Tu dois voir** l'annonce
   « 📶 … j'attends le retour de la connexion », puis « 🧠 Mini-cerveau local … », puis une réponse courte avec
   l'étiquette « mini-cerveau local ». Rebranche le Wi-Fi : le message suivant repart sur Groq.
4. **Stop** : pendant que le mini-cerveau réfléchit, appuie sur ⏹️. **Tu dois voir** « Tâche arrêtée » tout de suite,
   et le ventilateur du PC se calmer en quelques secondes (Ollama a arrêté de calculer).
5. **Facultatif — 2e cerveau gratuit** : Réglages → Modèles → « 2e cerveau gratuit » → Cerebras ou Gemini, colle la
   clé, **Activer**. **Tu dois voir** « … répond (x s) avec … ».

**À me renvoyer** : le fichier `data\logs\mesure-AAAAMMJJ-HHMM.json` de l'étape 2.
**Si ça échoue** : une capture de l'écran, plus les 30 dernières lignes de `data\logs\zeus.log`.

---

## 13. L'interface spatiale (3 min, gratuit)

1. Clique sur **Jarvis** (ou Alt+J), fenêtre en plein écran. **Tu dois voir** « ZEUS — Interface spatiale » en haut,
   le cœur doré entouré de l'anneau des modules, le fil de la conversation à gauche, les relevés système à droite.
2. Compare les relevés avec le Gestionnaire des tâches de Windows (Ctrl+Maj+Échap → Performances) : processeur et
   mémoire doivent être proches (à quelques points près, ils ne sont pas mesurés au même instant).
3. Écris « cherche le taux du dollar » dans la case du bas. **Tu dois voir** le module « ANALYSE » s'allumer en or
   pendant la recherche, puis la réponse dans le panneau de droite.
4. Ferme avec ✕ : le ventilateur ne doit pas rester emballé (l'animation s'arrête).

**Si ça échoue** : une capture d'écran du mode Jarvis.

---

## 14. Le banc de tests ZEUS (15 à 25 min, gratuit avec Groq)

```
python zeus.py banc
```

Réponds `o` à « Lancer le banc ? ». **Tu dois voir** une ligne ✅ ou ❌ par test, puis le score total et le score par
catégorie. Le banc s'arrête tout seul si Groq atteint sa limite du jour (relance-le le lendemain, ou par catégorie :
`--categorie maths`).

**À me renvoyer** : le fichier `data\logs\banc-AAAAMMJJ-HHMM.json` indiqué à la fin.
