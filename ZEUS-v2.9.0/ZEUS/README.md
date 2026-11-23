# ⚡ ZEUS — ton IA personnelle qui agit

ZEUS est un agent IA que tu installes sur ton ordinateur. Tu lui parles (par écrit ou à la voix, depuis
ton PC ou ton téléphone) et il **agit** : il pilote ton téléphone Android, ton ordinateur et un navigateur,
range tes fichiers, cherche sur internet, envoie tes messages, planifie des tâches, retient ce qui compte
pour toi… et il peut tenir un **guichet administratif** complet (le métier de NEO, en plus poussé).

- **Ton téléphone Android, tout seul** : il lit l'écran, touche, fait défiler, écrit, ouvre les applis, appelle,
  envoie des SMS et des WhatsApp, lit tes notifications et tes contacts, règle le Wi-Fi, le Bluetooth, le volume,
  la luminosité, le mode silencieux, les alarmes, les minuteurs et l'agenda.
- **Il veille pour toi** : « préviens-moi si Maman m'écrit », « quand je reçois un SMS M-Pesa, note-le dans mon
  budget » — ZEUS surveille les notifications du téléphone et réagit tout seul. Et chaque matin, ton **brief**.
- **Ton ordinateur** : fichiers (PDF, Word, Excel, photos avec OCR), commandes, scripts Python, captures d'écran,
  clavier et souris, presse-papier.
- **Un navigateur piloté** : il ouvre des sites, remplit des formulaires, se connecte à tes comptes.
- **Le web** : recherche, lecture de pages, téléchargements.
- **Dossiers administratifs** : réception des demandes (WhatsApp, Telegram, e-mail), lecture et classement des
  pièces, contrôle des pièces expirées, trop anciennes, illisibles ou en double, relances, validation par un agent,
  export ZIP, journal complet.
- **Mémoire et compétences** : il retient tes préférences et tes proches, et apprend des méthodes réutilisables.
- **Tâches planifiées** : « rappelle-moi demain à 7h », « chaque matin, résume mes notifications ».
- **Sous-agents en parallèle** pour les grosses tâches.
- **Partout** : interface web (PC et téléphone, avec la voix « Zeus… »), Telegram, WhatsApp, e-mail, **SMS**, terminal.
- **Le moteur de tes autres IA** : Claude Desktop, Cursor, VS Code ou Hermes peuvent utiliser ZEUS comme extension
  (serveur MCP) et piloter ton téléphone à travers lui.
- **N'importe quel cerveau** : modèle local gratuit et privé (Ollama, LM Studio) ou en ligne (Claude, GPT, Gemini,
  OpenRouter, Groq, Mistral, DeepSeek). S'il y a une panne, il passe tout seul au modèle suivant.
- **Aucune installation compliquée** : uniquement Python. Zéro bibliothèque à installer.

## ⏱️ Démarrage rapide (5 minutes)

1. Double-clique sur **`DEMARRER-ZEUS.bat`** (Python 3.10+ requis). ZEUS s'ouvre dans sa propre fenêtre.
2. Branche un cerveau rapide : sur l'écran d'accueil, **🚀 Groq gratuit** (crée une clé gratuite sur
   console.groq.com et colle-la : ZEUS choisit le meilleur modèle et branche la voix), ou **⚡ Claude** pour la
   meilleure intelligence. Un modèle local (Ollama) marche aussi, mais il est lent sans carte graphique.
3. Choisis ton profil (**Je suis : étudiant, professeur, salarié, dirigeant, RH, chercheur, langues, vie perso**) et
   clique une idée, ou parle-lui avec le bouton **🎙️ Jarvis**.

Sur ton téléphone : `python zeus.py --lan --https`, scanne le QR code, accepte l'avertissement du certificat une fois
(« Paramètres avancés → Continuer ») : micro, mode Jarvis et prononciation fonctionnent aussi sur le téléphone.
Icône sur le bureau : `python zeus.py raccourci`.

### Version 2.9.0 — le banc de tests ZEUS

`python zeus.py banc` pose environ 30 questions à ZEUS, dans un ZEUS temporaire (tes données ne sont pas touchées,
toute autorisation est refusée), et donne un score par catégorie : raisonnement, mathématiques, connaissances,
mauvaise information, demande ambiguë, outils, tes documents, mémoire, sécurité (paiement, clé API, document piégé),
respect des consignes et panne simulée du cerveau principal. Tes erreurs signalées avec « ZEUS s'est trompé » sont
rejouées comme tests. Chaque banc est comparé au précédent : **régressions** (réussi avant, raté maintenant) et
**progrès**. Une seule catégorie : `python zeus.py banc --categorie securite`.

### Version 2.8.0 — ZEUS apprend de chaque conversation

- **Bilan de conversation** : toutes les 3 questions, ZEUS relit en arrière-plan les derniers échanges et retient au
  plus 3 faits durables sur toi (préférences, études, projets, proches, décisions). Rien de passager, jamais de
  secret. Tout est visible et effaçable dans ☰ Menu → Mémoire. Pour l'arrêter : `"agent": {"auto_learn": false}`.
- **Leçons des erreurs** : la réponse attendue que tu écris avec « ZEUS s'est trompé » devient une leçon ; quand une
  question proche revient, ZEUS la relit avant de répondre. « Trop long » devient une préférence durable.
- Interface épurée (2.7.2 à 2.7.6) : menu ☰ pour la navigation, menu ⋯ pour le rôle, Jarvis et la voix, conversations
  renommables et supprimables, modèles d'IA cachés (option développeur dans Réglages).

### Version 2.7.1 — Groq gratuit sans « requête trop grosse »

Groq gratuit refuse toute requête de plus de 8 000 jetons (erreur 413). Les rôles secrétaire, enseignant, formateur,
dirigeant, RH et chercheur la dépassaient à chaque message. ZEUS raccourcit maintenant les descriptions d'outils,
ne garde que les boîtes à outils utiles à la demande et résume l'historique : chaque requête reste sous la limite.
Les dépenses de Groq gratuit s'affichent à 0 $ au lieu de « prix inconnu ».

### Version 2.7.0 — l'interface spatiale

Le mode Jarvis (bouton « Jarvis », ou Alt+J) devient une interface spatiale, sur le modèle de l'image « Spatial
computing AI interface » :
- au centre, le **cœur doré** et l'**anneau des modules** (Communications, Sécurité, Analyse, Agenda, Mémoire,
  Téléphone) : le module que ZEUS utilise en ce moment s'allume en or, et l'étiquette du cœur donne le cerveau actif ;
- à gauche, le **fil de la conversation** ; à droite, l'**échange en cours** et les **relevés système**, avec de
  vraies valeurs : cerveau et secours, téléphone, tâches en cours, processeur, mémoire, disque libre, dépenses du
  mois, et la courbe de la dernière minute ;
- une **case pour écrire**, en plus de la voix.

Tout est dessiné sur place, sans bibliothèque ni police téléchargée : l'interface marche hors ligne, et l'animation
s'arrête dès qu'on quitte le mode Jarvis. Sur un téléphone ou une petite fenêtre, seuls le cœur et l'échange restent
affichés.

### Version 2.6.1 — le nouveau logo

Le logo de ZEUS devient le Z en titane et or avec son cœur cubique cyan (« ZEUS AI ») : onglet du navigateur,
barre de gauche, écran d'accueil, page de connexion, en-tête des réponses, appli installée sur le téléphone et
icône du bureau (`python zeus.py raccourci` pour la mettre à jour). Tout est dessiné en vectoriel et fonctionne sans
internet. Le mode Jarvis gagne une poussière de données en orbite autour de son cœur doré.

### Version 2.6.0 — un cerveau de secours rapide, et des réponses sans IA

