# Comment Six apprend, sans garder les conversations

Six s'améliore à trois niveaux. Aucun ne garde le texte d'une conversation.

| Niveau                   | Ce qui apprend                                                                                                      | Où c'est stocké                                                     | Fréquence                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1. Ton style             | Longueur de tes messages, tu ou vous, emojis, mélange avec le lingala, tes formules (« frère », « stp », « mbote ») | Sur ton appareil uniquement (PC : `~/.six/`, téléphone : IndexedDB) | À chaque conversation                                                                    |
| 2. Tes choix             | Le type de brouillon que tu choisis (rassurante, directe, alternative)                                              | Sur ton appareil uniquement                                         | À chaque choix                                                                           |
| 3. Le modèle de l'équipe | Les poids d'un modèle local (Mistral) affinés par QLoRA                                                             | Dossier `training/` de l'équipe                                     | Chaque semaine, sur un jeu de conversations **données avec accord écrit** et anonymisées |

## Pourquoi pas un entraînement en direct sur les conversations des utilisateurs

1. Il faudrait garder leurs conversations : c'est contraire à la promesse de Six.
2. N'importe qui pourrait « apprendre » de mauvaises réponses au modèle (empoisonnement).
3. Un modèle changé chaque jour ne peut plus être testé avant d'être mis en ligne.

## La règle du niveau 3

Aucun nouveau modèle ne remplace l'ancien sans passer le banc d'essai (`pnpm banc`) avec un meilleur score sur les mêmes conversations de test.

## Agent v0.3 — retour du vrai essai (Mistral 7B, export WhatsApp réel)

| Constat sur le vrai essai                                               | Correction                                                                             |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Brouillon qui invente la vie de l'utilisateur (« un film que j'ai vu ») | Règle de prompt + contrôle `vie-inventee`                                              |
| Brouillon qui se contredit                                              | Contrôle `incoherent`                                                                  |
| Brouillons 3× plus longs que l'utilisateur                              | Limite de mots tirée de la fiche de style, dans le prompt et le contrôle               |
| Ton « professionnel » avec une amie proche                              | Nouveau ton par défaut « naturel » + indice de relation tiré du nom (🤍, maman, prof…) |
| Relation devinée « collègue », libellés « il »                          | Indice de relation ; libellés avec le prénom                                           |
| 225 s pour une correction                                               | Correction ciblée : seuls les brouillons fautifs et le dernier message sont renvoyés   |
| Ctrl+C à la question A/B/C plantait                                     | Sortie propre, rien retenu                                                             |

## Agent v0.4 — retour du banc d'arnaques (Llama 3.2 3B)

| Constat au banc                                                           | Amélioration                                                                                                                                                                     |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arnaque « proche » : 1/3 brouillons utilisables après 2 corrections, 89 s | **Bouclier** : risque élevé → l'agent répond seul, sans IA (instantané, aucun risque qu'un modèle cède) ; réponses adaptées au type d'arnaque (nouveau numéro, code, gain/frais) |
| Faux gain + frais classé « moyen »                                        | Règle « frais » élargie (« envoyez d'abord… de frais ») → élevé (v0.3.3)                                                                                                         |
| « Je suis bloqué » lu comme une menace                                    | Menace = compte/carte/ligne de l'utilisateur menacés (v0.3.3)                                                                                                                    |
| Corrections qui tournent en rond                                          | Arrêt dès qu'une correction n'améliore rien                                                                                                                                      |
| Mot répété                                                                | Retiré par le code, sans rappeler le modèle                                                                                                                                      |
| Premier jet lent                                                          | 6 derniers messages au lieu de 8, réponse plafonnée à 380 jetons                                                                                                                 |
