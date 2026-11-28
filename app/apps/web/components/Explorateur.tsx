'use client';

import { copierTexte } from '@/lib/presse-papiers';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Afficheur } from './Afficheur';
import { recuperer } from '@/lib/recuperer';
import {
  construireArbre,
  filtrerArbre,
  genreApercu,
  type FichierListe,
  type Noeud,
} from '@/lib/arbre';

/** Entrée du contenu direct d'un dossier (voir listerNiveau dans lib/espace-travail.ts). */
type EntreeNiveau = {
  nom: string;
  chemin: string;
  type: 'dossier' | 'fichier';
  taille: number;
  maj: number;
};

/**
 * Explorateur de l'espace de travail, comme le panneau de fichiers de Claude :
 * - à gauche, l'arbre du dossier (filtre, dossiers repliables, « Tout replier », arbre masquable) ;
 * - à droite, les fichiers ouverts en onglets, affichés dans Six (photo, PDF, Word, PowerPoint, texte…) ;
 * - clic droit (ou « … » sur une ligne) : joindre à la barre de Six, copier le chemin, montrer dans l'Explorateur de
 *   Windows (app de bureau), versions précédentes.
 */

type VersionFichier = { id: string; date: number; taille: number };
type Pont = { montrerFichier?: (chemin: string) => Promise<boolean> };
const pont = (): Pont | undefined => (window as unknown as { sixBureau?: Pont }).sixBureau;

const URL_ESPACE = '/api/sixtouch/espace';
const URL_CLOUD = '/api/cloud/espace';
/** « cloud:<id> » : environnement cloud (API du Cloud, paramètre « e ») ; sinon un dossier de l'ordinateur. */
const avecDossier = (dossier: string, params: Record<string, string>) => {
  const cloud = dossier.startsWith('cloud:') ? dossier.slice(6) : '';
  const base = cloud ? URL_CLOUD : URL_ESPACE;
  const q = new URLSearchParams({
    ...(cloud ? { e: cloud } : dossier ? { d: dossier } : {}),
    ...params,
  }).toString();
  return q ? `${base}?${q}` : base;
};
const CLE_ARBRE = 'six-explorateur-arbre';

function taille(o: number): string {
  if (o < 1024) return `${o} o`;
  if (o < 1024 * 1024) return `${Math.round(o / 1024)} Ko`;
  return `${(o / 1024 / 1024).toFixed(1)} Mo`;
}

const ICONE: Record<ReturnType<typeof genreApercu>, Parameters<typeof Icon>[0]['name']> = {
  image: 'image',
  video: 'play',
  audio: 'mic',
  tableur: 'file',
  archive: 'file',
  pdf: 'file',
  docx: 'file',
  pptx: 'file',
  markdown: 'type',
  tableau: 'file',
  texte: 'type',
  autre: 'file',
};

