#!/usr/bin/env node
/**
 * make-pdf.mjs — Génère trois PDF sans aucune dépendance :
 *   docs/faisabilite-six.pdf          → dossier technique (équipe dev)
 *   docs/decisions-a-voter.pdf        → feuille de décision pour la direction
 *   docs/faisabilite-et-decisions.pdf → dossier complet qui mélange les deux
 * Usage : node scripts/make-pdf.mjs
 */

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makePdf } from './pdf-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATE = '5 octobre 2026';

/* ================================================================== */
/* Données partagées par les trois documents                          */
/* ================================================================== */

// Les 4 décisions, en français simple (doc DG + dossier complet)
const DECISIONS = [
  {
    no: 1,
    titre: "Combien on peut dépenser chaque mois pour l'IA",
    sujet:
      "chaque réponse de l'IA coûte un peu d'argent (quelques centièmes de dollar). Sans limite fixée, la facture peut monter sans contrôle.",
    demande:
      'fixer une limite mensuelle (recommandé : 50 $) et donner un moyen de paiement. Ordre de grandeur : 30 à 60 $/mois pour environ 3 000 conversations par mois.',
  },
  {
    no: 2,
    titre: 'Le moteur local (Ollama) : garder ou reporter',
    sujet:
      'une option « IA 100 % locale » existe, mais elle demande un gros ordinateur allumé jour et nuit.',
    demande:
      "dire si une telle machine est disponible. Si non, on lance avec l'IA en ligne, et l'option locale passera dans la version suivante (1.1).",
  },
  {
    no: 3,
    titre: "L'hébergement du site et de l'API (~10 $/mois)",
    sujet:
      'les offres gratuites utilisées pour tester interdisent un usage commercial, donc on ne peut pas lancer publiquement dessus.',
    demande:
      'valider environ 10 $/mois pour que le service soit en ligne en permanence, et le moyen de paiement. Sans ça, pas de lancement.',
  },
  {
    no: 4,
    titre: 'Les téléphones de test et le lecteur lingala (250–450 $ une fois)',
    sujet:
      "l'application vise trois publics (iPhone, petits téléphones Android, locuteurs de lingala) — elle doit être vérifiée sur chacun.",
    demande:
      'fournir ou financer 2 téléphones (~250–450 $ une seule fois) et désigner une personne qui lit le lingala pour vérifier les textes affichés aux utilisateurs.',
  },
];

// Coût total pour lancer (tous documents)
const COUTS = [
  ['IA en ligne (Claude Haiku)', '30–60 $', '—', '0 $ si 100 % local (décision 2)'],
  ['Hébergement', '7–12 $', '—', 'Le service reste allumé en permanence'],
  ['Téléphones de test', '—', '250–450 $', "iPhone d'occasion + Android simple"],
  ['Relecteur lingala', '0–30 $', '—', 'Bénévole ou dédommagement'],
  ['TOTAL', '~40–100 $/mois', '250–450 $', 'Plafond IA à fixer (décision 1)'],
];

// Si une décision tarde (doc DG + dossier complet)
const TARDE = [
  [
    'Décision 3 (hébergement) tarde',
    "Le lancement public du 13 octobre est impossible — c'est le seul point bloquant",
  ],
  [
    'Décision 1 (budget IA) tarde',
    "Impossible d'activer l'IA en ligne en production — le reste peut partir",
  ],
  [
    'Décision 2 (machine) tarde',
    "On lance sur l'IA en ligne ; l'option locale glisse en 1.1 sans retard",
  ],
  [
    'Décision 4 (téléphones) tarde',
    'Le lancement a lieu, mais les tests réels se feront après coup (risque qualité)',
  ],
];

