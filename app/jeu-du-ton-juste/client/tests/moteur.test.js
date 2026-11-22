// Tests du moteur du jeu (lanceur intégré à Node : npm test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeOutcome } from '../src/engine/probability.js';
import {
  computeRank,
  computeStars,
  computeTotalStars,
  isLevelUnlocked,
} from '../src/engine/rewards.js';
import {
  ETAT_VIDE,
  SERIE_MAX,
  appliquerTentative,
  etatCarte,
  lireSauvegarde,
} from '../src/engine/progression.js';
import { LEVELS } from '../src/data/levels.js';
import { SEUILS_ETOILES } from '../src/engine/rewards.js';

/** Joue la carte entière avec une note constante et renvoie jusqu'où le joueur parvient. */
function jouerLaCarte(scoreFixe) {
  let etat = structuredClone(ETAT_VIDE);
  for (let tour = 0; tour < LEVELS.length; tour++) {
    for (const l of LEVELS) {
      if (
        !isLevelUnlocked(
          l.id,
          computeTotalStars(etat.completedLevels, etat.serieBonus),
          LEVELS,
          etat.completedLevels,
        )
      )
        continue;
      etat = appliquerTentative(etat, l, {
        score: scoreFixe,
        success: scoreFixe >= l.minScore,
        stars: computeStars(scoreFixe),
        rank: computeRank(scoreFixe),
      }).etat;
    }
  }
  const total = computeTotalStars(etat.completedLevels, etat.serieBonus);
  const ouverts = LEVELS.filter((l) => isLevelUnlocked(l.id, total, LEVELS, etat.completedLevels));
  return { total, dernierNiveauOuvert: ouverts.length ? ouverts[ouverts.length - 1].id : 0 };
}

const isLevelUnlockedTout = (id) => isLevelUnlocked(id, 0, LEVELS, {});

const niveau = (id) => LEVELS.find((l) => l.id === id);
const reussite = { score: 75, success: true, stars: 1, rank: 'bronze' };

test('tirage : sous le minimum, échec sans tirage', () => {
  const o = computeOutcome({ score: 39, minScore: 40, successRate: 90, randomFn: () => 0 });
  assert.equal(o.success, false);
  assert.equal(o.roll, null);
});

test('tirage : le nombre affiché décide (bornes 1 et 100)', () => {
  assert.equal(
    computeOutcome({ score: 80, minScore: 40, successRate: 90, randomFn: () => 0.895 }).roll,
    90,
  );
  assert.equal(
    computeOutcome({ score: 80, minScore: 40, successRate: 90, randomFn: () => 0.895 }).success,
    true,
  );
  assert.equal(
    computeOutcome({ score: 80, minScore: 40, successRate: 90, randomFn: () => 0.9 }).success,
    false,
  );
  assert.equal(
    computeOutcome({ score: 80, minScore: 40, successRate: 90, randomFn: () => 0 }).roll,
    1,
  );
  assert.equal(
    computeOutcome({ score: 80, minScore: 40, successRate: 90, randomFn: () => 0.99999 }).roll,
    100,
  );
});

test('tirage : niveau à 100 % toujours réussi', () => {
  assert.equal(
    computeOutcome({ score: 92, minScore: 92, successRate: 100, randomFn: () => 0.99 }).success,
    true,
  );
});

test('étoiles et rangs aux seuils', () => {
  // Cahier des charges : 1 étoile dès 70, 2 dès 85, 3 dès 95 (rare). Un 65 réussi ne rapporte rien.
  assert.deepEqual(SEUILS_ETOILES, [70, 85, 95]);
  assert.deepEqual([65, 69, 70, 84, 85, 94, 95].map(computeStars), [0, 0, 1, 1, 2, 2, 3]);
  assert.deepEqual([69, 70, 80, 90, 95, 98].map(computeRank), [
    null,
    'bronze',
    'argent',
    'or',
    'platine',
    'diamant',
  ]);
});

test("rejouer un niveau facile ne fabrique pas d'étoiles à l'infini", () => {
  let etat = { ...ETAT_VIDE };
  for (let i = 0; i < 30; i++)
    etat = appliquerTentative(etat, niveau(1), {
      ...reussite,
      score: 99,
      stars: 3,
      rank: 'diamant',
    }).etat;
  // 3 étoiles + 1 sans-faute, une seule fois ; aucune série (toujours le même niveau).
  assert.equal(computeTotalStars(etat.completedLevels, etat.serieBonus), 4);
});

