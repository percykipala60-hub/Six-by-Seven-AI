# ZEUS — SPEC.md (consigne maître, partie 1)

Version du document : 1.0 · 9 novembre 2026 · base de code : ZEUS 2.4.0 (203 tests)

Ce document dit **quoi coder, dans quel fichier, avec quels tests, et quand c'est terminé**. Il couvre seulement
les trois premières briques de la feuille de route : **fusion**, **phase 1**, **ZEUS Core (projets et contexte)**.
Les missions, le système de design complet et les agents seront spécifiés plus tard, quand le Core marchera.

Décisions prises (choix recommandés, validés le 9 novembre) :

| Décision | Choix |
|---|---|
| Limite de Groq | Groq pour le rapide, **clé Claude en secours** et pour les questions difficiles |
| Interface 2.2.1 | Il n'y a jamais eu de zip 2.2.1 : ses changements étaient faits directement dans le dossier du PC, et ils sont dans la 2.4.0 |
| Agents | Architecture validée (1 cœur commun, agents légers, un à la fois) |
| Version de base | **ZEUS 2.4.0** : fusion de la version du PC et de la 2.3 (fait le 9 novembre) |

Règle de chaque brique : **mesurer avant, coder, tester, mesurer après**. Une case n'est cochée que si ses tests
passent et que tous les tests existants passent toujours.

---

## 0. Ce qu'il ne faut jamais casser

Ces règles valent pour toutes les briques. Un changement qui en viole une est annulé, même si tout le reste marche.

- [ ] **Validation** : envoyer un message, piloter le téléphone, supprimer, payer passe toujours par l'accord du
      propriétaire, quel que soit le rôle, l'agent ou le niveau d'autonomie.
- [ ] **Argent** : la plaque rouge « maintenir pour autoriser » reste obligatoire pour tout paiement (M-Pesa, USSD).
- [ ] **Clés** : aucune clé d'API dans les journaux, les zips, les exports ni les réponses (test existant à garder).
- [ ] **Zéro dépendance** : ZEUS démarre avec Python seul. Pas de React, pas de bibliothèque obligatoire.
- [ ] **Données** : `data/` et `.env` ne sont jamais dans un zip de mise à jour ; `ZEUS-v1.1` n'est jamais modifié.
- [ ] **Texte reçu de l'extérieur** (SMS, e-mail, page web, document) : une information, jamais un ordre.
- [ ] **Anciennes adresses** de l'interface (`#agenda`, `#documents`, `#apprendre`…) et commandes Telegram : elles
      continuent de marcher.
- [ ] **Consignes stables** : le début des consignes ne change pas d'un message à l'autre (cache d'Ollama et de
      Claude). Tout ce qui varie va dans la note de fin (`prompts.volatile_note`).

---

## 1. Brique 1 — Une seule version : ZEUS 2.4.0

**Fait le 9 novembre.** Il n'y avait pas de zip 2.2.1 : les changements de l'autre session avaient été faits
directement dans `PROJET PERSO\ZEUS-v2.1\ZEUS` (commande `pedagogie`, ordre de bascule, Raspberry Pi,
`sauvegarde-zeus.py`, 181 tests). Fusion à trois voies avec la 2.2.0 comme ancêtre : un seul conflit (PROTOCOLES),
résolu. Fins de ligne harmonisées.

