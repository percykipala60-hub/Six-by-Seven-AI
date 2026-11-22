import { afterEach, describe, expect, it, vi } from "vitest";
import { clientKey, foreignOrigin, guard, readJson } from "@/lib/http";
import { dailyLimitReached } from "@/lib/ai";

const req = (headers: Record<string, string> = {}, url = "http://localhost:3000/api/analyze") =>
  new Request(url, { method: "POST", headers, body: "{}" });

afterEach(() => vi.unstubAllEnvs());

describe("origine des requêtes", () => {
  it("accepte l'app elle-même", () => {
    expect(foreignOrigin(req({ origin: "http://localhost:3000" }))).toBe(false);
    expect(foreignOrigin(req({ "sec-fetch-site": "same-origin" }))).toBe(false);
  });

  it("refuse un autre site et une requête sans origine", () => {
    expect(foreignOrigin(req({ origin: "https://site-pirate.example" }))).toBe(true);
    expect(foreignOrigin(req({ "sec-fetch-site": "cross-site" }))).toBe(true);
    expect(foreignOrigin(req())).toBe(true);
  });

  it("accepte les domaines listés dans ALLOWED_ORIGINS", () => {
    vi.stubEnv("ALLOWED_ORIGINS", "https://six.example, https://www.six.example/");
    expect(foreignOrigin(req({ origin: "https://www.six.example" }))).toBe(false);
  });

  it("guard renvoie 403 pour un autre site", async () => {
    const r = guard(req({ origin: "https://site-pirate.example" }));
    expect(r?.status).toBe(403);
  });
});

describe("adresse du client (limite de débit)", () => {
  it("ignore X-Forwarded-For sans relais de confiance", () => {
    vi.stubEnv("TRUST_PROXY", "");
    expect(clientKey(req({ "x-forwarded-for": "1.2.3.4" }))).toBe("direct");
  });

  it("prend l'adresse ajoutée par le relais de confiance, pas celle inventée par le client", () => {
    vi.stubEnv("TRUST_PROXY", "1");
    // le client a inventé 6.6.6.6, l'hébergeur a ajouté la vraie adresse 41.243.1.2 à la fin
    expect(clientKey(req({ "x-forwarded-for": "6.6.6.6, 41.243.1.2" }))).toBe("41.243.1.2");
  });

  it("un client qui change d'en-tête à chaque requête reste limité", () => {
    vi.stubEnv("TRUST_PROXY", "");
    const statuts = Array.from({ length: 22 }, (_, i) =>
      guard(req({ origin: "http://localhost:3000", "x-forwarded-for": `10.0.0.${i}` }))?.status ?? 200,
    );
    expect(statuts).toContain(429);
  });
});

describe("taille des requêtes", () => {
  it("refuse d'après la taille annoncée sans lire le corps", async () => {
    const r = new Request("http://localhost/api/x", { method: "POST", headers: { "content-length": "999999" }, body: "{}" });
    expect(await readJson(r)).toBeNull();
  });
});

describe("plafond quotidien", () => {
  it("bloque au-delà de AI_DAILY_LIMIT", () => {
    vi.stubEnv("AI_DAILY_LIMIT", "2");
    const res = [dailyLimitReached(), dailyLimitReached(), dailyLimitReached(), dailyLimitReached()];
    expect(res.slice(-2)).toEqual([true, true]);
  });

  it("se désactive avec AI_DAILY_LIMIT=0", () => {
    vi.stubEnv("AI_DAILY_LIMIT", "0");
    expect(dailyLimitReached()).toBe(false);
  });
});