- **Mini-cerveau local.** Quand Groq est à sa limite ou qu'internet coupe, le modèle local (Ollama) ne reçoit plus la
  requête complète de ZEUS (4 000 à 6 000 jetons, soit 4 à 8 minutes de lecture sur un PC sans carte graphique). Il
  reçoit une requête légère (350 à 850 jetons) : consignes courtes et derniers échanges, sans outils. Il converse,
  explique, corrige ton anglais ou traduit ; pour envoyer un message ou chercher sur internet, il te propose de
  redemander quand le cerveau en ligne revient. Ses réponses portent l'étiquette « mini-cerveau local ».
  Pour le désactiver : `"local": {"mini": false}` dans `data\zeus.json`.
- **Préchauffage.** Pendant que ZEUS attend Groq ou le retour d'internet (jusqu'à une minute), le modèle local se
  charge et lit déjà ses consignes. Elles restent en mémoire une heure : les réponses suivantes démarrent plus vite.
  Pour le charger dès le lancement de ZEUS : `"local": {"preheat": "demarrage"}`.
- **⏹️ arrête vraiment le modèle local**, même pendant sa lecture silencieuse : Ollama s'arrête et le PC est libéré
  (avant, il pouvait continuer à calculer de longues minutes en arrière-plan).
- **Réflexes sans IA.** « Quelle heure est-il ? », « on est quel jour ? », « combien font 12 x 7 ? »,
  « 15 % de 230 », « qu'est-ce que j'ai demain ? » : réponse immédiate, sans modèle, sans jeton dépensé, même hors
  ligne. Pas dans les rôles où la phrase est un exercice (professeur de langue, interprète, enseignant).
- **2e cerveau gratuit.** Réglages → Modèles → « 2e cerveau gratuit » : Cerebras (environ 1 million de jetons
  gratuits par jour) ou Google Gemini (voit aussi les images). Il se place juste après Groq : quand Groq atteint
  sa limite du jour, ZEUS reste en ligne au lieu de passer au modèle local.
- Mesurer le mini-cerveau sur ton PC : `python zeus.py mesure --mini` (gratuit, 3 à 5 minutes).

### Version 2.5.0 — ZEUS se connaît et apprend de ses erreurs

