'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './Icon';
import { partagerDiscussion } from '@/lib/cloud';
import { lireEtatPremium } from '@/lib/premium-client';
import type { ChatMessage } from '@/lib/types';

/**
 * Partager la discussion par le Cloud (Six Premium). Sans Premium : ouvre Réglages > Cloud, qui explique l'offre.
 * Avec Premium : crée le lien, ouvre le partage du téléphone, ou copie le lien ; le bouton le dit lui-même
 * (pas de bandeau).
 */
export function BoutonPartager({
  titre,
  messages,
  onErreur,
}: {
  titre: string;
  messages: ChatMessage[];
  onErreur: (message: string) => void;
}) {
  const router = useRouter();
  const [etat, setEtat] = useState<'pret' | 'envoi' | 'copie'>('pret');

  const partager = async () => {
    if (etat === 'envoi') return;
    setEtat('envoi');
    const premium = await lireEtatPremium();
    if (!premium?.premium) {
      setEtat('pret');
      router.push('/reglages?v=memoire');
      return;
    }
    const r = await partagerDiscussion(titre, messages);
    if ('erreur' in r) {
      setEtat('pret');
      onErreur(r.erreur);
      return;
    }
    const tactile = window.matchMedia('(pointer: coarse)').matches;
    if (tactile && navigator.share) {
      await navigator.share({ title: titre, url: r.lien }).catch(() => {});
      setEtat('pret');
      return;
    }
    await navigator.clipboard?.writeText(r.lien).catch(() => {});
    setEtat('copie');
    setTimeout(() => setEtat('pret'), 2500);
  };

  const libelle =
    etat === 'copie' ? 'Lien copié' : etat === 'envoi' ? 'Partage…' : 'Partager la discussion';
  return (
    <button
      type="button"
      className="volet-bouton"
      aria-label={libelle}
      title={libelle}
      disabled={!messages.length}
      onClick={() => void partager()}
    >
      <Icon name={etat === 'copie' ? 'check' : 'partager'} size={18} stroke={1.8} />
    </button>
  );
}
