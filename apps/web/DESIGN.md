---
name: Six
description: Assistant mobile de réponse de Seven.AI, en 19 thèmes complets, clairs ou sombres.
colors:
  brand: '#1f3864'
  accent-a: '#1f3864'
  accent-b: '#3a67b8'
  on-accent: '#ffffff'
  icon-bg: '#090f1b'
  icon-ink: '#f2f5fa'
  icon-accent: '#4d7cfe'
  bg: '#f5f6fa'
  card: '#ffffff'
  panel2: '#eceff6'
  ink: '#1b1f2a'
  muted: '#5b6475'
  line: '#dde1ea'
  ok: '#17795e'
  warn: '#9a5b00'
  bad: '#b3261e'
  brand-dark: '#7fa2ea'
  accent-a-dark: '#2a52a0'
  accent-b-dark: '#4a78d0'
  bg-dark: '#12151c'
  card-dark: '#1c212b'
  panel2-dark: '#252b38'
  ink-dark: '#eef0f5'
  muted-dark: '#a3abbb'
  line-dark: '#2c3341'
  ok-dark: '#35e0c2'
  warn-dark: '#ffb547'
  bad-dark: '#ff8a80'
typography:
  display:
    fontFamily: 'Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif'
    fontSize: 'clamp(2.2rem, 10vw, 2.75rem)'
    fontWeight: 750
    lineHeight: 1.05
    letterSpacing: '-0.035em'
  headline:
    fontFamily: 'Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif'
    fontSize: '1.6rem'
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: '-0.01em'
  title:
    fontFamily: 'Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif'
    fontSize: '1.1rem'
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: '-0.01em'
  body:
    fontFamily: 'Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif'
    fontSize: '16px'
    fontWeight: 400
    lineHeight: 1.45
  body-sm:
    fontFamily: 'Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif'
    fontSize: '0.92rem'
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: 'Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif'
    fontSize: '0.85rem'
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: '0'
  caption:
    fontFamily: 'Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif'
    fontSize: '0.74rem'
    fontWeight: 400
    lineHeight: 1.45
rounded:
  sm: '10px'
  md: '14px'
  lg: '16px'
  xl: '18px'
  2xl: '20px'
  saisie: '26px'
  full: '999px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '22px'
components:
  button-primary:
    backgroundColor: '{colors.accent-b}'
    textColor: '{colors.on-accent}'
    rounded: '{rounded.md}'
    padding: '12px 16px'
    height: '48px'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.ink}'
    rounded: '{rounded.md}'
    padding: '12px 16px'
    height: '48px'
  button-round:
    backgroundColor: 'transparent'
    textColor: '{colors.ink}'
    rounded: '{rounded.full}'
    size: '44px'
  button-send:
    backgroundColor: '{colors.accent-b}'
    textColor: '{colors.on-accent}'
    rounded: '{rounded.full}'
    size: '44px'
  button-send-disabled:
    backgroundColor: '{colors.panel2}'
    textColor: '{colors.muted}'
    rounded: '{rounded.full}'
    size: '44px'
  saisie:
    backgroundColor: '{colors.card}'
    textColor: '{colors.ink}'
    rounded: '{rounded.saisie}'
    padding: '6px'
  saisie-plus:
    backgroundColor: '{colors.panel2}'
    textColor: '{colors.ink}'
    rounded: '{rounded.full}'
    size: '44px'
  chip:
    backgroundColor: '{colors.card}'
    textColor: '{colors.ink}'
    rounded: '{rounded.full}'
    padding: '8px 14px'
    height: '44px'
  chip-active:
    backgroundColor: '{colors.accent-b}'
    textColor: '{colors.on-accent}'
    rounded: '{rounded.full}'
  suggest-card:
    backgroundColor: '{colors.card}'
    textColor: '{colors.ink}'
    rounded: '{rounded.xl}'
    padding: '12px 14px'
    height: '92px'
  card:
    backgroundColor: '{colors.card}'
    textColor: '{colors.ink}'
    rounded: '{rounded.lg}'
    padding: '14px 16px'
  input:
    backgroundColor: '{colors.card}'
    textColor: '{colors.ink}'
    rounded: '{rounded.md}'
    padding: '12px'
  set-row:
    backgroundColor: '{colors.card}'
    textColor: '{colors.ink}'
    padding: '8px 14px'
    height: '56px'
  group-list:
    backgroundColor: '{colors.card}'
    rounded: '{rounded.xl}'
  drawer-item:
    backgroundColor: 'transparent'
    textColor: '{colors.ink}'
    rounded: '{rounded.md}'
    padding: '0 12px'
    height: '48px'
  drawer-item-active:
    textColor: '{colors.brand}'
    rounded: '{rounded.md}'
  avatar:
    backgroundColor: '{colors.accent-b}'
    textColor: '{colors.on-accent}'
    rounded: '{rounded.full}'
    size: '36px'