- **ZEUS sur lui-même** : quand tu lui demandes ce qu'il sait faire, ses limites ou ce qu'il veut améliorer, ZEUS
  reçoit une fiche construite à partir de son état réel (version, modèles branchés et s'ils voient les images,
  limites de Groq gratuit, fonctions pas encore essayées en vrai, dernier score du banc d'essai, erreurs signalées).
  Il répond avec ses vrais chiffres au lieu d'une réponse générique. La fiche n'est ajoutée qu'à ces questions-là :
  elle ne coûte rien aux autres messages.
- **« ZEUS s'est trompé »** : un lien discret sous chaque réponse. Tu choisis ce qui n'allait pas (réponse fausse,
  pas compris, trop long…) et tu écris ce que tu attendais. La question, la réponse, les outils appelés et le modèle
  sont rangés dans `data\cas\` (sans aucune clé). Sur Telegram : `/erreur ta réponse attendue`.
  Pour les relire : `python zeus.py cas` ; pour en classer un : `python zeus.py cas --statut 3 traite`.
  Ces cas deviendront les tests du banc d'essai : une erreur signalée ne doit pas revenir.

### Version 2.4.4 — en-tête lisible

Sur un écran réglé à 125 ou 150 % (Windows), les menus Rôle, Cerveau et Jarvis écrasaient le titre de la
conversation. Ils passent maintenant à la ligne quand la place manque.

### Version 2.4.3 — résistant aux coupures d'internet

Quand internet coupe (DNS, Wi-Fi, réseau mobile), ZEUS guette son retour pendant 45 secondes au plus et reprend
Groq ou Claude dès que la connexion revient, au lieu de partir 5 minutes sur le modèle local. Le professeur de
langue reçoit aussi des consignes plus précises sur les fautes qu'il laissait passer (prétérit avec « yesterday »,
majuscule des noms allemands, « au Canada ») et sur une fausse correction espagnole (« el año próximo » est juste).

### Version 2.4.2 — un professeur plus léger

Pendant un cours de langue, ZEUS n'envoie plus que les outils utiles à la leçon (corrections, cartes, progression,
mémoire, recherche) : la requête du professeur passe d'environ 7 900 à 6 000 jetons estimés, soit plus de phrases
par minute et par jour avec Groq gratuit. Les autres outils restent disponibles à la demande. Le banc d'essai
`pedagogie` s'arrête proprement quand Groq a épuisé sa limite du jour, au lieu d'attendre 5 minutes par phrase.

### Version 2.4.1 — Groq gratuit sans blocage

Quand les modèles Groq atteignent leur limite (8 000 jetons par minute en gratuit), ZEUS **attend les quelques
secondes annoncées et les reprend**, au lieu de passer au modèle local qui peut bloquer 5 minutes sans carte
graphique. Le modèle local n'est plus utilisé que si la limite dure plus d'une minute ou si internet est coupé.
Le banc d'essai `pedagogie` efface aussi correctement son dossier temporaire sous Windows.

### Version 2.4 — une seule version

La 2.4 réunit les deux branches de ZEUS : la 2.3 (« Bibliothèque ») et les améliorations faites directement sur le PC
après la 2.2 : le banc d'essai du professeur (`python zeus.py pedagogie`), un ordre de bascule entre modèles mieux
testé, l'installation jour et nuit sur Raspberry Pi (`RASPBERRY-PI.md`) et le script `sauvegarde-zeus.py`. La suite à
venir est décrite dans `SPEC.md` et `ROADMAP.md`.

### Version 2.3 — « Bibliothèque »

| | |
|---|---|
| 📚 **Mes documents** | Nouvel onglet **Documents** : donne à ZEUS tes dossiers de cours, de notes ou de l'entreprise (ou dépose des fichiers). Il les indexe sur ton PC (PDF, Word, PowerPoint, Excel, OpenDocument, texte, e-mails…) et y cherche ses réponses en citant **le document et la page**. Recherche sans accents et tolérante aux pluriels ; l'index suit tout seul les fichiers ajoutés, modifiés ou supprimés (toutes les 30 min). En conversation : « que dit mon cours sur la loi d'Ohm ? », « cherche dans mes documents le préavis de démission ». Les rôles Enseignant, Formateur, Chercheur, RH et Dirigeant l'utilisent d'office. |
| 🎯 **Test de niveau adaptatif** | **Apprendre → Test de niveau** : 10 à 16 questions de grammaire et de vocabulaire (anglais, espagnol, allemand, français) qui s'ajustent à chaque réponse, comme les tests de positionnement en ligne. Résultat de A1 à C2, avec le détail par niveau et par compétence, l'explication de chaque réponse, et un bouton pour **commencer le cours à ce niveau**. Les cours suivants reprennent ce niveau tout seuls. |
| 📅 **Google Agenda et Outlook** | **Agenda → Google Agenda et Outlook** : colle l'adresse secrète iCal de ton agenda Google ou le lien ICS publié d'Outlook. ZEUS le relit toutes les 15 min (rendez-vous récurrents et exceptions compris) : conflits d'horaire, rappels (au choix) et brief du matin en tiennent compte. Dans l'autre sens, chaque rendez-vous créé par ZEUS a des boutons **+ Google** et **+ Outlook** (ajout en un clic, sans clé d'API), et l'agenda de ZEUS est publié en flux privé auquel un téléphone ou Thunderbird peut s'abonner. |
| 📱 **Correctif téléphone** | Le menu « Plus » du téléphone donne enfin accès à Apprendre, Agenda et Documents. |

### Version 2.2 — « Olympus Arc »

| | |
|---|---|
| ⚡ **Nouvelle identité** | Deux thèmes : **Obsidienne** (sombre) et **Marbre** (clair). Une règle de couleur simple : le cyan quand ZEUS écoute ou est en ligne, l'or quand il agit ou attend ton accord, le rouge pour l'argent. Polices système uniquement (Bahnschrift, Segoe UI ; Roboto sur Android) : tout marche hors ligne. Nouvel éclair, dont le haut forme la barre du Z. |
| 🌀 **Le réacteur** | Le mode Jarvis devient un réacteur : trois anneaux gyroscopiques en perspective autour d'un cœur de plasma. Il suit ta voix quand il écoute, lance des éclairs quand il parle, s'emballe quand il agit. Entrée : un éclair frappe le centre ; sortie : il s'effondre en une ligne. Le même réacteur accueille sur l'écran d'accueil. |
| 💸 **Argent : maintenir pour autoriser** | Un paiement (M-Pesa, USSD…) s'affiche en plaque rouge et ne s'autorise qu'en **gardant le bouton appuyé une seconde** (souris, doigt ou touche Entrée) : un clic par erreur ne paie rien. |
| 🧭 **Relevé de mission** | Chaque action de ZEUS est un nœud sur un conducteur doré ; le plan s'affiche numéroté ; le panneau « En direct » devient des instruments. |
| ♿ **Accessibilité** | Contrastes AA vérifiés dans les deux thèmes (texte et contours des champs), focus visible, zones tactiles de 44 px, emoji remplacés par du texte ou des icônes dessinées, « réduire les animations » respecté (le réacteur reste fixe). |
| 🎓 **`python zeus.py pedagogie`** | Banc d'essai du professeur de langue : 31 phrases d'élève (anglais, espagnol, allemand, français) dont les erreurs sont connues, plus des phrases pièges sans faute. ZEUS les corrige avec ton vrai cerveau ; le banc compte les erreurs trouvées, les fausses corrections, la forme des réponses. Tout se passe dans un ZEUS temporaire : tes cartes et ton journal d'erreurs ne bougent pas. Résultat dans `data/logs/pedagogie-….json`. |

### Version 2.1.1 — fiabilité du cerveau en ligne

| | |
|---|---|
| 🔀 **Bascule annoncée** | Quand un modèle tombe, ZEUS le dit dans la réponse en cours (« ⚠️ groq : limite de requêtes atteinte. Je passe à claude. ») et prend le suivant. Ordre : ton cerveau principal, puis les autres modèles **en ligne**, puis le **modèle local en dernier** (il est prévenu : « plusieurs minutes »). |
| ⏱️ **Plus jamais figé** | Un modèle en ligne muet pendant 1 min 30 est considéré en panne (avant : jusqu'à 2 × 5 min). ZEUS prévient dès 20 s sans réponse. Une limite de requêtes longue (Groq gratuit) fait passer tout de suite au modèle suivant au lieu d'attendre 40 s. Le modèle local a 10 min pour sa 1re réponse (avant : 5 min, trop court sans carte graphique). |
| ⏹️ **Stop immédiat** | Le bouton Stop agit en moins d'une seconde, même pendant les minutes où un modèle local lit les consignes. |
| ✂️ **Réponse coupée détectée** | Une coupure réseau au milieu d'une réponse ne donne plus une phrase tronquée présentée comme complète : ZEUS bascule sur le modèle suivant. |
| 📡 **Message clair hors ligne** | Internet coupé : « ta connexion internet semble coupée ou très lente » (et non plus « vérifie qu'Ollama est lancé »). |
| 📏 **`python zeus.py mesure`** | Vitesse réelle de chaque modèle : réseau, premier mot, durée, jetons par seconde, à froid et à chaud, plus un essai de bout en bout. Coût estimé et demandé avant de dépenser. Résultat dans `data/logs/mesure-….json`. |
| 🔑 **Premier démarrage** | Avec `ANTHROPIC_API_KEY` **et** `GROQ_API_KEY` dans `.env`, les deux sont branchés, plus Ollama en dernier secours s'il est installé (avant : Claude seul). |

### Nouveautés de la version 2.1 — « Jarvis intégré »

| | |
|---|---|
| 🎙️ **Mode Jarvis** | Bouton **🎙️ Jarvis** (ou Alt+J) : conversation vocale plein écran autour d'une orbe animée qui réagit à ta voix. ZEUS t'accueille (« Bonsoir, tu as 2 rendez-vous aujourd'hui… »), écoute, répond à voix haute, montre ce qu'il fait, et tu valides ses actions **à la voix** (« oui » / « non »). |
| ⚡ **Commandes instantanées** | Sans attendre l'IA, même hors ligne : « quelle heure est-il », « quel jour sommes-nous », « minuteur 5 minutes », « répète », « plus lentement », « parle anglais », « ajoute à ma liste : acheter du pain », « ouvre YouTube ». En français, anglais, espagnol et allemand. |
| 🗣️ **Le tuteur Jarvis dans ZEUS** | Repris de ton projet Jarvis : recast, principe i+1, part de français selon le niveau, **corrections revérifiées par un second modèle**, **journal d'erreurs** (une erreur qui revient remonte en révision), vocabulaire et erreurs transformés en cartes, message dicté reconnu (ponctuation et erreurs de transcription ignorées), traductions entre parenthèses jamais lues à voix haute. |
| 🎯 **Prononciation et dictée** | Écoute (normal ou lent), répète, et vois mot à mot ce qui a été compris : vert juste, orange presque, rouge manquant, score sur 100. Dictée notée. Bouton **🔁 Répéter** sous chaque réponse du prof, **💡 Conseils du prof** sur les mots difficiles. |
| 🎭 **Jeux de rôle et défis** | 8 scènes (restaurant, aéroport, entretien d'embauche, boutique de foot, pitch de start-up, médecin, hôtel, appel pro) ou la tienne ; **défi** ciblé sur tes erreurs les plus fréquentes ; **bilan de séance**. |
| 🔥 **Série, minutes de parole, objectifs** | Jours d'affilée, minutes parlées, cartes revues, objectifs du jour (10 cartes, 5 min de parole, 3 messages corrigés), activité des 7 derniers jours. **Export Anki**. Accent réglable (anglais britannique par défaut). |
| 🌍 **Mode interprète** | Français ↔ anglais, espagnol ou allemand : chacun parle dans sa langue, ZEUS traduit à voix haute et le micro passe tout seul à l'autre langue. Consignes courtes et aucun outil : rapide, même avec un modèle local. |
| 🎤 **Dictaphone de réunion** | Onglet Agenda → **Enregistrer une réunion** : ZEUS transcrit et rédige le compte rendu (décisions, actions, échéances), puis propose de les ranger dans tes tâches et ton agenda. |
| 👔 **Rôles métier** | **Professeur / formateur** (séances, QCM, exercices différenciés, corrections avec barème, appréciations), **Conseiller du dirigeant** (notes de décision, SWOT, plans à 90 jours, conseils d'administration), **RH** (fiches de poste, grilles d'évaluation équitables, entretiens STAR, intégration — jamais de critère discriminatoire), **Assistant de recherche** (bibliographie sourcée avec DOI — jamais de référence inventée —, méthode, statistiques, relecture). Menu **Rôle**, ou `/formateur`, `/dirigeant`, `/rh`, `/chercheur`. |
| 🧭 **Accueil par profil** | « Je suis : étudiant, professeur, salarié, dirigeant, RH, chercheur, langues, vie perso » : le bon rôle et des idées adaptées en un clic. |
| 🚀 **Groq en un clic** | Gratuit et très rapide : colle ta clé, ZEUS choisit le meilleur modèle disponible (sans liste figée qui vieillit) et branche la reconnaissance vocale. Aussi dans `python zeus.py setup`. |
| 📱 **HTTPS automatique** | `python zeus.py --lan --https` (ou Réglages → Accès) : ZEUS crée son certificat (en Python pur, sans OpenSSL) pour que le micro, le mode Jarvis et la prononciation marchent sur le téléphone. |
| 💬 **Rôles sur tous les canaux** | `/prof anglais B1`, `/interprete espagnol`, `/rh`… marchent sur Telegram, **WhatsApp, SMS et e-mail**. |
| 🪟 **Sa propre fenêtre** | ZEUS s'ouvre dans une fenêtre d'application (Edge ou Chrome, sans barre d'adresse) ; `python zeus.py raccourci` pose l'icône ⚡ ZEUS sur le bureau. |
| 🛠️ **Défauts corrigés** | Testé avec de vrais modèles locaux (Mistral 7B, Llama 3.2 3B) : un modèle trop lent affichait « Vérifie qu'Ollama est lancé » (faux) et était relancé une 2e fois pour rien ; après un changement de rôle, un petit modèle recopiait les consignes internes à l'utilisateur ; un simple « bonjour » déclenchait des outils (le brief du matin) au lieu d'une réponse directe ; le récapitulatif de fin de tâche effaçait la mémoire du modèle local ; le texte « null » apparaissait sur les cartes sans exemple et dans le brief ; une correction valable pouvait être perdue. Lanceur et tests Windows réparés. 138 tests automatiques. |

### Nouveautés de la version 2.0

| | |
|---|---|
| 🗣️ **Professeur de langue** | Anglais, espagnol, allemand, français. Test de niveau (A1 → C2), conversation, jeux de rôle, grammaire, exercices, dictée, prononciation, préparation TOEIC / IELTS / DELE / Goethe / DELF. Chaque message est corrigé (« ✏️ Corrections » avec la règle). |
| 🎓 **Enseignant de toute matière** | Maths, physique, chimie, SVT, histoire, philo, économie, droit, compta, programmation… Méthode socratique (il guide au lieu de donner la réponse), calculs vérifiés en Python, fiches de révision, quiz, sujets d'examen corrigés, plan de révision avec rappels. |
| 🗂️ **Secrétaire complet** | Agenda avec rappels automatiques et alerte de conflit, export `.ics` (Google Agenda, Outlook, iPhone), carnet d'adresses, liste de tâches avec priorités et échéances, factures et devis Word aux totaux exacts (FR/EN/ES/DE), courriers, comptes rendus. |
| 🧠 **Cartes mémoire** | Le vocabulaire et les notions vues en cours deviennent des cartes révisées par répétition espacée (onglet **Apprendre**, avec écoute de la prononciation). Suivi de progression et points faibles. |
| 🎙️ **Voix façon Jarvis** | Micro en français, anglais, espagnol ou allemand (ou automatique) ; chaque phrase est lue avec une voix de SA langue ; la lecture commence pendant que ZEUS écrit ; **conversation continue** (il réécoute après avoir parlé) ; « stop » le coupe. Sur Telegram, un vocal reçoit une réponse vocale. Transcription Whisper en détection automatique de langue. |
| 🎭 **Rôles par conversation** | Menu **Rôle** en haut d'une conversation, ou simplement : « sois mon prof d'espagnol », « mode secrétaire ». Sur Telegram : `/prof anglais B1`, `/enseignant maths`, `/secretaire`, `/assistant`. |
| 🔑 **Fichier `.env`** | Les clés (ANTHROPIC_API_KEY, GROQ_API_KEY…) peuvent rester dans `.env` ; une clé Claude suffit à tout brancher au premier démarrage. |
| 🛠️ **Correctifs** | Lanceur Windows réparé (il ne démarrait plus ZEUS), tests réparés sous Windows, documents Word avec de vrais tableaux. 108 tests automatiques. |

### Nouveautés de la version 1.1

| | |
|---|---|
| 🔔 **Surveillance du téléphone** | Déclencheurs sur les notifications (appli, expéditeur, mots) : ZEUS te prévient ou agit seul. |
| ☀️ **Brief du matin** | Météo de ta ville, messages importants, rendez-vous, dossiers, 3 priorités — à la demande ou chaque jour. |
| ⚡ **Puissance maximale** | Claude Opus 5.5 + Fable 5.1 + Haiku 5.5 en un clic, cache optimisé, compteur de dépenses et plafond mensuel, choix du cerveau par conversation. Connecteur Claude mis à jour (API 2026-10-21). |
| 📱 **Commandes directes** | Wi-Fi, Bluetooth, données, luminosité, volume, silencieux, ne pas déranger, alarmes, minuteurs, agenda — sans passer par l'écran. |
| 🎯 **Captures annotées** | Les modèles qui voient reçoivent l'écran avec des repères numérotés sur chaque bouton : moins d'erreurs de clic. |
| 📨 **Canal SMS** | ZEUS reçoit et répond aux SMS avec ton propre téléphone : le guichet devient accessible sans internet ni smartphone. |
| ⚙️ **Scripts outillés** | Dans un script Python, `from zeus_outils import outil` appelle n'importe quel outil : 50 messages en une seule étape. |
| 🔌 **ZEUS serveur MCP** | `python zeus.py mcp` : Claude Desktop, Cursor, VS Code, Hermes… pilotent ton téléphone via ZEUS. |
| ✨ **Compétences par lien** | Installe une compétence (SKILL.md, GitHub…) en collant son lien, après une vérification de sécurité. |
| 🛡️ **Correctif** | La détection des applis financières se déclenchait à tort sur la plupart des applis : corrigé. |

---

## 1. Installer (5 minutes)

### Windows
1. Installe **Python 3.10 ou plus récent** depuis <https://www.python.org/downloads/>
   (coche **« Add Python to PATH »** pendant l'installation).
2. Décompresse le dossier `ZEUS` où tu veux (par exemple dans `Documents`).
3. Double-clique sur **`CONFIGURER-ZEUS.bat`** (questions simples : ton prénom, ton modèle d'IA…).
4. Double-clique sur **`DEMARRER-ZEUS.bat`**. Ton navigateur s'ouvre sur ZEUS.

### Mac / Linux
```bash
cd ZEUS
python3 zeus.py setup      # configuration guidée
python3 zeus.py            # démarrer
```
(ou double-clique `demarrer-zeus.sh` après `chmod +x demarrer-zeus.sh`)

### Directement sur un téléphone Android (Termux)
Installe **Termux** et **Termux:API** depuis F-Droid, puis :
```bash
pkg install python android-tools termux-api
cd ZEUS && python zeus.py setup && python zeus.py --lan
```
Avec un modèle en ligne (Groq, OpenRouter, Claude…) car un téléphone est trop petit pour un gros modèle local.
Pour que ZEUS pilote l'écran du téléphone sur lequel il tourne : Options pour les développeurs →
**Débogage sans fil** → « Associer avec un code », puis `adb pair localhost:PORT CODE` et `adb connect localhost:PORT`.

---

## 2. Brancher le cerveau (le modèle d'IA)

### Puissance maximale (payant) — recommandé pour agir sur le téléphone et les longues missions

Dans `python zeus.py setup` choisis **1. PUISSANCE MAXIMALE**, ou dans l'interface : Réglages → Modèles →
**Puissance maximale — Claude → Configurer**. ZEUS branche trois cerveaux Claude d'un coup :

| Rôle dans ZEUS | Modèle | Prix officiel (par million de jetons : entrée / sortie / relu du cache) |
|---|---|---|
| Cerveau principal (voit les images) | Claude Opus 5.5 | 4 $ / 20 $ / 0,20 $ |
| Mode maximum, choisi par conversation | Claude Fable 5.1 | 10 $ / 50 $ / 0,25 $ |
| Tâches de fond (résumés, classement, apprentissage) | Claude Haiku 5.5 | 0,10 $ / 0,50 $ / 0,01 $ |

1. Crée un compte sur <https://platform.claude.com>, puis **Settings → Billing → Buy credits** (crédits
   prépayés, valables un an, non remboursables). Pour commencer, 20 à 30 $ suffisent.
2. **Settings → API keys → Create key**, en choisissant un *workspace*. Copie la clé (`sk-ant-…`) : elle ne
   s'affiche qu'une fois.
3. Colle-la dans ZEUS et choisis ton **plafond mensuel**.

**Ce que ça coûte vraiment** (estimations) : une question simple ≈ 1 à 3 centimes avec Opus ; une tâche de
10 étapes sur le téléphone ≈ 0,20 à 0,30 $ avec Opus, ≈ 0,50 $ en mode maximum (Fable). Deux choses font
baisser la facture :
- **le cache** : à chaque étape, la partie déjà envoyée (consignes, outils, conversation) est relue depuis le
  cache de Claude, facturée 20 fois moins cher que la première fois (Opus 5.5) ;
- **le plafond** : Réglages → Modèles → Dépenses. ZEUS compte chaque centime (par modèle, par jour) ; à 80 % du
  plafond il te prévient, à 100 % il passe sur tes modèles gratuits (ou s'arrête, au choix). Sur Telegram :
  `/depenses`. Le coût de chaque réponse s'affiche à côté du nom du modèle.

**Mode maximum** : en haut d'une conversation, menu **Cerveau → Maximum** (ou `/max` sur Telegram) pour
confier une mission difficile à Fable 5.1 ; `/normal` pour revenir à Opus.

### Les autres choix

| Choix | Pour qui | Comment |
|---|---|---|
| **Ollama (local)** | Gratuit, 100 % privé, marche sans internet | Installe <https://ollama.com>, puis `ollama pull qwen3:8b`. ZEUS le détecte **tout seul** au démarrage. |
| **Claude (un seul modèle)** | Si tu veux choisir toi-même | Clé sur <https://platform.claude.com>, par exemple `claude-sonnet-5-5` (2 $ / 10 $) |
| **Groq** | Très rapide | Clé sur <https://console.groq.com> (sert aussi pour la voix : 0,04 $ par heure d'audio avec `whisper-large-v3-turbo`) |
| **OpenRouter** | Des centaines de modèles avec une seule clé | <https://openrouter.ai> |
| OpenAI, Gemini, Mistral, DeepSeek, LM Studio, llama.cpp | — | Réglages → Modèles → Ajouter un modèle |

**Quel modèle local selon ton PC ?**
- 8 Go de RAM : `qwen3:4b` (correct pour les tâches simples)
- 16 Go : `qwen3:8b` (bon équilibre)
- 32 Go ou carte graphique : `qwen3:14b` ou `qwen3:30b`
- Pour voir les images (captures d'écran, photos de documents) : ajoute un modèle « vision », par exemple
  `ollama pull qwen2.5vl:7b`, ou utilise Claude/GPT/Gemini qui voient les images.

Astuce : garde un modèle local (Ollama) en plus de Claude : il sert de secours en cas de panne internet et
prend le relais quand le plafond du mois est atteint. **Ordre de bascule** : le cerveau principal, puis les autres
modèles en ligne (Groq, Claude…), puis les modèles locaux en dernier. Délai de panne réglable par modèle avec
`"timeout"` (secondes ; défaut 90 en ligne, 600 en local). Pour un autre fournisseur payant (OpenAI, Gemini…),
indique ses prix dans la fiche du modèle pour que le compteur de dépenses le suive.

---

## 3. Brancher ton téléphone Android

```bash
python zeus.py phone
```
Cet assistant installe ADB (l'outil officiel de Google) si besoin, puis te guide :
1. Sur le téléphone : **Paramètres → À propos du téléphone → touche 7 fois « Numéro de build »**.
2. **Options pour les développeurs → Débogage USB** (et **Débogage sans fil** pour te passer du câble).
3. Branche le câble USB et accepte « Autoriser le débogage USB » (coche « Toujours autoriser »).
4. Pour écrire avec accents et emoji, ZEUS propose d'installer le clavier libre **ADBKeyboard**
   (il ne l'active que le temps d'écrire, puis remet ton clavier).

Ensuite, dis simplement : « lis mes notifications », « envoie un WhatsApp à Maman : j'arrive »,
« appelle Patrick », « coupe le Bluetooth », « mets une alarme à 6h30 du lundi au vendredi »,
« minuteur 10 minutes », « ajoute réunion budget demain à 9h à mon agenda », « ouvre YouTube et mets… ».
L'onglet **Téléphone** de l'interface montre l'écran en direct (tu peux le toucher depuis le PC) et propose les
**commandes directes** : interrupteurs Wi-Fi, Bluetooth, données, silencieux…, curseurs de luminosité et de volume,
alarme et minuteur.

**Surveillance (onglet Tâches, ou simplement en parlant à ZEUS)** : « préviens-moi si mon patron m'écrit sur
WhatsApp », « si je reçois un SMS contenant *urgent*, appelle-moi », « quand je reçois de l'argent par M-Pesa,
note-le ». ZEUS lit les notifications toutes les 20 secondes ; il te prévient (interface, Telegram…) ou exécute la
tâche demandée. Les messages surveillés restent des informations : ZEUS n'obéit jamais à leur contenu.

**Brief du matin (onglet Tâches)** : indique ta ville, coche « Chaque jour à 07:00 », ou dis « fais mon brief ».

**iPhone :** Apple interdit ce type de contrôle. Avec un iPhone, tu peux parler à ZEUS (Telegram, interface web),
mais il ne peut pas piloter l'écran de l'iPhone.

---

## 4. Parler à ZEUS depuis ton téléphone

- **Telegram (le plus simple, marche partout, messages vocaux compris)** : crée un bot avec **@BotFather**
  (`/newbot`), colle le jeton dans Réglages → Canaux, redémarre ZEUS, puis envoie au bot le **code d'appairage**
  affiché. Ton compte est alors reconnu comme propriétaire ; les validations arrivent avec des boutons
  « Autoriser / Refuser ».
- **Interface web sur le même Wi-Fi** : Réglages → Accès → « Autoriser l'accès depuis le réseau local », redémarre
  (ou lance `python zeus.py --lan`), puis **scanne le QR code** affiché (dans l'interface ou dans le terminal).
  Ajoute la page à l'écran d'accueil. Sous Windows, accepte la demande du pare-feu pour les réseaux privés.
- **Par SMS, sans internet** : Réglages → Canaux → SMS. ZEUS lit les SMS reçus sur ton téléphone Android et répond
  avec lui (chaque SMS envoyé est facturé par ton opérateur, comme d'habitude). Indique tes numéros dans « Tes
  numéros de téléphone » pour que ZEUS te reconnaisse quand tu lui écris depuis un autre téléphone. Les numéros
  courts et les expéditeurs nommés (opérateurs, banques, M-Pesa) ne reçoivent jamais de réponse, et le nombre de
  réponses par numéro et par heure est limité.
- **Le micro sur le téléphone** : lance `python zeus.py --lan --https` (ou coche Réglages → Accès → HTTPS) ; au
  premier accès, le navigateur du téléphone prévient que le certificat est « non sécurisé » (il a été créé par ZEUS,
  sur ton PC) : « Paramètres avancés » → « Continuer ». Le micro, le mode Jarvis et la prononciation marchent ensuite.
- **La voix** : sur PC avec Chrome ou Edge, le micro marche tout de suite, en **français, anglais, espagnol ou
  allemand** (menu 🎙️ sous la zone de saisie ; « Langue auto » suit la langue du cours en mode professeur).
  Coche **Conversation continue** pour discuter comme avec Jarvis : après chaque réponse, ZEUS réécoute tout seul ;
  dis « merci » ou « c'est tout » pour terminer, « stop » pour le couper. **Mains libres** : « Zeus, … ».
  Astuce : les voix « Natural » / « Online » de Microsoft Edge et les voix Google de Chrome sont les plus naturelles ;
  ZEUS les choisit automatiquement quand elles sont installées.
  Sur téléphone, le navigateur exige une adresse HTTPS pour le micro : utilise Telegram (vocaux), ou un tunnel
  HTTPS gratuit : `cloudflared tunnel --url http://localhost:7777`.
  Pour transcrire les vocaux Telegram, ajoute une clé Groq (gratuite) ou OpenAI dans Réglages → Voix
  — ou réutilise celle d'un modèle déjà branché, ZEUS la trouve tout seul.

---

## 5. Le guichet administratif (le métier de NEO, en mieux)

Active-le dans Réglages → Guichet et donne le nom de ton organisation. Ensuite, quand **un usager** écrit sur
WhatsApp, Telegram, par e-mail ou **par SMS** (même avec un simple téléphone à touches) :
1. ZEUS identifie la démarche et ouvre un dossier (`D-2026-0001`…).
2. Il donne la liste exacte des pièces à envoyer.
3. Chaque photo ou PDF reçu est **lu (OCR) et classé automatiquement** ; ZEUS repère les pièces **expirées**,
   **trop anciennes** (justificatif de plus de 3 mois…), **illisibles** ou **en double**.
4. Il dit à l'usager ce qui manque, prépare ou envoie les **relances** automatiquement.
5. Dossier complet → tu es prévenu ; tu valides ou rejettes dans l'onglet **Dossiers** (l'usager est informé).
6. En cas de doute, de réclamation ou d'urgence, ZEUS **passe la main à un humain**, et tu peux répondre toi-même
   depuis l'interface.

