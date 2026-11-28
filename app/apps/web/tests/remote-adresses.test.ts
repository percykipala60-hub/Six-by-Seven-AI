import { describe, expect, it } from 'vitest';
import { lireAdresses } from '@/components/RemoteDiscussion';

describe('adresses autorisées du remote', () => {
  it('nettoie, met en minuscules et retire les doublons', () => {
    expect(lireAdresses(' A@x.fr, b@y.com\nA@X.fr ')).toEqual(['a@x.fr', 'b@y.com']);
  });
  it('accepte une liste vide', () => {
    expect(lireAdresses('  ')).toEqual([]);
  });
  it('refuse une adresse invalide ou plus de 20 adresses', () => {
    expect(lireAdresses('a@x.fr, pas-une-adresse')).toBeNull();
    expect(lireAdresses(Array.from({ length: 21 }, (_, i) => `p${i}@x.fr`).join(','))).toBeNull();
  });
});
