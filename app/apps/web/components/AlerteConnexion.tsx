'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { Logo } from './Logo';

/**
 * Page du lien de l'e-mail d'alerte de connexion (/compte/alerte?j=…&r=non|oui).
 * Rien ne se passe à l'ouverture (un antivirus ou une messagerie qui ouvre le lien ne bloque rien) : la personne
 * confirme d'un clic. « Ce n'était pas moi » bloque l'appareil et le déconnecte ; « C'était moi » confirme.
 */
type Etat = 'choix' | 'envoi' | 'bloque' | 'confirme' | 'erreur';

export function AlerteConnexion() {
  const [jeton, setJeton] = useState('');
  const [reponse, setReponse] = useState<'oui' | 'non'>('non');
  const [etat, setEtat] = useState<Etat>('choix');
  const [message, setMessage] = useState('');
  const [appareil, setAppareil] = useState('');

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    // Le lien est retiré de l'adresse après lecture : un second passage (mode développement) ne l'efface pas.
    if (!p.has('j')) return;
    setJeton(p.get('j') ?? '');
    setReponse(p.get('r') === 'oui' ? 'oui' : 'non');
    window.history.replaceState(null, '', '/compte/alerte');
  }, []);

  async function confirmer(r: 'oui' | 'non') {
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

  const titre =
    etat === 'bloque'
      ? 'Appareil bloqué'
      : etat === 'confirme'
        ? 'Connexion confirmée'
        : etat === 'erreur'
          ? 'Lien indisponible'
          : reponse === 'non'
            ? 'Bloquer cet appareil ?'
            : 'Confirmer cette connexion ?';
  const texte =
    etat === 'bloque'
      ? `${appareil ? `« ${appareil} » ` : 'Cet appareil '}a été déconnecté et ne peut plus accéder à votre compte. Changez aussi votre mot de passe depuis l’écran de connexion de Six (« Mot de passe oublié »).`
      : etat === 'confirme'
        ? 'Merci. Cette connexion reste active.'
        : etat === 'erreur'
          ? message
          : reponse === 'non'
            ? 'L’appareil qui vient de se connecter sera déconnecté immédiatement et ne pourra plus accéder à votre compte.'
            : 'Vous confirmez que cette connexion vient bien de vous.';

  return (
    <main className="screen auth-screen">
      <div className="auth-card">
        <div className="auth-hero">
          <Logo label="Six" />
          <span className="auth-eyebrow">SÉCURITÉ DU COMPTE</span>
          <h2>{titre}</h2>
          <p>{texte}</p>
        </div>
        {(etat === 'choix' || etat === 'envoi') && jeton && (
          <div className="stack" style={{ gap: 10 }}>
            <button
              type="button"
              disabled={etat === 'envoi'}
              onClick={() => void confirmer(reponse)}
            >
              {etat === 'envoi'
                ? 'Un instant…'
                : reponse === 'non'
                  ? 'Bloquer cet appareil'
                  : 'Oui, c’était moi'}
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={etat === 'envoi'}
              onClick={() => setReponse(reponse === 'non' ? 'oui' : 'non')}
            >
              {reponse === 'non' ? 'En fait, c’était moi' : 'Ce n’était pas moi'}
            </button>
          </div>
        )}
        {!jeton && etat === 'choix' && (
          <div className="auth-alert-err" role="alert">
            <Icon name="alert" size={18} />
            <span>Lien incomplet. Utilisez le bouton de l’e-mail reçu.</span>
          </div>
        )}
      </div>
    </main>
  );
}