---

# Design System: Six

## Overview

**Creative North Star: "La conversation qui attend"**

Six est une messagerie qui ne parle jamais à ta place. L'accueil ressemble à une app d'IA conversationnelle (Claude Mobile, Gemini) : une salutation au centre, la saisie au pouce en bas, rien d'autre à lire avant d'agir. Depuis le 2026-10-15, l'envoi ne découpe plus le travail en écrans : tout se lit dans un seul fil, la conversation masquée en haut à droite (`.envoi`), les messages de Six à gauche avec le petit logo (`.six`), les précisions de l'utilisateur en bulles d'action (`.bulle-moi`). Le reste de l'app suit la même retenue : une action principale par écran, des listes groupées comme dans les réglages d'un téléphone, des cibles de 44 px au minimum.

Le monde visuel n'a pas de couleur fixe. Tout passe par une douzaine de variables CSS (`--bg`, `--card`, `--panel2`, `--ink`, `--muted`, `--line`, `--brand`, `--accent-a`, `--accent-b`, `--on-accent`, `--icon-*`), et 19 thèmes complets les redéfinissent : bleu Seven.AI par défaut, sept autres couleurs de Six (ambre, gris, rose, violet, jaune, vert, néon) et onze couleurs inspirées des apps (WhatsApp, Facebook, SMS, LinkedIn, Telegram, Instagram, TikTok, Google, Claude, Kimi, Pinterest). Chaque thème existe en clair et en sombre, sauf Néon, toujours sombre. Un thème change toute l'app, logo compris. La seule constante est la forme : surfaces douces, coins arrondis, ombres légères, dégradé accent-a → accent-b réservé aux actions.

Les valeurs de la frontmatter sont celles du thème par défaut (bleu) ; les clés `-dark` sont celles du mode sombre par défaut. Les autres thèmes sont listés dans le sidecar `.impeccable/design.json` et définis dans `app/globals.css`, qui fait foi.

**Key Characteristics:**

- Jetons sémantiques uniquement : aucun composant ne code une couleur en dur, sauf la lueur du thème Néon et les bulles par réseau.
- Clair, sombre ou auto (système), choisi dans Réglages ; police choisie (Téléphone, Times, Georgia, Calibri) appliquée à toute l'app via `--font`.
- Dégradé à 135° de accent-a vers accent-b sur les actions principales, l'envoi, l'avatar et les puces actives.
- Logo « 6 » recoloré par masque, seul objet de marque à l'écran.
- Mobile d'abord : colonne de 480 px maximum, barres collées en haut et en bas, zones sûres respectées.

## Colors

Une palette de rôles, pas de teintes : chaque thème remplit les mêmes rôles, avec des contrastes vérifiés (WCAG).

### Primary

- **Bleu Seven.AI** (`brand`, `accent-a`) : liens, texte en évidence (`em`), anneau de focus, élément actif du menu, icônes d'action. En sombre, il s'éclaircit (`brand-dark`) pour garder le contraste.
- **Bleu de l'élan** (`accent-b`) : second point du dégradé d'action ; aussi bordure des éléments choisis (carte, réponse, police) et interrupteur activé.
- **Texte sur accent** (`on-accent`) : blanc par défaut, sombre sur Jaune et Néon, où le dégradé est clair.

### Secondary