10 démarches sont fournies comme modèles (acte de naissance, passeport, carte d'identité, casier judiciaire,
certificat de résidence, inscription scolaire, candidature, permis de construire, mariage, demande générale).
Adapte-les à ton pays : dis simplement à ZEUS « crée une démarche bourse d'études avec diplôme, relevé de notes
et photo », ou dépose un fichier JSON dans `data/procedures/`.

**Important :** les usagers externes n'ont accès **qu'aux outils du guichet**. Jamais à ton téléphone,
ton PC, tes fichiers ni à ta mémoire, même s'ils essaient de piéger ZEUS par message.

WhatsApp Business (API officielle de Meta) : il faut un compte Meta Business, et une adresse HTTPS publique pour
le webhook (`https://…/webhook/whatsapp`, par exemple avec Cloudflare Tunnel). Sans cela, ZEUS peut quand même
envoyer des WhatsApp depuis **ton** téléphone.

---

## 6. Sécurité : ce que ZEUS fait seul, et ce qu'il te demande

Trois niveaux d'**autonomie** (Réglages, ou `/autonomie` sur Telegram) :

| | Lire, chercher | Modifier en local (fichiers, gestes sur le téléphone) | Envoyer, appeler, publier | Supprimer, commandes sensibles | **Argent** |
|---|---|---|---|---|---|
| Prudent | seul | demande | demande | demande | **demande** |
| Équilibré (défaut) | seul | seul | demande | demande | **demande** |
| Autonome | seul | seul | seul | seul | **demande** |