// Les 4 problèmes, en détail (doc technique + dossier complet)
const PROBLEMES = [
  {
    no: 1,
    titre: 'Le budget API mensuel',
    probleme:
      'chaque réponse IA coûte des tokens. Sans plafond, la facture peut déraper ; sans carte, rien ne démarre.',
    solution:
      "budget mensuel plafonné, moteur principal local (Ollama) et Claude Haiku 4.5 (1 $ / M tokens entrée, 5 $ / M sortie) pour le nuage. À 3 000 conversations/mois (~12 000 tokens chacune), l'ordre de grandeur est de 30 à 60 $/mois — à valider par le banc d'essai sur de vraies conversations.",
    decision:
      'un plafond en dollars par mois, une carte dédiée, et le choix du modèle par défaut (Haiku 4.5 recommandé pour le coût).',
  },
  {
    no: 2,
    titre: 'La machine du serveur Ollama',
    probleme:
      'les modèles locaux exigent une machine allumée 24 h/24 ; sans cela, « moteur local » ne peut pas être promis dans la 1.0.',
    solution:
      "décider selon l'usage réel. Brouillon ponctuel sur un PC de l'équipe (8 Go) = acceptable en 1.0 avec un mode « serveur éteint » propre. Service public continu = louer un GPU (Ollama en ligne) ou reporter le local en 1.1 et livrer la 1.0 sur Claude seul.",
    decision:
      'RAM/GPU disponibles, machine allumée 24 h/24 oui ou non, et le sort du moteur local dans la 1.0.',
  },
  {
    no: 3,
    titre: "L'hébergement payant",
    probleme:
      "les offres gratuites Vercel/Render sont réservées à un usage non commercial et s'endorment ; incompatibles avec un lancement public.",
    solution:
      'API sur Render Starter 7 $/mois (ou Hetzner dès ~6 €/mois en auto-hébergé) et PWA sur Vercel Hobby ou Netlify. Total : environ 7 à 12 $/mois pour la 1.0.',
    decision: 'validation du budget hébergement (~10 $/mois) et du moyen de paiement.',
  },
  {
    no: 4,
    titre: 'Les appareils de test',
    probleme:
      "sans vrai iPhone, sans Android bas de gamme et sans locuteur lingala, on livre à l'aveugle sur les trois publics visés.",
    solution:
      "la couverture automatique existe déjà (tests Playwright sur WebKit et Chromium). Pour le réel : un iPhone d'occasion récent suffit, un Android à ~100 $ (par ex. Redmi/Tecno) pour le bas de gamme, et un locuteur lingala recruté dans l'entourage pour la relecture. Coût indicatif : 250 à 450 $ une fois.",
    decision: 'qui prête/achète les deux téléphones, et le nom du relecteur lingala.',
  },
];

// Comparatif hébergement (doc technique + dossier complet)
const HEBERGEMENT = {
  headers: ['Option', 'API', 'PWA', 'Total / mois', 'Points forts', 'Limites'],
  rows: [
    [
      'A. Gratuit (test interne)',
      "Render free (s'endort)",
      'Vercel Hobby',
      '0 $',
      'Rien à payer, suffisant pour les tests',
      'Non commercial, veille au 1er appel, pas pour le public',
    ],
    [
      'B. Payant léger (recommandé)',
      'Render Starter 7 $',
      'Vercel Hobby / Netlify',
      '~7–12 $',
      'Toujours en ligne, commercial OK, zéro admin',
      'Budget mensuel récurrent',
    ],
    [
      'C. Auto-hébergé',
      'VPS Hetzner ~6 € (CX23)',
      'Sur le même VPS',
      '~6–8 €',
      'Prix plancher, contrôle total, cohérent avec la position confidentialité',
      'Administration à assurer (mises à jour, HTTPS, sauvegardes)',
    ],
  ],
  widths: [2.2, 2.1, 1.9, 1.3, 2.4, 2.6],
};

// Ce qui est déjà réglé (doc technique + dossier complet)
const REGLE = [
  "Détection d'arnaques par règles, sans réseau, sur le téléphone — livrée.",
  'Masquage vérifiable des 12 derniers messages — livré.',
  'Agent Six avec contrôle qualité des brouillons et repli sûr — livré.',
  'Tests navigateur WebKit + Chromium en CI, logs sans données personnelles — livrés.',
  "Les fonctionnalités reportées (comptes, paiement mobile money, vocal, partage) glissent en 1.1 : elles ne menacent pas l'échéance.",
];

