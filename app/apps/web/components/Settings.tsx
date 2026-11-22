'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
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
import { lireAccent } from '@/lib/theme-ids';
import { LIEN_CONDITIONS, LIEN_CONFIDENTIALITE } from '@/lib/liens';
import { FONDS, fondValide, type FondId } from './Fond';
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
  autoriserSync,
  oublierMemoireDuCompte,
  reinitialiserMotDePasse,
  syncAutorisee,
  renvoyerConfirmation,
  verifierCode,
  type Compte,
  type FournisseurSocial,
  type Identifiant,
} from '@/lib/compte';
import { AppBar } from './AppBar';
import { useConfirmer } from './Confirmer';
import { AppIcon } from './AppIcon';
import { Icon, type IconName } from './Icon';
import { InterAppNotifications, InterAppOnboarding } from './InterAppNotifications';
import { Raccourcis } from './Raccourcis';
import { Logo } from './Logo';
import {
  EnteteSousPage,
  Groupe,
  Ligne,
  BoutonTexte,
  LigneInfo,
  Separateur,
  LigneChoix,
  LigneInterrupteur,
  LigneLien,
} from './Liste';

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
const AMBIANCES: Tuile[] = themeColors.ambiances;

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
  const [demande, demander] = useConfirmer();
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
    <>
      {demande}
      <Groupe
        pied={
          on
            ? "Six apprend de tes choix pour écrire comme toi et se souvient de tes contacts. Tout reste sur ce téléphone ; ce qu'il apprend est oublié après 90 jours."
            : 'Six oublie tout à chaque conversation. Rien n’est gardé sur ce téléphone.'
        }
      >
        <LigneInterrupteur
          id="memory-enabled"
          icon="memoire"
          label="Mémoire de Six"
          checked={on}
          onChange={(oui) => {
            if (oui) activerMemoire(true);
            else
              demander({
                titre: 'Couper la mémoire ?',
                texte:
                  "Six oubliera ce qu'il a appris, tes notes sur tes contacts et tes conversations gardées sur ce téléphone. On ne peut pas revenir en arrière.",
                action: 'Couper et tout effacer',
                danger: true,
                onConfirmer: () => activerMemoire(false),
              });
          }}
        />
      </Groupe>
      {on && (
        <>
          <Groupe
            titre="Ce que Six a appris"
            pied={
              appris.length
                ? undefined
                : `Six apprend à partir de 3 réponses choisies (${m.choix.length}/3).`
            }
          >
            {appris.length ? (
              <div className="lg-bloc">
                <div className="tags">
                  {appris.map((a) => (
                    <span className="tag" key={a}>
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="lg-bloc muted small">Rien pour l’instant.</div>
            )}
          </Groupe>
          <Groupe
            titre="Tes contacts"
            pied={
              m.contacts.length
                ? 'Ce que tu as noté sur chaque personne. Envoyé avec ta demande, nom masqué.'
                : 'Pendant une conversation, touche « Ce que Six sait de… » pour noter qui est la personne.'
            }
          >
            {m.contacts.length ? (
              m.contacts.map((c) => (
                <LigneInfo
                  key={c.nom}
                  icon="user"
                  label={c.nom}
                  sous={c.note}
                  valeur={
                    <BoutonTexte label={`Oublier ${c.nom}`} onClick={() => ecrireNote(c.nom, '')}>
                      Oublier
                    </BoutonTexte>
                  }
                />
              ))
            ) : (
              <div className="lg-bloc muted small">Aucun contact noté.</div>
            )}
          </Groupe>
          <Groupe
            titre="Sur ce téléphone"
            pied="Tes conversations terminées restent ici tant que tu les gardes. Tu peux aussi les effacer une par une depuis l’accueil."
          >
            <LigneInfo icon="chat" label="Conversations gardées" valeur={nbConv} />
            <LigneInfo icon="bell" label="Suivis en attente" valeur={m.suivis.length} />
          </Groupe>
          <Groupe>
            {nbConv > 0 && (
              <Ligne
                danger
                label="Effacer les conversations gardées"
                onClick={() =>
                  demander({
                    titre: 'Effacer les conversations gardées ?',
                    texte: `${nbConv} conversation${nbConv > 1 ? 's' : ''} et leurs réponses seront effacées de ce téléphone. On ne peut pas revenir en arrière.`,
                    action: 'Effacer',
                    danger: true,
                    onConfirmer: () => {
                      effacerConversations();
                      window.dispatchEvent(new Event('six-memoire'));
                    },
                  })
                }
              />
            )}
            <Ligne
              danger
              label="Effacer la mémoire de Six"
              onClick={() =>
                demander({
                  titre: 'Effacer la mémoire de Six ?',
                  texte:
                    'Six oubliera tes habitudes, tes notes sur tes contacts et tes suivis. La mémoire reste activée et recommencera à apprendre.',
                  action: 'Effacer',
                  danger: true,
                  onConfirmer: effacerMemoire,
                })
              }
            />
          </Groupe>
        </>
      )}
    </>
  );
}

type Vue =
  '' | 'theme' | 'police' | 'style' | 'memoire' | 'compte' | 'notifications' | 'raccourcis';
const TITRES: Record<Exclude<Vue, ''>, string> = {
  theme: 'Thème',
  police: 'Police',
  style: "Mon style d'écriture",
  memoire: 'Mémoire',
  compte: 'Compte',
  notifications: 'Notifications des apps',
  raccourcis: 'Bulle et clavier',
};
const MODES: Record<Theme, string> = { auto: 'Auto', light: 'Clair', dark: 'Sombre' };

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

/** Saisie d'un code à 6 chiffres en cases individuelles. */
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

/** Compte : invité par défaut ; connexion / inscription par e-mail ou code. La mémoire ne part sur le compte qu'avec l'autorisation de la personne. */
function CompteVue() {
  const [demande, demander] = useConfirmer();
  const [sync, setSync] = useState(false);
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
      setSync(syncAutorisee());
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
      setInfo('Ravi de te revoir !');
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
      setInfo(
        'Compte créé. Ta mémoire reste sur ce téléphone, sauf si tu choisis de la copier sur ton compte.',
      );
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
      setInfo('Connecté.');
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

      <Groupe
        titre="Profil"
        pied={
          c.statut === 'connecte'
            ? 'Ton prénom est gardé sur ton compte, pour que Six te salue sur tous tes appareils.'
            : 'Gardé sur ce téléphone seulement.'
        }
      >
        <div className="lg-ligne lg-statique lg-saisie">
          <label htmlFor="prenom" className="lg-label lg-cle">
            Prénom
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
        </div>
      </Groupe>

      {c.statut === 'connecte' ? (
        <>
          {demande}
          <Groupe
            titre="Mémoire et compte"
            pied={
              sync
                ? 'Tes habitudes, tes notes sur tes contacts et tes suivis te suivent sur tes autres appareils. Jamais tes conversations.'
                : 'Désactivé : ta mémoire reste sur ce téléphone. Active-le pour la retrouver sur tes autres appareils.'
            }
          >
            <LigneInterrupteur
              id="memoire-sync"
              icon="refresh"
              label="Copier ma mémoire sur mon compte"
              checked={sync}
              disabled={busy}
              onChange={async (on) => {
                if (on) {
                  setBusy(true);
                  const err = await autoriserSync(true);
                  setBusy(false);
                  setErreur(err ?? '');
                  setInfo(err ? '' : 'Ta mémoire est maintenant copiée sur ton compte.');
                  return;
                }
                demander({
                  titre: 'Arrêter la copie sur ton compte ?',
                  texte:
                    'La copie de ta mémoire gardée sur ton compte sera effacée. Celle de ce téléphone ne change pas.',
                  action: 'Arrêter et effacer la copie',
                  danger: true,
                  onConfirmer: async () => {
                    const err = await autoriserSync(false);
                    setErreur(err ?? '');
                    setInfo(err ? '' : 'La copie sur ton compte a été effacée.');
                  },
                });
              }}
            />
            <LigneInfo icon="memoire" label="Habitudes apprises" valeur={statsMemoire.habitudes} />
            <LigneInfo icon="user" label="Contacts notés" valeur={statsMemoire.contacts} />
            <LigneInfo icon="bell" label="Rappels" valeur={statsMemoire.suivis} />
          </Groupe>

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

          <Groupe titre="Sécurité">
            <Ligne
              icon="key"
              label="Changer le mot de passe"

              onClick={() => setShowPwdChange((ouvert) => !ouvert)}
            />
            {showPwdChange && (
              <form onSubmit={handleChangerMotDePasse} className="lg-bloc auth-pwd-change">
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
          </Groupe>

          <Groupe>
            <Ligne
              danger
              disabled={busy}
              label="Effacer la mémoire partout"
              onClick={() =>
                demander({
                  titre: 'Effacer la mémoire partout ?',
                  texte:
                    'Ta mémoire sera effacée de ton compte et de ce téléphone : habitudes, notes sur tes contacts et suivis. On ne peut pas revenir en arrière.',
                  action: 'Tout effacer',
                  danger: true,
                  onConfirmer: async () => {
                    const err = await oublierMemoireDuCompte();
                    setErreur(err ?? '');
                    setInfo(err ? '' : 'Mémoire effacée du compte et de ce téléphone.');
                  },
                })
              }
            />
            <Ligne
              danger
              icon="logout"
              disabled={busy}
              label="Se déconnecter"
              onClick={() =>
                demander({
                  titre: 'Se déconnecter ?',
                  texte:
                    'Ta mémoire reste sur ce téléphone. Tu pourras te reconnecter à tout moment avec ton adresse e-mail.',
                  action: 'Se déconnecter',
                  onConfirmer: async () => {
                    await deconnecter();
                    setInfo('');
                  },
                })
              }
            />
          </Groupe>
        </>
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
                ? 'Garde ton prénom et, si tu le choisis, ta mémoire sur tous tes appareils.'
                : mode === 'otp'
                  ? 'Reçois un code sécurisé dans ta boîte e-mail pour te connecter.'
                  : mode === 'oubli'
                    ? 'On t’enverra un lien sécurisé pour choisir un nouveau mot de passe.'
                    : 'Connecte-toi pour garder ton prénom et, si tu le choisis, ta mémoire sur tous tes appareils.'}
            </p>
          </div>
          {/* Connexion en un geste : le reste (e-mail, code) ne change pas. */}
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

          {/* 2. Mode CRÉATION DE COMPTE (Sign up) — étapes numérotées. */}
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
        </div>
      )}
    </>
  );
}

export function Settings() {
  const [demande, demander] = useConfirmer();
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
  const [fond, setFond] = useState<FondId>('vagues');
  const [style, setStyle] = useState<UserStyle>(DEFAULT_STYLE);
  const [expr, setExpr] = useState('');
  const [themeIconError, setThemeIconError] = useState(false);
  const [memOn, setMemOn] = useState(false);
  const [compte, setCompte] = useState<Compte>({ statut: 'invite', prenom: '' });
  const [recherche, setRecherche] = useState('');

  useEffect(() => {
    const t = read('six-theme');
    setTheme(t === 'light' || t === 'dark' ? t : 'auto');
    setAccent(lireAccent());
    setFond(fondValide(read('six-fond')));
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

  function applyFond(f: FondId) {
    setFond(f);
    const root = document.documentElement;
    if (f === 'vagues') {
      delete root.dataset.fond;
      write('six-fond', null);
    } else {
      root.dataset.fond = f;
      write('six-fond', f);
    }
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
      <main className="screen sub lg-page">
        <EnteteSousPage titre={TITRES[vue]} onRetour={retour} />
        {vue === 'theme' && (
          <>
            <div className="apercu" aria-label="Aperçu du thème">
              <p className="apercu-in">On dit quoi pour samedi ?</p>
              <p className="apercu-out">Je serai là samedi chez Maman !</p>
            </div>
            <Groupe titre="Apparence">
              <div className="modes" role="radiogroup" aria-label="Apparence">
                {(['light', 'dark', 'auto'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={theme === m}
                    className="mode"
                    onClick={() => applyTheme(m)}
                  >
                    <span className={`mode-ecran mode-${m}`} aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="mode-nom">{MODES[m]}</span>
                    <span className="mode-coche" aria-hidden="true">
                      {theme === m && <Icon name="check" size={13} stroke={3} />}
                    </span>
                  </button>
                ))}
              </div>
            </Groupe>
            <Groupe titre="Fond">
              <div className="modes fonds" role="radiogroup" aria-label="Fond">
                {FONDS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="radio"
                    aria-checked={fond === f.id}
                    className="mode"
                    onClick={() => applyFond(f.id)}
                  >
                    <span className={`mode-ecran fond-apercu apercu-${f.id}`} aria-hidden="true" />
                    <span className="mode-nom">{f.label}</span>
                    <span className="mode-coche" aria-hidden="true">
                      {fond === f.id && <Icon name="check" size={13} stroke={3} />}
                    </span>
                  </button>
                ))}
              </div>
            </Groupe>
            <Groupe titre="Couleur">
              <Pastilles liste={ACCENTS} choisi={accent} onChoisir={applyAccent} />
            </Groupe>
            <Groupe
              titre="Ambiances"
              pied={
                themeIconError
                  ? "Six n'a pas pu changer son icône. Relance l'application puis réessaie."
                  : "La couleur change toute l'app : fonds, boutons et icône. Ce réglage reste sur ce téléphone."
              }
            >
              <Pastilles liste={AMBIANCES} choisi={accent} onChoisir={applyAccent} />
            </Groupe>
          </>
        )}
        {vue === 'police' && (
          <Groupe pied="Si ton téléphone n’a pas la police, Six affiche la plus proche.">
            <div role="radiogroup" aria-label="Police" className="lg-contenu">
              {POLICES.map((p) => (
                <LigneChoix
                  key={p.id}
                  label={<span style={{ fontFamily: p.family }}>{p.label}</span>}
                  choisi={police === p.id}
                  onClick={() => applyPolice(p.id)}
                />
              ))}
            </div>
          </Groupe>
        )}
        {vue === 'style' && (
          <>
            <Groupe
              titre="Ta façon d’écrire"
              pied="Six s’en sert pour écrire comme toi. Ce réglage reste sur ce téléphone."
            >
              <div className="lg-bloc">
                <label htmlFor="deco" className="lg-label">
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
              </div>
              <div className="lg-bloc">
                <label htmlFor="det" className="lg-label">
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
              </div>
              <LigneInterrupteur
                id="emojis"
                label="Emojis"
                checked={style.emojis}
                onChange={(on) => updateStyle({ ...style, emojis: on })}
              />
            </Groupe>
            <Groupe titre="Tes expressions" pied="Jusqu’à 5 expressions que tu utilises souvent.">
              {style.expressions.map((x) => (
                <LigneInfo
                  key={x}
                  label={`« ${x} »`}
                  valeur={
                    <BoutonTexte
                      label={`Retirer ${x}`}
                      onClick={() =>
                        updateStyle({
                          ...style,
                          expressions: style.expressions.filter((e) => e !== x),
                        })
                      }
                    >
                      Retirer
                    </BoutonTexte>
                  }
                />
              ))}
              {style.expressions.length < 5 && (
                <form
                  className="lg-ligne lg-statique lg-saisie"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const val = expr.trim().slice(0, 40);
                    if (val && !style.expressions.includes(val))
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
                    placeholder="Ajouter, ex. : Pas de souci"
                  />
                  <button type="submit" className="lg-ajout" disabled={!expr.trim()}>
                    Ajouter
                  </button>
                </form>
              )}
            </Groupe>
            <Groupe>
              <Ligne
                danger
                label="Effacer mon style"
                onClick={() =>
                  demander({
                    titre: 'Effacer ton style ?',
                    texte:
                      'Ton registre, ta longueur préférée et tes expressions reviendront aux réglages de départ.',
                    action: 'Effacer',
                    danger: true,
                    onConfirmer: () => {
                      clearStyle();
                      setStyle(DEFAULT_STYLE);
                    },
                  })
                }
              />
            </Groupe>
            {demande}
          </>
        )}
        {vue === 'memoire' && <MemoireSix />}
        {vue === 'compte' && <CompteVue />}
        {vue === 'notifications' && <InterAppNotifications />}
        {vue === 'raccourcis' && <Raccourcis />}
      </main>
    );
  }

  const couleur = [...ACCENTS, ...AMBIANCES].find((a) => a.id === accent)?.label ?? 'Bleu';
  const registre =
    style.decontracte >= 66 ? 'Décontracté' : style.decontracte <= 33 ? 'Formel' : 'Équilibré';
  // Entrées de la liste, avec des mots-clés pour la recherche.
  const entrees: {
    id: string;
    icon: IconName;
    label: string;
    sous?: string;
    cles: string;
    href?: string;
    externe?: boolean;
  }[] = [
    {
      id: 'theme',
      icon: 'palette',
      label: 'Thème',
      sous: `${couleur}, ${MODES[theme].toLowerCase()}, fond ${FONDS.find((f) => f.id === fond)?.label.toLowerCase()}`,
      cles: 'couleur clair sombre apparence ambiance',
    },
    {
      id: 'police',
      icon: 'type',
      label: 'Police',
      sous: POLICES.find((p) => p.id === police)?.label,
      cles: 'texte écriture caractères',
    },
    {
      id: 'style',
      icon: 'pencil',
      label: 'Mon style d’écriture',
      sous: `${registre}, expressions, emojis`,
      cles: 'registre longueur emoji expressions ton',
    },
    {
      id: 'memoire',
      icon: 'memoire',
      label: 'Mémoire',
      sous: memOn ? 'Activée, gardée sur ce téléphone' : 'Désactivée',
      cles: 'contacts conversations gardées habitudes effacer',
    },
    {
      id: 'raccourcis',
      icon: 'phone',
      label: 'Bulle et clavier',
      sous: 'Répondre depuis n’importe quelle app (Android)',
      cles: 'bulle flottante clavier raccourci rapide whatsapp',
    },
    {
      id: 'notifications',
      icon: 'bell',
      label: 'Notifications des apps',
      sous: 'Messages reçus dans tes apps (Android)',
      cles: 'notification android alertes',
    },
    {
      id: 'confidentialite',
      icon: 'lock',
      label: 'Confidentialité',
      sous: 'Ce que Six traite et comment l’effacer',
      cles: 'données vie privée politique',
      href: LIEN_CONFIDENTIALITE,
      externe: true,
    },
    {
      id: 'conditions',
      icon: 'balance',
      label: 'Conditions et mentions légales',
      sous: 'Règles d’utilisation, éditeur, hébergement',
      cles: 'cgu conditions mentions légales éditeur hébergeur',
      href: LIEN_CONDITIONS,
      externe: true,
    },
  ];
  const normaliser = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const q = normaliser(recherche.trim());
  const correspond = (e: (typeof entrees)[number]) =>
    !q || normaliser(`${e.label} ${e.sous ?? ''} ${e.cles}`).includes(q);
  return (
    <>
      <AppBar page="reglages" titre="" />
      <main className="screen settings lg-page">
        <h1 className="lg-grand-titre">Réglages</h1>
        <div className="lg-recherche">
          <Icon name="search" size={16} />
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un réglage"
            aria-label="Rechercher un réglage"
          />
        </div>

        {!q && (
          <>
            <button type="button" className="lg-ligne lg-profil" onClick={() => ouvrir('compte')}>
              <span className="avatar lg-avatar" aria-hidden="true">
                {initiale(compte) || <Icon name="user" size={28} stroke={1.75} />}
              </span>
              <span className="lg-txt">
                <span className="lg-profil-nom">{compte.prenom || 'Invité'}</span>
                <span className="lg-sous">
                  {compte.statut === 'connecte'
                    ? compte.identifiant
                    : 'Se connecter ou créer un compte'}
                </span>
              </span>
            </button>
            <Separateur />
          </>
        )}

        <div className="lg-liste">
          {entrees
            .filter(correspond)
            .map((e) =>
              e.href ? (
                <LigneLien
                  key={e.id}
                  href={e.href}
                  externe={e.externe}
                  icon={e.icon}
                  label={e.label}
                  sous={e.sous}
                />
              ) : (
                <Ligne
                  key={e.id}
                  icon={e.icon}
                  label={e.label}
                  sous={e.sous}
                  onClick={() => ouvrir(e.id as Vue)}
                />
              ),
            )}
        </div>
        {q && !entrees.some(correspond) && <p className="lg-pied">Aucun réglage ne correspond.</p>}

        {!q && compte.statut === 'connecte' && (
          <>
            <Separateur />
            <Ligne
              icon="logout"
              danger
              label="Se déconnecter"
              onClick={() =>
                demander({
                  titre: 'Se déconnecter ?',
                  texte:
                    'Ta mémoire reste sur ce téléphone. Tu pourras te reconnecter à tout moment avec ton adresse e-mail.',
                  action: 'Se déconnecter',
                  onConfirmer: () => deconnecter(),
                })
              }
            />
            {demande}
          </>
        )}
      </main>
    </>
  );
}

/** Pastilles de couleur, comme le choix de couleur d'un téléphone : un rond, le nom dessous, une coche. */
function Pastilles({
  liste,
  choisi,
  onChoisir,
}: {
  liste: Tuile[];
  choisi: string;
  onChoisir: (id: string) => void;
}) {
  return (
    <div className="pastilles" role="radiogroup">
      {liste.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={choisi === t.id}
          className="pastille"
          onClick={() => onChoisir(t.id)}
        >
          <span
            className="pastille-rond"
            aria-hidden="true"
            style={
              {
                '--p-fond': t.gradient
                  ? `linear-gradient(45deg, ${t.gradient.join(', ')})`
                  : `linear-gradient(135deg, ${t.icon.accent}, ${t.icon.background})`,
              } as CSSProperties
            }
          >
            {choisi === t.id && <Icon name="check" size={16} stroke={3} />}
          </span>
          <span className="pastille-nom">{t.label}</span>
        </button>
      ))}
    </div>
  );
}
