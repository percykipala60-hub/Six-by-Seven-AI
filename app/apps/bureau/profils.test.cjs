'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { preparerProfils } = require('./profils.cjs');

test('permuter, fermer une session puis toutes les sessions sur ce PC', (t) => scenario(t));
async function scenario(t) {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'six-profils-'));
  let selection = 1;
  const outils = {
    app: { getPath: () => racine, setPath() {}, quit() {}, relaunch() {} },
    safeStorage: { encryptString: (s) => Buffer.from(s), decryptString: (b) => b.toString() },
    dialog: { showMessageBoxSync: () => selection },
  };
  const ouvrir = () => preparerProfils('http://localhost', outils);
  const session = (id) =>
    JSON.stringify({
      user: { id, email: id + '@example.test' },
      access_token: 'acces-' + id,
      refresh_token: 'jeton-' + id,
    });
  try {
    let profil = ouvrir();
    await profil('memoriser', session('a'));
    await profil('ajouter');
    await assert.rejects(profil('lire'));
    profil = ouvrir();
    assert.equal(await profil('lire'), null);
    await profil('memoriser', session('b'));
    const [a] = await profil('liste');
    await profil('choisir', a.id);
    profil = ouvrir();
    assert.equal(await profil('lire'), session('a'));
    await assert.rejects(profil('memoriser', session('b')));
    await profil('effacer');
    await profil('quitter');
    profil = ouvrir();
    assert.equal(await profil('lire'), session('b'));
    assert.deepEqual(await profil('liste'), []);
    await profil('ajouter');
    profil = ouvrir();
    await profil('memoriser', session('c'));
    selection = 0;
    await profil('tout-quitter');
    assert.equal((await profil('liste')).length, 1);
    selection = 1;
    await profil('tout-quitter');
    profil = ouvrir();
    assert.deepEqual(await profil('liste'), []);
    assert.equal(await profil('lire'), null);
    await profil('memoriser', session('a'));
    const verifier = t.mock.method(
      globalThis,
      'fetch',
      async () => new Response(JSON.stringify({ id: 'b' })),
    );
    await assert.rejects(profil('retrouver', 'test'));
    verifier.mock.mockImplementation(async () => new Response(JSON.stringify({ id: 'a' })));
    await profil('retrouver', 'test');
    await assert.rejects(profil('lire'));
    profil = ouvrir();
    assert.equal(await profil('lire'), session('a'));
    const fichier = fs.readdirSync(racine).find((n) => n.endsWith('.json'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(racine, fichier), 'utf8')).actif, 'initial');
  } finally {
    fs.rmSync(racine, { recursive: true, force: true });
  }
}

test('le preload appelle uniquement les profils annoncés par le processus principal', async () => {
  const { runInNewContext } = require('node:vm');
  const source = fs.readFileSync(path.join(__dirname, 'preload.cjs'), 'utf8');
  for (const disponible of [false, true]) {
    let pont;
    const appels = [];
    runInNewContext(source, {
      process: { argv: disponible ? ['electron', '--six-profils-v1'] : ['electron'] },
      require: () => ({
        contextBridge: {
          exposeInMainWorld: (_nom, valeur) => {
            pont = valeur;
          },
        },
        ipcRenderer: { invoke: (...args) => appels.push(args) },
      }),
    });
    assert.equal(pont.versionProfils, Number(disponible));
    if (disponible) {
      await pont.profils.liste();
      assert.equal(appels[0][0], 'six:profils');
    } else {
      assert.equal(pont.profils, undefined);
      assert.equal(appels.length, 0);
    }
  }
});

test('une session illisible est oubliée au lieu de faire planter', async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'six-profils-'));
  const app = { getPath: () => dossier, setPath() {}, relaunch() {}, quit() {} };
  let lisible = true;
  const safeStorage = {
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => {
      if (!lisible) throw Error('Error while decrypting the ciphertext');
      return b.toString();
    },
  };
  const commander = preparerProfils('http://localhost:3000', { app, safeStorage, dialog: {} });
  await commander('memoriser', JSON.stringify({ user: { id: 'u1' }, refresh_token: 'r' }));
  lisible = false;
  assert.equal(await commander('lire'), null);
  assert.equal(await commander('lire'), null);
});