- **Argent** : paiement, Mobile Money (M-Pesa, Orange Money, Airtel Money…), code PIN, codes USSD (`*…#`),
  formulaires de carte bancaire → ZEUS demande **toujours** confirmation (réglage modifiable, déconseillé).
- Les commandes catastrophiques (formater un disque, tout effacer…) demandent toujours confirmation.
- Les suppressions vont dans la **corbeille ZEUS** (`data/trash`), récupérables.
- Tout contenu externe (pages web, e-mails, documents, écran du téléphone, messages de tiers) est traité comme une
  information, jamais comme un ordre.
- **Scripts** : un script qui appelle les outils de ZEUS (`zeus_outils`) passe par les mêmes validations qu'un appel
  normal ; son accès se ferme à la fin du script.
- **Serveur MCP** : l'application cliente (Claude Desktop…) te demande ton accord avant chaque action ; ZEUS
  bloque en plus, toujours, l'argent et les actions irréversibles — celles-là se font depuis ZEUS.
- **Compétences installées par lien** : vérifiées avant installation (téléchargement de scripts, contournement des
  consignes, envoi d'argent ou de secrets, fichiers d'identifiants…). En cas d'alerte, rien n'est installé sans
  ton accord explicite.
- L'interface est protégée par un **jeton** ; tout est **journalisé** (onglet Journal).
- Tes données restent **sur ton ordinateur** (`data/`). Avec un modèle local, rien ne sort de ta machine.

