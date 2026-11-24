import { beforeEach, describe, expect, it } from 'vitest';
import {
  LIGNES_CODE_ARTEFACT,
  VERSIONS_MAX,
  artefactsDuChat,
  artefactsDuProjet,
  blocsDocument,
  cleDe,
  curerArtefact,
  decouper,
  detacherDuProjet,
  effacerArtefactsDuChat,
  extraireArtefacts,
  fusionnerExtraits,
  garderArtefacts,
  lireArtefacts,
  lireTableau,
  nomFichier,
  rangerArtefacts,
  retrouver,
  SUPPRESSIONS_ARTEFACTS,
} from '@/lib/artefacts';
import { lireSuppressions } from '@/lib/projets';
import { planSync, fusionnerRecus } from '@/lib/projets-sync';
import { sevenAiSystem } from '@/lib/prompt';

const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  },
  window: {
    dispatchEvent: () => true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  },
});

beforeEach(() => store.clear());

describe('lecture des artefacts dans une réponse', () => {
  it('découpe le texte et les balises', () => {
    const r = `Voici ton plan.
<artefact id="plan" type="document" titre="Plan du rapport">
# Introduction
- Contexte
</artefact>
Dis-moi si tu veux le développer.`;
    const m = decouper(r);
    expect(m.map((x) => x.genre)).toEqual(['texte', 'artefact', 'texte']);
    expect(m[1]).toMatchObject({
      artefact: { cle: 'plan', titre: 'Plan du rapport', type: 'document' },
    });
    expect(m[1].genre === 'artefact' && m[1].artefact.contenu).toBe('# Introduction\n- Contexte');
  });

  it('reconnaît le langage, retire la clôture et signale une balise coupée', () => {
    const [a] = extraireArtefacts(
      "<artefact titre='Calcul' type='code'>\n```python\nprint(1)\n```\n</artefact>",
    );
    expect(a).toMatchObject({
      cle: 'calcul',
      type: 'code',
      langage: 'python',
      contenu: 'print(1)',
    });
    const [b] = extraireArtefacts('Début <artefact id="page" type="html" titre="Accueil"><html>');
    expect(b).toMatchObject({ type: 'html', incomplet: true, contenu: '<html>' });
  });

  it('devine le type et donne un titre par défaut', () => {
    const [a] = extraireArtefacts('<artefact langage="csv">a,b\n1,2</artefact>');
    expect(a).toMatchObject({ type: 'tableau', titre: 'Sans titre', cle: 'sans-titre' });
  });

  it('fait un artefact d’un long bloc de code sans balise, pas d’un court', () => {
    const court = 'Exemple :\n```js\nconst a = 1;\n```';
    expect(decouper(court)).toEqual([{ genre: 'texte', texte: court }]);
    const lignes = Array.from({ length: LIGNES_CODE_ARTEFACT }, (_, i) => `x = ${i}`).join('\n');
    const m = decouper(`Le script :\n\`\`\`python\n${lignes}\n\`\`\`\nFin.`);
    expect(m.map((x) => x.genre)).toEqual(['texte', 'artefact', 'texte']);
    expect(m[1]).toMatchObject({ artefact: { type: 'code', langage: 'python', cle: 'bloc-1' } });
  });

  it('une réponse sans artefact reste du texte', () => {
    expect(decouper('Bonjour !')).toEqual([{ genre: 'texte', texte: 'Bonjour !' }]);
    expect(cleDe('Été 2026 : bilan !')).toBe('ete-2026-bilan');
  });

  it('les consignes de Six décrivent la balise', () => {
    expect(sevenAiSystem('chat')).toContain('<artefact id="nom-court"');
    expect(sevenAiSystem('sixtouch', true)).toContain("ecrire_resultat n'a pas besoin d'artefact");
  });
});

