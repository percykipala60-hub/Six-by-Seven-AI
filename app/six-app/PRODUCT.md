# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

À confirmer : l'utilisateur a demandé une correction du résumé ci-dessous (2026-10-10) sans encore la préciser.
Hypothèse issue du dépôt (CLAUDE.md, docs/) : étudiants, professionnels et personnes peu à l'aise à l'écrit, à Kinshasa, surtout sur téléphone Android avec un réseau parfois faible. Ils ont reçu un message (WhatsApp, SMS, e-mail, Messenger…) et ne savent pas quoi répondre ni sur quel ton.

## Product Purpose

Six (assistant de la startup Seven.AI, projet PBL5 Groupe 7) lit une conversation collée, partagée ou capturée, explique ce que l'autre veut dire (y compris le second degré), repère les arnaques, puis propose trois réponses au ton juste. L'utilisateur choisit, ajuste et envoie lui-même. Réussite : une réponse juste copiée en moins d'une minute, sans quitter longtemps sa messagerie.

## Positioning

« Ton juste » (assertivité et empathie), interculturel (ne pas prendre les messages au premier degré), confidentialité réelle : masquage des noms et numéros sur le téléphone avant tout envoi. Six ne parle jamais à la place de l'utilisateur.

## Operating Context

PWA installable (Next.js, six-app). Entrées : copier-coller, captures lues sur le téléphone (OCR), export WhatsApp, partage depuis les messageries. Parcours en 4 étapes : Coller, Protéger, Comprendre, Répondre. Démo devant un jury PBL (ULC-Icam) le 15 octobre 2026.

## Capabilities and Constraints

- Aucune conversation stockée ni journalisée ; la mémoire de Six (habitudes chiffrées, notes sur les contacts, suivis) vit sur le téléphone, visible et effaçable.
- Périmètre actuel : frontend seulement ; serveur et clavier Android gelés depuis le 2026-10-08.
- Comptes : décision du 2026-10-10 — structure d'interface + mode invité maintenant (aucun serveur touché). Plus tard, un compte servira à synchroniser la mémoire entre appareils : il faudra alors stocker ces données sur un serveur et réécrire la page Confidentialité. Fournisseur de connexion non choisi.
- Thèmes complets (couleurs de Six et inspirés des apps) et polices réglables ; contrastes WCAG vérifiés.

## Brand Commitments

Nom Six, startup Seven.AI, logo « 6 » recoloré par thème, bleu Seven AI par défaut, tutoiement, français simple. Thèmes réseaux : couleurs seulement ; vraies icônes d'apps uniquement pour ouvrir l'app correspondante.

## Evidence on Hand

Aucun témoignage, chiffre d'usage ni client réel : ne pas en inventer. Exemples de conversations fictifs dans components/Flow.tsx.

## Product Principles

1. L'utilisateur garde la main : Six propose, l'humain envoie.
2. La confidentialité se prouve à l'écran (ce qui part est montré).
3. Rapide sur un petit réseau : peu d'étapes, une action principale par écran.
4. Comprendre avant de répondre (sens probable, arnaques).

## Accessibility & Inclusion

Cibles tactiles ≥ 44 px, contrastes WCAG vérifiés par thème, mouvement réduit respecté, lecteurs d'écran (libellés ARIA), personnes peu à l'aise à l'écrit : phrases courtes.