test('série : 3 niveaux réussis pour la première fois d’affilée donnent +1, un échec remet à zéro', () => {
  let etat = { ...ETAT_VIDE };
  let r = appliquerTentative(etat, niveau(1), reussite);
  r = appliquerTentative(r.etat, niveau(2), reussite);
  r = appliquerTentative(r.etat, niveau(4), reussite);
  assert.deepEqual(
    r.bonuses.map((b) => b.id),
    ['serie_parfaite'],
  );
  assert.equal(r.etat.serieBonus, 1);
  r = appliquerTentative(r.etat, niveau(5), reussite);
  r = appliquerTentative(r.etat, niveau(6), { ...reussite, success: false, stars: 0, rank: null });
  assert.equal(r.etat.serie, 0);
});

test('cœur fidèle : seulement au premier essai du niveau piégé', () => {
  const echec = appliquerTentative({ ...ETAT_VIDE }, niveau(3), {
    score: 80,
    success: false,
    stars: 0,
    rank: null,
  });
  const ensuite = appliquerTentative(echec.etat, niveau(3), reussite);
  assert.equal(
    ensuite.bonuses.some((b) => b.id === 'coeur_fidele'),
    false,
  );
  const direct = appliquerTentative({ ...ETAT_VIDE }, niveau(3), reussite);
  assert.equal(
    direct.bonuses.some((b) => b.id === 'coeur_fidele'),
    true,
  );
  assert.equal(direct.etat.completedLevels[3].bonusStars, 2);
});

test('un niveau réussi reste réussi après un échec, avec ses meilleures étoiles', () => {
  let r = appliquerTentative({ ...ETAT_VIDE }, niveau(1), {
    score: 88,
    success: true,
    stars: 2,
    rank: 'argent',
  });
  r = appliquerTentative(r.etat, niveau(1), { score: 30, success: false, stars: 0, rank: null });
  assert.equal(r.etat.completedLevels[1].reussi, true);
  assert.equal(r.etat.completedLevels[1].stars, 2);
  assert.equal(r.etat.completedLevels[1].rank, 'argent');
});

test('ancienne sauvegarde gonflée : bonus bornés à la lecture', () => {
  const etat = lireSauvegarde({
    completedLevels: { 1: { stars: 3, bonusStars: 40, lastOutcome: 'success', attempts: 50 } },
    bonusHistory: Array.from({ length: 20 }, () => ({ id: 'serie_parfaite', stars: 1 })),
  });
  assert.equal(etat.completedLevels[1].bonusStars, 3);
  assert.equal(etat.serieBonus, SERIE_MAX);
  assert.equal(etat.completedLevels[1].reussi, true);
});

test('les données des niveaux sont cohérentes', () => {
  assert.equal(LEVELS.length, 15);
  LEVELS.forEach((l, i) => {
    assert.equal(l.id, i + 1);
    assert.ok(l.scenario && l.criteria && l.title);
    assert.ok(l.successRate > 0 && l.successRate <= 100);
    if (i > 0) assert.ok(l.unlockStars >= LEVELS[i - 1].unlockStars, `seuil du niveau ${l.id}`);
  });
  assert.equal(LEVELS.filter((l) => l.piege).length, 1);
});

test("déblocage : un niveau ne s'ouvre que si le précédent est réussi", async () => {
  const { isLevelUnlocked } = await import('../src/engine/rewards.js');
  // Niveau 1 ouvert dès le départ, niveau 2 fermé tant que le 1 n'est pas réussi, même avec des étoiles.
  assert.equal(isLevelUnlocked(1, 0, LEVELS, {}), true);
  assert.equal(isLevelUnlocked(2, 10, LEVELS, {}), false);
  assert.equal(
    isLevelUnlocked(2, 10, LEVELS, { 1: { reussi: false, lastOutcome: 'fail', attempts: 3 } }),
    false,
  );
  // Niveau 1 réussi ne suffit pas : il faut aussi 1 étoile, donc au moins 70/100 (cahier des charges).
  assert.equal(isLevelUnlocked(2, 1, LEVELS, { 1: { reussi: true, stars: 1 } }), true);
  assert.equal(isLevelUnlocked(2, 0, LEVELS, { 1: { reussi: true, stars: 0 } }), false);
  assert.equal(LEVELS.find((l) => l.id === 2).unlockStars, 1);
  // Le 3 reste fermé si le 2 n'est pas réussi, même avec beaucoup d'étoiles.
  assert.equal(isLevelUnlocked(3, 20, LEVELS, { 1: { reussi: true } }), false);
});

