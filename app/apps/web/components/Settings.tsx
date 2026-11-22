'use client';

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
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
  deconnecter,
  definirMotDePasseOublie,
  demanderCodeChangementMdp,
  ecouterCompte,
  ecrirePrenom,
  enRecuperation,
  lireCompte,
  autoriserSync,
  oublierMemoireDuCompte,
  syncAutorisee,
  type Compte,
} from '@/lib/compte';
import { AppBar } from './AppBar';
import { AvatarContenu } from './AvatarContenu';
import { CodeOtp } from './Connexion';
import { useConfirmer } from './Confirmer';
import { Icon, type IconName } from './Icon';
import { InterAppNotifications, InterAppOnboarding } from './InterAppNotifications';
import { Raccourcis } from './Raccourcis';
import { EVT_PREMIUM, PremiumVue } from './Premium';
import { lireEtatPremium } from '@/lib/premium-client';
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
  | ''
  | 'premium'
  | 'theme'
  | 'police'
  | 'style'
  | 'memoire'
  | 'compte'
  | 'notifications'
  | 'raccourcis';
const TITRES: Record<Exclude<Vue, ''>, string> = {
  premium: 'Six Premium',
  theme: 'Thème',
  police: 'Police',
  style: "Mon style d'écriture",
  memoire: 'Mémoire',
  compte: 'Compte',
  notifications: 'Notifications des apps',
  raccourcis: 'Bulle et clavier',
};
const MODES: Record<Theme, string> = { auto: 'Auto', light: 'Clair', dark: 'Sombre' };

/**
 * Compte : la connexion se fait à l'ouverture de l'app (PorteCompte, components/Connexion.tsx), plus ici.
 * Cet écran gère le compte déjà ouvert : prénom, copie de la mémoire, mot de passe, déconnexion.
 * La mémoire ne part sur le compte qu'avec l'autorisation de la personne.
 */
