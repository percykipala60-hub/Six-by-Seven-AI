'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  CONNEXION_DISPONIBLE,
  MDP_MIN_INSCRIPTION,
  annulerConnexionBureau,
  connecterAvecFournisseur,
  dansAppBureau,
  connecterParMotDePasse,
  demarrerCompte,
  ecouterCompte,
  fournisseursActifs,
  inscrire,
  lireCompte,
  reinitialiserMotDePasse,
  renvoyerConfirmation,
  verifierCode,
  type FournisseurSocial,
  type FournisseursActifs,
  type TypeCode,
  erreurDeRetourDansAdresse,
  messageRetourRefuse,
} from '@/lib/compte';
import { LIEN_CONDITIONS, LIEN_CONFIDENTIALITE } from '@/lib/liens';
import {
  etaitBloque,
  etaitDeconnecteADistance,
  marquerBloque,
  marquerDeconnecteADistance,
} from '@/lib/securite';
import { QrConnexion } from './QrConnexion';
import { AppIcon } from './AppIcon';
import { Icon } from './Icon';
import { Logo } from './Logo';

type ModeAuth = 'connexion' | 'inscription' | 'oubli';

/** Logo Apple monochrome (SVG officiel simplifié), pour le bouton de connexion. */
function AppleLogo({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className="auth-social-icon"
    >
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

/** Saisie d'un code à 6 chiffres en cases individuelles. */
export function CodeOtp({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const chars = Array.from({ length: 6 }, (_, i) => value[i] ?? '');

  const ecrire = (i: number, brut: string) => {
    const digits = brut.replace(/\D/g, '');
    if (!digits) {
      // Effacement : on retire le chiffre de cette case et on recule.
      const reste = (value.slice(0, i) + value.slice(i + 1)).replace(/\D/g, '');
      onChange(reste);
      return;
    }
    // Saisie (ou collage) : on remplit à partir de cette case.
    const base = value.replace(/\D/g, '').slice(0, i);
    const suivant = (base + digits).slice(0, 6);
    onChange(suivant);
    const cible = Math.min(i + digits.length, 5);
    refs.current[cible]?.focus();
  };

  return (
    <div className="otp-boxes" role="group" aria-label="Code à 6 chiffres">
      {chars.map((chiffre, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="otp-box"
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={6}
          aria-label={`Chiffre ${i + 1}`}
          value={chiffre}
          onChange={(e) => ecrire(i, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !chiffre && i > 0) refs.current[i - 1]?.focus();
            if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
            if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
          }}
          onPaste={(e) => {
            e.preventDefault();
            const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
            if (digits) onChange(digits);
          }}
        />
      ))}
    </div>
  );
}

function evaluerForceMdp(pwd: string): { niveau: 'weak' | 'medium' | 'strong'; texte: string } {
  if (!pwd) return { niveau: 'weak', texte: '' };
  if (pwd.length < 6) return { niveau: 'weak', texte: 'Trop court (au moins 6 caractères)' };
  const hasNum = /\d/.test(pwd);
  const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
  const hasUpper = /[A-Z]/.test(pwd);
  if (pwd.length >= 8 && (hasNum || hasSpecial) && hasUpper) {
    return { niveau: 'strong', texte: 'Mot de passe sécurisé' };
  }
  if (pwd.length >= 6 && (hasNum || hasUpper || hasSpecial)) {
    return { niveau: 'medium', texte: 'Sécurité moyenne' };
  }
  return { niveau: 'weak', texte: 'Sécurité faible' };
}

/** Formulaire de connexion / création de compte (e-mail + mot de passe puis code, ou Google / Apple). */
export function FormulaireConnexion() {
  const [mode, setMode] = useState<ModeAuth>('connexion');

  // Champs de saisie
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmationMdp, setConfirmationMdp] = useState('');
  const [prenomSaisie, setPrenomSaisie] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [accepteConditions, setAccepteConditions] = useState(false);
  const [socialBusy, setSocialBusy] = useState<FournisseurSocial | null>(null);
  // Boutons Google / Apple affichés seulement si le fournisseur est activé côté Supabase.
  const [sociaux, setSociaux] = useState<FournisseursActifs>({ google: false, apple: false });
  useEffect(() => {
    let vivant = true;
    void fournisseursActifs().then((a) => vivant && setSociaux(a));
    return () => {
      vivant = false;
    };
  }, []);

  // Deuxième étape : code à 6 chiffres reçu par e-mail (connexion ou confirmation d'inscription).
  const [etapeCode, setEtapeCode] = useState<{ email: string; type: TypeCode } | null>(null);
  const [codeOtp, setCodeOtp] = useState('');
  // « Renvoyer le code » attend une minute entre deux envois (comme Supabase côté serveur).
  const [attente, setAttente] = useState(0);
  useEffect(() => {
    if (attente <= 0) return;
    const t = setTimeout(() => setAttente((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [attente]);
  // États de chargement et retours
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  // Retour de Google ou Apple refusé : Supabase revient sur Six avec l'erreur dans l'adresse. On l'affiche en
  // clair (au lieu de rester silencieux) puis on la retire de l'adresse.
  // Connexion par code QR (comme Steam) : le code s'affiche à la place des boutons quand on le demande.
  const [qrOuvert, setQrOuvert] = useState(false);
  // Appareil bloqué depuis l'e-mail d'alerte : on l'explique une fois.
  useEffect(() => {
    if (etaitDeconnecteADistance()) {
      marquerDeconnecteADistance(false);
      setInfo(
        'Cet appareil a été déconnecté depuis un autre appareil. Reconnecte-toi pour continuer.',
      );
      return;
    }
    if (!etaitBloque()) return;
    marquerBloque(false);
    setErreur(
      'Cet appareil a été déconnecté depuis l’e-mail d’alerte de connexion (« Ce n’était pas moi »). Si c’était bien toi, reconnecte-toi ; sinon, change ton mot de passe avec « Mot de passe oublié ».',
    );
  }, []);
  useEffect(() => {
    const description = erreurDeRetourDansAdresse(window.location.href);
    if (!description) return;
    setErreur(messageRetourRefuse(description));
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const fragment = new URLSearchParams(url.hash.slice(1));
    if (!url.searchParams.has('error') && !fragment.has('error')) return;
    setErreur(
      'La connexion avec Google ou Apple a échoué. Utilise ton adresse e-mail ou réessaie plus tard.',
    );
    url.searchParams.delete('error');
    url.searchParams.delete('error_code');
    url.searchParams.delete('error_description');
    fragment.delete('error');
    fragment.delete('error_code');
    fragment.delete('error_description');
    window.history.replaceState(
      null,
      '',
      `${url.pathname}${url.search}${fragment.size ? `#${fragment}` : ''}`,
    );
  }, []);

  const forceMdp = useMemo(() => evaluerForceMdp(motDePasse), [motDePasse]);

  async function handleSocial(fournisseur: FournisseurSocial) {
    setErreur('');
    setInfo('');
    setSocialBusy(fournisseur);
    try {
      await demarrerCompte();
      const r = await connecterAvecFournisseur(fournisseur);
      if (r.erreur) setErreur(r.erreur);
      else if (r.info) setInfo(r.info);
    } catch {
      setErreur('La connexion ne répond pas. Vérifie ta connexion Internet et réessaie.');
    } finally {
      setSocialBusy(null);
    }
  }

  function ouvrirEtapeCode(type: TypeCode) {
    setEtapeCode({ email: email.trim().toLowerCase(), type });
    setCodeOtp('');
    setAttente(60);
  }

  async function handleConnexion(e: FormEvent) {
    e.preventDefault();
    setErreur('');
    setInfo('');
    setBusy(true);
    try {
      await demarrerCompte();
      const r = await connecterParMotDePasse(email, motDePasse);
      if (r.erreur) setErreur(r.erreur);
      else if (r.code) ouvrirEtapeCode(r.code);
      else setErreur('La connexion n’a pas pu être terminée. Réessaie.');
    } catch {
      setErreur('La connexion ne répond pas. Vérifie ta connexion Internet et réessaie.');
    } finally {
      setBusy(false);
    }
  }

  async function handleInscription(e: FormEvent) {
    e.preventDefault();
    setErreur('');
    setInfo('');
    if (!prenomSaisie.trim()) {
      setErreur('Indique ton prénom pour que Six puisse te saluer.');
      return;
    }
    if (motDePasse.length < MDP_MIN_INSCRIPTION) {
      setErreur(`Le mot de passe doit comporter au moins ${MDP_MIN_INSCRIPTION} caractères.`);
      return;
    }
    if (motDePasse !== confirmationMdp) {
      setErreur('Les deux mots de passe ne correspondent pas.');
      return;
    }
    if (!accepteConditions) {
      setErreur('Accepte les conditions d’utilisation et la politique de confidentialité.');
      return;
    }
    setBusy(true);
    try {
      await demarrerCompte();
      const res = await inscrire(email, motDePasse, prenomSaisie, accepteConditions);
      if (res.error) setErreur(res.error);
      else if (res.confirmationRequise) ouvrirEtapeCode('inscription');
      else {
        setMotDePasse('');
        setConfirmationMdp('');
        setInfo('Compte créé. Tu peux maintenant utiliser Six.');
      }
    } catch {
      setErreur('La création du compte ne répond pas. Vérifie ta connexion Internet et réessaie.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRenvoyerCode() {
    if (!etapeCode || attente > 0) return;
    setBusy(true);
    setErreur('');
    setInfo('');
    // Connexion : on revérifie le mot de passe avant tout nouvel envoi.
    try {
      const err =
        etapeCode.type === 'inscription'
          ? await renvoyerConfirmation(etapeCode.email)
          : (await connecterParMotDePasse(etapeCode.email, motDePasse)).erreur;
      if (err) setErreur(err);
      else {
        setAttente(60);
        setInfo('Un nouveau code vient de partir. Regarde aussi tes spams.');
      }
    } catch {
      setErreur('Le renvoi du code ne répond pas. Réessaie dans un instant.');
    } finally {
      setBusy(false);
    }
  }

  async function handleValiderCode(e: FormEvent) {
    e.preventDefault();
    if (!etapeCode) return;
    setBusy(true);
    setErreur('');
    setInfo('');
    try {
      await demarrerCompte();
      const err = await verifierCode(etapeCode.email, codeOtp, etapeCode.type);
      if (err) setErreur(err);
      else {
        setEtapeCode(null);
        setCodeOtp('');
        setEmail('');
        setMotDePasse('');
        setConfirmationMdp('');
        setMode('connexion');
        setInfo('Adresse confirmée. Ton compte est prêt.');
      }
    } catch {
      setErreur('La vérification du code ne répond pas. Réessaie dans un instant.');
    } finally {
      setBusy(false);
    }
  }

  async function handleOubli(e: FormEvent) {
    e.preventDefault();
    setErreur('');
    setInfo('');
    setBusy(true);
    try {
      const err = await reinitialiserMotDePasse(email);
      if (err) setErreur(err);
      else {
        setInfo('Un e-mail de réinitialisation t’a été envoyé. Regarde aussi tes spams.');
        setMode('connexion');
      }
    } catch {
      setErreur('La demande ne répond pas. Vérifie ta connexion Internet et réessaie.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <div className="auth-hero">
        <Logo label="Six" />
        <span className="auth-eyebrow">COMPTE SIX</span>
        <h2>
          {etapeCode
            ? 'Vérifie ton e-mail'
            : mode === 'inscription'
              ? 'Créer ton compte'
              : mode === 'oubli'
                ? 'Réinitialiser le mot de passe'
                : 'Bienvenue sur Six'}
        </h2>
        <p>
          {etapeCode
            ? etapeCode.type === 'inscription'
              ? 'Dernière étape : confirme que cette adresse est bien la tienne.'
              : 'Pour ta sécurité, chaque connexion se confirme avec un code reçu par e-mail.'
            : mode === 'inscription'
              ? 'Un compte suffit pour utiliser Six. Ta mémoire reste sur cet appareil, sauf si tu choisis de la copier sur ton compte.'
              : mode === 'oubli'
                ? 'On t’enverra un lien sécurisé pour choisir un nouveau mot de passe.'
                : 'Connecte-toi ou crée ton compte pour commencer.'}
        </p>
      </div>
      {/* Connexion en un geste : le reste (e-mail, code) ne change pas. */}
      {!etapeCode &&
        (mode === 'connexion' || mode === 'inscription') &&
        (sociaux.google || sociaux.apple) && (
          <>
            <div className="auth-socials">
              {sociaux.google && (
                <button
                  type="button"
                  className="auth-social-btn solid"
                  onClick={() => void handleSocial('google')}
                  disabled={busy || socialBusy !== null}
                >
                  <AppIcon id="google" size={22} className="auth-social-icon" />
                  <span>
                    {socialBusy === 'google' ? 'Ouverture de Google…' : 'Continuer avec Google'}
                  </span>
                </button>
              )}
              {sociaux.apple && (
                <button
                  type="button"
                  className="auth-social-btn"
                  onClick={() => void handleSocial('apple')}
                  disabled={busy || socialBusy !== null}
                >
                  <AppleLogo size={20} />
                  <span>
                    {socialBusy === 'apple' ? 'Ouverture d’Apple…' : 'Continuer avec Apple'}
                  </span>
                </button>
              )}
              {mode === 'connexion' && (
                <button
                  type="button"
                  className="auth-social-btn"
                  aria-expanded={qrOuvert}
                  onClick={() => setQrOuvert((v) => !v)}
                  disabled={busy || socialBusy !== null}
                >
                  <Icon name="qr" size={20} stroke={1.6} />
                  <span>{qrOuvert ? 'Masquer le code QR' : 'Se connecter avec un code QR'}</span>
                </button>
              )}
            </div>
            {mode === 'connexion' && qrOuvert && <QrConnexion />}
            {socialBusy && dansAppBureau() && (
              <div className="auth-attente-navigateur">
                <p>Termine la connexion dans ton navigateur : Six reprend ici tout seul ensuite.</p>
                <button type="button" className="auth-lien" onClick={annulerConnexionBureau}>
                  Annuler
                </button>
              </div>
            )}
            <div className="auth-divider" role="separator">
              <span>ou par e-mail</span>
            </div>
          </>
        )}

      {/* Onglets Connexion / Inscription (pas pendant l'étape du code ni « oubli ») */}
      {!etapeCode && (mode === 'connexion' || mode === 'inscription') && (
        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'connexion'}
            className={`auth-tab ${mode === 'connexion' ? 'active' : ''}`}
            onClick={() => {
              setMode('connexion');
              setErreur('');
              setInfo('');
            }}
          >
            Se connecter
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'inscription'}
            className={`auth-tab ${mode === 'inscription' ? 'active' : ''}`}
            onClick={() => {
              setMode('inscription');
              setErreur('');
              setInfo('');
            }}
          >
            Créer un compte
          </button>
        </div>
      )}

      {info && (
        <div className="auth-alert-succes" role="status">
          <Icon name="check" size={18} />
          <span>{info}</span>
        </div>
      )}
      {erreur && (
        <div className="auth-alert-err" role="alert">
          <Icon name="alert" size={18} />
          <span>{erreur}</span>
        </div>
      )}
      {/* Étape 2 : code à 6 chiffres reçu par e-mail */}
      {etapeCode && (
        <form onSubmit={handleValiderCode} className="stack" style={{ gap: 12 }}>
          <b>Entre le code à 6 chiffres</b>
          <p className="muted small">
            Envoyé à <b>{etapeCode.email}</b>. Il expire dans 10 minutes. Regarde aussi dans tes
            courriers indésirables.
          </p>
          <CodeOtp value={codeOtp} onChange={setCodeOtp} />
          <button
            className="btn primary"
            type="submit"
            disabled={busy || codeOtp.replace(/\D/g, '').length < 6}
          >
            {busy
              ? 'Vérification…'
              : etapeCode.type === 'inscription'
                ? 'Confirmer mon adresse'
                : 'Valider et me connecter'}
          </button>
          <div className="auth-footer-actions">
            <button
              type="button"
              className="link"
              onClick={() => void handleRenvoyerCode()}
              disabled={busy || attente > 0}
            >
              {attente > 0 ? `Renvoyer le code dans ${attente} s` : 'Renvoyer le code'}
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                setEtapeCode(null);
                setCodeOtp('');
                setErreur('');
                setInfo('');
              }}
            >
              <Icon name="back" size={16} /> Retour
            </button>
          </div>
        </form>
      )}

      {/* 1. Mode CONNEXION : mot de passe, puis code par e-mail */}
      {!etapeCode && mode === 'connexion' && (
        <form onSubmit={handleConnexion} className="stack" style={{ gap: 14 }}>
          <div>
            <label htmlFor="auth-email" className="set-label">
              Adresse e-mail
            </label>
            <input
              id="auth-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="toi@exemple.com"
              required
            />
          </div>

          <div>
            <label htmlFor="auth-pwd" className="set-label">
              Mot de passe
            </label>
            <div className="input-pwd-wrap">
              <input
                id="auth-pwd"
                type={showPwd ? 'text' : 'password'}
                autoComplete="current-password"
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                className="pwd-toggle-btn"
                onClick={() => setShowPwd(!showPwd)}
                aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                <Icon name={showPwd ? 'eyeOff' : 'eye'} size={18} />
              </button>
            </div>
          </div>

          <button
            className="btn primary"
            type="submit"
            disabled={busy || !email.trim() || !motDePasse}
          >
            {busy ? 'Vérification…' : 'Continuer'}
          </button>

          <div className="auth-footer-actions">
            <button
              type="button"
              className="link"
              onClick={() => {
                setMode('oubli');
                setErreur('');
                setInfo('');
              }}
            >
              Mot de passe oublié ?
            </button>
          </div>
        </form>
      )}

      {/* 2. Mode CRÉATION DE COMPTE (Sign up) — étapes numérotées. */}
      {!etapeCode && mode === 'inscription' && (
        <form onSubmit={handleInscription} className="stack auth-steps" style={{ gap: 14 }}>
          <div className="auth-step">
            <span className="auth-step-num" aria-hidden="true">
              1
            </span>
            <div className="auth-step-body">
              <label htmlFor="inscr-prenom" className="set-label">
                Comment Six doit-il t’appeler ?
              </label>
              <input
                id="inscr-prenom"
                type="text"
                autoComplete="given-name"
                maxLength={30}
                value={prenomSaisie}
                onChange={(e) => setPrenomSaisie(e.target.value)}
                placeholder="Ex : Sarah"
                required
              />
            </div>
          </div>

          <div className="auth-step">
            <span className="auth-step-num" aria-hidden="true">
              2
            </span>
            <div className="auth-step-body">
              <label htmlFor="inscr-email" className="set-label">
                Ton adresse e-mail
              </label>
              <input
                id="inscr-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="toi@exemple.com"
                required
              />
            </div>
          </div>

          <div className="auth-step">
            <span className="auth-step-num" aria-hidden="true">
              3
            </span>
            <div className="auth-step-body">
              <label htmlFor="inscr-pwd" className="set-label">
                Choisis un mot de passe (au moins {MDP_MIN_INSCRIPTION} caractères)
              </label>
              <div className="input-pwd-wrap">
                <input
                  id="inscr-pwd"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  placeholder="••••••••"
                  minLength={MDP_MIN_INSCRIPTION}
                  required
                />
                <button
                  type="button"
                  className="pwd-toggle-btn"
                  onClick={() => setShowPwd(!showPwd)}
                  aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  <Icon name={showPwd ? 'eyeOff' : 'eye'} size={18} />
                </button>
              </div>
              {motDePasse && (
                <div>
                  <div className="pwd-meter">
                    <div
                      className={`pwd-meter-step ${
                        forceMdp.niveau === 'weak' ||
                        forceMdp.niveau === 'medium' ||
                        forceMdp.niveau === 'strong'
                          ? forceMdp.niveau
                          : ''
                      }`}
                    />
                    <div
                      className={`pwd-meter-step ${
                        forceMdp.niveau === 'medium' || forceMdp.niveau === 'strong'
                          ? forceMdp.niveau
                          : ''
                      }`}
                    />
                    <div
                      className={`pwd-meter-step ${
                        forceMdp.niveau === 'strong' ? forceMdp.niveau : ''
                      }`}
                    />
                  </div>
                  <div className="pwd-hint">
                    <span>{forceMdp.texte}</span>
                    <span>{motDePasse.length} car.</span>
                  </div>
                </div>
              )}
              <label htmlFor="inscr-pwd-conf" className="set-label">
                Confirmer le mot de passe
              </label>
              <input
                id="inscr-pwd-conf"
                type={showPwd ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmationMdp}
                onChange={(e) => setConfirmationMdp(e.target.value)}
                placeholder="••••••••"
                minLength={MDP_MIN_INSCRIPTION}
                required
              />
            </div>
          </div>

          <label className="auth-terms">
            <input
              type="checkbox"
              checked={accepteConditions}
              onChange={(e) => setAccepteConditions(e.target.checked)}
              required
            />
            <span>
              J’accepte les{' '}
              <a
                href={LIEN_CONDITIONS}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                conditions d’utilisation
              </a>{' '}
              et la{' '}
              <a
                href={LIEN_CONFIDENTIALITE}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                politique de confidentialité
              </a>
              .
            </span>
          </label>

          <button
            className="btn primary"
            type="submit"
            disabled={
              busy ||
              !email.trim() ||
              !motDePasse ||
              !prenomSaisie.trim() ||
              motDePasse !== confirmationMdp ||
              !accepteConditions
            }
          >
            {busy ? 'Création en cours…' : 'Créer mon compte'}
          </button>

          <div className="auth-footer-actions">
            <button
              type="button"
              className="link"
              onClick={() => {
                setMode('connexion');
                setErreur('');
                setInfo('');
              }}
            >
              Déjà un compte ? Se connecter
            </button>
          </div>
          {confirmationMdp && motDePasse !== confirmationMdp && (
            <p className="auth-field-error" role="status">
              Les deux mots de passe ne correspondent pas encore.
            </p>
          )}
        </form>
      )}

      {/* 4. Mode MOT DE PASSE OUBLIÉ */}
      {!etapeCode && mode === 'oubli' && (
        <form onSubmit={handleOubli} className="stack" style={{ gap: 12 }}>
          <b>Mot de passe oublié</b>
          <p className="muted small">
            Saisis ton adresse e-mail. Six t&apos;enverra un lien pour créer un nouveau mot de passe
            en toute sécurité.
          </p>
          <label htmlFor="oubli-email" className="set-label">
            Adresse e-mail
          </label>
          <input
            id="oubli-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="toi@exemple.com"
            required
          />
          <button className="btn primary" type="submit" disabled={busy || !email.trim()}>
            {busy ? 'Envoi du lien…' : 'Envoyer le lien de réinitialisation'}
          </button>
          <button
            type="button"
            className="link"
            onClick={() => {
              setMode('connexion');
              setErreur('');
              setInfo('');
            }}
          >
            <Icon name="back" size={16} /> Retour à la connexion
          </button>
        </form>
      )}
    </div>
  );
}

// Pages lisibles sans compte : les textes légaux (liés depuis le formulaire d'inscription).
// Sans compte aussi : le retour de connexion (il sert justement à se connecter) et les partages du Cloud (lus par
// des personnes qui n'ont pas forcément de compte).
const PAGES_PUBLIQUES = [
  '/conditions',
  '/confidentialite',
  '/mentions',
  '/connexion/retour',
  '/connexion/nouveau-mot-de-passe',
  '/compte/alerte',
  '/partage',
];

/**
 * Le compte est obligatoire : tant que la personne n'est pas connectée, l'app affiche l'écran de connexion
 * à la place de la page demandée. Sans Supabase configuré (dev local, tests), l'app reste ouverte en invité.
 */
export function PorteCompte({ children }: { children: ReactNode }) {
  const chemin = usePathname() ?? '/';
  const [connecte, setConnecte] = useState<boolean | null>(null);
  useEffect(() => {
    const lire = () => setConnecte(lireCompte().statut === 'connecte');
    lire();
    return ecouterCompte(lire);
  }, []);

  const publique = PAGES_PUBLIQUES.some((p) => chemin === p || chemin.startsWith(`${p}/`));
  if (!CONNEXION_DISPONIBLE || publique) return <>{children}</>;
  if (connecte === null) return null; // session lue après le montage : pas d'écran qui clignote
  if (!connecte) {
    return (
      <div className="app">
        <main className="screen auth-screen">
          <FormulaireConnexion />
        </main>
      </div>
    );
  }
  return <>{children}</>;
}