// Plan des 8 jours (doc technique + dossier complet)
const PLAN = [
  [
    'J+1–J+2',
    'Vote des 4 décisions (budget, machine, hébergement, appareils)',
    "Rien — c'est la priorité",
  ],
  [
    'J+2–J+3',
    'Commande hébergement + carte, déploiement API et PWA, pastille verte',
    'Décisions 1 et 3',
  ],
  ['J+3–J+5', 'Tests sur vrais appareils, relecture lingala, corrections', 'Décision 4'],
  ['J+5–J+7', "Banc d'essai final, plafond API appliqué, documentation", 'Décision 2'],
  ['J+8', 'Mise en production de ce qui est fini ; le reste part en 1.1', 'Tout'],
];

const CITATION = "« L'IA propose, l'humain décide. »";

/* ================================================================== */
/* DOCUMENT 1 — dossier technique                                     */
/* ================================================================== */
makePdf(
  join(root, 'docs', 'faisabilite-six.pdf'),
  'Problèmes de faisabilité — octobre 2026',
  (d) => {
    const { heading, text, bullet, table, spacer } = d;
    const { bleu, gris, rouge } = d.colors;

    heading(1, 'Six 1.0 — Problèmes de faisabilité et solutions');
    text(`Document de travail — ${DATE} — périmètre Six 1.0 (échéance 13 octobre 2026)`, {
      size: 9,
      color: gris,
      after: 14,
    });

    heading(2, '1. Où en est le projet');
    text(
      "Six est une PWA qui propose des réponses à une conversation (WhatsApp, SMS, e-mail) sans jamais parler à la place de l'utilisateur. Le code est déjà substantiel : le parcours /repondre complet, l'Agent Six (détection d'arnaques, contrôle des brouillons, apprentissage du style), le banc d'essai, 10 fichiers de tests unitaires et des tests navigateur Android/iPhone en CI.",
      { after: 6 },
    );
    text(
      'Les obstacles ne sont pas techniques : quatre questions ouvertes, relevées dans docs/decisions.md, bloquent la Phase 3. Ce document chiffre chaque problème et propose une résolution.',
      { after: 10 },
    );

    heading(2, '2. Les quatre problèmes et leurs solutions');
    for (const p of PROBLEMES) {
      heading(3, `Problème ${p.no} — ${p.titre}`);
      bullet(`Le problème : ${p.probleme}`);
      bullet(`Solution proposée : ${p.solution}`);
      bullet(`Décision attendue : ${p.decision}`, { color: rouge });
    }

    heading(2, '3. Comparatif hébergement (API + PWA)');
    table(HEBERGEMENT.headers, HEBERGEMENT.rows, HEBERGEMENT.widths);
    spacer(6);
    text(
      "Prix relevés en octobre 2026. Recommandation : option B pour le lancement, option C en consolidation si l'équipe veut tout maîtriser.",
      { size: 8.5, color: gris, after: 10 },
    );

    heading(2, '4. Budget total estimé pour la 1.0');
    table(['Poste', 'Mensuel', 'Une fois', 'Notes'], COUTS, [2.4, 1.5, 1.5, 3.0]);
    spacer(8);

    heading(2, '5. Ce qui est déjà réglé (aucune décision requise)');
    for (const r of REGLE) bullet(r);

    heading(2, '6. Plan des 8 jours restants');
    table(['Jours', 'Travail', 'Dépend de'], PLAN, [1.2, 3.4, 2.2]);
    spacer(8);

    heading(2, '7. Conclusion');
    text(
      "Le projet est réalisable pour le 13 octobre. Le périmètre technique de la 1.0 est déjà écrit et testé ; les quatre problèmes ouverts sont des décisions d'organisation et de budget, tranchables en une réunion. La seule vraie incertitude est le coût IA réel, que le banc d'essai permet de mesurer avant engagement.",
      { after: 6 },
    );
    text(CITATION, { size: 10, font: 'F1', color: bleu, align: 'center' });
  },
);

