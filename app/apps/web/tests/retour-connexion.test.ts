import { describe, expect, it } from 'vitest';
import { erreurDeRetourDansAdresse, messageRetourRefuse } from '@/lib/compte';

describe('retour de Google ou Apple refusé', () => {
  it('lit l’erreur laissée par Supabase dans l’adresse (fragment ou paramètres)', () => {
    const adresse =
      'http://localhost:3000/?error=server_error&error_description=Unable+to+exchange+external+code%3A+4%2F0A#error=server_error&error_description=Unable+to+exchange+external+code';
    expect(erreurDeRetourDansAdresse(adresse)).toMatch(/Unable to exchange external code/);
    expect(erreurDeRetourDansAdresse('http://localhost:3000/#access_token=x')).toBe('');
  });

  it('explique en clair une clé du fournisseur invalide, une annulation ou une autre erreur', () => {
    expect(messageRetourRefuse('Unable to exchange external code: 4/0A', 'Google')).toMatch(
      /connexion avec Google est momentanément indisponible/,
    );
    expect(messageRetourRefuse('access_denied', 'Apple')).toBe('Connexion avec Apple annulée.');
    expect(messageRetourRefuse('autre chose')).toMatch(/n’a pas abouti/);
  });
});