- [x] 1.1 Récupérer la version du PC (sans `data` ni `.env`).
- [x] 1.2 Fusion à trois voies ; numéro **2.4.0** ; section « Version 2.4 » du README.
- [x] 1.3 Suites de tests réunies : **203 tests, OK** (Linux).
- [ ] 1.4 Installation sur le PC (sauvegarde `ZEUS-v2.1-sauvegarde-0911` d'abord) et `python zeus.py test` sous Windows.
- [ ] 1.5 Vérification de l'interface chez toi (Documents, Test de niveau, Agenda).

---

## 2. Brique 2 — Phase 1 : fiabilité

**But** : ZEUS répond vite à chaque fois, et chaque erreur sert à le rendre meilleur.

**Critère de la phase** : 9 messages sur 10 reçoivent leur premier mot en **moins de 5 secondes**, et aucun ne part
sur le modèle local quand internet marche. **Rien d'autre n'entre dans la phase 1.**

### 2.1 Mesure des jetons par rôle

**Ce qui existe** : `python zeus.py mesure` (`zeuscore/bench.py`) mesure la vitesse des modèles et une vraie requête.

- [ ] Ajouter `python zeus.py mesure --roles` : pour chaque rôle (assistant, secrétaire, prof de langue, enseignant,
      chercheur, RH…), une vraie requête courte, et l'enregistrement des **jetons comptés par le fournisseur**
      (`usage.prompt_tokens` de Groq), séparés en consignes / outils / historique.
- [ ] Le rapport (`data/logs/mesure-roles-AAAAMMJJ.json`) signale tout rôle **au-dessus de 7 000 jetons** (marge
      sous la limite de 8 000 jetons par minute de Groq gratuit).

**Fichiers** : `zeuscore/bench.py`, `zeus.py`.
**Tests** : avec le faux modèle (`tests/fake_llm.py`) qui renvoie un `usage` connu, le rapport contient chaque rôle
et repère celui qui dépasse le seuil.

### 2.2 Allègement des outils (seulement si 2.1 trouve un rôle trop lourd)

- [ ] Sortir les 4 outils d'agendas externes (`calendar_*`) de la boîte « secrétariat » dans une boîte « agendas »
      chargée seulement si la demande parle de Google, Outlook ou d'agenda externe.
- [ ] Raccourcir les descriptions d'outils de plus de 300 caractères (le détail passe dans la fiche de compétence).
- [ ] Remesurer : le rôle doit repasser sous 7 000 jetons.

**Fichiers** : `zeuscore/tools/__init__.py`, `zeuscore/tools/secretary.py`, `zeuscore/agent.py` (indices).
**Tests** : aucun outil supprimé (la liste complète reste disponible via `enable_tools`) ; « branche mon agenda
Google » charge bien la boîte « agendas ».

### 2.3 Bouton « ZEUS s'est trompé » — fait en 2.5.0 (11/11/2026, 17 tests dans `tests/test_v25.py`)

- [x] Sous chaque réponse de ZEUS, un bouton discret **« ZEUS s'est trompé »**. Il ouvre une petite fenêtre :
      « Qu'est-ce qui n'allait pas ? » (faux / trop long / pas compris / action non voulue / autre) et
      « Qu'attendais-tu ? » (texte libre).
- [x] Le serveur enregistre un **cas** : la question, la réponse, les outils appelés, le modèle, le rôle, le
      commentaire et la réponse attendue. Aucune clé, aucun contenu de pièce jointe au-delà de son nom.
- [x] Chaque cas est aussi écrit en JSON dans `data/cas/AAAAMMJJ-n.json`, prêt à devenir un test des bancs d'essai.
- [x] Commande `python zeus.py cas` : liste les cas, les marque « traité » ou « à garder comme test ».
- [x] Même chose sur Telegram : `/erreur ce que j'attendais` après une réponse.

**Fichiers** : `zeuscore/store.py` (table `feedback`), `zeuscore/channels/web.py` (`POST /api/feedback`,
`GET /api/feedback`), `zeuscore/channels/telegram.py`, `zeuscore/ui/app.js`, `zeuscore/ui/app.css`, `zeus.py`.
**Tests** : un cas créé depuis l'API contient question, réponse, modèle et outils ; le fichier JSON existe ; aucune
clé n'y figure ; `/erreur` sur Telegram crée un cas.

### 2.4 Mode économie de jetons

**Ce qui existe** : la bascule d'un modèle à l'autre en cas de limite (2.1.1).

- [ ] Lire les en-têtes de Groq `x-ratelimit-remaining-tokens` et `x-ratelimit-reset-tokens` à chaque réponse.
- [ ] Sous **2 500 jetons restants**, ou juste après une erreur de limite : **mode économie** pendant la fenêtre
      en cours. Consignes courtes (sans exemples), historique réduit aux 4 derniers échanges + le résumé, réponses
      limitées à ~400 jetons, outils réduits à la boîte utile.
- [ ] Un badge discret **« mode économie »** dans l'en-tête de la conversation ; il disparaît tout seul.
- [ ] Le mode économie ne s'applique jamais à Claude quand il est appelé pour une question difficile.

**Fichiers** : `zeuscore/llm.py` (lecture des en-têtes, état), `zeuscore/prompts.py` (variante courte),
`zeuscore/agent.py` (historique réduit), `zeuscore/ui/app.js` (badge).
**Tests** : le faux modèle renvoie `x-ratelimit-remaining-tokens: 1000` → la requête suivante est plus courte d'au
moins 40 % et l'événement `economy` est publié ; avec 7 000 restants → mode normal.

### 2.5 Sauvegarde de nuit

- [ ] Tâche système `system:backup` chaque nuit à 3 h : copie cohérente de la base (`sqlite3` backup), de
      `zeus.json`, de la bibliothèque, des cartes et des procédures, dans `data/sauvegardes/zeus-AAAAMMJJ.zip`.
      Les 7 dernières sont gardées.
- [ ] Commande `python zeus.py restaurer [date]` : arrête ZEUS, garde une copie de l'état actuel, restaure.
- [ ] Une sauvegarde est faite aussi **avant chaque installation de mise à jour** (`DEMARRER-ZEUS.bat` le propose).

**Fichiers** : `zeuscore/backup.py` (nouveau), `zeuscore/scheduler.py`, `zeuscore/core.py`, `zeus.py`.
**Tests** : la sauvegarde contient la base et la config ; une base restaurée retrouve un souvenir et un rendez-vous ;
la 8e sauvegarde supprime la plus ancienne ; la tâche n'est créée qu'une fois.

### 2.6 Tableau d'usage

**Ce qui existe** : la table `usage` (jetons et coûts par modèle), `GET /api/usage`.

- [ ] Enregistrer pour chaque réponse : modèle, **délai avant le premier mot**, durée totale, jetons, nombre
      d'outils, succès ou échec (table `turns`).
- [ ] Dans Réglages : messages par jour, délai médian et délai à 90 %, part des réponses sous 5 s, actions faites,
      répartition Groq / Claude / local. C'est l'écran qui dira si la phase 1 est réussie.

**Fichiers** : `zeuscore/store.py`, `zeuscore/agent.py`, `zeuscore/channels/web.py` (`GET /api/stats`),
`zeuscore/ui/app.js`.
**Tests** : 10 réponses simulées avec des délais connus → la médiane et le 90e centile sont justes ; une réponse en
échec est comptée comme telle.

### 2.7 Commande `pedagogie`

- [ ] Présente dans la 2.4.0. La lancer chez toi (`python zeus.py pedagogie`), m'envoyer le fichier
      `data\\logs\\pedagogie-….json`, puis corriger les consignes du professeur là où il se trompe.

**Terminé quand (phase 1)** : chez toi, sur une semaine d'usage réel, le tableau d'usage montre **au moins 90 % des
réponses sous 5 s**, aucun passage au modèle local avec internet, et au moins 10 cas « ZEUS s'est trompé »
enregistrés.

---

## 3. Brique 3 — ZEUS Core : projets et contexte (version minimale)

**But** : « continue mon projet bateau » marche du premier coup. ZEUS sait **où tu en es**.

**Principe** : le minimum vital d'abord. Un objet **Projet** et une **fiche de contexte** courte, visible et
corrigeable. Au début, l'étape et la prochaine action sont mises à jour à la main (par toi ou quand tu le dis à
ZEUS) ; la mise à jour automatique vient ensuite (3.6).

