# ZEUS — ROADMAP.md

Ordre de construction (plan du 9 novembre 2026). Une étape n'est commencée que lorsque la précédente est terminée et
mesurée. Détail des briques 1 à 3 : `SPEC.md`.

| Rang | Brique | État | Terminé le | Mesure avant → après |
|---|---|---|---|---|
| 1 | Fusion de la version du PC (2.2.0 + pedagogie, bascule, Raspberry Pi, sauvegarde) et de la 2.3 → **ZEUS 2.4.0** | fait | 09/11/2026 | tests : 181 (PC) + 179 (2.3) → 203 (OK sous Windows le 09/11) |
| 1 | Phase 1 : fiabilité (jetons, « ZEUS s'est trompé », mode économie, sauvegarde, usage) | en cours : 2.4.1 (attendre Groq plutôt que le local), 2.4.2 (professeur allégé), 2.4.3 (coupures d'internet), 2.5.0 (fiche « ZEUS sur lui-même » et bouton « ZEUS s'est trompé »), 2.6.0 (mini-cerveau local, réflexes sans IA, 2e cerveau gratuit) | | banc pedagogie : 12/31 phrases réussies (matin) → 11/11 avant la limite du jour (2.4.1) ; requête 7 900 → 6 000 jetons estimés (2.4.2) ; 10/11 : 26 phrases sur 31 répondues, 15/20 erreurs, 13/13 pièges, 1 fausse correction ; les 5 échecs = coupures d'internet → 2.4.3 attend la connexion ; tests : 213 → 230 (2.5.0) → 254 (2.6.0) → 256 (2.6.1, logo) → 263 (2.7.0) |
| 2 | ZEUS Core : projets et contexte (version minimale) | à faire | | « continue mon projet » : ? → 3 projets sur 3 |
| 1 bis | Banc de tests ZEUS (score par catégorie, régressions, pannes, rejeu des erreurs signalées) | fait en 2.9.0 | 11/11/2026 | score : ? → à mesurer (python zeus.py banc) |
| 3 | Système de design (jetons, composants, DESIGN-SYSTEM.md) | commencé : logo (2.6.1), interface spatiale du mode Jarvis (2.7.0) | | |
| 4 | Moteur de missions | à faire | | |
| 5 | Agents, un par un (Secrétaire d'abord) | à faire | | jetons par requête : ? → < 3 000 |
| 6 | Bibliothèque de compétences (6 fiches de priorité 1) | à faire | | |
| 7 | Vérificateur (« ✓ Vérifié ») | à faire | | |
| 8 | Vision | à faire | | |
| 9 | Proactivité (brief, alertes avec sourdine, veille) | à faire | | |
| 10 | Raspberry Pi et voix dans la pièce | plus tard | | |
| — | Cerveau maison, étape 1 (PC actuel) : mini-cerveau local (requête ~800 jetons), préchauffage, plus de réflexes sans IA, 2e fournisseur en ligne | fait en 2.6.0, à mesurer sur ton PC (`python zeus.py mesure --mini`) | 11/11/2026 | requête locale : 4 300-6 000 → 350-850 jetons estimés ; 1re réponse locale : 4-8 min → ? (objectif < 1 min) |
| — | Cerveau maison, étape 2 (nouveau PC avec carte graphique NVIDIA 12 Go ou Mac à puce Apple 16 Go+) : modèle local 8-14 B en premier, Claude pour les questions difficiles | au changement de PC | | part des réponses faites en local : 0 % → ? |
| — | Cerveau maison, étape 3 : petit modèle spécialisé sur tes corrections | quand il y aura des centaines de cas « ZEUS s'est trompé » | | |
| 11 | Autonomie niveau 3 | beaucoup plus tard | | |

Déjà livré avant ce plan : 2.3.0 (recherche dans les documents, test de niveau adaptatif, lecture de Google Agenda
et d'Outlook) — à tester chez toi (`PROTOCOLES-DE-TEST.md`, sections 7 à 9).