/* ================================================================== */
/* DOCUMENT 2 — feuille de décision pour la direction                 */
/* ================================================================== */
makePdf(join(root, 'docs', 'decisions-a-voter.pdf'), 'Décisions à prendre — direction', (d) => {
  const { heading, text, bullet, table, spacer } = d;
  const { bleu, gris, rouge } = d.colors;

  heading(1, 'Six — Décisions à prendre avant le lancement');
  text(
    `Présenté par le programmeur — ${DATE}. Tout ce qui suit est un choix d'argent et d'organisation, pas un choix technique : l'application est construite et testée. Il reste 8 jours avant l'échéance du 13 octobre.`,
    { size: 9, color: gris, after: 14 },
  );

  heading(2, 'Le projet en deux phrases');
  text(
    "Six est une application qui aide quelqu'un à répondre à un message (WhatsApp, SMS, e-mail) : l'application propose jusqu'à trois réponses prêtes, et la personne garde toujours la main — elle choisit, corrige et envoie elle-même. Les conversations privées ne sont jamais stockées.",
    { after: 6 },
  );
  text(
    "Ce qui est déjà fait : l'application fonctionne de bout en bout et est testée automatiquement. Il ne manque que des décisions d'argent et d'organisation — c'est le sujet de cette page.",
    { after: 10 },
  );

  heading(2, 'Les 4 décisions, en français simple');
  for (const dec of DECISIONS) {
    heading(3, `Décision ${dec.no} — ${dec.titre}`);
    bullet(`Le sujet : ${dec.sujet}`);
    bullet(`Ce qu'on demande : ${dec.demande}`);
  }

  heading(2, 'Coût total pour lancer (8 jours restants)');
  table(['Poste', 'Chaque mois', 'Une seule fois', 'Notes'], COUTS, [2.4, 1.5, 1.5, 3.0]);
  spacer(8);

  heading(2, 'Ce qui se passe si une décision tarde');
  table(['Si…', 'Alors…'], TARDE, [2.2, 4.0]);
  spacer(8);

  heading(2, 'Ce que je demande ce mardi');
  bullet('Un oui/non sur chaque décision (5 minutes de vote suffit).');
  bullet('Un porteur de carte (ou une carte prépayée) pour les deux budgets récurrents.', {
    color: rouge,
  });
  bullet('Le nom de qui achète/prête les téléphones et du relecteur lingala.');

  heading(2, 'Pourquoi je peux vous le garantir');
  bullet(
    "Toute la partie logicielle de la 1.0 est écrite, testée et relue : le parcours complet, la protection contre les arnaques, le masquage des noms et numéros avant l'envoi au serveur.",
  );
  bullet(
    "Chaque décision peut être testée à petit budget avant engagement (le banc d'essai mesure le coût IA réel).",
  );
  bullet(
    "Une fonctionnalité non terminée le 13 octobre ne part pas : c'est déjà écrit dans les règles du projet.",
  );

  heading(2, 'Conclusion');
  text(
    "Le logiciel est prêt. Les quatre décisions ci-dessus sont des choix d'argent et d'organisation : elles se prennent en une réunion de 30 minutes. Avec le feu vert, la mise en ligne est possible dans les 8 jours.",
    { after: 6 },
  );
  text("« L'IA propose, l'humain décide. » — c'est vrai pour l'application, et c'est vrai ici.", {
    size: 10,
    font: 'F1',
    color: bleu,
    align: 'center',
  });
});

