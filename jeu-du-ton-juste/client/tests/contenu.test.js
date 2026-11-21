// Tests du contenu bonus : 210 devinettes (40 classiques, 100 difficiles, 70 expertes)
// et 82 énigmes (50 difficiles, 32 expertes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RIDDLES, TOTAL_DEVINETTES } from '../src/data/riddles.js';
import { ENIGMAS, TOTAL_ENIGMES } from '../src/data/enigmas.js';
import { ETAT_VIDE, lireSauvegarde } from '../src/engine/progression.js';

test('la banque contient 210 devinettes et 82 énigmes', () => {
  assert.equal(TOTAL_DEVINETTES, 210);
  assert.equal(RIDDLES.length, 210);
  assert.equal(TOTAL_ENIGMES, 82);
  assert.equal(ENIGMAS.length, 82);
  assert.equal(RIDDLES.filter((item) => item.difficulte === 'classique').length, 40);
  assert.equal(RIDDLES.filter((item) => item.difficulte === 'difficile').length, 100);
  assert.equal(RIDDLES.filter((item) => item.difficulte === 'experte').length, 70);
  assert.equal(ENIGMAS.filter((item) => item.difficulte === 'experte').length, 32);
});

test('chaque défi a un identifiant unique, une question et une bonne réponse valide', () => {
  for (const liste of [RIDDLES, ENIGMAS]) {
    const ids = liste.map((item) => item.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(Math.min(...ids), 1);
    assert.equal(Math.max(...ids), liste.length);
  }

  const questions = [...RIDDLES, ...ENIGMAS].map((item) => item.question);
  assert.equal(new Set(questions).size, questions.length);

  for (const riddle of RIDDLES) {
    assert.ok(riddle.question.length > 10);
    assert.equal(riddle.choix.length, 3);
    assert.ok(riddle.bonneReponse >= 0 && riddle.bonneReponse < riddle.choix.length);
    assert.ok(riddle.reward > 0);
  }

  for (const enigme of ENIGMAS) {
    assert.ok(enigme.titre.length > 3);
    assert.ok(enigme.question.length > 20);
    assert.equal(enigme.choix.length, 4);
    assert.ok(enigme.bonneReponse >= 0 && enigme.bonneReponse < enigme.choix.length);
    assert.ok(enigme.explication.length > 10);
    if (enigme.difficulte === 'experte') {
      assert.ok(enigme.reward >= 70 && enigme.reward <= 110, 'récompense experte 70-110');
    } else {
      assert.ok(enigme.reward >= 30 && enigme.reward <= 50, 'récompense difficile 30-50');
    }
  }
});

test('les devinettes et énigmes difficiles expliquent leur réponse', () => {
  for (const riddle of RIDDLES.filter((item) => item.id > 40)) {
    assert.ok(riddle.explication && riddle.explication.length > 10);
  }
  for (const enigme of ENIGMAS) {
    assert.ok(enigme.explication && enigme.explication.length > 10);
  }
});

test('la sauvegarde accepte les nouveaux identifiants et rejette les hors-bornes', () => {
  const etat = lireSauvegarde({
    solvedRiddles: [1, 40, 140, 141, 210, 211, 0, 'x'],
    solvedEnigmas: [1, 50, 51, 82, 83, 0, 'y'],
  });
  assert.deepEqual(etat.solvedRiddles, [1, 40, 140, 141, 210]);
  assert.deepEqual(etat.solvedEnigmas, [1, 50, 51, 82]);
  assert.deepEqual(ETAT_VIDE.solvedEnigmas, []);
});
