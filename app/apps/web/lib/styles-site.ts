/**
 * Sites web (artefact de type « html ») : quand la personne demande un site ou une page, Six reçoit en plus un
 * catalogue de styles (palette, typographie, mise en page), inspirés de styles courants du web. Ces consignes ne
 * partent qu'avec une demande de site : le reste du temps, le prompt reste court (et en cache).
 */

export type StyleSite = {
  id: string;
  nom: string;
  /** Pour quel genre de site. */
  pour: string;
  /** Palette, typographie et éléments de mise en page, en une ligne. */
  recette: string;
};

export const STYLES_SITE: StyleSite[] = [
  {
    id: 'epure',
    nom: 'Épuré monochrome',
    pour: 'produit haut de gamme, automobile, technologie',
    recette:
      'fond #F5F5F4 et blanc, encre #111, gris #8A8A8A ; titres sans empattement très gras et serrés (clamp(40px,6vw,72px), letter-spacing -0.03em) ; boutons pilules noirs avec flèche ; héros à gauche, grand visuel à droite ; bande de 3 chiffres clés avec icônes fines séparées par des filets ; grille de cartes aux coins arrondis 20px.',
  },
  {
    id: 'citron',
    nom: 'Clair et citron',
    pour: 'électronique, application, produit grand public',
    recette:
      'fond #F2F2F0, cartes blanches ou #EBEBE8 arrondies 24px, accent citron #D9F24A (boutons, pastilles d’icônes), encre #111 ; petits sur-titres en capitales espacées suivis d’un trait ; titre géant sur 3 lignes ; 3 cartes de fonctionnalités avec pastille ronde et grand chiffre gris clair ; rangée de logos « compatible avec ».',
  },
  {
    id: 'glacier',
    nom: 'Nuit et glacier',
    pour: 'finance, conseil patrimonial, SaaS, tableau de bord',
    recette:
      'héros en dégradé nuit #0E2A3B → #1B4B5E avec montagne en SVG, accent menthe #9FE7E0 ; cartes en verre (fond rgba(255,255,255,.08), bordure rgba(255,255,255,.18), backdrop-filter: blur) avec une courbe SVG ; puis fond clair #F4F8FA, 5 cartes de services aux icônes turquoise, bande de 4 chiffres, témoignage dans une carte.',
  },
  {
    id: 'galerie',
    nom: 'Galerie mode',
    pour: 'mode, boutique, marque de vêtements',
    recette:
      'fond gris perle #ECEAE8 et blanc, encre noire ; titres en CAPITALES très gras et larges ; navigation en capitales espacées ; grilles de 4 cartes produits arrondies 12px (visuel en dégradé gris-beige, nom et prix) ; boutons rectangulaires fins (noir plein ou contour 1px) ; bloc newsletter avec champ et bouton noirs collés.',
  },
  {
    id: 'evasion',
    nom: 'Évasion ardoise',
    pour: 'voyage, tourisme, réservation, événement',
    recette:
      'blanc, ardoise #7C8BA6 pour les cartes pleines, marine #2B3A55 pour les boutons pilules ; héros pleine largeur arrondi 24px (paysage en dégradé vert-bleu et collines SVG) avec un mot géant blanc ; barre de recherche pilule dans l’en-tête ; cartes de destination avec étiquette de prix ; étapes « 1-2-3 » ; 3 chiffres ronds avec icônes.',
  },
  {
    id: 'atelier-nuit',
    nom: 'Atelier de nuit',
    pour: 'architecture, décoration, hôtellerie, luxe',
    recette:
      'fond #121212 et sections #1C1C1C, texte #EDE6DA, accent sable #CBB89D ; titres à empattements (Georgia) ; mot du nom en très grandes lettres translucides derrière le héros ; petites cartes de chiffres en verre ; 6 cartes de services fines aux bords #2A2A2A ; grilles de visuels arrondis 16px ; avis client avec étoiles.',
  },
  {
    id: 'residence',
    nom: 'Résidence dorée',
    pour: 'immobilier, agence, location',
    recette:
      'crème #FBF7F2, marine #1B2A4A, or #C59D5F ; titre marine avec un mot en italique doré (Georgia italic) ; barre de recherche blanche en pilule qui chevauche le héros (lieu, type, budget, bouton) ; 4 garanties en icônes rondes beiges ; cartes de biens (étiquette « À vendre », pièces, surface, prix) ; bandeau d’appel marine arrondi.',
  },
  {
    id: 'botanique',
    nom: 'Botanique',
    pour: 'cosmétique naturelle, bio, bien-être, épicerie',
    recette:
      'blanc cassé #F7F6F0, vert profond #2F5D34, sauge #DDE6D5 ; bandeau d’annonce vert en haut ; titres à empattements (Georgia), capitales pour les rubriques ; héros sauge avec produits dessinés en formes arrondies ; 4 promesses avec icônes au trait ; grille de 6 catégories ; cartes produits avec bouton « Ajouter au panier » vert.',
  },
  {
    id: 'velours',
    nom: 'Velours rose',
    pour: 'beauté, maquillage, mode féminine',
    recette:
      'blanc, vieux rose #A85C72, rose pâle #F6E7EA, prune #4A1F33 pour le pied de page ; titres à empattements élégants ; héros rose poudré ; barre de 4 promesses dans une carte blanche flottante ; catégories en médaillons ronds ; offre en bloc vieux rose à côté d’un visuel ; notes en étoiles dorées.',
  },
  {
    id: 'cabinet',
    nom: 'Cabinet bleu acier',
    pour: 'conseil, cabinet, entreprise de services, institution',
    recette:
      'héros marine #1E2D4D avec immeubles en SVG et voile dégradé, accent bleu acier #4F7CA8 ; 3 cartes blanches ombrées qui chevauchent le héros (icône, titre, texte, bouton) ; section claire #EEF2F7 avec 4 axes séparés par des filets ; projets récents en cartes ; boutons rectangulaires arrondis 4px.',
  },
  {
    id: 'agence-creme',
    nom: 'Agence crème',
    pour: 'architecture, studio créatif, portfolio, ONG',
    recette:
      'crème #F3F0EA, vert sapin #2F4A35, encre #1E1E1E ; titres fins et grands avec un mot en italique à empattements ; visuel du héros à coins très arrondis (40px) avec une pastille de 3 chiffres ; carrousel de projets ; 6 cartes de services #ECE7DE avec pastille sapin ; témoignages dont un sur fond sapin.',
  },
];