- **Logo** (`icon-bg`, `icon-ink`, `icon-accent`) : fond, « 6 » et trait du logo. Le thème Instagram ajoute `--icon-grad` (dégradé à 45°) ; TikTok, Google et Néon ajoutent `--icon-ring` (filet `--line`) quand le fond du logo se confond avec la page.

### Tertiary

- **États** (`ok`, `warn`, `bad`) : vert pour la confidentialité (cadenas, pastille « connecté », pastilles du bilan), ambre pour la prudence et le mode démo, rouge pour les arnaques et les erreurs. Toujours mélangés à `--card` (12 à 16 %) pour les fonds, jamais en aplat plein sauf le bouton danger.

### Neutral

- **Fond de page** (`bg`) : toile de l'app et couleur de la barre système (`theme-color`).
- **Carte** (`card`) : surfaces posées (cartes, pilule de saisie, menu latéral, listes groupées).
- **Panneau** (`panel2`) : surfaces en creux (bouton « + », pastilles, segments, appui sur une rangée).
- **Encre** (`ink`) : texte principal.
- **Texte secondaire** (`muted`) : sous-titres, valeurs, libellés de groupe, texte d'exemple des champs.
- **Trait** (`line`) : bordures de 1 px et séparateurs de rangées.

### Named Rules

**The Full Theme Rule.** Un thème redéfinit tous les rôles : fond, cartes, textes, traits, icône, barre système et icône d'onglet. Un nouveau composant ne lit que les variables ; s'il a besoin d'une couleur absente, c'est un nouveau rôle à définir dans les 19 thèmes, pas une valeur en dur.

**The Contrast Floor Rule.** Dans chaque thème et chaque mode : texte ≥ 7:1, texte secondaire et repères ≥ 4,5:1, boutons ≥ 4,5:1, icône ≥ 3:1. Le texte d'exemple des champs utilise `--muted` à pleine opacité pour rester à 4,5:1.

**The Colors-Only Rule.** Les thèmes inspirés des apps empruntent des couleurs, jamais un logo. Les vraies icônes d'apps n'apparaissent que pour ouvrir l'app correspondante (barre du bas de l'accueil).

**The Action Gradient Rule.** Le dégradé accent-a → accent-b (135°) marque ce qu'on peut faire : action principale, envoi, avatar, puce active, numéros d'étapes. Il ne sert jamais de fond décoratif.

## Typography

**Display Font:** police du système (`Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif`)
**Body Font:** la même, via `--font`
**Alternatives réglables:** Times (`Times New Roman, Times, Tinos, Liberation Serif, Noto Serif, serif`), Georgia (`Georgia, Gelasio, Noto Serif, serif`), Calibri (`Calibri, Carlito, Segoe UI, Roboto, system-ui, sans-serif`)

**Character:** une seule famille, celle du téléphone, sans police téléchargée (réseau faible). La hiérarchie vient du poids et de l'interlettrage serré des titres, pas d'un contraste de familles.

### Hierarchy

- **Display** (750, clamp(2.2rem, 10vw, 2.75rem), 1.05, -0.035em) : la salutation de l'accueil, « Bonjour / Bon après-midi / Bonsoir », suivie du prénom s'il est connu. Une seule par écran.
- **Headline** (700, 1.6rem, 1.15, -0.01em) : titre d'écran du parcours ; 1.35rem pour h2, 1.25rem pour le titre d'une sous-page de Réglages.
- **Title** (700, 1.1rem, -0.01em) : titre de la barre du haut, tronqué par points de suspension.
- **Body** (400, 16px, 1.45) : texte courant ; 0.97rem dans les rangées de réglages et les réponses.
- **Body small** (0.92rem) : sous-titres et texte secondaire ; 0.82rem pour les notes.
- **Label** (600, 0.85rem, interlettrage 0, casse de phrase) : titres de groupe de Réglages (« Apparence », « Six »).
- **Caption** (0.74rem) : ligne de confidentialité sous la saisie.

### Named Rules

**The Sentence-Case Label Rule.** Partout dans l'app (`.lbl` et `.group-title`, depuis le 2026-10-10), les titres de section sont en casse de phrase, en `--muted`, 0.85rem, 600, sans interlettrage. Pas de petites capitales espacées au-dessus d'un titre.