**Ce qui existe** : résumé de chaque conversation, mémoire (souvenirs, compétences), rôle actif, bibliothèque de
documents (2.3), tâches avec champ `project`, agenda, note de fin de consignes (`prompts.volatile_note`).

### 3.1 L'objet Projet

- [ ] Table `projects` : id, nom, alias (ex. « bateau » pour « IMOCA »), objectif, statut (actif, en pause, fini),
      **étape actuelle**, **prochaine action**, progression (0-100), dossier de documents (lien vers la
      bibliothèque), créé, mis à jour, dernière conversation.
- [ ] Table `project_decisions` : projet, date, décision, source (conversation ou saisie).
- [ ] Les tâches gardent leur champ `project` (texte) ; il pointe vers le nom du projet.

**Fichiers** : `zeuscore/store.py` (tables + migration), `zeuscore/projects.py` (nouveau : `create`, `get`,
`find(text)`, `update`, `decide`, `active_for(session)`).

### 3.2 Les outils de projet (boîte « core », toujours chargés, 4 outils courts)

- [ ] `project_open(name)` : rend un projet actif pour la conversation.
- [ ] `project_update(step, next_action, progress, status)` : met à jour.
- [ ] `project_decide(text)` : enregistre une décision datée.
- [ ] `project_list()` : projets actifs avec étape et progression.
      (Création : `project_update` sur un nom inconnu propose de le créer ; risque « write », sans validation.)

