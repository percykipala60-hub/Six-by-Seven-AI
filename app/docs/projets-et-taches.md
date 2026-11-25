# Projets et tâches planifiées

Les pages `/projets` et `/taches` sont accessibles depuis le menu et le rail de Six. Une connexion est nécessaire. Le serveur vérifie le jeton avec l’authentification existante avant chaque accès. Les projets contiennent un titre et un contexte réutilisé dans Cosinus ; ils ne montent pas un dossier du téléphone. Les discussions restent soumises au réglage Mémoire existant.

## Activation sur le serveur Docker

Le service Six doit utiliser Node 22.13 minimum (l’image du dépôt est 22.22). SQLite est fourni par `node:sqlite`. Le volume `travail_data` conserve les projets, tâches et derniers résultats dans `/app/travail/travail.sqlite` ; sauvegarder ce volume et limiter son accès à l’administrateur. Le déploiement cible un seul serveur, pas plusieurs volumes isolés ni Vercel éphémère.

1. Ajouter dans `deploy/.env` un `SIX_CRON_SECRET` aléatoire d’au moins 32 caractères. Ne jamais le versionner ni utiliser une variable `NEXT_PUBLIC_*`.
2. Depuis `deploy`, exécuter `docker compose --profile planification up -d --build`.
3. Vérifier `docker compose --profile planification ps` puis ouvrir Tâches planifiées avec un compte connecté. La création n’est activée que si le serveur a reçu récemment un battement authentifié du planificateur.
4. Créer une tâche ponctuelle quelques minutes dans le futur, fermer l’application, puis la rouvrir et vérifier le résultat avec Actualiser.

Le planificateur appelle une route protégée toutes les 30 secondes et traite une tâche à la fois. L’exécution peut être décalée par les tâches précédentes ou une panne. Les dates sont stockées en UTC, affichées dans le fuseau de l’appareil. Les récurrences sont des intervalles de 24 heures ou 7 jours, sans conservation de l’heure murale lors du passage heure d’été/hiver. Les occurrences manquées ne sont pas rejouées en rafale.

Les tâches génèrent du texte et des artefacts avec le skill choisi et le contexte courant du projet. Elles n’accèdent pas aux pièces jointes locales, ne pilotent pas le navigateur et n’envoient aucun message à un tiers. Seul le dernier résultat est conservé ; pas encore de notification push. Les quotas de messages gratuits sont appliqués à chaque exécution. Maximum 50 projets et 50 tâches par compte.

Une tâche échouée est suspendue. Après interruption du serveur pendant un appel IA, la réservation est déclarée interrompue après 15 minutes et suspendue, sans relance automatique pour éviter les doubles générations. L’utilisateur peut la reprendre explicitement. Une tâche en cours ne peut pas être supprimée ; un projet ayant des tâches liées doit d’abord être libéré de celles-ci.

En local, définir `SIX_TRAVAIL_DIR` sur un dossier hors Git et `SIX_CRON_SECRET`, puis appeler `POST /api/travail/executer` avec `Authorization: Bearer <secret>` depuis un ordonnanceur indépendant. Aucun secret n’est créé automatiquement par le code.