/* ================================================================== */
/* DOCUMENT 3 — dossier complet (faisabilité + décisions mélangées)   */
/* ================================================================== */
makePdf(
  join(root, 'docs', 'faisabilite-et-decisions.pdf'),
  'Dossier complet — faisabilité & décisions',
  (d) => {
    const { heading, text, bullet, table, spacer } = d;
    const { bleu, gris, rouge } = d.colors;

    heading(1, 'Six 1.0 — Dossier complet');
    text(
      `Faisabilité et décisions à voter — ${DATE} — échéance du 13 octobre 2026. Ce document mélange les deux : les parties 1 et 2 s'adressent à la direction (en français simple), les parties 3 à 5 donnent le détail technique pour l'équipe.`,
      { size: 9, color: gris, after: 14 },
    );

    heading(2, 'Sommaire');
    bullet('Partie 1 — Le projet en deux phrases');
    bullet('Partie 2 — Les 4 décisions à prendre, le coût total et les conséquences des retards');
    bullet('Partie 3 — Analyse de faisabilité : les 4 problèmes en détail et leurs solutions');
    bullet('Partie 4 — Ce qui est déjà réglé (aucune décision requise)');
    bullet('Partie 5 — Plan des 8 jours restants et conclusion');
    spacer(6);

    heading(2, 'Partie 1 — Le projet en deux phrases');
    text(
      "Six est une application qui aide quelqu'un à répondre à un message (WhatsApp, SMS, e-mail) : l'application propose jusqu'à trois réponses prêtes, et la personne garde toujours la main — elle choisit, corrige et envoie elle-même. Les conversations privées ne sont jamais stockées.",
      { after: 6 },
    );
    text(
      "L'application fonctionne de bout en bout et est testée automatiquement (10 fichiers de tests, tests navigateur Android/iPhone en CI). Il ne manque que des décisions d'argent et d'organisation — objet de la partie 2.",
      { after: 10 },
    );

    heading(2, 'Partie 2 — Les 4 décisions à prendre (pour la direction)');
    for (const dec of DECISIONS) {
      heading(3, `Décision ${dec.no} — ${dec.titre}`);
      bullet(`Le sujet : ${dec.sujet}`);
      bullet(`Ce qu'on demande : ${dec.demande}`);
    }

    heading(3, 'Coût total pour lancer');
    table(['Poste', 'Chaque mois', 'Une seule fois', 'Notes'], COUTS, [2.4, 1.5, 1.5, 3.0]);
    spacer(6);

    heading(3, 'Ce qui se passe si une décision tarde');
    table(['Si…', 'Alors…'], TARDE, [2.2, 4.0]);
    spacer(6);

    heading(3, 'Ce que je demande en réunion');
    bullet('Un oui/non sur chaque décision (5 minutes de vote suffit).');
    bullet('Un porteur de carte (ou une carte prépayée) pour les deux budgets récurrents.', {
      color: rouge,
    });
    bullet('Le nom de qui achète/prête les téléphones et du relecteur lingala.');
    spacer(6);

    heading(2, "Partie 3 — Analyse de faisabilité (détail pour l'équipe)");
    for (const p of PROBLEMES) {
      heading(3, `Problème ${p.no} — ${p.titre}`);
      bullet(`Le problème : ${p.probleme}`);
      bullet(`Solution proposée : ${p.solution}`);
      bullet(`Décision attendue : ${p.decision}`, { color: rouge });
    }

    heading(3, 'Comparatif hébergement (API + PWA)');
    table(HEBERGEMENT.headers, HEBERGEMENT.rows, HEBERGEMENT.widths);
    spacer(6);
    text(
      "Prix relevés en octobre 2026. Recommandation : option B pour le lancement, option C en consolidation si l'équipe veut tout maîtriser.",
      { size: 8.5, color: gris, after: 8 },
    );

    heading(2, 'Partie 4 — Ce qui est déjà réglé (aucune décision requise)');
    for (const r of REGLE) bullet(r);
    spacer(6);

    heading(2, 'Partie 5 — Plan des 8 jours restants');
    table(['Jours', 'Travail', 'Dépend de'], PLAN, [1.2, 3.4, 2.2]);
    spacer(8);

    heading(2, 'Conclusion');
    text(
      "Le projet est réalisable pour le 13 octobre. Le périmètre technique de la 1.0 est déjà écrit et testé ; les quatre problèmes ouverts sont des décisions d'organisation et de budget, tranchables en une réunion de 30 minutes. La seule vraie incertitude est le coût IA réel, que le banc d'essai permet de mesurer avant engagement. Avec le feu vert, la mise en ligne est possible dans les 8 jours.",
      { after: 6 },
    );
    text(CITATION, { size: 10, font: 'F1', color: bleu, align: 'center' });
  },
);