**Fichiers** : `zeuscore/tools/projects.py` (nouveau), `zeuscore/tools/__init__.py`.

### 3.3 Trouver le bon projet

- [ ] `projects.find(text, session)` dans cet ordre : nom ou alias cité dans le message → projet actif de la
      conversation → projet mis à jour il y a moins de 7 jours **s'il est seul** dans ce cas.
- [ ] Deux projets possibles et aucun nom cité : ZEUS **demande** (« Tu parles du bateau ou du rapport PBL ? »), il ne
      devine pas.

### 3.4 La fiche de contexte

- [ ] `zeuscore/context.py` (nouveau) : `context_for(session, text) -> dict` et `render(ctx) -> str`, **400 jetons au
      plus**. Contenu : projet, étape, prochaine action, progression, 3 dernières décisions, 3 tâches ouvertes du
      projet, 5 documents récents du dossier du projet, action en cours (plan ou mission en cours), niveau de
      l'utilisateur si pertinent (test de niveau, rôle).
- [ ] Injection dans **`prompts.volatile_note`** (fin de consignes, hors cache) : le début des consignes ne change pas.
- [ ] `update_context(event)` : appelé quand un outil de projet, une tâche du projet ou un plan change. Publie
      `context_changed` pour l'interface. (Prépare le lien avec le futur moteur de missions.)

### 3.5 La carte de contexte dans l'interface (premier composant du système de design)

- [ ] `zeus-context-card` en haut de la conversation : « Projet bateau · Étape : simulation · Ensuite : lancer
      l'étude de stabilité · 68 % ». Discrète, une ligne sur téléphone.
- [ ] Trois gestes : **Corriger** (petite fenêtre : projet, étape, prochaine action, progression), **Changer de
      projet** (liste), **Fermer** (masque la carte pour cette conversation, sans rien effacer).
- [ ] API : `GET /api/projects`, `POST /api/projects`, `PATCH /api/projects/<id>`, `POST /api/projects/<id>/decisions`,
      `PATCH /api/sessions/<sid>` avec `project_id`.

**Fichiers** : `zeuscore/channels/web.py`, `zeuscore/ui/index.html`, `zeuscore/ui/app.js`, `zeuscore/ui/app.css`.

### 3.6 Mise à jour automatique (après validation de 3.1 à 3.5 chez toi)

- [ ] À la fin d'un échange qui touche un projet, le modèle rapide propose une mise à jour (« étape : simulation
      → terminée ? ») ; elle s'applique **seulement si tu la confirmes d'un clic**, puis, quand 20 propositions
      d'affilée ont été acceptées sans correction, tu peux passer cette catégorie au niveau d'autonomie 2.

### Tests de la brique 3

- [ ] « Continue mon projet bateau » avec un projet « IMOCA » (alias « bateau ») : la fiche de contexte envoyée au
      modèle contient l'étape, la prochaine action et les documents du projet.
- [ ] « Fais la suite » dans une conversation liée au projet → même résultat, sans nom cité.
- [ ] Deux projets récents et aucun nom → ZEUS pose la question, aucun projet n'est choisi au hasard.
- [ ] La fiche fait **400 jetons au plus**, même avec 50 tâches et 200 documents.
- [ ] Le début des consignes est **identique** avec et sans projet actif (cache préservé).
- [ ] `project_update` publie `context_changed` et la carte se met à jour.
- [ ] Corriger l'étape depuis la carte change la fiche envoyée au message suivant.
- [ ] Une ancienne base (sans tables de projets) s'ouvre et se migre sans perte.

**Terminé quand** : les tests passent, toute la suite aussi, les jetons par requête n'augmentent pas de plus de 5 %,
et chez toi **« continue mon projet … » retrouve le bon projet, l'étape et les fichiers du premier coup** sur tes
3 projets réels.

---

## 4. Ce qui n'est pas dans ce document (volontairement)

Moteur de missions, système de design complet et navigation en 5 zones, agents spécialisés, fiches de compétence,
vérificateur, vision, proactivité, Raspberry Pi. Ils auront leur SPEC quand la brique 3 sera terminée.
