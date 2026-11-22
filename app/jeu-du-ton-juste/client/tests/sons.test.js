// Tests du module de sons : trois séquences connues, jouées sans erreur même sans audio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEQUENCES, SONS, jouerSon } from '../src/engine/sons.js';

test('il y a exactement trois sons : bonne réponse, mauvaise réponse, défaite', () => {
  assert.deepEqual(SONS, ['bonne-reponse', 'mauvaise-reponse', 'defaite']);
});

test('chaque séquence a des notes complètes et jouables', () => {
  for (const nom of SONS) {
    const notes = SEQUENCES[nom];
    assert.ok(notes.length >= 2, `${nom} : au moins deux notes`);
    for (const [frequence, attente, duree, type, volume] of notes) {
      assert.ok(frequence > 0 && frequence < 20000, `${nom} : fréquence audible`);
      assert.ok(attente >= 0, `${nom} : délai positif`);
      assert.ok(duree > 0, `${nom} : durée positive`);
      assert.ok(['sine', 'triangle', 'square', 'sawtooth'].includes(type), `${nom} : onde connue`);
      assert.ok(volume > 0 && volume <= 1, `${nom} : volume borné`);
    }
  }
});

test('jouerSon ignore les noms inconnus et marche sans AudioContext (node)', () => {
  assert.doesNotThrow(() => jouerSon('inconnu'));
  assert.doesNotThrow(() => jouerSon('bonne-reponse')); // pas de window en node : silencieux
});