**The Short-Line Rule.** Les sous-titres centrés restent sous 30ch ; le public est peu à l'aise à l'écrit, les phrases sont courtes.

## Layout

Une colonne de 480 px au maximum, centrée, pleine hauteur (`100dvh`). Les écrans ont 16 px de marge latérale et 12 px en haut ; les blocs sont espacés de 14 px (22 px entre les groupes de Réglages). Les rangées qui défilent sortent de la marge (`margin: 0 -16px`) pour toucher le bord de l'écran.

L'accueil se lit de haut en bas : barre de 56 px collée en haut (fond `--bg` à 94 %), salutation centrée verticalement, puis un pied collé en bas qui se fond dans la page (dégradé transparent → `--bg` sur 22 px) et contient seulement la feuille d'import si ouverte, la pilule de saisie et la ligne de confidentialité. Depuis le 2026-10-15 (retours de testeurs : trop d'informations), l'accueil n'étale plus les fonctions : les exemples sont dans la feuille « + », les suivis dans le menu latéral et les icônes d'apps sur l'écran de fin. Les écrans du parcours gardent leur action principale collée en bas de la même manière (dégradé sur 18 px). Les zones sûres (`env(safe-area-inset-*)`) s'ajoutent aux marges du haut et du bas.

Il n'y a ni barre d'onglets ni point de rupture : sur grand écran, la colonne reste à 480 px.

### Named Rules

**The Thumb Rule.** Saisir, importer et envoyer se font en bas de l'écran ; ce qui se lit est en haut ou au centre.

**The Peeking Row Rule.** Une rangée qui défile horizontalement montre un élément coupé au bord droit, se fond sur 32 px à droite (masque en dégradé) et garde une marge de fin d'au moins la largeur du fondu (40 px) pour que le dernier élément sorte entièrement en fin de défilement. Les cartes d'exemples ont une largeur calculée pour en montrer 2,3.

## Elevation & Depth

Hybride : la profondeur vient d'abord du ton (`--bg` < `--card`, `--panel2` en creux, filet `--line` de 1 px), puis de deux ombres seulement. Les ombres sont plus denses en mode sombre pour rester visibles. Le thème Néon remplace la profondeur par une lueur cyan.

### Shadow Vocabulary

- **Posé** (`--sh-1` : `0 1px 2px rgb(16 24 40 / 0.06)` ; sombre `0 1px 2px rgb(0 0 0 / 0.35)`) : cartes, carte de profil, icônes d'apps.
- **Flottant** (`--sh-2` : `0 8px 24px rgb(16 24 40 / 0.10)` ; sombre `0 10px 28px rgb(0 0 0 / 0.45)`) : pilule de saisie, feuille d'import, bouton principal, bouton d'envoi.
- **Menu** (`8px 0 32px rgb(0 0 0 / 0.18)`) : menu latéral, au-dessus d'un voile `rgb(0 0 0 / 0.42)`.
- **Halo du logo** (`0 10px 30px` accent-b à 30 %) : logo de l'accueil uniquement.
- **Choix** (`0 0 0 1px` ou `2px` accent-b) : élément sélectionné, en anneau, sans décalage.

### Named Rules

**The Two Shadows Rule.** Hors menu et halo du logo, une surface est posée (`--sh-1`) ou flottante (`--sh-2`). Pas d'ombre dure décalée, pas de troisième niveau.

## Shapes

Tout est arrondi, rien n'est anguleux. Les rayons croissent avec la taille de la surface : 10 px (actions compactes, segments), 14 px (boutons, champs, rangées de menu et d'import), 16 px (cartes), 18 px (listes groupées, cartes d'exemples), 20 px (carte de profil, feuille d'import, blocs du parcours), 26 px (pilule de saisie). Les boutons d'icône, l'avatar et l'envoi sont des cercles parfaits. Le logo suit un carré arrondi d'environ 30 % de son côté (17 px à 56 px, 12 px à 40 px, 11 px à 38 px).

Les bordures sont des filets de 1 px en `--line`. Les bulles de message gardent un coin plus petit (4 px) du côté de l'émetteur.

## Components

### Buttons