---

## 7. Exemples

- « Fais mon brief du matin »
- « Lis mes notifications et dis-moi ce qui est urgent »
- « Envoie un WhatsApp à Maman : j'arrive dans 30 minutes »
- « Préviens-moi si quelqu'un m'écrit le mot *urgent* »
- « Mets le téléphone en silencieux et réveille-moi à 6h »
- « Envoie à chacun de ces 20 numéros le message de rappel de la réunion » (un seul script, 20 envois)
- « Mon frère Patrick, c'est le 081 555 1234 » (il le retient)
- « Cherche le taux du dollar en francs congolais aujourd'hui »
- « Range les PDF de mon dossier Téléchargements par thème »
- « Fais un tableau Excel de mes dépenses à partir de ces reçus » (avec les photos jointes)
- « Connecte-toi sur le site de l'université et télécharge mon relevé de notes »
- « Chaque matin à 7h, résume mes e-mails non lus et mes dossiers incomplets »
- « Montre-moi les dossiers incomplets et prépare les relances »
- « Fais trois recherches en parallèle sur … et compare »

---

## 8. Aller plus loin

- **Compétences** : ZEUS enregistre les méthodes qui marchent (onglet Mémoire). Format `SKILL.md`, compatible avec
  les compétences d'autres agents : dépose un dossier `nom/SKILL.md` dans `data/skills/`, ou colle le lien d'une
  compétence dans Mémoire → « Installer » (ou dis « installe la compétence https://github.com/… »).
- **ZEUS pour tes autres IA (serveur MCP)** : `python zeus.py mcp --print-config` affiche le bloc à coller dans
  la configuration de Claude Desktop (Réglages → Développeur → Modifier la configuration), Cursor, VS Code… :
  ```json
  {"mcpServers": {"zeus": {"command": "python", "args": ["C:\\Users\\moi\\Documents\\ZEUS\\zeus.py", "mcp"]}}}
  ```
  L'application voit alors les outils du téléphone, des dossiers, de l'ordinateur et du navigateur, plus
  `zeus_ask` pour confier une tâche entière à ZEUS (avec sa mémoire). Choix des outils exposés : Réglages →
  « ZEUS pour tes autres IA ».
- **Scripts** : pour une action répétée, ZEUS écrit un script qui appelle ses propres outils :
  ```python
  from zeus_outils import outil
  for nom in ["Maman", "Patrick", "Bureau"]:
      outil("phone_send_whatsapp", to=nom, message="Réunion demain à 9h")
  ```
- **Serveurs MCP** (extensions : Google Drive, GitHub, bases de données…) : Réglages → Serveurs MCP, par exemple
  ```json
  {"fichiers": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:/Users/moi/Documents"], "trust": "read"}}
  ```
- **Navigateur piloté** (facultatif) : `pip install playwright` puis `python -m playwright install chromium`.
- **Meilleure lecture des PDF** (facultatif) : `pip install pypdf`. **Photos de documents** : installe Tesseract OCR.
- **Clavier/souris du PC** (facultatif, Mac/Linux) : `pip install pyautogui`.
- **Démarrage automatique** : Windows → Planificateur de tâches « À l'ouverture de session » sur `DEMARRER-ZEUS.bat` ;
  Termux → application Termux:Boot.

## 8 bis. Apprendre et se faire assister

**Cours de langue** : menu **Rôle → Prof d'anglais** (ou espagnol, allemand, français), ou dis « sois mon prof
d'espagnol ». ZEUS teste ton niveau, puis tu choisis : conversation libre, jeu de rôle (« simule un entretien
d'embauche en anglais »), grammaire, vocabulaire, exercices, dictée… Écris ou parle dans la langue apprise : il
répond, puis corrige tes fautes en expliquant la règle. Les mots nouveaux vont dans tes cartes mémoire.

**Révisions de cours** : **Rôle → Enseignant**, choisis la matière et le niveau (« physique, terminale »), ou
envoie la photo d'un exercice. ZEUS t'aide à trouver toi-même (indices progressifs), corrige, fait des fiches, des
quiz notés et un planning de révision avec rappels. L'onglet **Apprendre** montre les cartes à réviser et ta progression.

**Prononciation** : onglet **Apprendre → 🎙️ Prononciation** (ou **🔁 Répéter** sous une réponse du prof). Écoute la
phrase, clique **À toi**, parle : chaque mot s'affiche en vert (juste), orange (presque) ou rouge (manquant), avec un
score sur 100. Le score mesure ce que la reconnaissance vocale comprend : un bon repère d'intelligibilité, pas une
analyse phonétique. **✍️ Dictée** : ZEUS lit, tu écris, il note.

**Jeux de rôle et défis** : **🎭 Jeu de rôle** (choisis la scène et la langue), **💪 Défi sur mes faiblesses** (ZEUS
te fait retravailler tes erreurs les plus fréquentes). Sur Telegram : `/jeu anglais restaurant`, `/defi espagnol es.ser_estar`.

**Interprète** : **Rôle → 🌍 Français ↔ Anglais** (ou espagnol, allemand), puis **🎙️ Jarvis** : la première personne
parle en français, ZEUS traduit à voix haute en anglais, puis écoute la réponse en anglais et la traduit en français,
et ainsi de suite. Deux boutons sous l'orbe permettent de choisir qui parle. Sur Telegram : `/interprete anglais`.

**Secrétariat** : **Rôle → Secrétaire**, ou directement : « ajoute réunion budget jeudi à 10h avec Paul, rappelle-moi
30 min avant », « enregistre Paul Mbala, comptable, 0812345678 », « fais une facture de 1 200 $ à la société Kivu pour
un site web, TVA 16 % », « réponds au dernier e-mail de la banque », « rédige le compte rendu de la réunion ».
L'onglet **Agenda** regroupe rendez-vous, tâches et contacts.

**Test de niveau** : **Apprendre → Test de niveau**, choisis la langue. Réponds sans chercher (au hasard si tu ne sais
pas : le test le prévoit). Il s'arrête tout seul dès qu'il est sûr de ton niveau, puis propose de commencer le cours à ce
niveau. Le test porte sur l'écrit (grammaire, vocabulaire) ; l'oral et la rédaction s'évaluent en cours avec ZEUS.

**Mes documents** : onglet **Documents** → colle le chemin d'un dossier (ex. `C:\Users\moi\Documents\Cours`) et
clique **Ajouter**, ou **Déposer des fichiers**. Cherche directement, ou clique **Demander à ZEUS** : il répond à partir
de tes fichiers et cite `[document, p. X]`. Un PDF scanné (image) n'a pas de texte : installe Tesseract pour l'OCR,
sinon ZEUS le signale « illisible ».

**Brancher Google Agenda** : sur ordinateur, Google Agenda → ⚙️ Paramètres → clique ton agenda à gauche → « Intégrer
l'agenda » → copie l'**Adresse secrète au format iCal** → colle-la dans **Agenda → Google Agenda et Outlook**.
**Outlook.com** : ⚙️ → Calendrier → Calendriers partagés → Publier un calendrier → « Peut afficher tous les détails »
→ copie le lien **ICS**. ZEUS lit ces agendas mais ne les modifie pas : pour ajouter un rendez-vous de ZEUS à Google ou
Outlook, clique **+ Google** ou **+ Outlook** sous le rendez-vous.

## 9. Commandes

```
python zeus.py              démarrer (interface + canaux + tâches)
python zeus.py --lan        démarrer, accessible depuis ton téléphone sur le même Wi-Fi
python zeus.py setup        configuration guidée
python zeus.py chat         discuter dans le terminal
python zeus.py phone        brancher / tester le téléphone Android
python zeus.py doctor       diagnostic complet
python zeus.py mcp          ZEUS comme serveur MCP (pour Claude Desktop, Cursor, VS Code, Hermes…)
python zeus.py mcp --print-config   bloc de configuration à coller dans ces applications
python zeus.py raccourci    icône ZEUS sur le bureau (Windows) ou dans le menu des applications (Linux)
python zeus.py test         tests automatiques (simulateurs inclus : pas besoin de téléphone ni de modèle)
python zeus.py mesure       vitesse réelle des modèles (--local pour inclure Ollama, --modele groq pour un seul)
python zeus.py pedagogie    qualité des corrections du professeur de langue (--langue en pour une seule langue)
python zeus.py cas          erreurs signalées avec « ZEUS s'est trompé » (--statut N traite pour en classer une)
python zeus.py mesure --mini  vitesse du mini-cerveau local (secours quand Groq est bloqué)
bash installer-raspberry.sh ZEUS jour et nuit sur un Raspberry Pi (guide : RASPBERRY-PI.md)
```

## 10. Comparaison honnête

| | NEO (prototype) | Hermes Agent | ZEUS |
|---|---|---|---|
| Installation | — | script d'installation (Python, Node…) | **Python seul, aucune dépendance** |
| Modèles | un modèle local | nombreux fournisseurs | local + cloud, **bascule automatique**, mode outils en texte pour les petits modèles |
| Piloter le téléphone | non | non | **Android complet** : écran (captures annotées), gestes, applis, appels, SMS, WhatsApp, notifications, réglages, alarmes, agenda |
| Agir sans qu'on demande | ? | tâches planifiées | tâches planifiées, **surveillance des notifications** avec déclencheurs, brief du matin |
| Dossiers administratifs | démonstration | non | **oui** : démarches, classement, contrôles, relances, validation, export, journal |
| Navigateur | ? | oui | oui (facultatif) |
| Canaux | mail, WhatsApp | **plus de 20** | web + voix, Telegram, WhatsApp, e-mail, **SMS sans abonnement**, terminal |
| Mémoire, compétences | ? | oui | oui (SKILL.md compatible) |
| Sécurité | ? | listes blanches, validations | confiance par interlocuteur, 3 autonomies, **garde-fou argent/USSD**, corbeille, journal |
| Interface | démonstration | terminal + applis | **tableau de bord web PC/mobile**, miroir du téléphone, QR code |
| Extensions | — | MCP + hub de compétences | client **et serveur** MCP, SKILL.md installables par lien, scripts qui appellent les outils |
| Rôles | — | — | **professeur de langue** (FR/EN/ES/DE), **enseignant** toute matière, **secrétaire**, assistant expert |
| Voix | — | vocaux sur certaines messageries | micro 4 langues, voix adaptée à chaque phrase, conversation continue, réponses vocales Telegram |

Et face à Claude ou ChatGPT utilisés directement ? ZEUS ne remplace pas leur intelligence : il **s'en sert comme
cerveau** (Claude Opus 5.5 / Fable 5.1 recommandés) et y ajoute ce qu'une simple discussion ne fait pas : agir sur
ton téléphone et ton PC, une mémoire qui t'appartient, l'agenda, les rappels, les cartes de révision, la surveillance
des notifications, tout en local. Avec un petit modèle local, les réponses sont moins bonnes qu'avec Claude.

Là où Hermes reste devant : le nombre d'intégrations (messageries, environnements isolés Docker/SSH, hub de
compétences) et une communauté plus grande. La puissance réelle de ZEUS dépend aussi du modèle branché :
un petit modèle local fait bien les tâches simples, un grand modèle (Claude, GPT…) réussit les longues missions.

