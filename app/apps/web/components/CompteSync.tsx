'use client';
import { reprendreHistoriqueExistant } from '@/lib/historique-compte';

import { profilsBureau } from '@/lib/profils-bureau';
import { useEffect } from 'react';
import { CONNEXION_DISPONIBLE, demarrerCompte } from '@/lib/compte';

/**
 * Suit la session du compte et synchronise la mémoire de Six. Un invité ne charge rien : le client Supabase ne vient
 * qu'avec une session déjà ouverte, un lien de connexion reçu par e-mail, ou quand on demande un code (écran Compte).
 */
export function CompteSync() {
  useEffect(() => {
    if (!CONNEXION_DISPONIBLE) return;
    reprendreHistoriqueExistant();
    let session = false;
    try {
      session = Boolean(localStorage.getItem('six-auth'));
    } catch {
      /* stockage bloqué */
    }
    const lien = /access_token=|[?&]code=/.test(window.location.hash + window.location.search);
    if (profilsBureau() || session || lien) void demarrerCompte();
  }, []);
  return null;
}
