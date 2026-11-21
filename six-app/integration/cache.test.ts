// Contrôle RÉEL de la mise en cache (coûte environ 1 à 2 centimes) : npm run check-cache
// 1) le prompt système de rédaction dépasse le minimum de mise en cache du modèle ;
// 2) deux demandes de rédaction de suite : la seconde relit le cache (cache lu > 0).
// Ignoré si aucune clé Claude n'est configurée dans .env.local.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { callAI } from "@/lib/ai";
import { REDACTION_SYSTEM, repliesPrompt } from "@/lib/prompt";

const envFile = join(import.meta.dirname, "..", ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
const MODEL = process.env.CLAUDE_MODEL_REDACTION || "claude-sonnet-5-5";
// Minimums de mise en cache (doc Anthropic) : 512 tokens pour Sonnet 5.5, 4096 pour Haiku 4.5.
const MINIMUM = MODEL.startsWith("claude-haiku-4-5") ? 4096 : 512;

describe.skipIf(!hasKey)(`mise en cache du prompt de rédaction (${MODEL})`, () => {
  it(`le prompt système dépasse le minimum de ${MINIMUM} tokens`, async () => {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const avec = await client.messages.countTokens({
      model: MODEL,
      system: REDACTION_SYSTEM,
      messages: [{ role: "user", content: "x" }],
    });
    const sans = await client.messages.countTokens({ model: MODEL, messages: [{ role: "user", content: "x" }] });
    const systemTokens = avec.input_tokens - sans.input_tokens;
    console.log(`Prompt système de rédaction : ${systemTokens} tokens (minimum ${MINIMUM})`);
    expect(systemTokens).toBeGreaterThanOrEqual(MINIMUM);
  });

  it("la seconde demande relit le cache", async () => {
    const lignes: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((...a: unknown[]) => void lignes.push(String(a[0])));
    // Conversation d'essai inventée, déjà masquée.
    const p1 = repliesPrompt({ conversation: "[PERSONNE 1]: Tu viens ce soir ?", objectif: "Accepter", ton: "amical", longueur: "courte" });
    const p2 = repliesPrompt({ conversation: "[PERSONNE 1]: Tu peux m'envoyer le dossier ?", objectif: "Gagner du temps", ton: "professionnel", longueur: "courte" });
    await callAI("redaction", p1.system, p1.user, 4000);
    await callAI("redaction", p2.system, p2.user, 4000);
    spy.mockRestore();
    const lu = lignes.map((l) => Number(l.match(/cache lu (\d+)/)?.[1] ?? 0));
    const ecrit = lignes.map((l) => Number(l.match(/cache écrit (\d+)/)?.[1] ?? 0));
    console.log(lignes.join("\n"));
    expect(lignes).toHaveLength(2);
    expect(ecrit[0] + lu[0]).toBeGreaterThan(0); // 1re demande : cache écrit (ou déjà chaud)
    expect(lu[1]).toBeGreaterThan(0); // 2e demande, autre conversation : le système est relu depuis le cache
  }, 120_000);
});