## 11. Limites connues

- iPhone : pas de contrôle de l'écran (restriction d'Apple).
- **Modèle local sur un PC sans carte graphique** : mesuré sur un PC de ce type, `mistral:7b` lit environ 11 jetons
  par seconde et `llama3.2:3b` environ 18 : il faut 4 à 8 minutes pour lire les consignes et les outils de ZEUS avant
  la première réponse. Ensuite, comme les consignes ne changent plus d'un message à l'autre, Ollama les garde en
  mémoire : un message suivant a été lu en 3 secondes au lieu de 4 minutes. Les petits modèles font aussi plus
  d'erreurs avec les outils (vu en essai : appels inutiles). Sur un tel PC, prends un modèle en ligne (Groq est gratuit
  et très rapide, Claude est le plus intelligent) et garde le modèle local en secours. Le mode interprète (consignes
  très courtes, sans outils) et les commandes instantanées restent utilisables dans tous les cas.
- Minuteurs vocaux : ils vivent dans la page ouverte. Pour une alarme qui doit sonner même ZEUS fermé, demande
  « mets une alarme » (elle est réglée sur le téléphone).
- Voix dans l'interface web : la reconnaissance vocale du navigateur exige Chrome ou Edge (sinon ZEUS enregistre
  et transcrit avec Whisper si une clé Groq/OpenAI est configurée). Elle écoute une langue à la fois : choisis-la
  dans le menu 🎙️ (ou laisse « auto » suivre le cours).
