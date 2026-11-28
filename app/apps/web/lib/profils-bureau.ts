'use client';

type Profil = { id: string; nom: string };
export type ProfilsBureau = {
  retrouver?(cle: string): Promise<void>;
  liste(): Promise<Profil[]>;
  choisir(id: string): Promise<void>;
  ajouter(): Promise<void>;
  quitter(): Promise<void>;
  toutQuitter(): Promise<void>;
  lire(): Promise<string | null>;
  memoriser(valeur: string): Promise<void>;
  effacer(): Promise<void>;
};
export function profilsBureau(): ProfilsBureau | undefined {
  if (typeof window === 'undefined') return undefined;
  const pont = (
    window as unknown as { sixBureau?: { versionProfils?: number; profils?: ProfilsBureau } }
  ).sixBureau;
  return pont?.versionProfils === 1 ? pont.profils : undefined;
}

// Le premier profil reprend la session existante avant de retirer sa copie en clair.
export function stockageBureau(pont: ProfilsBureau) {
  return {
    async getItem(cle: string) {
      if (cle !== 'six-auth') return localStorage.getItem(cle);
      const chiffre = await pont.lire();
      const ancienne = localStorage.getItem(cle);
      if (!chiffre && ancienne) await pont.memoriser(ancienne);
      if (ancienne) localStorage.removeItem(cle);
      return chiffre ?? ancienne;
    },
    async setItem(cle: string, valeur: string) {
      if (cle === 'six-auth') {
        await pont.memoriser(valeur);
        localStorage.removeItem(cle);
      } else localStorage.setItem(cle, valeur);
    },
    async removeItem(cle: string) {
      if (cle === 'six-auth') await pont.effacer();
      localStorage.removeItem(cle);
    },
  };
}
