'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import {
  ID_AUTO,
  creerEnvironnement,
  dossiersConnus,
  ecouterEnvironnements,
  lireEnvironnements,
  memeDossier,
  memoriserEnvironnementsCloud,
  nomDossier,
  versEnvironnementCloud,
  type Environnement,
} from '@/lib/environnements';
import { recuperer } from '@/lib/recuperer';

/**
 * Choix de l'environnement de Cosinus, comme dans Claude Code :
 * - une liste déroulante (recherche, environnements locaux, Cloud, « Nouvel environnement ») ;
 * - au démarrage d'une discussion, une carte avec les derniers environnements ;
 * - la fenêtre « Nouvel environnement » : onglets Local / Cloud / SSH / Remote Control, nom, dossiers.
 * Local : des dossiers de cet ordinateur. Cloud : un environnement en ligne lié au compte (Supabase), qu'on peut
 * remplir avec un dépôt GitHub public. Remote Control n'existe pas encore et le dit clairement.
 */

type Pont = {
  choisirDossier?: () => Promise<string | null>;
  cheminFichier?: (f: File) => string;
};
const pont = (): Pont | undefined =>
  typeof window === 'undefined' ? undefined : (window as unknown as { sixBureau?: Pont }).sixBureau;

/** Chemin complet d'un fichier joint, connu seulement dans l'app de bureau ('' ailleurs). */
export function cheminDuFichier(f: File): string {
  try {
    return pont()?.cheminFichier?.(f) ?? '';
  } catch {
    return '';
  }
}

/**
 * Cosinus peut-il travailler dans un dossier de l'ordinateur ? Oui quand Six tourne sur cet ordinateur (app de
 * bureau, serveur local) ; « defaut » : le dossier proposé par défaut (SIXTOUCH_DOSSIER ou celui du projet).
 */
export function useEtatEspace(actif: boolean): { local: boolean; defaut: string } {
  const [etat, setEtat] = useState({ local: false, defaut: '' });
  useEffect(() => {
    if (!actif) return;
    const c = new AbortController();
    fetch('/api/sixtouch/espace?etat=1', { cache: 'no-store', signal: c.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { local?: boolean; defaut?: string } | null) => {
        if (d) setEtat({ local: d.local === true, defaut: d.defaut ?? '' });
      })
      .catch(() => {});
    return () => c.abort();
  }, [actif]);
  return etat;
}

export function useEnvironnements(): Environnement[] {
  const [envs, setEnvs] = useState<Environnement[]>([]);
  useEffect(() => {
    const lire = () => setEnvs(lireEnvironnements());
    lire();
    return ecouterEnvironnements(lire);
  }, []);
  return envs;
}

type EnvCloudServeur = {
  id: string;
  nom: string;
  depot_github: string | null;
  par_defaut: boolean;
  maj: string;
};

/**
 * Environnements cloud du compte (le serveur crée « Mon cloud » au besoin). Gardés sur l'appareil pour le menu et
 * la barre latérale. « erreur » : pas connecté, ou Cloud pas encore activé dans Supabase.
 */
export function useEnvironnementsCloud(actif = true): { pret: boolean; erreur: string } {
  const [etat, setEtat] = useState({ pret: false, erreur: '' });
  useEffect(() => {
    if (!actif) return;
    let annule = false;
    recuperer('/api/cloud/espace')
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as {
          environnements?: EnvCloudServeur[];
          error?: string;
        };
        if (annule) return;
        if (!r.ok || !d.environnements) {
          setEtat({ pret: false, erreur: d.error ?? 'Cloud indisponible.' });
          return;
        }
        memoriserEnvironnementsCloud(d.environnements.map(versEnvironnementCloud));
        setEtat({ pret: true, erreur: '' });
      })
      .catch(() => !annule && setEtat({ pret: false, erreur: 'Cloud injoignable.' }));
    return () => {
      annule = true;
    };
  }, [actif]);
  return etat;
}

