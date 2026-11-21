import { describe, expect, it } from 'vitest';
import { lireIdentifiant } from '@/lib/compte';
import { fusionner } from '@/lib/memoire';

describe('lireIdentifiant', () => {
  it('reconnaît une adresse e-mail (en minuscules)', () => {
    expect(lireIdentifiant(' Toi@Exemple.com ')).toEqual({
      type: 'email',
      valeur: 'toi@exemple.com',
    });
  });

  it('refuse les numéros de téléphone (seul l’e-mail est accepté)', () => {
    expect(lireIdentifiant('081 234 5678')).toBeNull();
    expect(lireIdentifiant('812345678')).toBeNull();
    expect(lireIdentifiant('00243 81 234 5678')).toBeNull();
    expect(lireIdentifiant('+33 6 12 34 56 78')).toBeNull();
  });

  it("refuse ce qui n'est pas un e-mail valide", () => {
    expect(lireIdentifiant('bonjour')).toBeNull();
    expect(lireIdentifiant('toi@exemple')).toBeNull();
    expect(lireIdentifiant('12')).toBeNull();
  });
});

describe('validation de connexion et inscription', () => {
  it('rejette les e-mails invalides et mots de passe trop courts', async () => {
    const { connecterParMotDePasse, inscrire } = await import('@/lib/compte');
    expect(await connecterParMotDePasse('mauvais-email', '123456')).toBe(
      'Écris une adresse e-mail valide.',
    );
    expect(await connecterParMotDePasse('test@exemple.com', '123')).toBe(
      'Le mot de passe doit comporter au moins 6 caractères.',
    );

    const resInscr1 = await inscrire('mauvais-email', '12345678', 'Jean', true);
    expect(resInscr1.error).toBe('Écris une adresse e-mail valide.');

    const resInscr2 = await inscrire('test@exemple.com', '12345678', '', true);
    expect(resInscr2.error).toBe('Indique ton prénom pour que Six te reconnaisse.');

    const resInscr3 = await inscrire('test@exemple.com', '123', 'Jean', true);
    expect(resInscr3.error).toBe('Choisis un mot de passe d’au moins 8 caractères.');
  });

  it('exige l’acceptation des conditions avant de créer un compte', async () => {
    const { inscrire } = await import('@/lib/compte');
    const res = await inscrire('test@exemple.com', 'motdepasse8', 'Jean');
    expect(res.error).toBe(
      'Pour créer un compte, accepte les conditions d’utilisation et la politique de confidentialité.',
    );
    expect(res.confirmationRequise).toBe(false);
  });

  it('évalue la longueur d’un nouveau mot de passe', async () => {
    const { MDP_MIN_INSCRIPTION, erreurMotDePasse } = await import('@/lib/compte');
    expect(MDP_MIN_INSCRIPTION).toBe(8);
    expect(erreurMotDePasse('')).toBe('Choisis un mot de passe.');
    expect(erreurMotDePasse('court')).toBe('Choisis un mot de passe d’au moins 8 caractères.');
    expect(erreurMotDePasse('motdepasse8')).toBeNull();
  });
});

describe('fusionner (mémoire du téléphone + mémoire du compte)', () => {
  const now = Date.now();
  it("garde tout, sans doublon, et la note la plus récente d'un contact", () => {
    const tel = {
      choix: [{ t: now - 1000, mots: 12, emoji: false, tu: true, vous: false }],
      contacts: [{ nom: 'Junior', note: 'petit frère', vu: now - 5000 }],
      suivis: [
        { id: 'a1', qui: 'Junior', quoi: 'relancer', canal: 'whatsapp', quand: now + 3600_000 },
      ],
    };
    const compte = {
      choix: [
        { t: now - 1000, mots: 12, emoji: false, tu: true, vous: false },
        { t: now - 2000, mots: 30, emoji: true, tu: false, vous: true },
      ],
      contacts: [
        { nom: 'Junior', note: 'petit frère, on se tutoie', vu: now - 100 },
        { nom: 'Patron', note: 'vouvoyer', vu: now - 100 },
      ],
      suivis: [
        { id: 'a1', qui: 'Junior', quoi: 'relancer', canal: 'whatsapp', quand: now + 3600_000 },
      ],
    };
    const m = fusionner(tel, compte);
    expect(m.choix).toHaveLength(2);
    expect(m.contacts.find((c) => c.nom === 'Junior')?.note).toBe('petit frère, on se tutoie');
    expect(m.contacts).toHaveLength(2);
    expect(m.suivis).toHaveLength(1);
  });

  it('ignore une mémoire du compte abîmée', () => {
    expect(fusionner({ choix: [], contacts: [], suivis: [] }, 'pas une mémoire')).toEqual({
      choix: [],
      contacts: [],
      suivis: [],
    });
  });
});