/** La personne demande-t-elle un site ou une page web ? */
export function demandeSite(question: string): boolean {
  return /\b(site|landing|page d['’]accueil|page web|site web|vitrine|boutique en ligne|e-?commerce|portfolio|maquette web|page html)\b/i.test(
    question,
  );
}

/** Site ou présentation : une réponse longue (artefact entier), qui demande plus de place qu'une réponse de discussion. */
export function demandeLivrableLong(question: string): boolean {
  return (
    demandeSite(question) ||
    /\b(pr[ée]sentation|diaporama|powerpoint|pptx|slides?|expos[ée]|soutenance|pitch)\b/i.test(
      question,
    )
  );
}

/** Consignes ajoutées au prompt quand la personne demande un site (vide sinon). */
export function consignesSite(question: string): string {
  if (!demandeSite(question)) return '';
  return `

Site web demandé : livre la page entière dans un artefact type="html".
- Structure : en-tête (logo texte, navigation, bouton d'action), héros, 3 à 5 sections utiles au sujet, pied de page. Page responsive (une colonne sous 768 px), polices système (system-ui, Georgia pour les empattements), styles dans une balise <style>, aucun fichier ni lien externe, aucun script qui charge quoi que ce soit.
- Images : aucune photo. Remplace-les par des visuels en dégradés CSS et formes SVG simples (paysage, produit, bâtiment), aux coins arrondis comme dans le style choisi.
- Textes en français, concrets et adaptés à la personne ; aucun faux chiffre, faux avis ni faux nom : écris [à compléter].
- Choisis le style le plus adapté au sujet (ou celui que la personne nomme), et respecte sa recette :
${STYLES_SITE.map((s) => `  • ${s.id} — ${s.nom} (${s.pour}) : ${s.recette}`).join('\n')}`;
}