export function Explorateur({
  dossier,
  dossiers = [],
  version,
  onJoindre,
  onInfo,
  enDessous,
}: {
  dossier: string;
  /** Tous les dossiers de l'environnement (le premier = dossier de travail ; les autres en lecture seule). */
  dossiers?: string[];
  version: number;
  onJoindre: (fichiers: File[]) => void;
  onInfo: (message: string) => void;
  /** Ce qui s'affiche sous l'arbre (pièces, réponses et liens de la discussion). */
  enDessous?: ReactNode;
}) {
  const [etat, setEtat] = useState<
    | { statut: 'chargement' }
    | { statut: 'absent'; message: string }
    | { statut: 'ok'; racine: string; fichiers: FichierListe[]; versions: Record<string, number> }
  >({ statut: 'chargement' });
  const [filtre, setFiltre] = useState('');
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const [onglets, setOnglets] = useState<string[]>([]);
  const [actif, setActif] = useState('');
  const [arbreVisible, setArbreVisible] = useState(true);
  const [menuGeneral, setMenuGeneral] = useState(false);
  const [contexte, setContexte] = useState<{ x: number; y: number; chemin: string } | null>(null);
  const [sousMenuCopier, setSousMenuCopier] = useState(false);
  const [historique, setHistorique] = useState<{
    chemin: string;
    versions: VersionFichier[];
  } | null>(null);
  const [bureau, setBureau] = useState(false);
  const cadre = useRef<HTMLDivElement>(null);
  // Dossier affiché : celui de travail par défaut ; les autres dossiers de l'environnement se lisent seulement.
  const [vue, setVue] = useState(dossier);
  useEffect(() => setVue(dossier), [dossier]);
  const lectureSeule = Boolean(vue && dossier && vue !== dossier);
  // Contenu direct de chaque dossier ouvert (« » : la racine, toujours affichée), chargé à la demande.
  const [niveaux, setNiveaux] = useState<Map<string, EntreeNiveau[]>>(new Map());
  const chargerNiveau = useCallback(
    async (chemin: string) => {
      try {
        const r = await recuperer(avecDossier(vue, { niveau: chemin }));
        const d = (await r.json().catch(() => ({}))) as { entrees?: EntreeNiveau[] };
        if (r.ok && d.entrees) setNiveaux((m) => new Map(m).set(chemin, d.entrees ?? []));
      } catch {
        /* dossier illisible : il reste fermé */
      }
    },
    [vue],
  );
  // Volet étroit : un fichier ouvert prend toute la place, l'arbre se montre à la demande (bouton de la barre).
  const [etroit, setEtroit] = useState(false);
  const [arbreEtroit, setArbreEtroit] = useState(false);
  useEffect(() => {
    const el = cadre.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setEtroit(e.contentRect.width < 560));
    obs.observe(el);
    return () => obs.disconnect();
  }, [etat.statut]);

  useEffect(() => {
    setBureau(Boolean(pont()?.montrerFichier));
    try {
      setArbreVisible(localStorage.getItem(CLE_ARBRE) !== '0');
    } catch {
      /* stockage bloqué */
    }
  }, []);
  const basculerArbre = () =>
    etroit
      ? setArbreEtroit((v) => !v)
      : setArbreVisible((v) => {
          try {
            localStorage.setItem(CLE_ARBRE, v ? '0' : '1');
          } catch {
            /* stockage bloqué */
          }
          return !v;
        });

  const charger = useCallback(async () => {
    try {
      const r = await recuperer(avecDossier(vue, {}));
      const d = (await r.json().catch(() => ({}))) as {
        dossier?: string;
        fichiers?: FichierListe[];
        versions?: Record<string, number>;
        error?: string;
      };
      if (!r.ok || !d.dossier)
        setEtat({ statut: 'absent', message: d.error ?? 'Espace indisponible.' });
      else
        setEtat({
          statut: 'ok',
          racine: d.dossier,
          fichiers: d.fichiers ?? [],
          versions: d.versions ?? {},
        });
    } catch {
      setEtat({ statut: 'absent', message: 'Espace de travail injoignable.' });
    }
  }, [vue]);
  useEffect(() => {
    void charger();
  }, [charger, version]);
  // La racine est toujours chargée ; les dossiers ouverts se rechargent avec elle.
  const ouvertsRef = useRef(ouverts);
  ouvertsRef.current = ouverts;
  useEffect(() => {
    void chargerNiveau('');
    for (const c of ouvertsRef.current) void chargerNiveau(c);
  }, [chargerNiveau, version]);
  // Autre dossier affiché : les onglets et dossiers ouverts de l'ancien se ferment.
  useEffect(() => {
    setOnglets([]);
    setActif('');
    setOuverts(new Set());
    setNiveaux(new Map());
  }, [vue]);

  // Un clic ailleurs ou Échap referme les menus.
  useEffect(() => {
    if (!contexte && !menuGeneral) return;
    const fermer = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (
        e instanceof PointerEvent &&
        (e.target as Element | null)?.closest('.explorateur-menu, .explorateur-menu-general')
      )
        return;
      setContexte(null);
      setMenuGeneral(false);
      setSousMenuCopier(false);
    };
    document.addEventListener('pointerdown', fermer);
    document.addEventListener('keydown', fermer);
    return () => {
      document.removeEventListener('pointerdown', fermer);
      document.removeEventListener('keydown', fermer);
    };
  }, [contexte, menuGeneral]);

  const fichiers = useMemo(() => (etat.statut === 'ok' ? etat.fichiers : []), [etat]);
  const arbre = useMemo(() => construireArbre(fichiers), [fichiers]);
  const visibles = useMemo(() => filtrerArbre(arbre, filtre), [arbre, filtre]);
  const urlFichier = (chemin: string) => avecDossier(vue, { f: chemin });
  const absolu = (chemin: string) => {
    if (etat.statut !== 'ok') return chemin;
    const windows = /^[a-z]:/i.test(etat.racine) || etat.racine.includes('\\');
    return `${etat.racine.replace(/[\\/]+$/, '')}${windows ? '\\' : '/'}${windows ? chemin.replace(/\//g, '\\') : chemin}`;
  };

  const ouvrir = (chemin: string) => {
    setOnglets((o) => (o.includes(chemin) ? o : [...o, chemin]));
    setActif(chemin);
    setArbreEtroit(false);
  };
  const arbreMontre = !actif || (etroit ? arbreEtroit : arbreVisible);
  const fermerOnglet = (chemin: string) => {
    setOnglets((o) => {
      const reste = o.filter((c) => c !== chemin);
      if (actif === chemin) setActif(reste.at(-1) ?? '');
      return reste;
    });
  };
  const copier = async (texte: string, quoi: string) => {
    try {
      await copierTexte(texte);
      onInfo(`${quoi} copié.`);
    } catch {
      onInfo('Copie impossible dans ce navigateur.');
    }
  };
  const joindre = async (chemin: string) => {
    try {
      const r = await recuperer(urlFichier(chemin));
      if (!r.ok) throw new Error('introuvable');
      const blob = await r.blob();
      onJoindre([
        new File([blob], chemin.split('/').pop() ?? 'fichier', { type: blob.type.split(';')[0] }),
      ]);
      onInfo(`« ${chemin} » est joint à la barre de Six.`);
    } catch {
      onInfo(`Impossible de joindre « ${chemin} ».`);
    }
  };
  const voirVersions = async (chemin: string) => {
    try {
      const r = await recuperer(avecDossier(vue, { versions: chemin }));
      const d = (await r.json().catch(() => ({}))) as { versions?: VersionFichier[] };
      setHistorique({ chemin, versions: d.versions ?? [] });
    } catch {
      onInfo(`Versions de « ${chemin} » indisponibles.`);
    }
  };
  const restaurer = async (chemin: string, v: VersionFichier) => {
    try {
      const r = await fetch(URL_ESPACE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'restaurer',
          chemin,
          version: v.id,
          ...(dossier ? { dossier } : {}),
        }),
      });
      const d = (await r.json().catch(() => ({}))) as { restaures?: string[]; error?: string };
      if (!r.ok || !d.restaures) throw new Error(d.error ?? 'Restauration impossible.');
      onInfo(
        `Version du ${new Date(v.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} restaurée : ${d.restaures.join(', ')}. L'ancienne version actuelle est gardée.`,
      );
      setHistorique(null);
      // Les onglets ouverts se rechargent (nouvelle adresse = nouveau contenu).
      setOnglets((o) => [...o]);
      await charger();
    } catch (e) {
      onInfo(e instanceof Error ? e.message : 'Restauration impossible.');
    }
  };

  const basculerDossier = (chemin: string) =>
    setOuverts((o) => {
      const s2 = new Set(o);
      if (s2.has(chemin)) s2.delete(chemin);
      else {
        s2.add(chemin);
        if (!niveaux.has(chemin)) void chargerNiveau(chemin);
      }
      return s2;
    });
  /** Ligne de l'arbre « niveau par niveau » (sans filtre) : le contenu direct, puis celui des dossiers ouverts. */
  const ligneNiveau = (e: EntreeNiveau, profondeur: number): ReactNode => {
    if (e.type === 'fichier')
      return ligne(
        { type: 'fichier', nom: e.nom, chemin: e.chemin, taille: e.taille, maj: e.maj },
        profondeur,
      );
    const ouvert = ouverts.has(e.chemin);
    const enfants = niveaux.get(e.chemin);
    return (
      <li key={e.chemin}>
        <button
          type="button"
          aria-expanded={ouvert}
          className="explorateur-ligne dossier"
          style={{ paddingLeft: `${8 + profondeur * 14}px` }}
          onClick={() => basculerDossier(e.chemin)}
        >
          <Icon name="chevron" size={12} stroke={2} />
          <span>{e.nom}</span>
        </button>
        {ouvert && (
          <ul role="group">
            {enfants === undefined ? (
              <li
                className="explorateur-attente"
                style={{ paddingLeft: `${22 + profondeur * 14}px` }}
              >
                Chargement…
              </li>
            ) : enfants.length === 0 ? (
              <li
                className="explorateur-attente"
                style={{ paddingLeft: `${22 + profondeur * 14}px` }}
              >
                Dossier vide
              </li>
            ) : (
              enfants.map((x) => ligneNiveau(x, profondeur + 1))
            )}
          </ul>
        )}
      </li>
    );
  };
  const ligne = (n: Noeud, profondeur: number): ReactNode => {
    const retrait = { paddingLeft: `${8 + profondeur * 14}px` };
    if (n.type === 'dossier') {
      const ouvert = Boolean(filtre.trim()) || ouverts.has(n.chemin);
      return (
        <li key={n.chemin}>
          <button
            type="button"
            aria-expanded={ouvert}
            className="explorateur-ligne dossier"
            style={retrait}
            onClick={() =>
              setOuverts((o) => {
                const s = new Set(o);
                if (s.has(n.chemin)) s.delete(n.chemin);
                else s.add(n.chemin);
                return s;
              })
            }
          >
            <Icon name="chevron" size={12} stroke={2} />
            <span>{n.nom}</span>
          </button>
          {ouvert && <ul role="group">{n.enfants.map((e) => ligne(e, profondeur + 1))}</ul>}
        </li>
      );
    }
    const versions = etat.statut === 'ok' ? (etat.versions[n.chemin] ?? 0) : 0;
    return (
      <li key={n.chemin}>
        <button
          type="button"
          aria-current={actif === n.chemin ? 'true' : undefined}
          className={`explorateur-ligne fichier${actif === n.chemin ? ' actif' : ''}`}
          style={retrait}
          title={`${n.chemin} · ${taille(n.taille)}`}
          onClick={() => ouvrir(n.chemin)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContexte({ x: e.clientX, y: e.clientY, chemin: n.chemin });
            setSousMenuCopier(false);
          }}
        >
          <Icon name={ICONE[genreApercu(n.nom)]} size={14} stroke={1.8} />
          <span>{n.nom}</span>
          {versions > 0 && (
            <span className="explorateur-versions" title={`${versions} version(s) précédente(s)`}>
              <Icon name="undo" size={11} stroke={2} />
            </span>
          )}
        </button>
      </li>
    );
  };

  if (etat.statut !== 'ok')
    return (
      <div className="volet-liste">
        <h3>Espace de travail</h3>
        <p className="volet-rien">{etat.statut === 'chargement' ? 'Chargement…' : etat.message}</p>
        {enDessous}
      </div>
    );

  const menu = contexte && (
    <div
      className="explorateur-menu"
      role="menu"
      style={{
        left: Math.min(contexte.x, window.innerWidth - 230),
        top: Math.min(contexte.y, window.innerHeight - 220),
      }}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          void joindre(contexte.chemin);
          setContexte(null);
        }}
      >
        Joindre à la barre de Six
      </button>
      <div className="explorateur-sous" onPointerEnter={() => setSousMenuCopier(true)}>
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={sousMenuCopier}
          onClick={() => setSousMenuCopier((v) => !v)}
        >
          Copier <Icon name="suivant" size={12} stroke={2} />
        </button>
        {sousMenuCopier && (
          <div className="explorateur-menu explorateur-sous-menu" role="menu">
            {(
              [
                ['Chemin absolu', absolu(contexte.chemin)],
                ['Chemin relatif', contexte.chemin],
                ['Nom du fichier', contexte.chemin.split('/').pop() ?? contexte.chemin],
              ] as const
            ).map(([libelle, valeur]) => (
              <button
                key={libelle}
                type="button"
                role="menuitem"
                onClick={() => {
                  void copier(valeur, libelle);
                  setContexte(null);
                }}
              >
                {libelle}
              </button>
            ))}
          </div>
        )}
      </div>
      {bureau && !vue.startsWith('cloud:') && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            void pont()
              ?.montrerFichier?.(absolu(contexte.chemin))
              .catch(() =>
                onInfo(
                  'Redémarre l’app Six de bureau pour utiliser « Montrer dans l’Explorateur ».',
                ),
              );
            setContexte(null);
          }}
        >
          Montrer dans l&apos;Explorateur
        </button>
      )}
      {!lectureSeule && (etat.versions[contexte.chemin] ?? 0) > 0 && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            void voirVersions(contexte.chemin);
            setContexte(null);
          }}
        >
          Versions précédentes…
        </button>
      )}
    </div>
  );

  return (
    <div ref={cadre} className={`explorateur${actif && !etroit ? ' avec-fichier' : ''}`}>
      <div className="explorateur-barre">
        {dossiers.length > 1 && !actif ? (
          <select
            className="explorateur-choix"
            value={vue}
            aria-label="Dossier affiché"
            onChange={(e) => setVue(e.target.value)}
          >
            {dossiers.map((d, i) => (
              <option key={d} value={d}>
                {d
                  .replace(/[\\/]+$/, '')
                  .split(/[\\/]/)
                  .pop()}
                {i === 0 ? ' (travail)' : ' (lecture)'}
              </option>
            ))}
          </select>
        ) : (
          <span className="explorateur-titre" title={actif ? absolu(actif) : etat.racine}>
            {actif || etat.racine}
          </span>
        )}
        <button
          type="button"
          aria-label="Tout replier"
          title="Tout replier"
          disabled={!ouverts.size}
          onClick={() => setOuverts(new Set())}
        >
          <Icon name="carre" size={14} stroke={1.8} />
        </button>
        <button
          type="button"
          aria-label={
            arbreMontre ? "Masquer l'arbre des fichiers" : "Afficher l'arbre des fichiers"
          }
          title={arbreMontre ? "Masquer l'arbre" : "Afficher l'arbre"}
          aria-pressed={arbreMontre}
          onClick={basculerArbre}
        >
          <Icon name="menu" size={15} stroke={1.8} />
        </button>
        <div className="explorateur-menu-general">
          <button
            type="button"
            aria-label="Plus d'options"
            aria-expanded={menuGeneral}
            onClick={() => setMenuGeneral((v) => !v)}
          >
            <Icon name="points" size={16} stroke={3} />
          </button>
          {menuGeneral && (
            <div className="explorateur-menu droite" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  void charger();
                  setMenuGeneral(false);
                }}
              >
                Actualiser
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  basculerArbre();
                  setMenuGeneral(false);
                }}
              >
                Afficher l&apos;arbre {arbreMontre && <Icon name="check" size={13} stroke={2.2} />}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!ouverts.size}
                onClick={() => {
                  setOuverts(new Set());
                  setMenuGeneral(false);
                }}
              >
                Replier tous les dossiers
              </button>
              {actif && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    void copier(absolu(actif), 'Chemin absolu');
                    setMenuGeneral(false);
                  }}
                >
                  Copier le chemin du fichier
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="explorateur-corps">
        {arbreMontre && (
          <div className="explorateur-arbre">
            <input
              className="explorateur-filtre"
              value={filtre}
              onChange={(e) => setFiltre(e.target.value)}
              placeholder="Filtrer les fichiers"
              aria-label="Filtrer les fichiers"
            />
            {filtre.trim() ? (
              <ul className="explorateur-liste" aria-label="Fichiers trouvés">
                {visibles.map((n) => ligne(n, 0))}
              </ul>
            ) : (niveaux.get('') ?? []).length === 0 ? (
              <p className="volet-rien">
                {niveaux.has('')
                  ? 'Le dossier est vide. Déposez-y vos fichiers : ils apparaîtront ici. Les résultats de Six vont dans « resultats ».'
                  : 'Chargement…'}
              </p>
            ) : (
              <ul className="explorateur-liste" aria-label="Contenu du dossier">
                {(niveaux.get('') ?? []).map((e) => ligneNiveau(e, 0))}
              </ul>
            )}
            {filtre && visibles.length === 0 && <p className="volet-rien">Aucun fichier trouvé.</p>}
            {historique && (
              <div className="explorateur-historique">
                <p>
                  Versions précédentes de « {historique.chemin} »
                  <button type="button" aria-label="Fermer" onClick={() => setHistorique(null)}>
                    <Icon name="x" size={12} stroke={2.2} />
                  </button>
                </p>
                <ul>
                  {historique.versions.length === 0 && <li>Aucune version précédente.</li>}
                  {historique.versions.map((v) => (
                    <li key={v.id}>
                      <span>
                        {new Date(v.date).toLocaleString('fr-FR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}{' '}
                        · {taille(v.taille)}
                      </span>
                      <button type="button" onClick={() => void restaurer(historique.chemin, v)}>
                        Restaurer
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!actif && enDessous}
          </div>
        )}
        {actif && !(etroit && arbreEtroit) && (
          <div className="explorateur-vue">
            <div className="explorateur-onglets" role="tablist">
              {onglets.map((c) => (
                <div
                  key={c}
                  className={`explorateur-onglet${c === actif ? ' actif' : ''}`}
                  role="tab"
                  aria-selected={c === actif}
                >
                  <button type="button" onClick={() => setActif(c)} title={c}>
                    {c.split('/').pop()}
                  </button>
                  <button
                    type="button"
                    aria-label={`Fermer ${c}`}
                    title="Fermer"
                    onClick={() => fermerOnglet(c)}
                  >
                    <Icon name="x" size={11} stroke={2.4} />
                  </button>
                </div>
              ))}
            </div>
            <div className="explorateur-contenu">
              <Afficheur
                key={`${actif}-${etat.versions[actif] ?? 0}`}
                nom={actif}
                url={urlFichier(actif)}
              />
            </div>
          </div>
        )}
      </div>
      {menu}
    </div>
  );
}