function CompteVue() {
  const [demande, demander] = useConfirmer();
  const [sync, setSync] = useState(false);
  // La copie de la mémoire sur le compte est réservée à Six Premium (règle aussi appliquée par Supabase).
  const [premium, setPremium] = useState<boolean | null>(null);
  useEffect(() => {
    // En veille (paiement pas encore ouvert), la copie reste ouverte à tous.
    void lireEtatPremium().then((e) => setPremium(e ? e.premium || e.veille : null));
  }, []);
  const [c, setC] = useState<Compte>({ statut: 'invite', prenom: '' });
  const [prenom, setPrenom] = useState('');

  // Champs de saisie
  const [showPwd, setShowPwd] = useState(false);
  // « Renvoyer le code » attend une minute entre deux envois (comme Supabase côté serveur).
  const [attente, setAttente] = useState(0);
  useEffect(() => {
    if (attente <= 0) return;
    const t = setTimeout(() => setAttente((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [attente]);

  // Changement de mot de passe
  const [showPwdChange, setShowPwdChange] = useState(false);
  const [ancienMdp, setAncienMdp] = useState('');
  const [codeMdp, setCodeMdp] = useState('');
  const [codeMdpEnvoye, setCodeMdpEnvoye] = useState(false);
  // Arrivée par un lien « Mot de passe oublié » : nouveau mot de passe sans l'ancien.
  const [recuperation, setRecuperation] = useState(false);
  useEffect(() => {
    if (enRecuperation()) {
      setRecuperation(true);
      setShowPwdChange(true);
    }
  }, [c.statut]);
  const [nouveauMdp, setNouveauMdp] = useState('');
  const [confirmationNouveau, setConfirmationNouveau] = useState('');

  // États de chargement et retours
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [statsMemoire, setStatsMemoire] = useState({ habitudes: 0, contacts: 0, suivis: 0 });

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

  async function handleChangerMotDePasse(e: FormEvent) {
    e.preventDefault();
    setErreur('');
    setInfo('');
    if (nouveauMdp !== confirmationNouveau) {
      setErreur('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true);
    const err = recuperation
      ? await definirMotDePasseOublie(nouveauMdp)
      : await changerMotDePasse(ancienMdp, nouveauMdp, codeMdp);
    setBusy(false);
    if (err) {
      setErreur(err);
    } else {
      setAncienMdp('');
      setCodeMdp('');
      setCodeMdpEnvoye(false);
      setNouveauMdp('');
      setConfirmationNouveau('');
      setShowPwdChange(false);
      setRecuperation(false);
      setInfo('Mot de passe enregistré. Il fonctionne dès maintenant sur tous tes appareils.');
    }
  }

  async function handleCodeMdp() {
    if (attente > 0) return;
    setBusy(true);
    setErreur('');
    setInfo('');
    const err = await demanderCodeChangementMdp();
    setBusy(false);
    if (err) setErreur(err);
    else {
      setCodeMdpEnvoye(true);
      setAttente(60);
      setInfo('Un code vient de partir à l’adresse de ton compte.');
    }
  }

  return (
    <>
      <div className="compte-head">
        <span className="avatar avatar-lg" aria-hidden="true">
          <AvatarContenu c={c} taille={34} />
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
              premium === false && !sync
                ? 'Avec Six Premium, ta mémoire te suit sur tes autres appareils (Réglages > Six Premium). Sans premium, elle reste sur ce téléphone.'
                : sync
                  ? 'Tes habitudes, tes notes sur tes contacts et tes suivis te suivent sur tes autres appareils. Jamais tes conversations.'
                  : 'Désactivé : ta mémoire reste sur ce téléphone. Active-le pour la retrouver sur tes autres appareils.'
            }
          >
            <LigneInterrupteur
              id="memoire-sync"
              icon="refresh"
              label="Copier ma mémoire sur mon compte"
              checked={sync}
              disabled={busy || (!sync && premium === false)}
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
                {!recuperation && (
                  <>
                    <label htmlFor="ancien-mdp" className="set-label">
                      Mot de passe actuel
                    </label>
                    <input
                      id="ancien-mdp"
                      type={showPwd ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={ancienMdp}
                      onChange={(e) => setAncienMdp(e.target.value)}
                      placeholder="••••••••"
                      required
                    />
                    <span className="set-label">Code reçu par e-mail</span>
                    {codeMdpEnvoye ? (
                      <>
                        <CodeOtp value={codeMdp} onChange={setCodeMdp} />
                        <button
                          type="button"
                          className="link"
                          onClick={() => void handleCodeMdp()}
                          disabled={busy || attente > 0}
                        >
                          {attente > 0 ? `Renvoyer le code dans ${attente} s` : 'Renvoyer le code'}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => void handleCodeMdp()}
                        disabled={busy}
                      >
                        Recevoir un code par e-mail
                      </button>
                    )}
                  </>
                )}
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
                    nouveauMdp !== confirmationNouveau ||
                    (!recuperation && (!ancienMdp || codeMdp.replace(/\D/g, '').length < 6))
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
      ) : null}
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
  const [premium, setPremium] = useState(false);
  // Entrée Six Premium cachée tant que le paiement n'est pas ouvert (premium en veille).
  const [premiumOuvert, setPremiumOuvert] = useState(false);
  useEffect(() => {
    const lirePremium = () =>
      void lireEtatPremium().then((e) => {
        setPremium(Boolean(e?.premium));
        setPremiumOuvert(Boolean(e && !e.veille));
      });
    lirePremium();
    window.addEventListener(EVT_PREMIUM, lirePremium);
    return () => window.removeEventListener(EVT_PREMIUM, lirePremium);
  }, []);

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
        {vue === 'premium' && <PremiumVue />}
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
    ...(premiumOuvert || premium
      ? [
          {
            id: 'premium',
            icon: 'sparkles' as const,
            label: 'Six Premium',
            sous: premium ? 'Actif' : 'Sans limite, meilleur modèle, mémoire partout',
            cles: 'premium abonnement payer paiement mobile money carte pass limite',
          },
        ]
      : []),
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
                <AvatarContenu c={compte} taille={28} trait={1.75} />
              </span>
              <span className="lg-txt">
                <span className="lg-profil-nom">{compte.prenom || 'Invité'}</span>
                <span className="lg-sous">
                  {compte.statut === 'connecte'
                    ? compte.identifiant
                    : 'Mode invité, tout reste sur ce téléphone'}
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
