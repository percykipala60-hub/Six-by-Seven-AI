import { describe, expect, it } from "vitest";
import { anonymize, markMe } from "@/lib/anonymize";
import { guessMe, isGenericSpeaker, speakerLabels, speakers } from "@/lib/whatsapp";
import { analysisPrompt, REDACTION_SYSTEM } from "@/lib/prompt";

describe("qui parle dans la conversation", () => {
  it("liste les étiquettes dans l'ordre, y compris Moi et les rôles", () => {
    expect(speakers("Moi: salut\nMaman: tu as oublié\nMaman: ce n'est pas grave")).toEqual(["Moi", "Maman"]);
    expect(speakers("Service client: votre compte est bloqué")).toEqual(["Service client"]);
    expect(speakers("Prof. Mbuyi: votre rapport ?\nGrace Kabongo: ok")).toEqual(["Prof. Mbuyi", "Grace Kabongo"]);
    expect(speakers("Rendez-vous demain : 17h")).toEqual([]);
  });

  it("ne masque pas les liens de parenté ou de rôle", () => {
    expect(isGenericSpeaker("Maman")).toBe(true);
    expect(isGenericSpeaker("service client")).toBe(true);
    expect(isGenericSpeaker("Patrick")).toBe(false);
    expect(speakerLabels("Maman: coucou\nPatrick: salut")).toEqual(["Patrick"]);
  });

  it("devine l'utilisateur : Moi, sinon celui qui n'a pas écrit le dernier message", () => {
    expect(guessMe(["Moi", "Maman"], "Moi: a\nMaman: b")).toBe("Moi");
    expect(guessMe(["Patrick", "Deborah"], "Patrick: a\nDeborah: b\nPatrick: c")).toBe("Deborah");
    expect(guessMe(["A", "B", "C"], "A: x\nB: y\nC: z")).toBe("");
    expect(guessMe(["Service client"], "Service client: payez")).toBe("");
  });

  it("marque les messages de l'utilisateur « Moi » dans le texte masqué, et seulement eux", () => {
    const conv = "Patrick: tu peux m'envoyer le dossier ?\nDeborah: je suis en cours\nPatrick: Deborah, c'est urgent";
    const m = anonymize(conv, ["Patrick", "Deborah"]);
    const out = markMe(m.text, "Deborah", m.mapping);
    const lines = out.split("\n");
    expect(lines[1].startsWith("Moi: ")).toBe(true);
    expect(lines[0].startsWith("Moi")).toBe(false);
    expect(lines[2].startsWith("Moi")).toBe(false);
    expect(out).not.toContain("Deborah"); // le vrai nom ne part jamais
    expect(markMe("Moi: a\nX: b", "Moi", {})).toBe("Moi: a\nX: b");
    expect(markMe("A: a", "", {})).toBe("A: a");
  });

  it("explique à l'IA qui est « Moi », dans l'analyse et dans la rédaction (prompt mis en cache, sans variable)", () => {
    expect(analysisPrompt("Moi: a").system).toContain("« Moi : … » sont les messages de l'utilisateur");
    expect(analysisPrompt("Moi: a").system).toContain("jamais ce que veut l'interlocuteur");
    expect(REDACTION_SYSTEM).toContain("Tu écris la PROCHAINE réponse de l'utilisateur");
    expect(REDACTION_SYSTEM).not.toMatch(/\$\{/);
  });
});
