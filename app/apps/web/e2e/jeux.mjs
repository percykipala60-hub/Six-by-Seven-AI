import { BASE, ouvrir, rapport } from './lib.mjs';

const r = rapport();
const { browser, page } = await ouvrir();

try {
  await page.goto(BASE + '/');
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click();

  const espaceJeu = page.getByRole('link', { name: 'Espace jeu' });
  r.verifier(
    'Espace jeu est visible dans le menu',
    (await espaceJeu.getAttribute('href')) === '/espace-jeu',
  );
  await espaceJeu.click();
  await page.waitForURL('**/espace-jeu');

  const kinRush = page.getByRole('link', { name: 'Kin Rush' });
  const tonJuste = page.getByRole('link', { name: 'Le jeu du ton juste' });
  const coupeArnaque = page.getByRole('link', { name: "Coupe l'arnaque" });
  r.verifier(
    'Kin Rush est visible dans Espace jeu',
    (await kinRush.getAttribute('href')) === '/jeu',
  );
  r.verifier(
    'Le jeu du ton juste est visible dans Espace jeu',
    (await tonJuste.getAttribute('href')) === '/ton-juste',
  );
  r.verifier(
    "Coupe l'arnaque est visible dans Espace jeu",
    (await coupeArnaque.getAttribute('href')) === '/coupe-arnaque',
  );

  await kinRush.click();
  await page.waitForURL('**/jeu');
  await page
    .frameLocator('iframe[title="Kin Rush"]')
    .getByRole('heading', { name: 'KIN RUSH' })
    .waitFor();
  r.verifier('Kin Rush est charge', (await page.locator('iframe[title="Kin Rush"]').count()) === 1);

  await page.getByRole('link', { name: 'Quitter Kin Rush' }).click();
  await page.waitForURL('**/espace-jeu');
  await page.getByRole('link', { name: 'Le jeu du ton juste' }).click();
  await page.waitForURL('**/ton-juste');
  r.verifier(
    'Le jeu du ton juste est charge',
    (await page.locator('iframe[title="Le jeu du ton juste"]').count()) === 1,
  );

  await page.getByRole('link', { name: 'Quitter Le jeu du ton juste' }).click();
  await page.waitForURL('**/espace-jeu');
  await coupeArnaque.click();
  await page.waitForURL('**/coupe-arnaque');
  const arnaqueFrame = page.frameLocator('iframe[title="Coupe l\'arnaque"]');
  await arnaqueFrame.locator('#casesBtn').waitFor();
  r.verifier(
    "Coupe l'arnaque se charge dans son iframe",
    (await page.locator('iframe[title="Coupe l\'arnaque"]').count()) === 1,
  );
  await arnaqueFrame.locator('#casesBtn').click();
  await arnaqueFrame.locator('.cbtn[data-ch="0"][data-i="0"]').click();
  await arnaqueFrame.getByRole('button', { name: 'Arnaque', exact: true }).click();
  const verdict = arnaqueFrame.locator('#cRes .verdict');
  await verdict.waitFor();
  r.verifier(
    "une enquête peut être jouée jusqu'au verdict",
    (await verdict.textContent())?.includes("Bien vu : c'est une arnaque.") ?? false,
  );
  await arnaqueFrame.locator('#cNext').click();
  await arnaqueFrame.locator('#hintBtn').click();
  const starsAfterFirstHint = await arnaqueFrame
    .locator('body')
    .evaluate(() => window.coupeArnaque.stats().stars);
  await arnaqueFrame.locator('#hintBtn').click();
  const starsAfterSecondHint = await arnaqueFrame
    .locator('body')
    .evaluate(() => window.coupeArnaque.stats().stars);
  r.verifier(
    'un indice sur un message sûr ne peut pas être facturé deux fois',
    starsAfterSecondHint === starsAfterFirstHint,
  );
} catch (error) {
  r.verifier('Parcours des jeux sans interruption', false, String(error).split('\n')[0]);
} finally {
  await browser.close();
  r.fin();
}
