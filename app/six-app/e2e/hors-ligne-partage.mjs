// Service worker : hors-ligne et réception d'un partage WhatsApp. Prérequis : version de PRODUCTION
// (npm run build puis npm start), car le service worker ne s'active pas en développement.
import { BASE, DONNEES_PERSONNELLES, EXPORT_ESSAI, ouvrir, rapport } from "./lib.mjs";

const r = rapport();
const { browser, ctx, page } = await ouvrir();
let apiAppelee = false;
page.on("request", (req) => {
  if (req.url().includes("/api/")) apiAppelee = true;
});

try {
  await page.goto(BASE + "/");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)).catch(() => {});
  const sw = await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()));
  r.verifier("Service worker enregistré (production requise)", sw);
  if (!sw) throw new Error("service worker absent : lance la version de production");
  await page.waitForTimeout(1500);
  await page.reload();

  // Hors-ligne
  await ctx.setOffline(true);
  await page.reload();
  r.verifier("L'app s'ouvre hors-ligne", (await page.locator("#conv").count()) === 1);
  await page.goto(BASE + "/reglages");
  r.verifier("Réglages hors-ligne", (await page.locator("text=Apparence").count()) > 0);
  await ctx.setOffline(false);
  const apiEnCache = await page.evaluate(async () => {
    for (const k of await caches.keys()) {
      for (const req of await (await caches.open(k)).keys()) if (new URL(req.url).pathname.startsWith("/api/")) return true;
    }
    return false;
  });
  r.verifier("Aucune réponse /api gardée en cache", !apiEnCache);

  // Partage d'un export, comme le fait WhatsApp vers une PWA installée
  await page.goto(BASE + "/");
  await page.evaluate(async (contenu) => {
    const fd = new FormData();
    fd.append("chat", new File([contenu], "Discussion WhatsApp avec Patrick.txt", { type: "text/plain" }));
    await fetch("/share-target", { method: "POST", body: fd });
  }, EXPORT_ESSAI);
  await page.goto(BASE + "/?shared=1");
  await page.waitForSelector("text=Voici ce qui", { timeout: 15000 });
  const masque = await page.locator(".convo").innerText();
  r.verifier("Export partagé reçu et masqué", !DONNEES_PERSONNELLES.test(masque), masque);
  r.verifier("Adresse nettoyée après réception", new URL(page.url()).search === "");
  const reste = await page.evaluate(async () => (await (await caches.open("six-share")).keys()).length);
  r.verifier("Cache de partage vidé après lecture", reste === 0);
  r.verifier("Rien envoyé à /api avant le masquage", !apiAppelee);

  // Rien de partagé : retour à l'écran d'export (mode d'emploi replié, on l'ouvre pour vérifier)
  await page.goto(BASE + "/?shared=1");
  await page.getByRole("button", { name: "Comment ça marche" }).click({ timeout: 15000 });
  await page.waitForSelector("text=Exporter la discussion", { timeout: 15000 });
  r.verifier("Sans contenu partagé : écran export", true);
} catch (e) {
  r.verifier("Contrôle sans interruption", false, String(e).split("\n")[0]);
} finally {
  await browser.close();
  r.fin();
}
