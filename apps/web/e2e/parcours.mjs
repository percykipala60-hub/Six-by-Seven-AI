// Parcours complet + confidentialité. Prérequis : le serveur tourne (npm run dev ou npm start).
// Avec ou sans clé d'IA : sans clé, le faux modèle prouve le parcours, pas la qualité des réponses.
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE, DONNEES_PERSONNELLES, EXPORT_ESSAI, ouvrir, rapport } from './lib.mjs';

const r = rapport();
const dir = mkdtempSync(join(tmpdir(), 'six-e2e-'));
const fichier = join(dir, 'Discussion WhatsApp avec Patrick.txt');
writeFileSync(fichier, EXPORT_ESSAI, 'utf8');

const { browser, page } = await ouvrir();
const apiCorps = [];
const apiReponses = [];
page.on('request', (req) => {
  if (req.url().includes('/api/')) apiCorps.push({ url: req.url(), corps: req.postData() ?? '' });
});
page.on('response', async (res) => {
  if (res.url().includes('/api/')) apiReponses.push(await res.text().catch(() => ''));
});

try {
  // Accueil et écran WhatsApp
  await page.goto(BASE + '/');
  r.verifier('Accueil affiché', (await page.locator('#conv').count()) === 1);
  await page.getByRole('button', { name: 'Importer' }).click(); // le « + » de la barre de saisie ouvre la feuille d'import
  await page.getByRole('button', { name: 'Export de conversation' }).click();
  r.verifier('Bouton Ouvrir WhatsApp', (await page.locator('a[href="whatsapp://"]').count()) === 1);
  // Le mode d'emploi est replié par défaut : on l'ouvre, puis on vérifie les étapes de l'app choisie.
  await page.getByRole('button', { name: 'Comment ça marche' }).click();
  r.verifier('Écran export guidé', (await page.locator('text=Exporter la discussion').count()) > 0);

  // Import d'un export (choix du fichier à la main)
  await page.locator('input[type=file][accept*=".zip"]').first().setInputFiles(fichier);
  await page.waitForSelector('text=Voici ce qui', { timeout: 15000 });
  const masque = await page.locator('.convo').innerText();
  r.verifier(
    "Noms, numéro et e-mail masqués à l'écran",
    !DONNEES_PERSONNELLES.test(masque),
    masque,
  );

  // Fil unique : la conversation part masquée, Six répond en dessous (compréhension ou alerte, puis 3 réponses)
  await page.waitForSelector('text=Ce que Six a compris', { timeout: 20000 }).catch(() => {});
  const alerte = (await page.locator('text=ressemble à une arnaque').count()) > 0;
  r.verifier(
    'Analyse affichée dans le fil (compréhension ou alerte arnaque)',
    alerte || (await page.locator('text=Ce que Six a compris').count()) > 0,
  );
  if (alerte) await page.getByRole('button', { name: 'Répondre prudemment' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.reply').length === 3, null, {
    timeout: 45000,
  }); // elles s'écrivent une par une
  r.verifier('Trois réponses proposées dans le fil', (await page.locator('.reply').count()) === 3);
  r.verifier(
    'Tout sur le même écran (conversation envoyée toujours visible)',
    (await page.locator('.envoi .convo').count()) === 1,
  );

  // Une précision écrite dans la barre de saisie réécrit les réponses sur place
  await page.locator('#conv').fill('Je ne peux pas samedi');
  await page.getByRole('button', { name: 'Envoyer la précision' }).click();
  await page.waitForSelector('.bulle-moi', { timeout: 5000 });
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.reply').length === 3 && !document.querySelector('.bubbles.busy'),
    null,
    { timeout: 30000 },
  );
  r.verifier(
    'Précision envoyée et réponses réécrites',
    (await page.locator('.bulle-moi').count()) === 1,
  );

  // Ajustement sur place puis copie
  await page.getByRole('button', { name: 'Ajuster' }).click();
  r.verifier('Ajustement dans le fil', (await page.locator('#txt').count()) === 1);
  await page.getByRole('button', { name: 'Valider et copier' }).click();
  await page.waitForSelector("text=effacée de l'appareil");
  r.verifier(
    'Fin dans le fil et conversation effacée',
    (await page.locator('.envoi').count()) === 0,
  );

  // Confidentialité : ce qui est parti vers le serveur
  const envoyes = apiCorps.filter((c) => c.corps);
  r.verifier('Des requêtes IA ont bien été envoyées', envoyes.length >= 2);
  r.verifier(
    'Aucune donnée personnelle dans les requêtes /api',
    envoyes.every((c) => !DONNEES_PERSONNELLES.test(c.corps)),
    envoyes.find((c) => DONNEES_PERSONNELLES.test(c.corps))?.url,
  );
  r.verifier(
    'Aucune clé dans les réponses /api',
    apiReponses.every((t) => !/sk-[A-Za-z0-9]{10,}|x-api-key|ANTHROPIC|OPENAI/.test(t)),
  );
  const html = await page.content();
  r.verifier(
    'Aucune clé dans la page envoyée au navigateur',
    !/sk-[A-Za-z0-9]{10,}|ANTHROPIC_API_KEY|OPENAI_API_KEY/.test(html),
  );

  // Cas limites de l'API
  const api = (corps) =>
    page.evaluate(
      async (c) =>
        (
          await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: c,
          })
        ).status,
      corps,
    );
  r.verifier(
    'Conversation vide refusée (400)',
    (await api(JSON.stringify({ conversation: '' }))) === 400,
  );
  r.verifier(
    'Plus de 2000 caractères refusé (400)',
    (await api(JSON.stringify({ conversation: 'a'.repeat(2001) }))) === 400,
  );
  r.verifier('JSON invalide refusé (400)', (await api('pas du json')) === 400);

  // Pages
  for (const chemin of ['/reglages', '/sujets', '/confidentialite', '/conditions', '/mentions']) {
    const res = await page.goto(BASE + chemin);
    r.verifier(`Page ${chemin}`, res?.status() === 200);
  }

  // Mobile : pas de défilement horizontal
  await page.goto(BASE + '/');
  r.verifier(
    'Pas de défilement horizontal à 375 px',
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  );
} catch (e) {
  r.verifier('Parcours sans interruption', false, String(e).split('\n')[0]);
} finally {
  await browser.close();
  r.fin();
}
