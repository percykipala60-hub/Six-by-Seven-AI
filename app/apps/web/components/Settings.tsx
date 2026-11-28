'use client';

import { useRouter } from 'next/navigation';

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
import { appliquerMode, lireAccent, TOUJOURS_CLAIR } from '@/lib/theme-ids';
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
  modifierPhotoProfil,
  enRecuperation,
  lireCompte,
  oublierMemoireDuCompte,
  type Compte,
} from '@/lib/compte';
import { AppBar } from './AppBar';
import { ReglagesSixTouch } from './ReglagesSixTouch';
import { AvatarContenu } from './AvatarContenu';
import { CodeOtp } from './Connexion';
import { useConfirmer } from './Confirmer';
import { Icon, type IconName } from './Icon';
import { InterAppNotifications, InterAppOnboarding } from './InterAppNotifications';
import { Raccourcis } from './Raccourcis';
import { EVT_PREMIUM } from './Premium';
import { CloudSix } from './CloudSix';
import { lireEtatPremium } from '@/lib/premium-client';
import { ouvrirRaccourcisIOS, surIPhoneNatif } from '@/lib/raccourcis-ios';
import {
  EnteteSousPage,
  Groupe,
  Ligne,
  BoutonTexte,
  LigneInfo,
  LigneChoix,
  LigneInterrupteur,
} from './Liste';
import { plateforme } from '@/lib/plateforme';
import { AppareilsVue } from './Appareils';
import { GithubCloud } from './GithubCloud';
import { ecranAvantParametres } from './RetourParametres';
import { PluginsParametres } from './PluginsParametres';
import { ReglagesSkills } from './ReglagesSkills';
import { ReglagesVoix } from './ReglagesVoix';
import { ReglagesCapacites } from './ReglagesCapacites';
import {
  BureauVue,
  ConfidentialiteVue,
  ExporterDonnees,
  FacturationVue,
  InstructionsSix,
  NotificationsSixVue,
  UtilisationVue,
} from './ReglagesPlus';
import { ecrireAcces, lireAcces, type ACCES } from '@/lib/accessibilite';

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
    label: 'Police de l’appareil',
    court: 'Appareil',
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
        titre="Mémoire sur cet appareil"
        pied={
          on
            ? "Six apprend de vos choix pour écrire comme vous et se souvient de vos contacts. Tout reste sur cet appareil ; ce qu'il apprend est oublié après 90 jours."
            : 'Six oublie tout à chaque conversation. Rien n’est gardé sur cet appareil.'
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
                  "Six oubliera ce qu'il a appris, vos notes sur vos contacts et vos conversations gardées sur cet appareil. On ne peut pas revenir en arrière.",
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
            titre="Vos contacts"
            pied={
              m.contacts.length
                ? 'Ce que vous avez noté sur chaque personne. Envoyé avec votre demande, nom masqué.'
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
            titre="Sur cet appareil"
            pied="Vos conversations terminées restent ici tant que vous les gardez. Vous pouvez aussi les effacer une par une depuis l’accueil."
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
                    texte: `${nbConv} conversation${nbConv > 1 ? 's' : ''} et leurs réponses seront effacées de cet appareil. On ne peut pas revenir en arrière.`,
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
                    'Six oubliera vos habitudes, vos notes sur vos contacts et vos suivis. La mémoire reste activée et recommencera à apprendre.',
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
  | 'compte'
  | 'facturation'
  | 'utilisation'
  | 'apparence'
  | 'votre-six'
  | 'capacites'
  | 'voix'
  | 'notifications'
  | 'confidentialite'
  | 'plugins'
  | 'focus'
  | 'cosinus'
  | 'cloud'
  | 'appareils'
  | 'bureau'
  | 'apps'
  | 'raccourcis';
const TITRES: Record<Exclude<Vue, ''>, string> = {
  compte: 'Compte',
  facturation: 'Facturation',
  utilisation: 'Utilisation',
  apparence: 'Apparence',
  'votre-six': 'Votre Six',
  capacites: 'Capacités',
  voix: 'Voix et dictée',
  notifications: 'Notifications',
  confidentialite: 'Confidentialité',
  plugins: 'Plug-ins',
  focus: 'Focus',
  cosinus: 'Cosinus',
  cloud: 'Cloud et partages',
  appareils: 'Appareils connectés',
  bureau: 'Application de bureau',
  apps: 'Notifications des apps',
  raccourcis: 'Bulle et clavier',
};
/** Anciennes adresses des réglages (liens déjà partagés, ordres vocaux) : elles mènent à la nouvelle section. */
const ALIAS: Record<string, Exclude<Vue, ''>> = {
  theme: 'apparence',
  police: 'apparence',
  style: 'votre-six',
  memoire: 'cloud',
  premium: 'facturation',
  sixtouch: 'cosinus',
  skills: 'focus',
};
const MODES: Record<Theme, string> = { auto: 'Auto', light: 'Clair', dark: 'Sombre' };

/**
 * Compte : la connexion se fait à l'ouverture de l'app (PorteCompte, components/Connexion.tsx), plus ici.
 * Cet écran gère le compte déjà ouvert : prénom, copie de la mémoire, mot de passe, déconnexion.
 * La mémoire ne part sur le compte qu'avec l'autorisation de la personne.
 */
function CompteVue() {
  const [demande, demander] = useConfirmer();
  const [c, setC] = useState<Compte>({ statut: 'invite', prenom: '' });
  const [prenom, setPrenom] = useState('');
  const champPhoto = useRef<HTMLInputElement>(null);
  const [photoEnCours, setPhotoEnCours] = useState(false);
  const [erreurPhoto, setErreurPhoto] = useState('');

  async function changerPhoto(fichier?: File) {
    setPhotoEnCours(true);
    setErreurPhoto('');
    try {
      await modifierPhotoProfil(fichier);
    } catch (e) {
      setErreurPhoto(e instanceof Error ? e.message : 'Impossible de modifier la photo.');
    } finally {
      setPhotoEnCours(false);
    }
  }

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

  useEffect(() => {
    const lire = () => {
      const x = lireCompte();
      setC(x);
      setPrenom(x.prenom);
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
      setInfo('Un code vient de partir à l’adresse de votre compte.');
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
            ? 'Votre prénom et votre photo de profil sont synchronisés sur les appareils connectés à ce compte.'
            : 'Gardé sur cet appareil seulement.'
        }
      >
        <div className="lg-ligne lg-statique lg-saisie">
          <span className="lg-label lg-cle">Photo de profil</span>
          <input
            ref={champPhoto}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => {
              const fichier = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (fichier) void changerPhoto(fichier);
            }}
          />
          <button
            type="button"
            className="btn"
            disabled={photoEnCours}
            onClick={() => champPhoto.current?.click()}
          >
            {c.photoPersonnalisee ? 'Changer la photo' : 'Ajouter une photo'}
          </button>
          {c.photoPersonnalisee && (
            <button
              type="button"
              className="btn"
              disabled={photoEnCours}
              onClick={() => void changerPhoto()}
            >
              Retirer la photo
            </button>
          )}
        </div>
        {erreurPhoto && (
          <p role="alert" className="auth-alert-erreur">
            {erreurPhoto}
          </p>
        )}
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
            placeholder="Pour que Six vous salue"
          />
        </div>
      </Groupe>

      {c.statut === 'connecte' ? (
        <>
          {demande}

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
                    'Votre mémoire sera effacée de votre compte et de cet appareil : habitudes, notes sur vos contacts et suivis. On ne peut pas revenir en arrière.',
                  action: 'Tout effacer',
                  danger: true,
                  onConfirmer: async () => {
                    const err = await oublierMemoireDuCompte();
                    setErreur(err ?? '');
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
                    'Votre mémoire reste sur cet appareil. Vous pourrez vous reconnecter à tout moment avec votre adresse e-mail.',
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
            La connexion n&apos;est pas configurée sur cette version. Vous utilisez Six en invité :
            tout reste sur cet appareil.
          </p>
        </div>
      ) : null}
    </>
  );
}

/** Petit choix à deux ou trois boutons, au bout d'une rangée. */
function ChoixRangee<V extends string>({
  label,
  options,
  valeur,
  onChoisir,
}: {
  label: string;
  options: readonly (readonly [V, string])[];
  valeur: V;
  onChoisir: (v: V) => void;
}) {
  return (
    <div className="seg seg-rangee" role="group" aria-label={label}>
      {options.map(([v, nom]) => (
        <button key={v} type="button" aria-pressed={valeur === v} onClick={() => onChoisir(v)}>
          {nom}
        </button>
      ))}
    </div>
  );
}

/** Accessibilité : moins d'animations, plus de contraste, conversation plus large sur ordinateur. */
function Accessibilite({ grand }: { grand: boolean }) {
  type V<R extends keyof typeof ACCES> = (typeof ACCES)[R]['valeurs'][number];
  const [mouvement, setMouvement] = useState<V<'mouvement'>>('systeme');
  const [contraste, setContraste] = useState<V<'contraste'>>('systeme');
  const [largeur, setLargeur] = useState<V<'largeur'>>('etroite');
  useEffect(() => {
    setMouvement(lireAcces('mouvement'));
    setContraste(lireAcces('contraste'));
    setLargeur(lireAcces('largeur'));
  }, []);
  return (
    <Groupe titre="Accessibilité" pied="Ces réglages restent sur cet appareil.">
      <LigneInfo
        label="Mouvement"
        sous="Moins d’animations dans Six, ou comme le demande votre appareil."
        valeur={
          <ChoixRangee
            label="Mouvement"
            options={[
              ['systeme', 'Appareil'],
              ['reduit', 'Réduit'],
            ]}
            valeur={mouvement}
            onChoisir={(v) => {
              setMouvement(v);
              ecrireAcces('mouvement', v);
            }}
          />
        }
      />
      <LigneInfo
        label="Contraste"
        sous="Textes gris et traits plus foncés, plus faciles à lire."
        valeur={
          <ChoixRangee
            label="Contraste"
            options={[
              ['systeme', 'Appareil'],
              ['eleve', 'Élevé'],
            ]}
            valeur={contraste}
            onChoisir={(v) => {
              setContraste(v);
              ecrireAcces('contraste', v);
            }}
          />
        }
      />
      {grand && (
        <LigneInfo
          label="Largeur de la conversation"
          sous="Sur grand écran, dans Chat et Responsive."
          valeur={
            <ChoixRangee
              label="Largeur de la conversation"
              options={[
                ['etroite', 'Étroite'],
                ['moyenne', 'Moyenne'],
                ['large', 'Large'],
              ]}
              valeur={largeur}
              onChoisir={(v) => {
                setLargeur(v);
                ecrireAcces('largeur', v);
              }}
            />
          }
        />
      )}
    </Groupe>
  );
}

export function Settings() {
  const router = useRouter();
  const [demande, demander] = useConfirmer();
  const dedans = useRef(false); // vrai quand la sous-page a été ouverte depuis la liste : Retour revient en arrière
  // Sous-page courante (« ?v=apparence » etc.) lue depuis l'URL dans un effet, sans useSearchParams :
  // plus de re-render de secours côté client (source intermittente d'hydratation #418).
  const [vue, setVue] = useState<Vue>('');
  // Grand écran : sections à gauche, section ouverte à droite (comme les réglages d'un ordinateur).
  const [grand, setGrand] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const lire = () => setGrand(mq.matches);
    lire();
    mq.addEventListener('change', lire);
    return () => mq.removeEventListener('change', lire);
  }, []);
  useEffect(() => {
    const lireUrl = () => {
      const brut = new URLSearchParams(window.location.search).get('v') ?? '';
      const v = ALIAS[brut] ?? brut;
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
  const [compte, setCompte] = useState<Compte>({ statut: 'invite', prenom: '' });
  const [recherche, setRecherche] = useState('');
  const [premium, setPremium] = useState(false);
  // Chaque version ne montre que ses réglages : « Siri et raccourcis » dans l'app iPhone, « Bulle et clavier » et
  // « Notifications des apps » dans l'app Android, « Cosinus » (dossier de travail, navigateur) dans l'app de bureau.
  const [iphone, setIphone] = useState(false);
  const [android, setAndroid] = useState(false);
  const [bureau, setBureau] = useState(false);
  useEffect(() => {
    void surIPhoneNatif().then(setIphone);
    void plateforme().then((p) => {
      setAndroid(p === 'android');
      setBureau(p === 'bureau');
    });
  }, []);
  useEffect(() => {
    const lirePremium = () =>
      void lireEtatPremium().then((e) => {
        setPremium(Boolean(e?.premium));
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
    appliquerMode(document.documentElement, t, accent);
    write('six-theme', t === 'auto' ? null : t);
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
    appliquerMode(root, theme, a); // le Rose reste toujours clair
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

  // Contenu d'une section : sous-page sur téléphone, panneau de droite sur grand écran.
  const contenuVue = (vue: Exclude<Vue, ''>) => (
    <>
      {vue === 'apparence' && (
        <>
          <div className="apercu" aria-label="Aperçu du thème">
            <p className="apercu-in">On dit quoi pour samedi ?</p>
            <p className="apercu-out">Je serai là samedi chez Maman !</p>
          </div>
          <Groupe
            titre="Apparence"
            pied={
              TOUJOURS_CLAIR.has(accent)
                ? 'Le thème Rose reste toujours clair. Votre choix revient si vous changez de couleur.'
                : undefined
            }
          >
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
                ? "Six n'a pas pu changer son icône. Relancez l'application puis réessayez."
                : "La couleur change toute l'app : fonds, boutons et icône. Ce réglage reste sur cet appareil."
            }
          >
            <Pastilles liste={AMBIANCES} choisi={accent} onChoisir={applyAccent} />
          </Groupe>
          <Groupe
            titre="Police"
            pied="Si votre appareil n’a pas la police, Six affiche la plus proche."
          >
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
          <Accessibilite grand={grand} />
        </>
      )}
      {vue === 'votre-six' && (
        <>
          <InstructionsSix />
          <Groupe
            titre="Votre façon d’écrire"
            pied="Six s’en sert pour écrire comme vous. Ce réglage reste sur cet appareil."
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
          <Groupe titre="Vos expressions" pied="Jusqu’à 5 expressions que vous utilisez souvent.">
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
                  titre: 'Effacer votre style ?',
                  texte:
                    'Votre registre, votre longueur préférée et vos expressions reviendront aux réglages de départ.',
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
          <MemoireSix />
          <ExporterDonnees />
          {demande}
        </>
      )}
      {vue === 'cloud' && (
        <>
          <CloudSix onPremium={() => ouvrir('facturation')} />
          <GithubCloud />
        </>
      )}
      {vue === 'facturation' && <FacturationVue />}
      {vue === 'utilisation' && <UtilisationVue onOuvrir={(v) => ouvrir(v as Vue)} />}
      {vue === 'compte' && <CompteVue />}
      {vue === 'notifications' && (
        <NotificationsSixVue android={android} onOuvrir={(v) => ouvrir(v as Vue)} />
      )}
      {vue === 'confidentialite' && <ConfidentialiteVue onOuvrir={(v) => ouvrir(v as Vue)} />}
      {vue === 'bureau' && <BureauVue />}
      {vue === 'apps' && <InterAppNotifications />}
      {vue === 'raccourcis' && <Raccourcis />}
      {vue === 'cosinus' && <ReglagesSixTouch />}
      {vue === 'appareils' && <AppareilsVue />}
      {vue === 'plugins' && <PluginsParametres />}
      {vue === 'focus' && <ReglagesSkills />}
      {vue === 'voix' && <ReglagesVoix />}
      {vue === 'capacites' && <ReglagesCapacites />}
    </>
  );

  if (vue && !grand) {
    return (
      <main className="screen sub lg-page">
        <EnteteSousPage titre={TITRES[vue]} onRetour={retour} />
        {contenuVue(vue)}
      </main>
    );
  }

  const couleur = [...ACCENTS, ...AMBIANCES].find((a) => a.id === accent)?.label ?? 'Bleu';
  const registre =
    style.decontracte >= 66 ? 'Décontracté' : style.decontracte <= 33 ? 'Formel' : 'Équilibré';
  /**
   * Sections, rangées comme les réglages d'un assistant d'IA : sur ordinateur en quatre groupes (compte, préférences,
   * outils, appareil) ; sur téléphone en deux (« Compte » et « Application »). Mots-clés pour la recherche.
   */
  type Entree = {
    id: Exclude<Vue, ''> | 'siri';
    icon: IconName;
    label: string;
    sous?: string;
    cles: string;
    groupe: 1 | 2 | 3 | 4;
    mobile: 'compte' | 'app';
    action?: () => void;
  };
  const entrees: Entree[] = [
    {
      id: 'facturation',
      icon: 'sparkles',
      label: 'Facturation',
      sous: premium ? 'Six Premium' : 'Gratuit',
      cles: 'facturation forfait premium abonnement payer paiement pass prix',
      groupe: 1,
      mobile: 'compte',
    },
    {
      id: 'utilisation',
      icon: 'horloge',
      label: 'Utilisation',
      sous: 'Messages et analyses du jour',
      cles: 'utilisation limite quota messages analyses compteur jour',
      groupe: 1,
      mobile: 'compte',
    },
    {
      id: 'apparence',
      icon: 'palette',
      label: 'Apparence',
      sous: `${couleur}, ${TOUJOURS_CLAIR.has(accent) ? 'toujours clair' : MODES[theme].toLowerCase()}, ${POLICES.find((p) => p.id === police)?.court ?? 'Appareil'}`,
      cles: 'apparence thème couleur clair sombre fond ambiance police accessibilité contraste mouvement animation largeur',
      groupe: 2,
      mobile: 'app',
    },
    {
      id: 'votre-six',
      icon: 'memoire',
      label: 'Votre Six',
      sous: `Préférences, ${registre.toLowerCase()}, mémoire`,
      cles: 'votre six préférences instructions personnalisation style écriture registre longueur emoji expressions mémoire contacts habitudes exporter',
      groupe: 2,
      mobile: 'app',
    },
    {
      id: 'capacites',
      icon: 'bulb',
      label: 'Capacités',
      sous: 'Artéfacts, graphiques, fichiers, Internet',
      cles: 'capacités artéfacts artefacts graphiques diagrammes fichiers créer modifier internet web sources navigateur',
      groupe: 2,
      mobile: 'app',
    },
    {
      id: 'voix',
      icon: 'vocal',
      label: 'Voix et dictée',
      sous: 'Voix de Six, langue, mode vocal',
      cles: 'voix vocal parler langue lecture vitesse dictée micro écoute sphère',
      groupe: 2,
      mobile: 'app',
    },
    {
      id: 'notifications',
      icon: 'bell',
      label: 'Notifications',
      sous: 'Fin de réponse, alertes de connexion',
      cles: 'notifications alertes fin réponse e-mail connexion',
      groupe: 2,
      mobile: 'compte',
    },
    {
      id: 'confidentialite',
      icon: 'lock',
      label: 'Confidentialité',
      sous: 'Vos données, export, documents',
      cles: 'confidentialité données vie privée exporter politique conditions mentions',
      groupe: 2,
      mobile: 'compte',
    },
    {
      id: 'plugins',
      icon: 'plugins',
      label: 'Plug-ins',
      sous: 'Connecteurs et skills',
      cles: 'plugins connecteurs skills',
      groupe: 3,
      mobile: 'app',
    },
    {
      id: 'focus',
      icon: 'sparkles',
      label: 'Focus',
      sous: 'Méthode de travail de Cosinus',
      cles: 'focus skills méthode documents code pages web présentations données images cosinus',
      groupe: 3,
      mobile: 'app',
    },
    ...(bureau
      ? [
          {
            id: 'cosinus' as const,
            icon: 'sixtouch' as const,
            label: 'Cosinus',
            sous: 'Espace de travail, navigateur',
            cles: 'cosinus navigateur historique espace dossier agent fichiers terminal',
            groupe: 3 as const,
            mobile: 'app' as const,
          },
        ]
      : []),
    {
      id: 'cloud',
      icon: 'cloud',
      label: 'Cloud et partages',
      sous: 'Synchronisation, liens partagés, GitHub',
      cles: 'cloud synchroniser partager partages liens github dépôt premium',
      groupe: 3,
      mobile: 'compte',
    },
    {
      id: 'appareils',
      icon: 'appareils',
      label: 'Appareils connectés',
      sous: 'Où votre compte est ouvert, code QR',
      cles: 'appareils connectés sessions déconnecter code qr scanner associer',
      groupe: 3,
      mobile: 'compte',
    },
    ...(bureau
      ? [
          {
            id: 'bureau' as const,
            icon: 'ordinateur' as const,
            label: 'Application de bureau',
            sous: 'Démarrage, veille, version',
            cles: 'application bureau ordinateur démarrage veille éveillé version raccourcis',
            groupe: 4 as const,
            mobile: 'app' as const,
          },
        ]
      : []),
    ...(android
      ? [
          {
            id: 'raccourcis' as const,
            icon: 'phone' as const,
            label: 'Bulle et clavier',
            sous: 'Répondre depuis n’importe quelle app',
            cles: 'bulle flottante clavier raccourci rapide whatsapp',
            groupe: 4 as const,
            mobile: 'app' as const,
          },
          {
            id: 'apps' as const,
            icon: 'bell' as const,
            label: 'Notifications des apps',
            sous: 'Messages reçus dans vos apps',
            cles: 'notification apps whatsapp sms alertes android',
            groupe: 4 as const,
            mobile: 'app' as const,
          },
        ]
      : []),
    ...(iphone
      ? [
          {
            id: 'siri' as const,
            icon: 'mic' as const,
            label: 'Siri et raccourcis',
            sous: 'Bouton Action, écran verrouillé, AssistiveTouch',
            cles: 'siri raccourcis shortcuts bouton action assistivetouch iphone',
            groupe: 4 as const,
            mobile: 'app' as const,
            action: () => void ouvrirRaccourcisIOS(),
          },
        ]
      : []),
  ];
  const normaliser = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const q = normaliser(recherche.trim());
  const correspond = (e: Entree) =>
    !q || normaliser(`${e.label} ${e.sous ?? ''} ${e.cles}`).includes(q);
  const choisir = (e: Entree) => (e.action ? e.action() : ouvrir(e.id as Vue));
  const demanderDeconnexion = () =>
    demander({
      titre: 'Se déconnecter ?',
      texte:
        'Votre mémoire reste sur cet appareil. Vous pourrez vous reconnecter à tout moment avec votre adresse e-mail.',
      action: 'Se déconnecter',
      onConfirmer: () => deconnecter(),
    });
  // Fermer les paramètres : retour à l'écran d'où l'on venait (ou au Chat si on est arrivé directement).
  const fermer = () => {
    router.replace(ecranAvantParametres());
  };

  if (grand) {
    const actif: Exclude<Vue, ''> = vue || 'compte';
    const visibles = entrees.filter(correspond);
    return (
      <>
        <AppBar page="reglages" titre="" />
        <main className="screen settings reglages-grand">
          <div className="reglages-fenetre" role="region" aria-labelledby="reglages-nom">
            <header className="reglages-fenetre-tete">
              <h1 id="reglages-nom">Paramètres</h1>
              <button
                type="button"
                className="appbar-btn"
                aria-label="Fermer les paramètres"
                onClick={fermer}
              >
                <Icon name="x" size={18} />
              </button>
            </header>
            <div className="reglages-fenetre-corps">
              <nav className="reglages-menu" aria-label="Sections des paramètres">
                <div className="lg-recherche">
                  <Icon name="search" size={16} />
                  <input
                    type="search"
                    value={recherche}
                    onChange={(e) => setRecherche(e.target.value)}
                    placeholder="Rechercher"
                    aria-label="Rechercher un réglage"
                  />
                </div>
                <div className="reglages-groupe">
                  {!q && (
                    <button
                      type="button"
                      className="reglages-entree"
                      aria-current={actif === 'compte' ? 'page' : undefined}
                      onClick={() => ouvrir('compte')}
                    >
                      <Icon name="user" size={18} />
                      <span className="reglages-entree-txt">Compte</span>
                    </button>
                  )}
                  {visibles
                    .filter((e) => e.groupe === 1)
                    .map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        className="reglages-entree"
                        aria-current={actif === e.id ? 'page' : undefined}
                        onClick={() => choisir(e)}
                      >
                        <Icon name={e.icon} size={18} />
                        <span className="reglages-entree-txt">{e.label}</span>
                      </button>
                    ))}
                </div>
                {([2, 3, 4] as const).map((g) => {
                  const liste = visibles.filter((e) => e.groupe === g);
                  if (!liste.length) return null;
                  return (
                    <div key={g} className="reglages-groupe">
                      {liste.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          className="reglages-entree"
                          aria-current={actif === e.id ? 'page' : undefined}
                          onClick={() => choisir(e)}
                        >
                          <Icon name={e.icon} size={18} />
                          <span className="reglages-entree-txt">{e.label}</span>
                        </button>
                      ))}
                    </div>
                  );
                })}
                {q && !visibles.length && <p className="lg-pied">Aucun réglage ne correspond.</p>}
              </nav>
              <section className="reglages-contenu" aria-labelledby="reglages-titre">
                <h2
                  id="reglages-titre"
                  hidden={actif === 'plugins'}
                  className="reglages-contenu-titre"
                >
                  {TITRES[actif]}
                </h2>
                {contenuVue(actif)}
              </section>
            </div>
          </div>
          {demande}
        </main>
      </>
    );
  }

  // Téléphone : comme les réglages d'une app d'IA mobile — le compte en tête, puis « Compte » et « Application »,
  // l'apparence en trois vignettes, et la déconnexion en bas.
  const groupeMobile = (titre: string, cle: 'compte' | 'app') => {
    const liste = entrees.filter((e) => e.mobile === cle && correspond(e));
    if (!liste.length) return null;
    return (
      <Groupe titre={titre}>
        {cle === 'compte' && !q && (
          <Ligne
            icon="user"
            label="Profil"
            sous="Prénom, mot de passe, mémoire du compte"
            onClick={() => ouvrir('compte')}
          />
        )}
        {liste.map((e) => (
          <Ligne
            key={e.id}
            icon={e.icon}
            label={e.label}
            sous={e.sous}
            onClick={() => choisir(e)}
          />
        ))}
      </Groupe>
    );
  };
  return (
    <>
      <AppBar page="reglages" titre="" />
      <main className="screen settings lg-page">
        <h1 className="lg-grand-titre">Paramètres</h1>
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
          <button type="button" className="lg-ligne lg-profil" onClick={() => ouvrir('compte')}>
            <span className="avatar lg-avatar" aria-hidden="true">
              <AvatarContenu c={compte} taille={28} trait={1.75} />
            </span>
            <span className="lg-txt">
              <span className="lg-profil-nom">{compte.prenom || 'Invité'}</span>
              <span className="lg-sous">
                {compte.statut === 'connecte'
                  ? `${compte.identifiant} · ${premium ? 'Premium' : 'Gratuit'}`
                  : 'Mode invité, tout reste sur cet appareil'}
              </span>
            </span>
          </button>
        )}

        {groupeMobile('Compte', 'compte')}
        {groupeMobile('Application', 'app')}
        {q && !entrees.some(correspond) && <p className="lg-pied">Aucun réglage ne correspond.</p>}

        {!q && (
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
        )}

        {!q && compte.statut === 'connecte' && (
          <Groupe>
            <Ligne icon="logout" danger label="Se déconnecter" onClick={demanderDeconnexion} />
          </Groupe>
        )}
        {demande}
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