Pleins, francs, toujours à 44 px au moins.

- **Shape:** coins doux (14 px), hauteur 48 px ; 44 px en version compacte.
- **Primary:** dégradé accent-a → accent-b, texte `on-accent`, gras 700, ombre `--sh-2` plus un reflet intérieur de 1 px blanc à 18 %.
- **Hover / Focus:** pas d'effet de survol (tactile d'abord) ; appui : descend de 1 px et se réduit à 0,99 ; focus : contour de 3 px `--brand` décalé de 2 px, partout dans l'app.
- **Ghost:** transparent, filet `--line`, 600. **Danger:** aplat `--bad`, texte blanc. **Désactivé:** opacité 0,55.
- **Rond:** bouton d'icône de 44 px en cercle, sans fond ; fond `--panel2` à l'appui (menu, retour).

### Chips

- **Style:** pilule de 44 px, filet `--line` sur `--card`, 600, 0.9rem.
- **State:** active (`aria-pressed`) en dégradé d'action, sans bordure ; variante douce sur `--panel2` ; variante statique compacte de 0.78rem. Appui : réduction à 0,96.

### Cards / Containers

- **Corner Style:** 16 px (carte), 18 px (liste groupée), 20 px (carte de profil).
- **Background:** `--card` ; carte en pointillés transparente pour les zones vides.
- **Shadow Strategy:** `--sh-1` (voir Elevation & Depth).
- **Border:** filet `--line` de 1 px ; sélection en anneau accent-b.
- **Internal Padding:** 14 px × 16 px.

### Inputs / Fields

- **Style:** fond `--card`, filet `--line`, coins de 14 px, 12 px de marge intérieure ; listes déroulantes de 48 px avec chevron.
- **Focus:** bordure `--brand` et halo de 3 px `--brand` à 16 %.
- **Placeholder:** `--muted` à pleine opacité.

### Navigation

- **Barre du haut:** 56 px, collée, fond `--bg` à 94 %. Bouton menu rond à gauche, titre (Title) juste après, avatar à droite. Pas de barre d'onglets.
- **Menu latéral:** panneau `--card` de min(84vw, 320px), filet droit `--line`. Tête : petit logo et « Six » (800). Puis « Nouvelle conversation » sur `--panel2` avec un « + » en `--brand`, la navigation (Accueil, Quoi dire ?, Réglages, Confidentialité) en rangées de 48 px, et la ligne de profil collée en bas sur `--panel2`.
- **States:** page courante en `--brand` sur `--brand` à 12 % ; icônes en `--muted` sinon. Échap ferme, le focus reste dans le menu et revient au bouton à la fermeture.
- **Motion:** glisse depuis la gauche en 0,28 s (`cubic-bezier(0.2, 0.8, 0.2, 1)`), voile en fondu de 0,2 s.

### Avatar

Rond de 36 px en dégradé d'action, initiale du prénom (700) ou silhouette si aucun prénom. Pastille d'état de 11 px en bas à droite, cerclée de `--bg` : `--muted` pour invité, `--ok` pour connecté. Zone tactile étendue à 44 px. Tailles 48 px (ligne de profil) et 76 px (écran Compte, pastille de 16 px).

### Saisie (composant signature)

