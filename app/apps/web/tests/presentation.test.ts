import { describe, expect, it } from 'vitest';
import { DIAPOS_MAX, THEMES, lirePresentation, theme } from '@/lib/presentation';
import { poserDiapositive } from '@/lib/presentation-mise-en-page';
import { pptxEnOctets } from '@/lib/pptx';
import { extraireArtefacts, genreArtefact } from '@/lib/artefacts';
import { consignesSkill } from '@/lib/skills-cosinus';

const EXEMPLE = {
  theme: 'lilas',
  titre: 'Mémoire de fin d’études',
  diapositives: [
    {
      type: 'titre',
      titre: 'Mobile money à Kinshasa',
      sous_titre: 'Soutenance',
      auteur: 'Promotion L3',
    },
    { type: 'sommaire', titre: 'Plan', points: ['Contexte', 'Méthode', 'Résultats', 'Conclusion'] },
    { type: 'section', numero: '01', titre: 'Contexte', texte: 'Pourquoi ce sujet' },
    { type: 'texte', titre: 'Problématique', texte: 'Une question.', points: ['a', 'b'] },
    {
      type: 'colonnes',
      titre: 'Objectifs',
      colonnes: [
        { titre: 'Comprendre', texte: 'x' },
        { titre: 'Mesurer', texte: 'y' },
        { titre: 'Proposer', texte: 'z' },
      ],
    },
    {
      type: 'chiffres',
      titre: 'En chiffres',
      chiffres: [
        { valeur: '[à compléter]', libelle: 'utilisateurs' },
        { valeur: 3, libelle: 'opérateurs' },
      ],
    },
    {
      type: 'etapes',
      titre: 'Méthode',
      etapes: [
        { titre: 'Enquête', texte: '1' },
        { titre: 'Analyse', texte: '2' },
        { titre: 'Synthèse', texte: '3' },
      ],
    },
    {
      type: 'graphique',
      titre: 'Usage',
      series: [
        { libelle: '2022', valeur: 10 },
        { libelle: '2023', valeur: '25' },
        { libelle: 'x', valeur: 'pas un nombre' },
      ],
      texte: 'Hausse nette.',
    },
    {
      type: 'tableau',
      titre: 'Comparatif',
      lignes: [
        ['Opérateur', 'Frais'],
        ['A', '1 %'],
      ],
    },
    { type: 'citation', texte: 'Une phrase forte.', auteur: 'Quelqu’un' },
    { type: 'equipe', titre: 'Équipe', membres: [{ nom: 'Dayn Riley', role: 'Rédaction' }] },
    { type: 'fin', titre: 'Merci', sous_titre: 'Questions ?' },
    { type: 'inconnu', titre: 'Devient du texte', texte: 'ok' },
    { type: 'texte' },
  ],
};

describe('lecture d’une présentation', () => {
  it('lit le JSON de Six, même entouré de texte ou d’une clôture', () => {
    const p = lirePresentation(`Voici :\n\`\`\`json\n${JSON.stringify(EXEMPLE)}\n\`\`\``);
    expect(p?.theme).toBe('lilas');
    expect(p?.diapositives).toHaveLength(13); // la diapositive vide est écartée
    expect(p?.diapositives[12].type).toBe('texte'); // type inconnu → texte
    expect(p?.diapositives[7].series).toEqual([
      { libelle: '2022', valeur: 10 },
      { libelle: '2023', valeur: 25 },
    ]);
    expect(p?.diapositives[5].chiffres?.[1]).toEqual({ valeur: '3', libelle: 'opérateurs' });
  });

  it('refuse un contenu inutilisable et borne le nombre de diapositives', () => {
    expect(lirePresentation('pas de JSON')).toBeNull();
    expect(lirePresentation('{"diapositives": []}')).toBeNull();
    expect(lirePresentation('{ cassé')).toBeNull();
    const beaucoup = { diapositives: Array.from({ length: 50 }, (_, i) => ({ titre: `D${i}` })) };
    const p = lirePresentation(JSON.stringify(beaucoup));
    expect(p?.diapositives).toHaveLength(DIAPOS_MAX);
    expect(p?.theme).toBe('editorial'); // thème par défaut
    expect(p?.titre).toBe('D0');
  });

  it('est un artefact .pptx, demandé par la méthode « Présentations »', () => {
    const { artefacts } = extraireArtefacts(
      `Voici.\n\`\`\`presentation filename="expose.pptx"\n${JSON.stringify(EXEMPLE)}\n\`\`\``,
    );
    expect(artefacts[0].nom).toBe('expose.pptx');
    expect(genreArtefact(artefacts[0])).toBe('presentation');
    expect(lirePresentation(artefacts[0].contenu)?.diapositives).toHaveLength(13);
    const consignes = consignesSkill('auto', 'Prépare une présentation pour ma soutenance');
    expect(consignes).toContain('filename="titre-court.pptx"');
    expect(consignes).toContain('bordeaux (Bordeaux classique)');
  });
});

describe('mise en page', () => {
  const p = lirePresentation(JSON.stringify(EXEMPLE));
  if (!p) throw new Error('exemple illisible');

  it('pose chaque diapositive dans chacun des vingt-trois thèmes', () => {
    expect(THEMES).toHaveLength(23);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(23);
    for (const t of THEMES) {
      p.diapositives.forEach((d, i) => {
        const posee = poserDiapositive(t, d, i);
        expect(posee.fond).toMatch(/^#[0-9A-F]{6}$/i);
        const textes = posee.elements.filter((e) => e.genre === 'texte');
        expect(textes.length).toBeGreaterThan(0);
        for (const e of textes) {
          // Le texte reste dans la diapositive.
          expect(e.x).toBeGreaterThanOrEqual(0);
          expect(e.y).toBeGreaterThanOrEqual(0);
          expect(e.x + e.w).toBeLessThanOrEqual(100.01);
          expect(e.y + e.h).toBeLessThanOrEqual(100.01);
          expect(e.couleur).toMatch(/^#[0-9A-F]{6}$/i);
        }
      });
    }
  });

  it('montre le titre et les valeurs de la diapositive', () => {
    const textes = (i: number) =>
      poserDiapositive(theme('vague'), p.diapositives[i], i)
        .elements.flatMap((e) => (e.genre === 'texte' ? [e.texte ?? '', ...(e.puces ?? [])] : []))
        .join(' | ');
    expect(textes(0)).toContain('Mobile money à Kinshasa');
    expect(textes(1)).toContain('Méthode');
    expect(textes(3)).toContain('b');
    expect(textes(7)).toContain('25');
    expect(textes(8)).toContain('1 %');
    expect(textes(10)).toContain('DR');
  });
});

describe('export .pptx', () => {
  it('produit un fichier PowerPoint avec une diapositive par entrée', async () => {
    const p = lirePresentation(JSON.stringify(EXEMPLE));
    if (!p) throw new Error('exemple illisible');
    const octets = await pptxEnOctets(p, 'bordeaux');
    expect(octets[0]).toBe(0x50); // « PK » : une archive zip, comme tout .pptx
    expect(octets[1]).toBe(0x4b);
    const noms = new TextDecoder('latin1').decode(octets);
    expect(noms).toContain(`ppt/slides/slide${p.diapositives.length}.xml`);
    expect(noms).not.toContain(`ppt/slides/slide${p.diapositives.length + 1}.xml`);
  }, 30_000);
});
