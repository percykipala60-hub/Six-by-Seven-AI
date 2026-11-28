'use client';
import { useState } from 'react';
import { entetesCompte } from '@/lib/premium-client';
import { lireCompte } from '@/lib/compte';

export default function Page() {
  const [info, setInfo] = useState(''),
    [attente, setAttente] = useState(false);
  const c = lireCompte();
  async function connecter() {
    setAttente(true);
    try {
      const r = await fetch('/api/gmail', { method: 'POST', headers: await entetesCompte() });
      const d = await r.json();
      if (!r.ok || !d.adresse) throw Error(d.error || 'Gmail indisponible.');
      window.location.assign(d.adresse);
    } catch (e) {
      setInfo(e instanceof Error ? e.message : 'Connexion impossible.');
      setAttente(false);
    }
  }
  return (
    <main className="screen">
      <h1>Connecter Gmail</h1>
      <p>
        Associer Gmail au compte Six {c.statut === 'connecte' ? c.identifiant : ''}. Google vous
        demandera l’accès aux libellés.
      </p>
      <button disabled={attente} onClick={() => void connecter()}>
        Continuer avec Google
      </button>
      <p role="status">{info}</p>
    </main>
  );
}