La pilule de l'accueil : `--card`, filet `--line`, rayon de 26 px, ombre `--sh-2`, 6 px de marge. À gauche le « + » (cercle de 44 px sur `--panel2`), au centre le champ sans bordure qui grandit de 44 à 180 px, à droite l'envoi (cercle de 44 px en dégradé d'action, `--sh-2` ; sur `--panel2` en `--muted` tant que le champ est vide).

- **Focus:** bordure `--brand` et halo de 3 px `--brand` à 18 %, l'ombre reste.
- **Glisser-déposer:** bordure accent-b.
- **« + »:** tourne de 45° en × en 0,2 s et ouvre la feuille d'import au-dessus de la pilule.

### Feuille d'import

Carte `--card` de 20 px, ombre `--sh-2`, qui monte de 8 px en 0,18 s. Trois rangées de 48 px avec icône `--brand` : coller depuis le presse-papiers, captures d'écran, export de conversation. Fond `--panel2` à l'appui, opacité 0,5 si indisponible.

### Salutation

Logo de 56 px avec halo, salutation Display, sous-titre `--muted` sous 30ch. Entrée en 0,6 s : fondu, montée de 10 px, échelle 0,98 → 1. Disparaît quand on commence à écrire.

### Exemples (feuille « + »)

Sous les trois imports, un filet `--line`, le titre « Essayer avec un exemple » (Label) et trois rangées de 48 px, icône `--muted`, texte 500. Les cartes d'exemples de l'accueil (`.suggest-card`) ne sont plus utilisées.

### Réflexion

Pendant l'analyse et la rédaction : le logo de 64 px respire (échelle 1,06, 2,4 s) et deux ondes `accent-b` de 2 px s'en éloignent (échelle 1 → 1,9, décalées de 1,2 s), sous « Six réfléchit » (1.35rem, 700) et une phrase `--muted` qui dit ce que Six fait (une nouvelle toutes les 1,8 s, puis la dernière reste). Variante d'une ligne (point en dégradé d'action) pour une réécriture sur place. `role="status"`, `aria-busy` sur l'écran ; mouvement réduit : rien ne bouge, les phrases changent quand même.

### Listes groupées (Réglages)

Titre de groupe en Label, puis une liste `--card` à 18 px avec filet `--line`. Rangées de 56 px : pastille d'icône de 32 px (coins de 9 px, `--brand` sur `--brand` à 12 %), libellé 0.97rem, valeur `--muted` à droite, chevron `--muted`. Séparateurs de 1 px entre rangées ; `--panel2` à l'appui. Interrupteur de 48 × 28 px, accent-b quand activé.

### Logo recoloré

Carré arrondi en `--icon-bg` (ou `--icon-grad`) sur lequel deux calques PNG servent de masques : le « 6 » peint en `--icon-ink`, le trait en `--icon-accent`. Les tuiles de thèmes sont ce même logo à 38 px ; la tuile choisie porte un double anneau (2 px `--bg`, puis 2 px `--brand`). Hors page, l'icône de l'onglet est redessinée sur canevas avec les mêmes couleurs, et la barre du téléphone prend `--bg`.

### Motion

Courbe commune `cubic-bezier(0.2, 0.8, 0.2, 1)` pour tout ce qui entre ; 0,12 à 0,15 s `ease` pour les retours d'appui et de bordure. Avec `prefers-reduced-motion: reduce`, les transitions, les animations d'entrée et les réductions à l'appui sont coupées, et le halo du logo du parcours disparaît.

## Do's and Don'ts

### Do:

- **Do** lire chaque couleur dans une variable de thème et vérifier un nouveau composant dans au moins un thème clair, un thème sombre et Néon.
- **Do** tenir les seuils de contraste : texte ≥ 7:1, texte secondaire et repères ≥ 4,5:1, boutons ≥ 4,5:1, icône ≥ 3:1.
- **Do** donner 44 px au moins à toute cible tactile, en étendant la zone si le visuel est plus petit (avatar de 36 px).
- **Do** utiliser des boutons ronds de 44 px dans les barres du haut.
- **Do** faire déborder une rangée défilante d'un élément coupé, avec un fondu de 32 px à droite et une marge de fin d'au moins 40 px.
- **Do** titrer les groupes en casse de phrase (0.85rem, 600, `--muted`).
- **Do** couper toute transition et animation sous `prefers-reduced-motion: reduce`.

### Don't:

- **Don't** mettre une bordure gauche colorée sur une carte, une rangée ou une alerte ; la sélection se marque en anneau accent-b.
- **Don't** ajouter de surtitre en capitales espacées, nulle part.
- **Don't** utiliser de bouton carré dans une barre du haut.
- **Don't** laisser une rangée défilante finir pile au bord sans élément coupé ni fondu.
- **Don't** coder une couleur en dur dans un composant ; seuls la lueur de Néon et les bulles par réseau en ont.
- **Don't** reprendre le logo d'un réseau dans un thème ; seulement ses couleurs.
- **Don't** ajouter une barre d'onglets ; la navigation passe par le menu latéral.