/** Vérifie qu'un dossier existe et qu'il est utilisable (chemin renvoyé par le serveur, ou erreur lisible). */
async function verifierDossier(dossier: string): Promise<string> {
  const r = await fetch(`/api/sixtouch/espace?d=${encodeURIComponent(dossier)}&niveau=`, {
    cache: 'no-store',
  });
  const d = (await r.json().catch(() => ({}))) as { dossier?: string; error?: string };
  if (!r.ok || !d.dossier) throw new Error(d.error ?? 'Dossier inaccessible.');
  return d.dossier;
}

/** Un clic ailleurs ou Échap referme le menu. */
function useFermeture(ouvert: boolean, fermer: () => void) {
  const zone = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const f = (e: Event) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !zone.current?.contains(e.target as Node)
      )
        fermer();
    };
    document.addEventListener('pointerdown', f);
    document.addEventListener('keydown', f);
    return () => {
      document.removeEventListener('pointerdown', f);
      document.removeEventListener('keydown', f);
    };
  }, [ouvert, fermer]);
  return zone;
}

/** Liste déroulante des environnements (comme « Choose environment » de Claude Code). */
function MenuEnvironnements({
  actuel,
  onChoisi,
  onNouveau,
  vers = 'haut',
}: {
  actuel?: string;
  onChoisi: (e: Environnement) => void;
  onNouveau: () => void;
  vers?: 'haut' | 'bas';
}) {
  const envs = useEnvironnements();
  const cloud = useEnvironnementsCloud();
  const [recherche, setRecherche] = useState('');
  const t = recherche.trim().toLowerCase();
  const correspond = (e: Environnement) =>
    !t ||
    e.nom.toLowerCase().includes(t) ||
    (e.depot ?? '').toLowerCase().includes(t) ||
    e.dossiers.some((d) => d.toLowerCase().includes(t));
  const trouves = envs.filter((e) => e.type !== 'cloud' && correspond(e));
  const auto = envs.find((e) => e.id === ID_AUTO);
  const enLigne = envs
    .filter((e) => e.type === 'cloud' && e.id !== ID_AUTO && correspond(e))
    .sort((a, b) => Number(Boolean(b.parDefaut)) - Number(Boolean(a.parDefaut)));
  const ligneCloud = (e: Environnement, titre: string, sous?: string) => (
    <button
      key={e.id}
      type="button"
      role="menuitemradio"
      aria-checked={e.id === actuel}
      className="env-ligne-cloud"
      onClick={() => onChoisi(e)}
    >
      <span className="env-ligne-textes">
        <span>{titre}</span>
        {sous && <small>{sous}</small>}
      </span>
      {e.id === actuel && <Icon name="check" size={14} stroke={2.2} />}
    </button>
  );
  return (
    <div className={`env-menu ${vers}`} role="menu">
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus -- le champ vient d'être ouvert par un clic
        autoFocus
        className="env-recherche"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher un environnement"
        aria-label="Rechercher un environnement"
      />
      <p className="env-section">Local</p>
      {trouves.length === 0 && <p className="env-vide">Aucun environnement.</p>}
      {trouves.map((e) => (
        <button
          key={e.id}
          type="button"
          role="menuitemradio"
          aria-checked={e.id === actuel}
          title={e.dossiers.join('\n')}
          onClick={() => onChoisi(e)}
        >
          <span>{e.nom}</span>
          {e.id === actuel && <Icon name="check" size={14} stroke={2.2} />}
        </button>
      ))}
      <p className="env-section">Cloud</p>
      {cloud.erreur ? (
        <p className="env-vide">{cloud.erreur}</p>
      ) : !cloud.pret && !enLigne.length ? (
        <p className="env-vide">Chargement…</p>
      ) : (
        <>
          {auto &&
            (!t || 'auto'.includes(t)) &&
            ligneCloud(auto, 'Auto', 'Choisit selon le dépôt cité')}
          {enLigne.map((e) =>
            e.parDefaut
              ? ligneCloud(e, 'Par défaut', e.nom)
              : ligneCloud(e, e.nom, e.depot ? `GitHub : ${e.depot}` : undefined),
          )}
        </>
      )}
      <hr />
      <button type="button" role="menuitem" className="env-nouveau" onClick={onNouveau}>
        <Icon name="plus" size={15} stroke={2} /> Nouvel environnement
      </button>
    </div>
  );
}