test('difficulté : le jeu est très dur, mais reste finissable pour un joueur excellent', () => {
  // Règle d'or n° 1 du cahier des charges. Notes constantes, tirage ignoré (toujours favorable) :
  // le tirage ne fait que rendre le jeu plus dur encore.
  assert.equal(
    isLevelUnlockedTout(2),
    false,
    'le niveau 2 reste fermé tant que le 1 n’est pas réussi',
  );
  // À 80/100, une très bonne note, le joueur reste bloqué au niveau 8.
  assert.equal(jouerLaCarte(80).dernierNiveauOuvert, 8);
  // À 85/100, il atteint le niveau 14 sans ouvrir le légendaire.
  assert.equal(jouerLaCarte(85).dernierNiveauOuvert, 14);
  // À 92/100, il réunit les 30 étoiles et réussit les 15 niveaux.
  const excellent = jouerLaCarte(92);
  assert.equal(excellent.dernierNiveauOuvert, LEVELS.length);
  assert.ok(excellent.total >= LEVELS.at(-1).unlockStars, `${excellent.total} étoiles réunies`);
  // Aucun plancher n'est hors d'atteinte : le plus haut reste sous les 3 étoiles.
  for (const l of LEVELS)
    assert.ok(l.minScore < SEUILS_ETOILES[2], `niveau ${l.id} : plancher ${l.minScore}`);
});

test('état de carte : un niveau tenté mais raté n’est plus « jamais joué »', () => {
  assert.deepEqual(etatCarte(undefined), { etat: 'jamais', essais: 0, meilleur: 0 });
  assert.deepEqual(etatCarte({ attempts: 3, bestScore: 68, reussi: false }), {
    etat: 'essais',
    essais: 3,
    meilleur: 68,
  });
  assert.deepEqual(etatCarte({ attempts: 1, bestScore: 88, reussi: true }), {
    etat: 'reussi',
    essais: 1,
    meilleur: 88,
  });
  // Un niveau réussi reste réussi même si la dernière partie a échoué.
  assert.equal(etatCarte({ attempts: 4, lastOutcome: 'fail', reussi: true }).etat, 'reussi');
});

test('rangs du joueur : Pro existe entre Compétent et Expert, et le rang suivant est juste', async () => {
  const { getPlayerRank, nextPlayerRank } = await import('../src/engine/rewards.js');
  assert.deepEqual([0, 7, 8, 16, 24, 31, 32, 40, 60].map(getPlayerRank), [
    'Débutant',
    'Débutant',
    'Apprenti',
    'Compétent',
    'Pro',
    'Pro',
    'Expert',
    'Maître',
    'Maître',
  ]);
  assert.deepEqual(nextPlayerRank(20), { nom: 'Pro', manque: 4 });
  assert.equal(nextPlayerRank(45), null);
});

test("le total d'étoiles possible compte les bonus (le Maître reste atteignable)", async () => {
  const { maxEtoiles } = await import('../src/engine/progression.js');
  assert.equal(maxEtoiles(LEVELS), 15 * 3 + 15 + 2 + 5);
  assert.ok(maxEtoiles(LEVELS) >= 40);
});

test('ancienne sauvegarde : les étoiles bonus ne disparaissent pas en rejouant le niveau', () => {
  const etat = lireSauvegarde({
    completedLevels: { 3: { stars: 1, bonusStars: 2, reussi: true, attempts: 1 } },
  });
  const r = appliquerTentative(etat, niveau(3), reussite);
  assert.equal(r.etat.completedLevels[3].bonusStars, 2);
});

test('sauvegarde : les étoiles gagnées avec les anciens seuils, plus faciles, sont recalculées', () => {
  // Ancien réglage : 82/100 valait 2 étoiles. Avec 1 étoile dès 70 et 2 dès 85, il n'en vaut plus qu'une.
  const lu = lireSauvegarde({
    completedLevels: { 1: { stars: 2, bestScore: 82, reussi: true, attempts: 2 } },
  });
  assert.equal(lu.completedLevels[1].stars, 1);
  // Une sauvegarde déjà juste ne change pas.
  const juste = lireSauvegarde({
    completedLevels: { 2: { stars: 2, bestScore: 90, reussi: true } },
  });
  assert.equal(juste.completedLevels[2].stars, 2);
});

test('réponse trop courte refusée, record calculé', async () => {
  const { reponseAssezLongue, comparerRecord, MIN_CHARS } =
    await import('../src/engine/rewards.js');
  assert.equal(reponseAssezLongue('ok'), false);
  assert.equal(reponseAssezLongue(' '.repeat(20)), false);
  assert.equal(reponseAssezLongue('a'.repeat(MIN_CHARS)), true);
  assert.deepEqual(comparerRecord(60, 72, false), { type: 'record', gain: 12 });
  assert.equal(comparerRecord(80, 72, false), null);
  assert.deepEqual(comparerRecord(0, 50, true), { type: 'premier' });
});
