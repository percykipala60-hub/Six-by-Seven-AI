import { describe, expect, it } from 'vitest';
import { lienQr, lireLienQr } from '@/lib/qr-connexion';
import { nomAppareil, sessionDuJeton } from '@/lib/securite';
import { composerAlerteConnexion } from '@/lib/emails-auth';

const demande = { id: '0f8fad5b-d9cb-469f-a165-70867728950e', secret: 'a'.repeat(48) };

describe('connexion par code QR', () => {
  it('le QR est un lien Six que le scanner relit à l’identique', () => {
    const lien = lienQr(demande);
    expect(lien).toBe(`https://app.sixbysevenai.com/qr#i=${demande.id}&s=${demande.secret}`);
    expect(lireLienQr(lien)).toEqual(demande);
    expect(lireLienQr(`  ${lien}  `)).toEqual(demande);
  });

  it('refuse un QR qui n’est pas un code de connexion Six', () => {
    expect(lireLienQr('https://exemple.com/')).toBeNull();
    expect(lireLienQr('bonjour')).toBeNull();
    expect(lireLienQr(`https://app.sixbysevenai.com/qr#i=${demande.id}&s=court`)).toBeNull();
    expect(
      lireLienQr(`https://app.sixbysevenai.com/autre#i=${demande.id}&s=${demande.secret}`),
    ).toBeNull();
    expect(lireLienQr(`javascript:alert(1)//qr#i=${demande.id}&s=${demande.secret}`)).toBeNull();
  });
});

describe('alerte de connexion', () => {
  it('nomme l’appareil sans détail inutile', () => {
    const chrome =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
    const edge = `${chrome} Edg/140.0`;
    const iphone =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    expect(nomAppareil(chrome)).toBe('Windows · Chrome');
    expect(nomAppareil(edge)).toBe('Windows · Edge');
    expect(nomAppareil(iphone)).toBe('iPhone · Safari');
    expect(nomAppareil(iphone, 'mobile')).toBe('iPhone · App Six');
    expect(nomAppareil(chrome, 'bureau')).toBe('Windows · App de bureau Six');
  });

  it('lit l’identifiant de session d’un jeton Supabase (pour n’alerter qu’une fois par connexion)', () => {
    const charge = Buffer.from(JSON.stringify({ sub: 'u1', session_id: 's-123' })).toString(
      'base64url',
    );
    expect(sessionDuJeton(`xxx.${charge}.sig`)).toBe('s-123');
    expect(sessionDuJeton('pas-un-jeton')).toBeNull();
  });

  it('l’e-mail donne la méthode, l’appareil et les deux réponses, sans rien d’injectable', () => {
    const { objet, html } = composerAlerteConnexion({
      methode: 'Google',
      appareil: 'Windows · <script>alert(1)</script>',
      quand: new Date('2026-11-25T10:00:00Z'),
      lienReponse: 'https://app.sixbysevenai.com/compte/alerte?j=abc',
    });
    expect(objet).toBe('⚠ Alerte de sécurité : nouvelle connexion à votre compte Six');
    expect(html).toContain('Google');
    expect(html).toContain('j=abc&#38;r=non');
    expect(html).toContain('j=abc&#38;r=oui');
    expect(html).not.toContain('<script>');
    expect(html).toContain('heure de Kinshasa');
  });
});
