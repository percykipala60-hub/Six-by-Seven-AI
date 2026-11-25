import { describe, expect, it } from 'vitest';
import {
  COLLAGE_LONG,
  NOM_TEXTE_COLLE,
  abregerMilieu,
  badgeType,
  extraitTexte,
  piecesDuCollage,
} from '@/lib/collage';

describe('coller dans la barre de saisie', () => {
  it('garde les fichiers collés (capture, image) tels quels', () => {
    const image = new File([new Uint8Array([1, 2])], 'image.png', { type: 'image/png' });
    expect(piecesDuCollage([image], '')).toEqual([image]);
  });

  it('garde les fichiers même si le presse-papiers contient aussi du texte (nom du fichier)', () => {
    const pdf = new File(['%PDF'], 'rapport.pdf', { type: 'application/pdf' });
    expect(piecesDuCollage([pdf], 'rapport.pdf')).toEqual([pdf]);
  });

  it('transforme un long texte ou un texte sur plusieurs lignes en « Texte collé »', async () => {
    const long = piecesDuCollage([], 'x'.repeat(COLLAGE_LONG + 1));
    expect(long?.[0].name).toBe('Texte collé.txt');
    const lignes = piecesDuCollage([], 'a\nb\nc\nd\ne');
    expect(await lignes?.[0].text()).toBe('a\nb\nc\nd\ne');
    expect(piecesDuCollage([], 'a\r\nb\r\nc\r\nd\r\ne')?.[0].name).toBe(NOM_TEXTE_COLLE);
  });

  it('laisse un texte court se coller normalement', () => {
    expect(piecesDuCollage([], 'bonjour')).toBeNull();
    expect(piecesDuCollage([], 'deux\nlignes')).toBeNull();
    expect(piecesDuCollage([], '')).toBeNull();
  });
});

describe('aperçu des pièces jointes', () => {
  it('donne le badge de type du document', () => {
    expect(badgeType('Diagramme.drawio.pdf')).toBe('PDF');
    expect(badgeType('MESURE.docx')).toBe('DOCX');
    expect(badgeType(NOM_TEXTE_COLLE)).toBe('COLLÉ');
    expect(badgeType('LISEZMOI')).toBe('FICHIER');
  });

  it('coupe un long chemin au milieu en gardant le début et l’extension', () => {
    const chemin =
      'C:\\Users\\omen\\OneDrive\\Documents\\Diagrammes\\Architecture-du-projet.drawio.pdf';
    const court = abregerMilieu(chemin, 40);
    expect(court).toHaveLength(40);
    expect(court.startsWith('C:\\Users\\omen')).toBe(true);
    expect(court.endsWith('.drawio.pdf')).toBe(true);
    expect(court).toContain('…');
    expect(abregerMilieu('court.pdf', 40)).toBe('court.pdf');
  });

  it('montre le début d’un texte collé sur une ligne', () => {
    expect(extraitTexte('  Bonjour\n\n  le monde  \n')).toBe('Bonjour le monde');
    expect(extraitTexte('x'.repeat(300), 50)).toHaveLength(50);
  });
});
