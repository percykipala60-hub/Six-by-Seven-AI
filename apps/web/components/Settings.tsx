'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import Link from 'next/link';
import { DEFAULT_STYLE, clearStyle, loadStyle, saveStyle } from '@/lib/style';
import {
  activerMemoire,
  ecrireNote,
  effacerMemoire,
  habitudes,
  lireMemoire,
  memoireActive,
  type Memoire,
} from '@/lib/memoire';
import { effacerConversations, lireConversations } from '@/lib/conversations';
import { applyThemeIcon, hasNativeThemeIconError } from '@/lib/theme-icon';
import themeColors from '@/lib/theme-colors.json';
import type { UserStyle } from '@/lib/types';
import {
  CONNEXION_DISPONIBLE,
  MDP_MIN_INSCRIPTION,
  changerMotDePasse,
  connecterAvecFournisseur,
  connecterParMotDePasse,
  deconnecter,
  demarrerCompte,
  ecouterCompte,
  ecrirePrenom,
  envoyerCode,
  initiale,
  inscrire,
  lireCompte,
  lireIdentifiant,
  oublierMemoireDuCompte,
  reinitialiserMotDePasse,
  renvoyerConfirmation,
  verifierCode,
  type Compte,
  type FournisseurSocial,
  type Identifiant,
} from '@/lib/compte';
import { AppBar } from './AppBar';
import { AppIcon } from './AppIcon';
import { Icon, type IconName } from './Icon';
import { InterAppNotifications, InterAppOnboarding } from './InterAppNotifications';
import { Logo } from './Logo';

type Theme = 'auto' | 'light' | 'dark';
// Chaque thème est montré comme le logo qu'il donne : fond, « 6 » et trait (mêmes valeurs que app/globals.css).
type Tuile = {
  id: string;
  label: string;
  icon: { background: string; ink: string; accent: string };
  gradient?: string[];
  ring?: boolean;
};
const ACCENTS: Tuile[] = themeColors.accents;
const RESEAUX: Tuile[] = themeColors.networks;

/** Tuile de thème : le logo officiel de la marque pour les réseaux/IA, ou le logo Six recoloré pour les accents. */
function Tile({ t, on, onPick }: { t: Tuile; on: boolean; onPick: () => void }) {
  const isNetwork = RESEAUX.some((r) => r.id === t.id);
  const vars = {
    '--icon-bg': t.icon.background,
    '--icon-ink': t.icon.ink,
    '--icon-accent': t.icon.accent,
    '--icon-grad': t.gradient
      ? `linear-gradient(45deg, ${t.gradient.join(', ')})`
      : t.icon.background,
    '--icon-ring': t.ring ? 'var(--line)' : 'transparent',
  } as CSSProperties;
  return (
    <button className="tile" data-id={t.id} aria-pressed={on} onClick={onPick}>
      {isNetwork ? (
        <AppIcon id={t.id} size={38} className="tile-brand-icon" />
      ) : (
        <span className="logo six-logo" style={vars} aria-hidden="true">
          <i className="six-logo-glyphe" />
          <i className="six-logo-trait" />
        </span>
      )}
      {t.label}
    </button>
  );
}

// Polices : celles du système. Un téléphone qui ne les a pas (Android) affiche une police proche.
const POLICES = [
  {
    id: 'systeme',
    label: 'Police du téléphone',
    court: 'Téléphone',
    family: 'var(--font-systeme)',
  },
  {
    id: 'times',
    label: 'Times New Roman',
    court: 'Times',
    family: '"Times New Roman", Times, Tinos, "Liberation Serif", "Noto Serif", serif',
  },
  {
    id: 'georgia',
    label: 'Georgia',
    court: 'Georgia',
    family: 'Georgia, Gelasio, "Noto Serif", serif',
  },
  {
    id: 'calibri',
    label: 'Calibri',
    court: 'Calibri',
    family: 'Calibri, Carlito, "Segoe UI", Roboto, system-ui, sans-serif',
  },
];

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* stockage bloqué : le réglage vaut pour cette visite seulement */
  }
}