describe('versions et stockage', () => {
  const extrait = (contenu: string) => ({
    cle: 'plan',
    titre: 'Plan',
    type: 'document' as const,
    contenu,
  });

  it('crée une nouvelle version seulement quand le contenu change', () => {
    let l = fusionnerExtraits([], 'c1', 'p1', [extrait('v1')], 1);
    l = fusionnerExtraits(l, 'c1', 'p1', [extrait('v1')], 2);
    expect(l[0].versions).toHaveLength(1);
    l = fusionnerExtraits(l, 'c1', 'p1', [extrait('v2')], 3);
    expect(l).toHaveLength(1);
    expect(l[0].versions.map((v) => v.contenu)).toEqual(['v1', 'v2']);
    expect(l[0]).toMatchObject({ projet: 'p1', maj: 3, cree: 1 });
    // Même repère dans une autre discussion : un autre artefact.
    l = fusionnerExtraits(l, 'c2', undefined, [extrait('v1')], 4);
    expect(l).toHaveLength(2);
  });

  it('garde au plus VERSIONS_MAX versions', () => {
    let l = fusionnerExtraits([], 'c1', undefined, [extrait('0')], 0);
    for (let i = 1; i <= VERSIONS_MAX + 5; i++)
      l = fusionnerExtraits(l, 'c1', undefined, [extrait(String(i))], i);
    expect(l[0].versions).toHaveLength(VERSIONS_MAX);
    expect(l[0].versions.at(-1)?.contenu).toBe(String(VERSIONS_MAX + 5));
  });

  it('retrouve la version qui correspond à un message', () => {
    let l = fusionnerExtraits([], 'c1', undefined, [extrait('v1')], 1);
    l = fusionnerExtraits(l, 'c1', undefined, [extrait('v2')], 2);
    expect(retrouver(l, 'c1', extrait('v1')).version).toBe(0);
    expect(retrouver(l, 'c1', extrait('v2')).version).toBe(1);
    // Pas gardé (mémoire coupée) : un artefact provisoire d'une seule version.
    const r = retrouver([], 'c9', extrait('x'));
    expect(r).toMatchObject({ version: 0, artefact: { chat: 'c9', versions: [{ contenu: 'x' }] } });
  });

  it('garde, range et efface les artefacts d’une discussion', () => {
    garderArtefacts('c1', undefined, [extrait('v1')]);
    expect(lireArtefacts()).toHaveLength(1);
    rangerArtefacts('c1', 'p1');
    expect(artefactsDuProjet('p1')).toHaveLength(1);
    detacherDuProjet('p1');
    expect(artefactsDuProjet('p1')).toHaveLength(0);
    expect(artefactsDuChat('c1')).toHaveLength(1);
    const id = lireArtefacts()[0].id;
    effacerArtefactsDuChat('c1');
    expect(lireArtefacts()).toHaveLength(0);
    expect(lireSuppressions(SUPPRESSIONS_ARTEFACTS)).toEqual([id]);
  });

  it('écarte un artefact invalide', () => {
    expect(curerArtefact({ id: 'a', chat: 'c', type: 'virus', versions: [{ contenu: 'x' }] })).toBe(
      null,
    );
    expect(curerArtefact({ id: 'a', chat: 'c', type: 'code', versions: [] })).toBeNull();
  });
});

describe('affichage et téléchargement', () => {
  it('nomme le fichier selon le type ou le langage', () => {
    expect(nomFichier({ titre: 'Plan du rapport', type: 'document' })).toBe('Plan-du-rapport.md');
    expect(nomFichier({ titre: 'Calcul', type: 'code', langage: 'python' })).toBe('Calcul.py');
    expect(nomFichier({ titre: 'x', type: 'code', langage: 'cobol' })).toBe('x.txt');
    expect(nomFichier({ titre: 'Page / Accueil', type: 'html' })).toBe('Page-Accueil.html');
    expect(nomFichier({ titre: '???', type: 'tableau' })).toBe('artefact.csv');
  });

  it('lit un tableau CSV ou Markdown', () => {
    expect(lireTableau('Nom;Prix\n"Pain; frais";500')).toEqual([
      ['Nom', 'Prix'],
      ['Pain; frais', '500'],
    ]);
    expect(lireTableau('a,"b ""c"""\n1,2')).toEqual([
      ['a', 'b "c"'],
      ['1', '2'],
    ]);
    expect(lireTableau('| A | B |\n|---|---|\n| 1 | 2 |')).toEqual([
      ['A', 'B'],
      ['1', '2'],
    ]);
  });

  it('met en page un document léger', () => {
    expect(
      blocsDocument('# Titre\n\nUn **paragraphe**\nsuite\n- a\n- b\n1. c\n```\ncode\n```'),
    ).toEqual([
      { genre: 'titre', niveau: 1, texte: 'Titre' },
      { genre: 'paragraphe', texte: 'Un paragraphe\nsuite' },
      { genre: 'liste', ordonnee: false, elements: ['a', 'b'] },
      { genre: 'liste', ordonnee: true, elements: ['c'] },
      { genre: 'code', texte: 'code' },
    ]);
  });
});

describe('synchronisation avec le compte', () => {
  const e = (id: string, maj: number) => ({ id, maj });

  it('télécharge le plus récent, envoie le nouveau, efface le supprimé', () => {
    const plan = planSync(
      [e('a', 5), e('b', 1), e('nouveau', 3)],
      [e('a', 2), e('b', 9), e('distant', 4), e('efface', 1)],
      ['efface'],
    );
    expect(plan.aTelecharger).toEqual(['b', 'distant']);
    expect(plan.aEnvoyer.map((x) => x.id)).toEqual(['a', 'nouveau']);
    expect(plan.aEffacer).toEqual(['efface']);
    expect(plan.aRetirer).toEqual([]);
  });

  it('retire de l’appareil ce qui a été effacé depuis un autre appareil', () => {
    const plan = planSync([e('vu', 5), e('jamais-vu', 5)], [], [], ['vu']);
    expect(plan.aRetirer).toEqual(['vu']);
    expect(plan.aEnvoyer.map((x) => x.id)).toEqual(['jamais-vu']);
  });

  it('fusionne ce qui arrive du compte', () => {
    const l = fusionnerRecus([e('a', 5), e('b', 1)], [e('a', 2), e('b', 9), e('c', 3)]);
    expect(l).toEqual([e('b', 9), e('a', 5), e('c', 3)]);
  });
});