- Certaines applis (banques, jeux, vidéos protégées) bloquent la lecture de l'écran ou les captures : ZEUS te
  le dit et te demande d'agir.
- Lecture des SMS et des contacts par ADB refusée sur certains modèles : ZEUS passe alors par les applis
  à l'écran.
- WhatsApp Business : après 24 h sans message de l'usager, Meta impose des modèles de message approuvés.
- Réglages directs : selon la marque et la version d'Android, certaines commandes (mode avion, données mobiles)
  sont refusées par ADB ; ZEUS le dit et passe par l'écran. La lampe torche passe toujours par l'écran.
- SMS : si Android refuse la lecture de la boîte de réception par ADB, ZEUS lit les SMS dans les notifications
  (le texte complet d'un très long SMS peut alors être tronqué). Les MMS (photos) ne sont pas lus.

- **Mes documents** : recherche par mots-clés (sans accents, pluriels compris), pas par le sens : « salaire » ne
  trouve pas « rémunération ». Si rien ne sort, essaie un synonyme. Les PDF scannés demandent Tesseract (OCR) ; au-delà
  de 80 pages par PDF et de 40 Mo par fichier, la fin n'est pas indexée.
- **Agendas Google / Outlook** : lecture seule (l'écriture directe demanderait de créer une application chez Google ou
  Microsoft). Les modifications faites dans Google apparaissent dans ZEUS en 15 min au plus. Sous Windows, si un
  rendez-vous récurrent est décalé d'une heure, installe la base des fuseaux : `pip install tzdata`. Le flux .ics de
  ZEUS n'est joignable que sur ton réseau (lance `python zeus.py --lan`) : Google ne peut pas s'y abonner depuis
  internet.
- **Test de niveau** : 30 questions par langue ; refaire le test plusieurs fois le même jour finit par reposer des
  questions déjà vues.

## 12. Dépannage

- **« Aucun modèle »** : installe Ollama et lance `ollama pull qwen3:8b`, ou ajoute une clé dans Réglages → Modèles,
  puis clique **Tester**.
- **Claude répond « workspace »** : ta clé n'est liée à aucun workspace. Recrée-la en choisissant un workspace
  (Settings → API keys), ou indique l'identifiant `wrkspc_…` dans la fiche du modèle.
- **Claude répond « credit balance is too low »** : ajoute des crédits (Settings → Billing → Buy credits).
- **« Plafond du mois atteint »** : augmente-le dans Réglages → Modèles → Dépenses.
- **Téléphone non détecté** : essaie un autre câble (certains ne font que charger), accepte l'autorisation sur
  l'écran, relance `python zeus.py phone`.
- **Le port 7777 est pris** : `python zeus.py --port 7788`.
- **Diagnostic complet** : `python zeus.py doctor`. Les journaux sont dans `data/logs/zeus.log`.

## Structure du projet

```
zeus.py                  lanceur (serve, setup, chat, phone, doctor, mcp, test)
zeuscore/
  core.py                orchestrateur (sessions, canaux, notifications)
  agent.py               boucle agentique, sous-agents, compression du contexte, apprentissage
  llm.py                 connecteurs Ollama / OpenAI-compatible / Anthropic, routage et bascule
  security.py            confiance, autonomie, validations, garde-fous
  store.py               base SQLite (conversations, mémoire, compétences, dossiers, journal)
  dossiers.py            moteur de dossiers administratifs + procedures/*.json
  scheduler.py           tâches planifiées (français naturel et cron)
  mcp.py                 client MCP
  mcp_server.py          ZEUS comme serveur MCP (stdio)
  watcher.py             surveillance des notifications du téléphone, déclencheurs
  modes.py               rôles (assistant, secrétaire, prof de langue, tuteur, interprète, formateur, dirigeant,
                         RH, chercheur), langues, détection de langue, consignes de chaque rôle
  tlscert.py             certificat HTTPS autosigné en Python pur (micro du téléphone sur le Wi-Fi)
  tools/learning.py      rôle de la conversation, cartes mémoire (répétition espacée), progression, corrections
                         revérifiées et journal d'erreurs, série et objectifs, phrases de prononciation, export Anki
  tools/secretary.py     agenda + rappels + .ics, carnet d'adresses, tâches, factures et devis, agendas externes
  kb.py + tools/knowledge.py   bibliothèque : indexation de tes documents (SQLite FTS5) et recherche avec citations
  calendar_sync.py       abonnement aux agendas Google / Outlook (.ics, RRULE), liens « + Google » / « + Outlook »
  placement.py           test de niveau adaptatif (A1 → C2) ; placement_bank.py : les questions
  costs.py               compteur de dépenses des modèles payants, plafond mensuel
  brief.py               brief du matin
  bridge.py              pont d'outils pour les scripts (bridge_client/zeus_outils.py)
  tools/                 outils : fichiers, shell, web, documents, téléphone, ordinateur, navigateur…
  channels/              web (API + SSE), Telegram, WhatsApp, e-mail, SMS, terminal
  ui/                    interface web (HTML/CSS/JS sans dépendance)
tests/                   tests + simulateurs (faux modèle, faux téléphone ADB, faux serveur MCP)
data/                    créé au premier lancement : réglages, base, fichiers, journaux (reste sur ta machine)
```
