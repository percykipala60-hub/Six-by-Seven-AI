'use client';

import { useEffect, useState } from 'react';
import { Logo } from './Logo';

/**
 * Page du lien de l'e-mail d'alerte de connexion (/compte/alerte?j=…&r=non|oui), en deux questions :
 * 1. « Était-ce vous ? » ; 2. si non, la suggestion de bloquer l'appareil.
 * Rien ne se passe à l'ouverture (un antivirus ou une messagerie qui ouvre le lien ne bloque rien) : la personne
 * confirme d'un clic. Venant du lien « Non » de l'e-mail, la page commence à la deuxième question.
 */
type Etat = 'question' | 'blocage' | 'envoi' | 'bloque' | 'confirme' | 'garde' | 'erreur';

export function AlerteConnexion() {
  const [jeton, setJeton] = useState('');
  const [etat, setEtat] = useState<Etat>('question');
  const [message, setMessage] = useState('');
  const [appareil, setAppareil] = useState('');

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    // Le lien est retiré de l'adresse après lecture : un second passage (mode développement) ne l'efface pas.
    if (!p.has('j')) return;
    setJeton(p.get('j') ?? '');
    if (p.get('r') === 'non') setEtat('blocage');
    window.history.replaceState(null, '', '/compte/alerte');
  }, []);

  async function repondre(r: 'oui' | 'non') {
    setEtat('envoi');
    try {
      const res = await fetch('/api/compte/alerte', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jeton, reponse: r }),
      });
      const d = (await res.json().catch(() => ({}))) as { nom?: string; error?: string };
      if (!res.ok) {
        setMessage(d.error ?? 'Action impossible pour le moment. Réessayez.');
        setEtat('erreur');
        return;
      }
      setAppareil(d.nom ?? '');
      setEtat(r === 'non' ? 'bloque' : 'confirme');
    } catch {
      setMessage('Pas de réseau. Réessayez dans un instant.');
      setEtat('erreur');
    }
  }

  const contenu: Record<Etat, { titre: string; texte: string }> = {
    question: {
      titre: 'Était-ce vous ?',
      texte: 'Une nouvelle connexion à votre compte Six vient d’avoir lieu.',
    },
    blocage: {
      titre: 'Bloquer cet appareil ?',
      texte:
        'Il sera déconnecté immédiatement et ne pourra plus accéder à votre compte. Nous vous conseillons de le bloquer.',
    },
    envoi: { titre: 'Un instant…', texte: '' },
    bloque: {
      titre: 'Appareil bloqué',
      texte: `${appareil ? `« ${appareil} »` : 'L’appareil'} est déconnecté. Changez aussi votre mot de passe depuis l’écran de connexion de Six (« Mot de passe oublié »).`,
    },
    confirme: { titre: 'Merci', texte: 'Cette connexion reste active.' },
    garde: {
      titre: 'Appareil non bloqué',
      texte:
        'La connexion reste active. Vous pouvez la retirer à tout moment dans Réglages → Appareils connectés.',
    },
    erreur: { titre: 'Lien indisponible', texte: message },
  };
  const { titre, texte } = jeton
    ? contenu[etat]
    : { titre: 'Lien incomplet', texte: 'Utilisez le lien de l’e-mail reçu.' };

  return (
    <main className="screen auth-screen alerte-ecran">
      <section className="alerte-page">
        <span className="alerte-logo">
          <Logo label="Six" />
        </span>
        <h1 className="alerte-titre">{titre}</h1>
        {texte && <p className="alerte-texte">{texte}</p>}
        {jeton && etat === 'question' && (
          <div className="alerte-boutons">
            <button type="button" className="alerte-btn" onClick={() => void repondre('oui')}>
              Oui, c’était moi
            </button>
            <button type="button" className="alerte-btn danger" onClick={() => setEtat('blocage')}>
              Non
            </button>
          </div>
        )}
        {jeton && etat === 'blocage' && (
          <div className="alerte-boutons">
            <button type="button" className="alerte-btn" onClick={() => setEtat('garde')}>
              Ne pas bloquer
            </button>
            <button
              type="button"
              className="alerte-btn danger"
              onClick={() => void repondre('non')}
            >
              Bloquer l’appareil
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
