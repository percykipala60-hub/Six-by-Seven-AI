// Lecture d'une capture d'écran : une fausse discussion WhatsApp en mode sombre (INVENTÉE) est dessinée dans le
// navigateur, photographiée, puis donnée à Six. On vérifie que l'en-tête et la barre de saisie sont retirés,
// que « Moi » et « Autre » sont bien séparés, et que la capture part directement dans le fil.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE, ouvrir, rapport } from './lib.mjs';

const r = rapport();
const dir = mkdtempSync(join(tmpdir(), 'six-capture-'));
const image = join(dir, 'capture.png');

const bulle = (moi, texte, heure) =>
  `<div style="display:flex;justify-content:${moi ? 'flex-end' : 'flex-start'};margin:6px 12px">` +
  `<div style="max-width:78%;padding:8px 10px 6px;border-radius:10px;background:${moi ? '#005c4b' : '#202c33'};color:#e9edef;font:17px/1.35 Segoe UI,Arial">` +
  `${texte}<span style="font-size:12px;color:#8696a0;margin-left:8px">${heure}</span></div></div>`;

const html = `<!doctype html><body style="margin:0;width:420px;height:880px;background:#0b141a;position:relative;overflow:hidden">
<div style="height:28px;color:#e9edef;font:14px Arial;padding:4px 16px">22:33 &nbsp; LTE 45%</div>
<div style="height:56px;background:#202c33;color:#e9edef;font:18px Arial;padding:10px 16px">Junior<br><span style="font-size:13px;color:#8696a0">en ligne</span></div>
<div style="padding-top:20px">
${bulle(false, 'Eh grand frère, tu as disparu ! On ne te voit plus', '21:02')}
${bulle(false, 'Samedi on fait la fête chez Maman, il faut passer', '21:03')}
${bulle(true, 'Désolé, le nouveau travail me prend tout mon temps', '21:10')}
${bulle(true, 'Je viendrai samedi', '21:10')}
</div>
<div style="position:absolute;bottom:10px;left:10px;right:10px;height:48px;border-radius:24px;background:#202c33;color:#8696a0;font:17px Arial;padding:13px 18px;box-sizing:border-box">Message</div>
</body>`;

const { browser, page } = await ouvrir();
try {
  await page.setViewportSize({ width: 420, height: 880 });
  await page.setContent(html);
  await page.screenshot({ path: image });
  await page.setViewportSize({ width: 375, height: 812 });

  await page.goto(BASE + '/');
  const debut = Date.now();
  await page.locator('input[type=file][accept="image/*"]').setInputFiles(image);
  await page.waitForSelector('.envoi .envoi-tete', { timeout: 60000 });
  await page.locator('.envoi .envoi-tete').click(); // le texte envoyé est replié par défaut
  const secondes = ((Date.now() - debut) / 1000).toFixed(1);
  const lu = await page.locator('.envoi .convo').innerText();
  console.log(`Lu en ${secondes} s :\n${lu}\n`);

  r.verifier(
    'La capture part directement dans le fil',
    (await page.locator('.envoi').count()) === 1,
  );
  r.verifier('En-tête et barre de saisie retirés', !/LTE|en ligne|\bMessage\b/i.test(lu), lu);
  r.verifier("Message de l'autre lu", /disparu/i.test(lu), lu);
  r.verifier("Message de l'utilisateur lu", /samedi/i.test(lu) && /travail/i.test(lu), lu);
  const blocs = await page
    .locator('.envoi .msg')
    .evaluateAll((els) =>
      els.map((e) => ({ moi: e.classList.contains('me'), texte: e.innerText })),
    );
  const moi = blocs
    .filter((b) => b.moi)
    .map((b) => b.texte)
    .join(' ');
  const autre = blocs
    .filter((b) => !b.moi)
    .map((b) => b.texte)
    .join(' ');
  r.verifier(
    'Qui parle : « travail » est à moi',
    /travail/i.test(moi) && !/travail/i.test(autre),
    JSON.stringify(blocs),
  );
  r.verifier(
    "Qui parle : « disparu » est à l'autre",
    /disparu/i.test(autre) && !/disparu/i.test(moi),
    JSON.stringify(blocs),
  );
} catch (e) {
  r.verifier('Contrôle sans interruption', false, String(e).split('\n')[0]);
} finally {
  await browser.close();
  r.fin();
}
