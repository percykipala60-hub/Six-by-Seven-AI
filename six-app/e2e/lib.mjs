// Outils communs aux contrôles de bout en bout. Navigateur installé sur la machine (Edge par défaut) :
// BROWSER_CHANNEL=chrome pour Chrome. Serveur visé : BASE_URL (http://localhost:3000 par défaut).
import { chromium } from "playwright-core";

export const BASE = process.env.BASE_URL || "http://localhost:3000";

// Conversation d'essai INVENTÉE : jamais de vraie conversation.
export const EXPORT_ESSAI = [
  "12/09/2026, 14:33 - Patrick: Salut Deborah, tu peux m'envoyer le dossier avant 17h ? C'est urgent",
  "12/09/2026, 14:35 - Deborah: Je suis en cours jusqu'à 16h30",
  "12/09/2026, 14:40 - Patrick: Ok mais appelle-moi au +243 81 234 5678 ou écris à patrick@exemple.cd",
  "",
].join("\n");

export const DONNEES_PERSONNELLES = /Patrick|Deborah|243 ?81|patrick@exemple/;

export async function ouvrir({ mobile = true } = {}) {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || "msedge", headless: true });
  const ctx = await browser.newContext({ viewport: mobile ? { width: 375, height: 812 } : { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  return { browser, ctx, page };
}

/** Petit rapporteur : chaque contrôle affiche OK ou ÉCHEC, le code de sortie vaut 1 s'il y a un échec. */
export function rapport() {
  let echecs = 0;
  return {
    verifier(nom, condition, detail = "") {
      if (!condition) echecs++;
      console.log(`${condition ? "OK    " : "ÉCHEC "} ${nom}${!condition && detail ? ` → ${detail}` : ""}`);
    },
    fin() {
      console.log(echecs ? `\n${echecs} contrôle(s) en échec` : "\nTous les contrôles passent");
      process.exitCode = echecs ? 1 : 0;
    },
  };
}
