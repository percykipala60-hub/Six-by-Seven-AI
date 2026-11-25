'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { erreurMotDePasse, MDP_MIN_INSCRIPTION, PAGE_NOUVEAU_MDP } from '@/lib/compte';
import { supabase } from '@/lib/supabase';

/**
 * Page du lien « Mot de passe oublié » (/connexion/nouveau-mot-de-passe).
 * On y écrit le nouveau mot de passe deux fois, puis on confirme. Rien d'autre : pas de connexion automatique,
 * pas d'accès à l'app. Une fois le mot de passe changé, la session du lien est fermée partout et la personne
 * retourne elle-même dans Six pour se connecter avec son nouveau mot de passe.
 */
type Etat = 'chargement' | 'formulaire' | 'invalide' | 'fini';

export function NouveauMotDePasse() {
  const [etat, setEtat] = useState<Etat>('chargement');
  const [mdp, setMdp] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [voir, setVoir] = useState(false);
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    let fini = false;
    void (async () => {
      const lienEnErreur = /error_description|error=/.test(
        window.location.hash + window.location.search,
      );
      const sb = await supabase();
      // Le client lit lui-même les jetons du lien (dans l'adresse) au démarrage.
      const session = sb ? (await sb.auth.getSession()).data.session : null;
      window.history.replaceState(null, '', PAGE_NOUVEAU_MDP);
      if (!fini) setEtat(session && !lienEnErreur ? 'formulaire' : 'invalide');
    })();
    return () => {
      fini = true;
    };
  }, []);

  async function valider(e: FormEvent) {
    e.preventDefault();
    setErreur('');
    const faible = erreurMotDePasse(mdp);
    if (faible) return setErreur(faible);
    if (mdp !== confirmation) return setErreur('Les deux mots de passe ne sont pas identiques.');
    setEnvoi(true);
    try {
      const sb = await supabase();
      if (!sb) throw new Error('indisponible');
      const { error } = await sb.auth.updateUser({ password: mdp });
      if (error) {
        setErreur(
          /same|different/i.test(error.message)
            ? 'Choisis un mot de passe différent de l’ancien.'
            : 'Le lien a expiré. Redemande un lien depuis l’écran de connexion de Six.',
        );
        return;
      }
      // Par sécurité, la session du lien est fermée sur tous les appareils : on se reconnecte soi-même.
      await sb.auth.signOut({ scope: 'global' }).catch(() => {});
      setEtat('fini');
    } catch {
      setErreur('Pas de réseau. Réessaie dans un instant.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <main className="screen auth-screen">
      <div className="auth-card">
        <div className="auth-hero">
          <Logo label="Six" />
          <span className="auth-eyebrow">COMPTE SIX</span>
          <h2>
            {etat === 'fini'
              ? 'Mot de passe modifié'
              : etat === 'invalide'
                ? 'Lien expiré'
                : 'Nouveau mot de passe'}
          </h2>
          <p>
            {etat === 'fini'
              ? 'Retourne maintenant dans l’application Six et connecte-toi avec ton nouveau mot de passe. Tes appareils déjà connectés ont été déconnectés par sécurité.'
              : etat === 'invalide'
                ? 'Ce lien n’est plus valable (il ne sert qu’une fois, pendant 10 minutes). Redemande-en un depuis l’écran de connexion de Six, avec « Mot de passe oublié ».'
                : etat === 'chargement'
                  ? 'Vérification du lien…'
                  : 'Écris ton nouveau mot de passe deux fois, puis confirme.'}
          </p>
        </div>
        {etat === 'formulaire' && (
          <form onSubmit={valider} className="stack" style={{ gap: 14 }}>
            <label htmlFor="nouveau-mdp" className="set-label">
              Nouveau mot de passe (au moins {MDP_MIN_INSCRIPTION} caractères)
            </label>
            <div className="input-pwd-wrap">
              <input
                id="nouveau-mdp"
                type={voir ? 'text' : 'password'}
                autoComplete="new-password"
                value={mdp}
                onChange={(e) => setMdp(e.target.value)}
                placeholder="••••••••"
                required
                // eslint-disable-next-line jsx-a11y/no-autofocus -- seul champ de la page de nouveau mot de passe
                autoFocus
              />
              <button
                type="button"
                className="pwd-toggle-btn"
                onClick={() => setVoir(!voir)}
                aria-label={voir ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                <Icon name={voir ? 'eyeOff' : 'eye'} size={18} />
              </button>
            </div>
            <label htmlFor="nouveau-mdp-conf" className="set-label">
              Confirmer le nouveau mot de passe
            </label>
            <input
              id="nouveau-mdp-conf"
              type={voir ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="••••••••"
              required
            />
            {erreur && (
              <div className="auth-alert-err" role="alert">
                <Icon name="alert" size={18} />
                <span>{erreur}</span>
              </div>
            )}
            <button type="submit" disabled={envoi || !mdp || !confirmation}>
              {envoi ? 'Enregistrement…' : 'Confirmer le nouveau mot de passe'}
            </button>
          </form>
        )}
        {etat === 'fini' && (
          <div className="auth-alert-succes" role="status">
            <Icon name="check" size={18} />
            <span>Tu peux fermer cette page.</span>
          </div>
        )}
      </div>
    </main>
  );
}