/** Bouton de l'environnement en cours, sous la barre de saisie (« ▭ Mémoire ˅ »). */
export function SelecteurEnvironnement({
  actuel,
  onChoisi,
  verrouille,
  defaut,
}: {
  actuel?: Environnement;
  onChoisi: (e: Environnement) => void;
  /** La discussion a commencé : l'environnement ne change plus (une nouvelle discussion le permet). */
  verrouille?: boolean;
  defaut: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [creation, setCreation] = useState(false);
  useEffect(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.get('nouvel') !== '1') return;
    setCreation(true);
    u.searchParams.delete('nouvel');
    window.history.replaceState(null, '', u.pathname + u.search);
  }, []);
  const zone = useFermeture(ouvert, () => setOuvert(false));
  return (
    <div className="env-selecteur" ref={zone}>
      <button
        type="button"
        className="env-bouton"
        disabled={verrouille}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        title={
          verrouille
            ? `${actuel?.dossiers.join('\n') ?? ''}\nPour changer d'environnement, commence une nouvelle discussion.`
            : 'Choisir l’environnement'
        }
        onClick={() => setOuvert((v) => !v)}
      >
        <Icon name={actuel?.type === 'cloud' ? 'cloud' : 'dossier'} size={14} stroke={1.8} />
        <span>
          {actuel?.type === 'cloud' && !actuel.nom.startsWith('Cloud')
            ? `Cloud · ${actuel.nom}`
            : (actuel?.nom ?? 'Choisir un environnement')}
        </span>
        {!verrouille && <Icon name="down" size={12} stroke={2} />}
      </button>
      {ouvert && (
        <MenuEnvironnements
          actuel={actuel?.id}
          onChoisi={(e) => {
            setOuvert(false);
            onChoisi(e);
          }}
          onNouveau={() => {
            setOuvert(false);
            setCreation(true);
          }}
        />
      )}
      {creation && (
        <NouvelEnvironnement
          defaut={defaut}
          onFermer={() => setCreation(false)}
          onCree={(e) => {
            setCreation(false);
            onChoisi(e);
          }}
        />
      )}
    </div>
  );
}

/** Carte du début d'une discussion : les derniers environnements, puis « Choisir un environnement ». */
export function CarteEnvironnements({
  actuel,
  onChoisi,
  defaut,
}: {
  actuel?: Environnement;
  onChoisi: (e: Environnement) => void;
  defaut: string;
}) {
  const envs = useEnvironnements();
  const [ouvert, setOuvert] = useState(false);
  const [creation, setCreation] = useState(false);
  useEffect(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.get('nouvel') !== '1') return;
    setCreation(true);
    u.searchParams.delete('nouvel');
    window.history.replaceState(null, '', u.pathname + u.search);
  }, []);
  const zone = useFermeture(ouvert, () => setOuvert(false));
  return (
    <div className="env-carte" ref={zone}>
      {envs.slice(0, 3).map((e) => (
        <button
          key={e.id}
          type="button"
          className="env-carte-ligne"
          aria-pressed={e.id === actuel?.id}
          title={e.type === 'cloud' ? (e.depot ?? 'Environnement en ligne') : e.dossiers.join('\n')}
          onClick={() => onChoisi(e)}
        >
          <Icon name={e.type === 'cloud' ? 'cloud' : 'dossier'} size={15} stroke={1.8} />
          <span>{e.type === 'cloud' ? `Cloud · ${e.nom}` : e.nom}</span>
          {e.id === actuel?.id && <Icon name="check" size={15} stroke={2.2} />}
        </button>
      ))}
      <div className="env-carte-choisir">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={ouvert}
          onClick={() => (envs.length ? setOuvert((v) => !v) : setCreation(true))}
        >
          {envs.length ? 'Choisir un environnement' : 'Créer un environnement'}
          <Icon name={envs.length ? 'down' : 'plus'} size={13} stroke={2} />
        </button>
        {ouvert && (
          <MenuEnvironnements
            vers="bas"
            actuel={actuel?.id}
            onChoisi={(e) => {
              setOuvert(false);
              onChoisi(e);
            }}
            onNouveau={() => {
              setOuvert(false);
              setCreation(true);
            }}
          />
        )}
      </div>
      {creation && (
        <NouvelEnvironnement
          defaut={defaut}
          onFermer={() => setCreation(false)}
          onCree={(e) => {
            setCreation(false);
            onChoisi(e);
          }}
        />
      )}
    </div>
  );
}

