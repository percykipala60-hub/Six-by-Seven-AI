---
version: 1
slug: "components-flow-tsx"
primary_target: "components/Flow.tsx"
related_targets: ["components/Settings.tsx","components/AppBar.tsx"]
---

# Accueil, navigation et Réglages de Six

Mode : Operate. Tâche : coller un message et obtenir de l'aide en un geste ; retrouver ses réglages et son profil sans chercher.
Contraintes : thèmes existants (globals.css), logo recoloré, parcours en 4 étapes inchangé, confidentialité visible, cibles ≥ 44 px, réseau faible. Connexion : structure + mode invité (décision du 2026-10-10), aucun serveur.

## Direction contract

THESIS: L'accueil devient une conversation qui attend : salutation au centre, saisie au pouce en bas, comme Claude Mobile et Gemini (direction épinglée par l'équipe). Refuse la page-formulaire empilée et la barre d'onglets.
OWN-WORLD: Fond et cartes du thème actif, aucun nouveau jeton. Logo Six recoloré comme seul objet de marque au centre. Barre de saisie en pilule (rayon 26 px) sur --card avec ombre --sh-2 ; bouton d'envoi rond dans le dégradé accent-a → accent-b ; avatar rond 36 px à initiale avec pastille d'état ; menu latéral sur --card ; listes groupées à rangées 56 px dans Réglages.
STORY: Six me salue, je colle ou j'importe d'un seul « + », j'envoie ; je vois si je suis connecté ; je règle le thème dans sa propre page.
FIRST VIEWPORT: Barre du haut 56 px (menu à gauche, « Six » au centre gauche, avatar à droite). Centre vertical : logo 56 px, « Bonsoir, Prénom » à 1,9 rem, sous-titre, rangée défilante d'exemples. Bas collé : icônes d'apps 36 px, puis pilule de saisie « + / texte / envoyer », puis ligne de confidentialité.
FORM: canon épinglé (Claude Mobile / Gemini), position 1 de la liste ; pas de tirage (direction épinglée par le brief). Interaction signature : le « + » tourne en × et ouvre la feuille d'import au-dessus de la pilule ; la salutation s'efface quand on écrit.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
