import { describe, expect, it } from 'vitest';
import { STYLES_SITE, consignesSite, demandeLivrableLong, demandeSite } from '@/lib/styles-site';

describe('styles de sites web', () => {
  it('reconnaît une demande de site ou de page', () => {
    expect(demandeSite('Fais-moi un site web pour ma boutique de pagnes')).toBe(true);
    expect(demandeSite('Une landing page pour mon application')).toBe(true);
    expect(demandeSite('crée la page d’accueil de mon hôtel')).toBe(true);
    expect(demandeSite('Quelle est la situation à Kinshasa ?')).toBe(false);
    expect(demandeSite('Résume ce document')).toBe(false);
  });

  it('n’ajoute les consignes que pour une demande de site', () => {
    expect(consignesSite('Bonjour')).toBe('');
    const c = consignesSite('Fais-moi un site vitrine pour mon cabinet');
    expect(c).toContain('type="html"');
    expect(c).toContain('aucune photo');
    for (const s of STYLES_SITE) expect(c).toContain(`• ${s.id} — ${s.nom}`);
  });

  it('a des styles distincts et complets', () => {
    expect(STYLES_SITE.length).toBe(11);
    expect(new Set(STYLES_SITE.map((s) => s.id)).size).toBe(STYLES_SITE.length);
    for (const s of STYLES_SITE) expect(s.recette).toMatch(/#[0-9A-F]{6}/i);
  });

  it('donne plus de place aux sites et aux présentations', () => {
    expect(demandeLivrableLong('Prépare une présentation pour ma soutenance')).toBe(true);
    expect(demandeLivrableLong('Fais un PowerPoint sur le climat')).toBe(true);
    expect(demandeLivrableLong('Un site pour mon restaurant')).toBe(true);
    expect(demandeLivrableLong('Merci beaucoup')).toBe(false);
  });
});