type Onglet = 'local' | 'cloud' | 'distant';
const ONGLETS: [Onglet, string][] = [
  ['local', 'Local'],
  ['cloud', 'Cloud'],
  ['distant', 'Remote Control'],
];
const A_VENIR =
  'Bientôt : vous piloterez depuis votre téléphone le Six qui tourne sur votre ordinateur.';

/** Fenêtre « Nouvel environnement » (comme « New environment » de Claude Code). */
export function NouvelEnvironnement({
  defaut,
  onCree,
  onFermer,
}: {
  defaut: string;
  onCree: (e: Environnement) => void;
  onFermer: () => void;
}) {
  const [onglet, setOnglet] = useState<Onglet>('local');
  // Six en ligne ne peut pas lire les dossiers de l'ordinateur : la fenêtre s'ouvre alors sur le Cloud.
  const espaceLocal = useEtatEspace(true).local;
  const [lu, setLu] = useState(false);
  useEffect(() => {
    if (lu) return;
    const t = setTimeout(() => {
      setLu(true);
      if (!espaceLocal) setOnglet((o) => (o === 'local' ? 'cloud' : o));
    }, 400);
    return () => clearTimeout(t);
  }, [espaceLocal, lu]);
  const [nom, setNom] = useState('');
  const [dossiers, setDossiers] = useState<string[]>([]);
  const [ajout, setAjout] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [saisie, setSaisie] = useState(false);
  const [chemin, setChemin] = useState('');
  const [erreur, setErreur] = useState('');
  const [attente, setAttente] = useState(false);
  const [depot, setDepot] = useState('');
  const [branche, setBranche] = useState('');
  const envs = useEnvironnements();
  const zoneAjout = useFermeture(ajout, () => setAjout(false));
  const natif = Boolean(pont()?.choisirDossier);

  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && !ajout && onFermer();
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  }, [ajout, onFermer]);

  const connus = [...dossiersConnus(envs), ...(defaut ? [defaut] : [])].filter(
    (d, i, l) =>
      l.findIndex((x) => memeDossier(x, d)) === i && !dossiers.some((x) => memeDossier(x, d)),
  );
  const t = recherche.trim().toLowerCase();
  const proposes = connus.filter((d) => !t || d.toLowerCase().includes(t));

  const ajouter = async (d: string) => {
    setErreur('');
    setAttente(true);
    try {
      const verifie = await verifierDossier(d);
      setDossiers((l) => (l.some((x) => memeDossier(x, verifie)) ? l : [...l, verifie]));
      setAjout(false);
      setSaisie(false);
      setChemin('');
      setRecherche('');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Dossier inaccessible.');
    } finally {
      setAttente(false);
    }
  };
  /** Crée l'environnement cloud sur le serveur (et importe le dépôt GitHub s'il y en a un). */
  const creerCloud = async () => {
    setErreur('');
    setAttente(true);
    try {
      const r = await recuperer('/api/cloud/espace', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'creer', nom, depot, branche }),
      });
      const d = (await r.json().catch(() => ({}))) as {
        environnement?: EnvCloudServeur;
        error?: string;
      };
      if (!r.ok || !d.environnement) throw new Error(d.error ?? 'Création impossible.');
      const env = versEnvironnementCloud(d.environnement);
      memoriserEnvironnementsCloud([
        env,
        ...lireEnvironnements().filter((e) => e.type === 'cloud' && e.id !== ID_AUTO),
      ]);
      onCree(env);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Création impossible.');
    } finally {
      setAttente(false);
    }
  };
  const parcourir = async () => {
    const choisir = pont()?.choisirDossier;
    if (!choisir) {
      setSaisie(true);
      return;
    }
    try {
      const d = await choisir();
      if (d) await ajouter(d);
    } catch {
      // App de bureau lancée avant la mise à jour : le sélecteur n'existe pas encore dans sa partie principale.
      setSaisie(true);
      setErreur(
        'Le sélecteur de dossiers de l’app de bureau n’est pas encore prêt : redémarre l’app Six. En attendant, colle le chemin du dossier ici.',
      );
    }
  };

  // Rendue hors de la barre de saisie (au-dessus de toute la page), pour ne pas hériter de ses styles.
  return createPortal(
    <div className="env-fond" onPointerDown={(e) => e.target === e.currentTarget && onFermer()}>
      <div className="env-dialogue" role="dialog" aria-modal="true" aria-labelledby="env-titre">
        <div className="env-dialogue-tete">
          <h2 id="env-titre">Nouvel environnement</h2>
          <button type="button" aria-label="Fermer" onClick={onFermer}>
            <Icon name="x" size={16} stroke={2} />
          </button>
        </div>
        <div className="env-onglets" role="tablist">
          {ONGLETS.map(([id, libelle]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={onglet === id}
              onClick={() => setOnglet(id)}
            >
              {libelle}
            </button>
          ))}
        </div>
        {onglet === 'distant' ? (
          <p className="env-a-venir">{A_VENIR}</p>
        ) : onglet === 'cloud' ? (
          <>
            <label className="env-champ">
              <span>Nom</span>
              <input
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder={
                  depot
                    .split('/')
                    .pop()
                    ?.replace(/\.git$/, '') || 'Mon projet en ligne'
                }
              />
            </label>
            <label className="env-champ">
              <span>
                Dépôt GitHub <small className="env-optionnel">(optionnel)</small>
              </span>
              <input
                value={depot}
                onChange={(e) => setDepot(e.target.value)}
                placeholder="proprietaire/depot ou https://github.com/proprietaire/depot"
                spellCheck={false}
              />
            </label>
            {depot.trim() && (
              <label className="env-champ">
                <span>
                  Branche <small className="env-optionnel">(par défaut : la principale)</small>
                </span>
                <input
                  value={branche}
                  onChange={(e) => setBranche(e.target.value)}
                  placeholder="main"
                />
              </label>
            )}
            <p className="env-note">
              L’environnement est gardé dans votre compte Six : Six y travaille en ligne, même
              depuis votre téléphone. Un dépôt GitHub public y est copié (fichiers de 2 Mo au plus).
              Les dépôts privés viendront avec la connexion à GitHub.
            </p>
            {erreur && (
              <p role="alert" className="env-erreur">
                {erreur}
              </p>
            )}
          </>
        ) : !espaceLocal ? (
          <p className="env-note">
            Les dossiers de cet ordinateur ne sont utilisables que lorsque Six tourne sur cet
            ordinateur. Avec Six en ligne, choisissez « Cloud » : Six y travaille avec vos fichiers
            ou un dépôt GitHub.
          </p>
        ) : (
          <>
            <label className="env-champ">
              <span>Nom</span>
              <input
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder={dossiers[0] ? nomDossier(dossiers[0]) : 'Mon projet'}
              />
            </label>
            <div className="env-champ">
              <div className="env-champ-tete">
                <span>Dossiers</span>
                <div className="env-ajout" ref={zoneAjout}>
                  <button
                    type="button"
                    className="env-ajouter"
                    aria-haspopup="menu"
                    aria-expanded={ajout}
                    onClick={() => setAjout((v) => !v)}
                  >
                    <Icon name="plus" size={14} stroke={2} /> Ajouter
                  </button>
                  {ajout && (
                    <div className="env-menu bas droite" role="menu">
                      {saisie ? (
                        <form
                          className="env-saisie"
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (chemin.trim()) void ajouter(chemin.trim());
                          }}
                        >
                          <input
                            // eslint-disable-next-line jsx-a11y/no-autofocus -- le champ vient d'être ouvert par un clic
                            autoFocus
                            value={chemin}
                            onChange={(e) => setChemin(e.target.value)}
                            placeholder="C:\Users\moi\Documents\Projet"
                            aria-label="Chemin du dossier"
                            spellCheck={false}
                          />
                          <button type="submit" disabled={attente || !chemin.trim()}>
                            Ajouter
                          </button>
                        </form>
                      ) : (
                        <>
                          <input
                            // eslint-disable-next-line jsx-a11y/no-autofocus -- le champ vient d'être ouvert par un clic
                            autoFocus
                            className="env-recherche"
                            value={recherche}
                            onChange={(e) => setRecherche(e.target.value)}
                            placeholder="Rechercher"
                            aria-label="Rechercher un dossier"
                          />
                          {proposes.map((d) => (
                            <button
                              key={d}
                              type="button"
                              role="menuitem"
                              title={d}
                              disabled={attente}
                              onClick={() => void ajouter(d)}
                            >
                              <span>{nomDossier(d)}</span>
                            </button>
                          ))}
                          {proposes.length > 0 && <hr />}
                          <button
                            type="button"
                            role="menuitem"
                            disabled={attente}
                            onClick={() => void parcourir()}
                          >
                            <span className="env-parcourir">
                              <Icon name="dossier" size={15} stroke={1.8} />
                              {natif ? 'Choisir…' : 'Autre dossier…'}
                            </span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {dossiers.length === 0 ? (
                <p className="env-dossiers-vide">
                  Choisissez le dossier où Six travaille. Vous pouvez en ajouter d’autres : Six
                  pourra les lire, sans jamais les modifier.
                </p>
              ) : (
                <ul className="env-dossiers">
                  {dossiers.map((d, i) => (
                    <li key={d} title={d}>
                      <Icon name="dossier" size={14} stroke={1.8} />
                      <span className="env-dossier-chemin">{d}</span>
                      <span className="env-dossier-role">{i === 0 ? 'travail' : 'lecture'}</span>
                      <button
                        type="button"
                        aria-label={`Retirer ${d}`}
                        onClick={() => setDossiers((l) => l.filter((x) => x !== d))}
                      >
                        <Icon name="x" size={12} stroke={2.2} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {erreur && (
                <p role="alert" className="env-erreur">
                  {erreur}
                </p>
              )}
            </div>
          </>
        )}
        <div className="env-dialogue-pied">
          <button type="button" onClick={onFermer}>
            Annuler
          </button>
          <button
            type="button"
            className="principal"
            disabled={
              attente ||
              onglet === 'distant' ||
              (onglet === 'local' && (!espaceLocal || dossiers.length === 0))
            }
            onClick={() =>
              onglet === 'cloud' ? void creerCloud() : onCree(creerEnvironnement(nom, dossiers))
            }
          >
            {attente && onglet === 'cloud'
              ? depot.trim()
                ? 'Import du dépôt…'
                : 'Création…'
              : 'Créer l’environnement'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
