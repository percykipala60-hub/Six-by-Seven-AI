import { describe, expect, it } from "vitest";
import { anonymize, restore } from "@/lib/anonymize";

describe("anonymize", () => {
  it("masque téléphone, e-mail et lien", () => {
    const r = anonymize("Appelle-moi au +243 81 234 5678 ou écris à jean@exemple.cd, voir https://exemple.cd/x");
    expect(r.text).not.toMatch(/243|jean@|exemple\.cd/);
    expect(r.text).toContain("[TÉL 1]");
    expect(r.text).toContain("[EMAIL 1]");
    expect(r.text).toContain("[LIEN 1]");
  });

  it("garde un même repère pour un même nom et masque les noms connus", () => {
    const r = anonymize("Patrick: salut\nDeborah: coucou Patrick", ["Patrick", "Deborah"]);
    expect(r.text).not.toContain("Patrick");
    expect(r.text.match(/\[PERSONNE 1\]/g)?.length).toBe(2);
  });

  it("masque un nom après un titre ou une salutation", () => {
    const r = anonymize("Mr Kabongo va venir. Salut Marie !");
    expect(r.text).not.toMatch(/Kabongo|Marie/);
    expect(r.text).toContain("Mr [PERSONNE 1]");
  });

  it("ne masque pas un court nombre", () => {
    expect(anonymize("Rendez-vous à 17h30, salle 12").count).toBe(0);
  });

  // Les 9 cas de l'audit du 3 octobre 2026 : plus aucune fuite.
  it.each([
    ["prénom dans une phrase", "Jean est malade aujourd'hui", /Jean/],
    ["nom complet sans titre", "J'ai vu Moïse Kabila au marché", /Moïse|Kabila/],
    ["prénom en minuscules", "salut patrick ça va ?", /patrick/i],
    ["code PIN", "mon code PIN est 4521", /4521/],
    ["IBAN", "envoie sur le compte CD12 0001 0002 3456 7890", /0001|3456|7890/],
    ["compte annoncé", "mon compte 0045 1234 5678 chez la banque", /1234|5678/],
    ["adresse", "j'habite 12 avenue Kasa-Vubu, Gombe", /Kasa|12 avenue/],
    ["pseudo", "ajoute-moi @deborah_mk sur Insta", /deborah_mk/],
    ["étiquettes d'interlocuteurs", "Patrick: salut\nDeborah: coucou", /Patrick|Deborah/],
  ])("masque : %s", (_nom, texte, fuite) => {
    const known = texte.includes(":") ? ["Patrick", "Deborah"] : [];
    expect(anonymize(texte, known).text).not.toMatch(fuite);
  });

  it.each([
    ["grâce à toi (mot courant)", "merci, c'est grâce à toi"],
    ["heure", "Rendez-vous à 17h30, salle 12"],
    ["montant", "ça coûte 2000 francs"],
    ["début de phrase", "Demain on se voit au marché"],
    ["adjectif clair", "c'est claire et net"],
  ])("ne masque pas à tort : %s", (_nom, texte) => {
    expect(anonymize(texte).count).toBe(0);
  });

  it("remet aussi les codes, adresses et noms complets à la copie", () => {
    const t = "Moïse Kabila habite 12 avenue Kasa-Vubu, son code PIN est 4521";
    const r = anonymize("Bonjour, " + t);
    expect(restore(r.text, r.mapping)).toBe("Bonjour, " + t);
  });

  it("restore remet les vrais noms", () => {
    const r = anonymize("Salut Marie, appelle le 0812345678");
    expect(restore(r.text, r.mapping)).toBe("Salut Marie, appelle le 0812345678");
  });
});
