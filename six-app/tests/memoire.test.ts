import { beforeEach, describe, expect, it } from "vitest";
import { activerMemoire, ajouterSuivi, consigneMemoire, ecrireNote, habitudes, lireMemoire, noteContact, retenirChoix } from "@/lib/memoire";

// localStorage minimal pour l'environnement Node des tests.
const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  },
});

beforeEach(() => store.clear());

describe("mémoire de Six", () => {
  it("ne garde aucun texte des réponses choisies, seulement des nombres", () => {
    retenirChoix("Salut Junior, je viens samedi 😄");
    const brut = store.get("six-memoire") ?? "";
    expect(brut).not.toContain("Junior");
    expect(brut).not.toContain("samedi");
    expect(lireMemoire().choix[0]).toMatchObject({ mots: 5, emoji: true, tu: false });
  });

  it("tire des habitudes à partir de 3 choix", () => {
    retenirChoix("Ok je viens");
    expect(habitudes()).toEqual([]);
    retenirChoix("Tu as raison, je passe");
    retenirChoix("Je te rappelle ce soir");
    retenirChoix("Merci, tu es gentil");
    expect(habitudes()).toEqual(["réponses courtes (4 mots en moyenne)", "tutoiement", "pas d'emoji"]);
  });

  it("masque le nom du contact et les numéros dans la consigne envoyée", () => {
    ecrireNote("Junior", "Junior est mon petit frère, son numéro 0812345678");
    expect(noteContact("junior")).toContain("petit frère");
    const consigne = consigneMemoire("Junior", { "[PERSONNE 1]": "Junior" });
    expect(consigne).toContain("[PERSONNE 1] est mon petit frère");
    expect(consigne).not.toContain("Junior");
    expect(consigne).not.toContain("0812345678");
  });

  it("s'efface et n'écrit plus rien quand elle est désactivée", () => {
    ecrireNote("Junior", "mon frère");
    ajouterSuivi({ qui: "Junior", quoi: "Confirmer samedi", canal: "whatsapp", quand: Date.now() });
    activerMemoire(false);
    expect(store.has("six-memoire")).toBe(false);
    retenirChoix("Ok");
    expect(store.has("six-memoire")).toBe(false);
    expect(consigneMemoire("Junior", {})).toBe("");
  });

  it("oublie ce qui a plus de 90 jours et rejette les valeurs abîmées", () => {
    const vieux = Date.now() - 91 * 86_400_000;
    store.set("six-memoire", JSON.stringify({ choix: [{ t: vieux, mots: 3 }, { t: Date.now(), mots: "x" }], contacts: [{ nom: "A", note: "n", vu: vieux }], suivis: "abîmé" }));
    expect(lireMemoire()).toEqual({ choix: [], contacts: [], suivis: [] });
  });
});
