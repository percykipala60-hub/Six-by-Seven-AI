import { describe, expect, it } from "vitest";
import { REDACTION_SYSTEM, analysisPrompt, isCanal, parseAnalysis, repliesPrompt } from "@/lib/prompt";

const base = { conversation: "[PERSONNE 1] : Tu as disparu !", objectif: "Donner des nouvelles", ton: "amical" as const, longueur: "courte" as const };

describe("second degré", () => {
  it("demande les nuances à l'analyse et à la rédaction", () => {
    expect(analysisPrompt("x").system).toContain('"nuances"');
    expect(analysisPrompt("x").system).toContain("Tu as disparu");
    expect(REDACTION_SYSTEM).toContain("## Lire au second degré, entre cultures");
    expect(REDACTION_SYSTEM).toContain("Ne suppose jamais l'origine");
  });

  it("lit les nuances, en garde 3 au plus et écarte les incomplètes", () => {
    const n = (e: string) => ({ expression: e, premier_degre: "un reproche", sens_probable: "tu m'as manqué" });
    const a = parseAnalysis(
      JSON.stringify({ resume: "r", nuances: [n("a"), { expression: "b" }, "texte", n("c"), n("d"), n("e")] }),
    );
    expect(a.nuances.map((x) => x.expression)).toEqual(["a", "c", "d"]);
  });

  it("borne la longueur des nuances affichées", () => {
    const a = parseAnalysis(JSON.stringify({ resume: "r", nuances: [{ expression: "x".repeat(500), sens_probable: "y".repeat(500) }] }));
    expect(a.nuances[0].expression.length).toBe(80);
    expect(a.nuances[0].sens_probable.length).toBe(160);
    expect(a.nuances[0].premier_degre).toBe("");
  });

  it("donne une liste vide si l'IA n'en renvoie pas", () => {
    expect(parseAnalysis('{"resume":"r"}').nuances).toEqual([]);
    expect(parseAnalysis('{"resume":"r","nuances":"aucune"}').nuances).toEqual([]);
  });
});

describe("réseau", () => {
  it("indique le réseau dans le message, jamais dans le prompt système (cache)", () => {
    const sms = repliesPrompt({ ...base, canal: "sms" });
    expect(sms.user).toContain("Réseau : sms.");
    expect(sms.system).toBe(REDACTION_SYSTEM);
    expect(repliesPrompt(base).user).not.toContain("Réseau");
  });

  it("décrit la forme de chaque réseau dans le prompt système", () => {
    for (const c of ["whatsapp", "sms", "instagram", "facebook", "linkedin", "email"]) expect(REDACTION_SYSTEM).toContain(c);
    expect(REDACTION_SYSTEM).toContain("commentaire PUBLIC");
  });

  it("n'accepte que les réseaux connus", () => {
    expect(isCanal("whatsapp")).toBe(true);
    expect(isCanal("linkedin")).toBe(true);
    expect(isCanal("myspace")).toBe(false);
    expect(isCanal(3)).toBe(false);
  });
});
