// Tests de la garde d'origine : le CORS ne suffit pas, un client non-navigateur reçoit la réponse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORIGINES_PAR_DEFAUT, estLocale, lireListeOrigines, lireOrigine } from '../origins.js';

const ORIGINES = ['http://localhost:5180', 'http://127.0.0.1:5180'];

test('une origine déclarée passe', () => {
  assert.equal(lireOrigine('http://localhost:5180', '127.0.0.1', ORIGINES).autorise, true);
  assert.equal(lireOrigine('http://127.0.0.1:5180', '127.0.0.1', ORIGINES).autorise, true);
});

test('une origine étrangère est refusée, même depuis la machine locale', () => {
  const r = lireOrigine('https://evil.example', '127.0.0.1', ORIGINES);
  assert.equal(r.autorise, false);
  assert.match(r.raison, /origine refusée/);
});

test('sans en-tête Origin : les outils locaux passent, les appels distants non', () => {
  assert.equal(lireOrigine(undefined, '127.0.0.1', ORIGINES).autorise, true);
  assert.equal(lireOrigine(undefined, '::ffff:127.0.0.1', ORIGINES).autorise, true);
  assert.equal(lireOrigine(undefined, '::1', ORIGINES).autorise, true);
  const distant = lireOrigine(undefined, '203.0.113.7', ORIGINES);
  assert.equal(distant.autorise, false);
  assert.match(distant.raison, /sans origine/);
});

test('estLocale reconnaît aussi les adresses IPv4 encapsulées', () => {
  assert.equal(estLocale('::ffff:127.0.0.1'), true);
  assert.equal(estLocale('10.0.0.5'), false);
  assert.equal(estLocale(''), false);
  assert.equal(estLocale(undefined), false);
});

test('la version construite (vite preview, port 4173) peut appeler le serveur par défaut', () => {
  const origines = lireListeOrigines(undefined);
  assert.deepEqual(origines, ORIGINES_PAR_DEFAUT);
  assert.equal(lireOrigine('http://localhost:4173', '127.0.0.1', origines).autorise, true);
  assert.deepEqual(lireListeOrigines(' https://six.example , '), ['https://six.example']);
});
