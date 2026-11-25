import { describe, expect, it } from 'vitest';
import { STYLES_SITE, catalogueStyles } from '@/lib/styles-site';
import { consignesSkill, skillLong } from '@/lib/skills-cosinus';

describe('styles de sites web', () => {
  it('a onze styles distincts et complets', () => {
    expect(STYLES_SITE).toHaveLength(11);
    expect(new Set(STYLES_SITE.map((s) => s.id)).size).toBe(STYLES_SITE.length);
    for (const s of STYLES_SITE) expect(s.recette).toMatch(/#[0-9A-F]{6}/i);
  });

  it('part avec la méthode « Pages web » seulement', () => {
    const web = consignesSkill('auto', 'Fais-moi un site web pour ma boutique de pagnes');
    expect(web).toContain(catalogueStyles());
    for (const s of STYLES_SITE) expect(web).toContain(`• ${s.id} — ${s.nom}`);
    expect(consignesSkill('auto', 'Corrige ce bug python')).not.toContain('Styles de site');
  });

  it('donne plus de place aux sites et aux présentations', () => {
    expect(skillLong('auto', 'Une landing page pour mon application')).toBe(true);
    expect(skillLong('auto', 'Prépare un PowerPoint sur le climat')).toBe(true);
    expect(skillLong('auto', 'Merci beaucoup')).toBe(false);
    expect(skillLong('presentations')).toBe(true);
  });
});