/** Mémoire de Six : ce qu'il a appris, ce que tu lui as dit de tes contacts, tes suivis, et tes conversations gardées. Visible, modifiable, effaçable. */
function MemoireSix() {
  const [on, setOn] = useState(false);
  const [m, setM] = useState<Memoire>({ choix: [], contacts: [], suivis: [] });
  const [nbConv, setNbConv] = useState(0);

  useEffect(() => {
    const lire = () => {
      setOn(memoireActive());
      setM(lireMemoire());
      setNbConv(lireConversations().length);
    };
    lire();
    window.addEventListener('six-memoire', lire);
    return () => window.removeEventListener('six-memoire', lire);
  }, []);

  const appris = habitudes(m);
  return (
    <section className="stack" aria-label="Mémoire de Six">
      <p className="muted small">
        Six apprend de tes choix pour écrire comme toi et se souvenir de tes contacts. Tant que la
        mémoire est activée, tes conversations terminées sont aussi gardées sur ce téléphone,
        jusqu&apos;à ce que tu les effaces toi-même. Ce que Six apprend est oublié après 90 jours.
      </p>
      <label className="toggle" htmlFor="memory-enabled" aria-label="Activer la mémoire de Six">
        <span className="grow">
          <b>Mémoire activée</b>
          <span className="muted small">
            {on ? "Six se souvient d'une fois sur l'autre" : 'Six oublie tout à chaque fois'}
          </span>
        </span>
        <input
          id="memory-enabled"
          type="checkbox"
          className="sw"
          checked={on}
          onChange={(e) => activerMemoire(e.target.checked)}
        />
      </label>
      {on && (
        <>
          <div className="card stack">
            <div className="lbl">Ce que Six a appris</div>
            {appris.length ? (
              <div className="tags">
                {appris.map((a) => (
                  <span className="tag" key={a}>
                    {a}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted small">
                Rien encore : Six apprend à partir de 3 réponses choisies ({m.choix.length}/3).
              </p>
            )}
          </div>
          <div className="card stack">
            <div className="lbl">Tes contacts</div>
            {m.contacts.length ? (
              m.contacts.map((c) => (
                <div className="row sp contact" key={c.nom}>
                  <span className="grow">
                    <b>{c.nom}</b>
                    <span className="muted small"> · {c.note}</span>
                  </span>
                  <button
                    className="btn ghost small"
                    aria-label={`Oublier ${c.nom}`}
                    onClick={() => ecrireNote(c.nom, '')}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              ))
            ) : (
              <p className="muted small">
                Sur l&apos;écran « Protéger », dis à Six qui est la personne : il s&apos;en
                souviendra.
              </p>
            )}
          </div>
          {m.suivis.length > 0 && (
            <p className="muted small">
              {m.suivis.length} suivi{m.suivis.length > 1 ? 's' : ''} en attente sur l&apos;accueil.
            </p>
          )}
          <div className="card stack">
            <div className="row sp">
              <div className="lbl">Conversations gardées</div>
              <span className="muted small">{nbConv}</span>
            </div>
            <p className="muted small">
              Tes conversations terminées avec Six restent sur ce téléphone, tant que tu les
              conserves. Efface-les ici, une par une depuis l&apos;accueil, ou coupe la mémoire.
            </p>
            {nbConv > 0 && (
              <button
                className="btn ghost"
                onClick={() => {
                  effacerConversations();
                  window.dispatchEvent(new Event('six-memoire'));
                }}
              >
                <Icon name="trash" /> Effacer les conversations gardées
              </button>
            )}
          </div>
          <button className="btn ghost" onClick={effacerMemoire}>
            <Icon name="trash" /> Effacer la mémoire de Six
          </button>
        </>
      )}
    </section>
  );
}

type Vue = '' | 'theme' | 'police' | 'style' | 'memoire' | 'compte' | 'notifications';
const TITRES: Record<Exclude<Vue, ''>, string> = {
  theme: 'Thème et couleurs',
  police: 'Police',
  style: "Mon style d'écriture",
  memoire: 'Mémoire de Six',
  compte: 'Compte',
  notifications: 'Notifications des apps',
};
const MODES: Record<Theme, string> = { auto: 'Auto', light: 'Clair', dark: 'Sombre' };

/** Rangée d'une liste de réglages : icône, libellé, valeur actuelle, chevron. */
function Rangee({
  icon,
  label,
  valeur,
  onClick,
}: {
  icon: IconName;
  label: string;
  valeur?: string;
  onClick: () => void;
}) {
  return (
    <button className="set-row" onClick={onClick}>
      <span className="set-ico" aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      <span className="grow">{label}</span>
      {valeur && <span className="set-val">{valeur}</span>}
      <Icon name="chevron" size={18} />
    </button>
  );
}

function LienRangee({ href, icon, label }: { href: string; icon: IconName; label: string }) {
  return (
    <Link className="set-row" href={href}>
      <span className="set-ico" aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      <span className="grow">{label}</span>
      <Icon name="chevron" size={18} />
    </Link>
  );
}

function LienExterne({ href, icon, label }: { href: string; icon: IconName; label: string }) {
  return (
    <a className="set-row" href={href} target="_blank" rel="noopener noreferrer">
      <span className="set-ico" aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      <span className="grow">{label}</span>
      <Icon name="chevron" size={18} />
    </a>
  );
}

type ModeAuth = 'connexion' | 'inscription' | 'otp' | 'oubli';

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

/** Saisie d'un code à 6 chiffres en cases individuelles, comme dans Snap ou Claude. */
function CodeOtp({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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

/** Compte : invité par défaut ; connexion / inscription par e-mail ou code qui synchronise la mémoire de Six. */
function CompteVue() {
  const [c, setC] = useState<Compte>({ statut: 'invite', prenom: '' });
  const [prenom, setPrenom] = useState('');
  const [mode, setMode] = useState<ModeAuth>('connexion');

  // Champs de saisie
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmationMdp, setConfirmationMdp] = useState('');
  const [prenomSaisie, setPrenomSaisie] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [accepteConditions, setAccepteConditions] = useState(false);
  const [socialBusy, setSocialBusy] = useState<FournisseurSocial | null>(null);

  // OTP (code par e-mail)
  const [idOtp, setIdOtp] = useState<Identifiant | null>(null);
  const [codeOtp, setCodeOtp] = useState('');

  // Confirmation d'inscription et changement de mot de passe
  const [confirmationEmail, setConfirmationEmail] = useState('');
  const [showPwdChange, setShowPwdChange] = useState(false);
  const [nouveauMdp, setNouveauMdp] = useState('');
  const [confirmationNouveau, setConfirmationNouveau] = useState('');

  // États de chargement et retours
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [statsMemoire, setStatsMemoire] = useState({ habitudes: 0, contacts: 0, suivis: 0 });

  const forceMdp = useMemo(() => evaluerForceMdp(motDePasse), [motDePasse]);

  useEffect(() => {
    const lire = () => {
      const x = lireCompte();
      setC(x);
      setPrenom(x.prenom);
      const m = lireMemoire();
      setStatsMemoire({
        habitudes: m.choix.length,
        contacts: m.contacts.length,
        suivis: m.suivis.length,
      });
    };
    lire();
    return ecouterCompte(lire);
  }, []);

  async function handleSocial(fournisseur: FournisseurSocial) {
    setErreur('');
    setInfo('');
    setSocialBusy(fournisseur);
    await demarrerCompte();
    const r = await connecterAvecFournisseur(fournisseur);
    setSocialBusy(null);
    if (r.erreur) setErreur(r.erreur);
    else if (r.info) setInfo(r.info);
  }

  async function handleConnexion(e: FormEvent) {
    e.preventDefault();
    setErreur('');
    setInfo('');
    setBusy(true);
    await demarrerCompte();
    const err = await connecterParMotDePasse(email, motDePasse);
    setBusy(false);
    if (err) {
      setErreur(err);
    } else {
      setMotDePasse('');
      setInfo('Ravi de te revoir ! Ta mémoire est synchronisée.');
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
    await demarrerCompte();
    const res = await inscrire(email, motDePasse, prenomSaisie, accepteConditions);
    setBusy(false);
    if (res.error) {
      setErreur(res.error);
    } else if (res.confirmationRequise) {
      setConfirmationEmail(email.trim().toLowerCase());
      setInfo(
        'Compte créé ! Un e-mail de confirmation t’a été envoyé. Clique sur le lien reçu pour valider ton compte.',
      );
      setMode('connexion');
    } else {
      setMotDePasse('');
      setConfirmationMdp('');
      setInfo('Compte créé avec succès ! Ta mémoire est synchronisée.');
    }
  }

  async function handleRenvoyerConfirmation() {
    const adresse = confirmationEmail || email;
    setBusy(true);
    setErreur('');
    const err = await renvoyerConfirmation(adresse);
    setBusy(false);
    if (err) setErreur(err);
    else setInfo('Un nouvel e-mail de confirmation vient de partir. Regarde aussi tes spams.');
  }

  async function handleChangerMotDePasse(e: FormEvent) {
    e.preventDefault();
    setErreur('');
    setInfo('');
    if (nouveauMdp !== confirmationNouveau) {
      setErreur('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true);
    const err = await changerMotDePasse(nouveauMdp);
    setBusy(false);
    if (err) {
      setErreur(err);
    } else {
      setNouveauMdp('');
      setConfirmationNouveau('');
      setShowPwdChange(false);
      setInfo('Mot de passe enregistré. Il fonctionne dès maintenant sur tous tes appareils.');
    }
  }

  async function handleDemandeOtp(e: FormEvent) {
    e.preventDefault();
    const lu = lireIdentifiant(email);
    if (!lu) {
      setErreur('Écris une adresse e-mail valide (ex. : toi@exemple.com).');
      return;
    }
    setBusy(true);
    setErreur('');
    await demarrerCompte();
    const err = await envoyerCode(lu);
    setBusy(false);
    if (err) setErreur(err);
    else {
      setIdOtp(lu);
      setCodeOtp('');
    }
  }

  async function handleValiderOtp(e: FormEvent) {
    e.preventDefault();
    if (!idOtp) return;
    setBusy(true);
    setErreur('');
    const err = await verifierCode(idOtp, codeOtp);
    setBusy(false);
    if (err) setErreur(err);
    else {
      setIdOtp(null);
      setEmail('');
      setInfo('Connecté. Ta mémoire est réunie avec celle de ton compte.');
    }
  }

  async function handleOubli(e: FormEvent) {
    e.preventDefault();
    setErreur('');
    setInfo('');
    setBusy(true);
    const err = await reinitialiserMotDePasse(email);
    setBusy(false);
    if (err) {
      setErreur(err);
    } else {
      setInfo('Un e-mail de réinitialisation t’a été envoyé. Regarde aussi tes spams.');
      setMode('connexion');
    }
  }

  return (
    <>
      <div className="compte-head">
        <span className="avatar avatar-lg" aria-hidden="true">
          {initiale(c) || <Icon name="user" size={34} />}
          <span className={`avatar-dot${c.statut === 'connecte' ? ' on' : ''}`} />
        </span>
        <b className="compte-nom">
          {c.prenom || (c.statut === 'connecte' ? 'Connecté' : 'Invité')}
        </b>
        <span className="badge">{c.statut === 'connecte' ? c.identifiant : 'Mode invité'}</span>
      </div>

      <InterAppOnboarding connected={c.statut === 'connecte'} />

      <div className="group-list pad">
        <label htmlFor="prenom" className="set-label">
          Ton prénom
        </label>
        <input
          id="prenom"
          type="text"
          autoComplete="given-name"
          maxLength={30}
          value={prenom}
          onChange={(e) => setPrenom(e.target.value)}
          onBlur={() => ecrirePrenom(prenom)}
          placeholder="Pour que Six te salue"
        />
        <p className="muted small">
          {c.statut === 'connecte'
            ? 'Gardé sur ton profil, synchronisé sur tous tes appareils.'
            : 'Gardé sur ce téléphone seulement.'}
        </p>
      </div>

      {c.statut === 'connecte' ? (
        <div className="group-list pad">
          <b>Mémoire synchronisée</b>
          <p className="muted small">
            Tes habitudes résumées, tes notes sur tes contacts et tes suivis sont synchronisés en
            toute sécurité avec ton compte. Jamais tes conversations.
          </p>

          <div className="profile-stats-grid">
            <div className="profile-stat-tile">
              <span className="profile-stat-num">{statsMemoire.habitudes}</span>
              <span className="profile-stat-lbl">
                Habitude{statsMemoire.habitudes > 1 ? 's' : ''}
              </span>
            </div>
            <div className="profile-stat-tile">
              <span className="profile-stat-num">{statsMemoire.contacts}</span>
              <span className="profile-stat-lbl">
                Contact{statsMemoire.contacts > 1 ? 's' : ''}
              </span>
            </div>
            <div className="profile-stat-tile">
              <span className="profile-stat-num">{statsMemoire.suivis}</span>
              <span className="profile-stat-lbl">Rappel{statsMemoire.suivis > 1 ? 's' : ''}</span>
            </div>
          </div>

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

          <button
            className="btn ghost"
            disabled={busy}
            onClick={() => setShowPwdChange((ouvert) => !ouvert)}
            aria-expanded={showPwdChange}
          >
            <Icon name="lock" /> {showPwdChange ? 'Fermer' : 'Changer mon mot de passe'}
          </button>
          {showPwdChange && (
            <form onSubmit={handleChangerMotDePasse} className="stack auth-pwd-change">
              <label htmlFor="nouveau-mdp" className="set-label">
                Nouveau mot de passe (au moins {MDP_MIN_INSCRIPTION} caractères)
              </label>
              <div className="input-pwd-wrap">
                <input
                  id="nouveau-mdp"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={MDP_MIN_INSCRIPTION}
                  value={nouveauMdp}
                  onChange={(e) => setNouveauMdp(e.target.value)}
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
              <label htmlFor="confirmation-nouveau-mdp" className="set-label">
                Confirmer le nouveau mot de passe
              </label>
              <input
                id="confirmation-nouveau-mdp"
                type={showPwd ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={MDP_MIN_INSCRIPTION}
                value={confirmationNouveau}
                onChange={(e) => setConfirmationNouveau(e.target.value)}
                placeholder="••••••••"
                required
              />
              {confirmationNouveau && nouveauMdp !== confirmationNouveau && (
                <p className="auth-field-error" role="status">
                  Les deux mots de passe ne correspondent pas encore.
                </p>
              )}
              <button
                className="btn primary"
                type="submit"
                disabled={
                  busy ||
                  nouveauMdp.length < MDP_MIN_INSCRIPTION ||
                  nouveauMdp !== confirmationNouveau
                }
              >
                {busy ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
              </button>
            </form>
          )}
          <button
            className="btn ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const err = await oublierMemoireDuCompte();
              setBusy(false);
              setErreur(err ?? '');
              setInfo(err ? '' : 'Mémoire effacée du compte et de ce téléphone.');
            }}
          >
            <Icon name="trash" /> Effacer la mémoire partout
          </button>
          <button
            className="btn ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await deconnecter();
              setBusy(false);
              setInfo('');
            }}
          >
            Se déconnecter
          </button>
        </div>
      ) : !CONNEXION_DISPONIBLE ? (
        <div className="group-list pad">
          <b>Connexion</b>
          <p className="muted small">
            La connexion n&apos;est pas configurée sur cette version. Tu utilises Six en invité :
            tout reste sur ce téléphone.
          </p>
        </div>
      ) : (
        <div className="auth-card">
          <div className="auth-hero">
            <Logo label="Six" />
            <span className="auth-eyebrow">COMPTE SIX</span>
            <h2>
              {mode === 'inscription'
                ? 'Créer ton compte'
                : mode === 'otp'
                  ? idOtp
                    ? 'Vérifie ton e-mail'
                    : 'Connexion par e-mail'
                  : mode === 'oubli'
                    ? 'Réinitialiser le mot de passe'
                    : 'Ravi de te revoir'}
            </h2>
            <p>
              {mode === 'inscription'
                ? 'Retrouve ta mémoire Six et tes suivis sur tous tes appareils.'
                : mode === 'otp'
                  ? 'Reçois un code sécurisé dans ta boîte e-mail pour te connecter.'
                  : mode === 'oubli'
                    ? 'On t’enverra un lien sécurisé pour choisir un nouveau mot de passe.'
                    : 'Connecte-toi pour retrouver ta mémoire et tes suivis sur tous tes appareils.'}
            </p>
          </div>
          {/* Connexion en un geste, comme dans Claude et Gemini : le reste (e-mail, code) ne change pas. */}
          {(mode === 'connexion' || mode === 'inscription') && (
            <>
              <div className="auth-socials">
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
              </div>
              <div className="auth-divider" role="separator">
                <span>ou par e-mail</span>
              </div>
            </>
          )}

          {/* Onglets Connexion / Inscription si on n'est pas en sous-mode OTP ou Oubli */}
          {(mode === 'connexion' || mode === 'inscription') && (
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
          {confirmationEmail && (
            <div className="auth-alert-succes auth-confirmation" role="status">
              <Icon name="mail" size={18} />
              <span>
                Confirme l’adresse <b>{confirmationEmail}</b>.{' '}
                <button
                  type="button"
                  className="link"
                  onClick={() => void handleRenvoyerConfirmation()}
                  disabled={busy}
                >
                  Renvoyer l’e-mail
                </button>
              </span>
            </div>
          )}

          {/* 1. Mode CONNEXION classique */}
          {mode === 'connexion' && (
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
                {busy ? 'Connexion en cours…' : 'Se connecter'}
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
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setMode('otp');
                    setErreur('');
                    setInfo('');
                  }}
                >
                  <Icon name="mail" size={16} /> Connexion sans mot de passe (code e-mail)
                </button>
              </div>
            </form>
          )}

          {/* 2. Mode CRÉATION DE COMPTE (Sign up) — étapes numérotées, comme dans Snap. */}
          {mode === 'inscription' && (
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
                  <Link href="/conditions" onClick={(e) => e.stopPropagation()}>
                    conditions d’utilisation
                  </Link>{' '}
                  et la{' '}
                  <Link href="/confidentialite" onClick={(e) => e.stopPropagation()}>
                    politique de confidentialité
                  </Link>
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

          {/* 3. Mode OTP (Code e-mail unique) */}
          {mode === 'otp' && (
            <>
              {idOtp ? (
                <form onSubmit={handleValiderOtp} className="stack" style={{ gap: 12 }}>
                  <b>Entre le code à 6 chiffres</b>
                  <p className="muted small">
                    Envoyé à <b>{idOtp.valeur}</b>. Regarde aussi dans tes courriers indésirables.
                  </p>
                  <CodeOtp value={codeOtp} onChange={setCodeOtp} />
                  <button
                    className="btn primary"
                    type="submit"
                    disabled={busy || codeOtp.replace(/\s/g, '').length < 6}
                  >
                    {busy ? 'Vérification…' : 'Valider le code'}
                  </button>
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      setIdOtp(null);
                      setErreur('');
                    }}
                  >
                    <Icon name="back" size={16} /> Changer d&apos;adresse e-mail
                  </button>
                </form>
              ) : (
                <form onSubmit={handleDemandeOtp} className="stack" style={{ gap: 12 }}>
                  <b>Connexion sans mot de passe</b>
                  <p className="muted small">
                    Six t&apos;envoie un code à 6 chiffres par e-mail. Pratique si tu n&apos;as pas
                    de mot de passe.
                  </p>
                  <label htmlFor="otp-email" className="set-label">
                    Adresse e-mail
                  </label>
                  <input
                    id="otp-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="toi@exemple.com"
                    required
                  />
                  <button className="btn primary" type="submit" disabled={busy || !email.trim()}>
                    {busy ? 'Envoi du code…' : 'Recevoir un code de connexion'}
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
                    <Icon name="back" size={16} /> Retour à la connexion par mot de passe
                  </button>
                </form>
              )}
            </>
          )}

          {/* 4. Mode MOT DE PASSE OUBLIÉ */}
          {mode === 'oubli' && (
            <form onSubmit={handleOubli} className="stack" style={{ gap: 12 }}>
              <b>Mot de passe oublié</b>
              <p className="muted small">
                Saisis ton adresse e-mail. Six t&apos;enverra un lien pour créer un nouveau mot de
                passe en toute sécurité.
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

          <p className="auth-guest-note">
            <Icon name="lock" size={16} />
            <span>
              Tu peux aussi continuer en invité. Tes données restent sur ce téléphone jusqu’à la
              création d’un compte.
            </span>
          </p>
        </div>
      )}
    </>
  );
}

export function Settings() {
  const dedans = useRef(false); // vrai quand la sous-page a été ouverte depuis la liste : Retour revient en arrière
  // Sous-page courante (« ?v=theme » etc.) lue depuis l'URL dans un effet, sans useSearchParams :
  // plus de re-render de secours côté client (source intermittente d'hydratation #418).
  const [vue, setVue] = useState<Vue>('');
  useEffect(() => {
    const lireUrl = () => {
      const v = new URLSearchParams(window.location.search).get('v') ?? '';
      setVue(v in TITRES ? (v as Vue) : '');
    };
    lireUrl();
    window.addEventListener('popstate', lireUrl);
    return () => window.removeEventListener('popstate', lireUrl);
  }, []);
  const [theme, setTheme] = useState<Theme>('auto');
  const [accent, setAccent] = useState('bleu');
  const [police, setPolice] = useState('systeme');
  const [style, setStyle] = useState<UserStyle>(DEFAULT_STYLE);
  const [expr, setExpr] = useState('');
  const [themeIconError, setThemeIconError] = useState(false);
  const [memOn, setMemOn] = useState(false);
  const [compte, setCompte] = useState<Compte>({ statut: 'invite', prenom: '' });

  useEffect(() => {
    const t = read('six-theme');
    setTheme(t === 'light' || t === 'dark' ? t : 'auto');
    setAccent(read('six-accent') ?? 'bleu');
    setThemeIconError(hasNativeThemeIconError());
    const f = read('six-font');
    setPolice(POLICES.some((p) => p.id === f) ? (f as string) : 'systeme');
    setStyle(loadStyle() ?? DEFAULT_STYLE);
    const iconError = () => setThemeIconError(true);
    window.addEventListener('six-theme-icon-error', iconError);
    const lire = () => {
      setMemOn(memoireActive());
      setCompte(lireCompte());
    };
    lire();
    window.addEventListener('six-memoire', lire);
    const stop = ecouterCompte(lire);
    return () => {
      window.removeEventListener('six-memoire', lire);
      window.removeEventListener('six-theme-icon-error', iconError);
      stop();
    };
  }, []);

  function ouvrir(x: Vue) {
    dedans.current = true;
    window.history.pushState(null, '', `/reglages?v=${x}`);
    setVue(x);
  }

  function retour() {
    if (dedans.current)
      window.history.back(); // popstate met à jour vue
    else {
      window.history.replaceState(null, '', '/reglages');
      setVue('');
    }
  }

  function updateStyle(next: UserStyle) {
    setStyle(next);
    saveStyle(next);
  }

  function applyTheme(t: Theme) {
    setTheme(t);
    const root = document.documentElement;
    if (t === 'auto') {
      delete root.dataset.theme;
      write('six-theme', null);
    } else {
      root.dataset.theme = t;
      write('six-theme', t);
    }
    if (t !== theme) applyThemeIcon();
  }

  function applyAccent(a: string) {
    if (a === accent) return; // même tuile retapée : rien à faire, surtout pas d'appel natif
    setAccent(a);
    const root = document.documentElement;
    if (a === 'bleu') {
      delete root.dataset.accent;
      write('six-accent', null);
    } else {
      root.dataset.accent = a;
      write('six-accent', a);
    }
    void applyThemeIcon(); // toute l'app change : barre du téléphone, favicon et icône native
  }

  function applyPolice(p: string) {
    setPolice(p);
    const root = document.documentElement;
    if (p === 'systeme') {
      delete root.dataset.font;
      write('six-font', null);
    } else {
      root.dataset.font = p;
      write('six-font', p);
    }
  }

  if (vue) {
    return (
      <main className="screen sub">
        <div className="top">
          <button className="back" onClick={retour} aria-label="Retour aux réglages">
            <Icon name="back" />
          </button>
          <h1 className="top-title">{TITRES[vue]}</h1>
        </div>
        {vue === 'theme' && (
          <>
            <section className="card preview" aria-label="Aperçu du thème">
              <div className="row sp">
                <span className="muted small">Aperçu</span>
                <Logo small label="" />
              </div>
              <p className="pv-in">On dit quoi pour samedi ?</p>
              <p className="pv-out">Je serai là samedi chez Maman !</p>
              <span className="btn primary small" aria-hidden="true">
                <Icon name="copy" size={16} /> Copier la réponse
              </span>
            </section>
            <h2 className="group-title" id="mode">
              Mode
            </h2>
            <div className="seg" role="group" aria-labelledby="mode">
              <button aria-pressed={theme === 'dark'} onClick={() => applyTheme('dark')}>
                <Icon name="moon" size={16} /> Sombre
              </button>
              <button aria-pressed={theme === 'light'} onClick={() => applyTheme('light')}>
                <Icon name="sun" size={16} /> Clair
              </button>
              <button aria-pressed={theme === 'auto'} onClick={() => applyTheme('auto')}>
                <Icon name="phone" size={16} /> Auto
              </button>
            </div>
            <h2 className="group-title" id="couleurs">
              Couleurs de Six
            </h2>
            <div className="tiles" role="group" aria-labelledby="couleurs">
              {ACCENTS.map((a) => (
                <Tile key={a.id} t={a} on={accent === a.id} onPick={() => applyAccent(a.id)} />
              ))}
            </div>
            <h2 className="group-title" id="apps">
              Inspirées de tes apps
            </h2>
            <div className="tiles scroll-x" role="group" aria-labelledby="apps">
              {RESEAUX.map((a) => (
                <Tile key={a.id} t={a} on={accent === a.id} onPick={() => applyAccent(a.id)} />
              ))}
            </div>
            <p className="muted small">
              Le thème change toute l&apos;app : fonds, textes, boutons et icône. Couleurs inspirées
              des apps que tu utilises, rendues lisibles : Six n&apos;est affilié à aucune
              d&apos;elles. Ces réglages restent sur ton téléphone. L&apos;icône native suit le
              thème sur Android et iOS ; les icônes de raccourcis web installées restent celles du
              manifeste.
            </p>
            {themeIconError && (
              <p className="muted small" role="alert">
                Six n&apos;a pas pu changer son icône. Relance l&apos;application puis réessaie.
              </p>
            )}
          </>
        )}
        {vue === 'police' && (
          <>
            <div className="fonts" role="group" aria-label="Police">
              {POLICES.map((p) => (
                <button
                  key={p.id}
                  className="font"
                  aria-label={p.label}
                  title={p.label}
                  aria-pressed={police === p.id}
                  onClick={() => applyPolice(p.id)}
                >
                  <b style={{ fontFamily: p.family }}>Aa</b>
                  {p.court}
                </button>
              ))}
            </div>
            <p className="muted small">
              Toute l&apos;app change de police. Si ton téléphone ne l&apos;a pas, Six affiche la
              police la plus proche.
            </p>
          </>
        )}
        {vue === 'style' && (
          <>
            <p className="muted small">
              Six s&apos;en sert pour écrire comme toi. Ce réglage reste sur ton téléphone.
            </p>
            <div className="group-list pad">
              <label htmlFor="deco" className="set-label">
                Registre
              </label>
              <input
                id="deco"
                type="range"
                min={0}
                max={100}
                value={style.decontracte}
                onChange={(e) => updateStyle({ ...style, decontracte: Number(e.target.value) })}
              />
              <div className="ends" aria-hidden="true">
                <span>Formel</span>
                <span>Décontracté</span>
              </div>
              <label htmlFor="det" className="set-label">
                Longueur
              </label>
              <input
                id="det"
                type="range"
                min={0}
                max={100}
                value={style.detaille}
                onChange={(e) => updateStyle({ ...style, detaille: Number(e.target.value) })}
              />
              <div className="ends" aria-hidden="true">
                <span>Bref</span>
                <span>Détaillé</span>
              </div>
              <label className="row sp">
                <span>Emojis</span>
                <input
                  type="checkbox"
                  className="sw"
                  checked={style.emojis}
                  onChange={(e) => updateStyle({ ...style, emojis: e.target.checked })}
                />
              </label>
            </div>
            <div className="group-list pad">
              <span className="set-label">Tes expressions (5 maximum)</span>
              {style.expressions.length > 0 && (
                <div className="chips">
                  {style.expressions.map((x) => (
                    <button
                      key={x}
                      className="chip"
                      aria-label={`Retirer ${x}`}
                      onClick={() =>
                        updateStyle({
                          ...style,
                          expressions: style.expressions.filter((e) => e !== x),
                        })
                      }
                    >
                      « {x} » ✕
                    </button>
                  ))}
                </div>
              )}
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  const val = expr.trim().slice(0, 40);
                  if (val && style.expressions.length < 5 && !style.expressions.includes(val))
                    updateStyle({ ...style, expressions: [...style.expressions, val] });
                  setExpr('');
                }}
              >
                <label className="sr" htmlFor="expr">
                  Ajouter une expression
                </label>
                <input
                  id="expr"
                  type="text"
                  value={expr}
                  maxLength={40}
                  onChange={(e) => setExpr(e.target.value)}
                  placeholder="Ex : Pas de souci"
                />
                <button
                  className="btn ghost small"
                  type="submit"
                  disabled={style.expressions.length >= 5}
                >
                  Ajouter
                </button>
              </form>
            </div>
            <button
              className="btn ghost"
              onClick={() => {
                clearStyle();
                setStyle(DEFAULT_STYLE);
              }}
            >
              <Icon name="trash" /> Effacer mon style
            </button>
          </>
        )}
        {vue === 'memoire' && <MemoireSix />}
        {vue === 'compte' && <CompteVue />}
        {vue === 'notifications' && <InterAppNotifications />}
      </main>
    );
  }

  const couleur = [...ACCENTS, ...RESEAUX].find((a) => a.id === accent)?.label ?? 'Bleu';
  const registre =
    style.decontracte >= 66 ? 'Décontracté' : style.decontracte <= 33 ? 'Formel' : 'Équilibré';
  return (
    <>
      <AppBar page="reglages" titre="Réglages" />
      <main className="screen settings">
        <button className="profile-card" onClick={() => ouvrir('compte')}>
          <span className="avatar avatar-md" aria-hidden="true">
            {initiale(compte) || <Icon name="user" size={22} />}
            <span className={`avatar-dot${compte.statut === 'connecte' ? ' on' : ''}`} />
          </span>
          <span className="grow">
            <b>{compte.prenom || 'Invité'}</b>
            <span className="muted small">
              {compte.statut === 'connecte' ? compte.identifiant : 'Non connecté, tout reste ici'}
            </span>
          </span>
          <Icon name="chevron" size={18} />
        </button>
        <section aria-labelledby="g-apparence">
          <h2 className="group-title" id="g-apparence">
            Apparence
          </h2>
          <div className="group-list">
            <Rangee
              icon="sun"
              label="Thème et couleurs"
              valeur={`${couleur}, ${MODES[theme].toLowerCase()}`}
              onClick={() => ouvrir('theme')}
            />
            <Rangee
              icon="type"
              label="Police"
              valeur={POLICES.find((p) => p.id === police)?.court}
              onClick={() => ouvrir('police')}
            />
          </div>
        </section>
        <section aria-labelledby="g-six">
          <h2 className="group-title" id="g-six">
            Six
          </h2>
          <div className="group-list">
            <Rangee
              icon="pencil"
              label="Mon style d'écriture"
              valeur={registre}
              onClick={() => ouvrir('style')}
            />
            <Rangee
              icon="bulb"
              label="Mémoire de Six"
              valeur={memOn ? 'Activée' : 'Désactivée'}
              onClick={() => ouvrir('memoire')}
            />
            <Rangee
              icon="bell"
              label="Notifications des apps"
              valeur="Android"
              onClick={() => ouvrir('notifications')}
            />
          </div>
        </section>
        <section aria-labelledby="g-infos">
          <h2 className="group-title" id="g-infos">
            Confidentialité et informations
          </h2>
          <div className="group-list">
            <LienRangee href="/confidentialite" icon="lock" label="Confidentialité" />
            <LienRangee href="/conditions" icon="file" label="Conditions d'utilisation" />
            <LienRangee href="/mentions" icon="file" label="Mentions légales" />
            <LienExterne
              href="https://effulgent-jelly-177a12.netlify.app"
              icon="home"
              label="Version web de Six"
            />
          </div>
        </section>
        <p className="muted small set-foot">Six par Seven.AI, version de démonstration</p>
      </main>
    </>
  );
}
