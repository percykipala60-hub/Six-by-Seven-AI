'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Icon } from './Icon';
import { Explorateur } from './Explorateur';
import { recuperer } from '@/lib/recuperer';
import type { ChatMessage } from '@/lib/types';
import type { PageLecture } from '@/lib/page-lecture';
import { NavigateurComplet, type PoigneeNavigateur } from './NavigateurComplet';
import {
  BoutonMenuNatif,
  NavigateurNatif,
  OngletsNatifs,
  RechercheNatif,
  pontBureau,
} from './NavigateurNatif';
import { entetesCompte } from '@/lib/premium-client';

/**
 * Volet latéral du Chat, à droite : un navigateur et les fichiers de la discussion.
 * - Les boutons en haut à droite servent d'onglets : un clic ouvre, un second clic sur le même bouton ferme.
 *   Le volet n'a donc ni ligne d'onglets ni croix : toute la hauteur va à la page.
 * - À partir de 768 px, le volet se place à côté de la discussion et se redimensionne en tirant son bord gauche.
 * - Sur téléphone, pas de navigateur (trop encombrant) : seulement les fichiers, sous la barre du haut. Les travaux
 *   de Six s'y font en arrière-plan et leurs résultats (fichiers) apparaissent ici.
 * - Annoter : pointer, crayon, cadre et texte se posent sur la page. « Envoyer à Six » prend une capture d'écran de la
 *   page avec les repères (partage d'écran du navigateur, onglet courant) et la joint à la barre de Six, avec l'adresse
 *   et la description des repères. Une page d'un autre site ne peut pas être lue depuis l'app : Six la verra
 *   elle-même quand il naviguera depuis le serveur.
 * Historique, largeur et onglet ouvert sont gardés sur l'appareil.
 */

export type OngletVolet = 'navigateur' | 'fichiers';

const ONGLETS: { id: OngletVolet; label: string; icone: 'globe' | 'file' }[] = [
  { id: 'navigateur', label: 'Navigateur', icone: 'globe' },
  { id: 'fichiers', label: 'Fichiers', icone: 'file' },
];

const LIEN = /\bhttps?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?]/g;

const CLE_NAV = 'six-volet-nav';
const CLE_REGLAGES = 'six-volet';
const HISTORIQUE_MAX = 60;
const LARGEUR_DEFAUT = 440;
const LARGEUR_MIN = 380;
const DISCUSSION_MIN = 340; // place gardée à la discussion, à côté du volet
const BARRE_VERTICALE = 64;
export const GRAND_VOLET = '(min-width: 768px)';

type Nav = { pile: string[]; pos: number; visites: string[] };

/** Historique sans pages vides (« about:blank » d'un onglet qui démarrait) : seules les pages web y restent. */
function navPropre(n: Nav): Nav {
  const web = (u: string) => u === '' || /^https?:\/\//.test(u);
  const avant = n.pile.slice(0, n.pos + 1).filter(web).length;
  const pile = n.pile.filter(web);
  return {
    pile,
    pos: Math.min(pile.length - 1, Math.max(-1, avant - 1)),
    visites: n.visites.filter((v) => v && web(v)),
  };
}
type Reglages = { onglet: OngletVolet | null; largeur: number };

function lire<T>(cle: string, defaut: T): T {
  try {
    const brut = localStorage.getItem(cle);
    return brut ? { ...defaut, ...(JSON.parse(brut) as T) } : defaut;
  } catch {
    return defaut;
  }
}
function ecrire(cle: string, valeur: unknown) {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur));
  } catch {
    /* stockage bloqué : rien n'est gardé */
  }
}

/** Réglages du volet gardés sur l'appareil (onglet ouvert, largeur). */
export function lireReglagesVolet(): Reglages {
  return lire<Reglages>(CLE_REGLAGES, { onglet: null, largeur: LARGEUR_DEFAUT });
}
export function garderOngletVolet(onglet: OngletVolet | null) {
  ecrire(CLE_REGLAGES, { ...lireReglagesVolet(), onglet });
}

function largeurMax(): number {
  return Math.max(LARGEUR_MIN, window.innerWidth - BARRE_VERTICALE - DISCUSSION_MIN);
}
function borner(l: number): number {
  return Math.round(Math.min(largeurMax(), Math.max(LARGEUR_MIN, l)));
}

/** Adresse tapée → URL à ouvrir : une adresse est complétée en https, sinon c'est une recherche. */
export function adresseVersUrl(saisie: string): string {
  const t = saisie.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(t)) return `https://${t}`;
  // Recherche Google en mode « intégrable » (igu=1) : la page de résultats accepte d'être affichée dans un cadre.
  return `https://www.google.com/search?igu=1&q=${encodeURIComponent(t)}`;
}

/** Texte lisible d'une adresse : la recherche tapée, ou l'adresse sans « https:// ». */
function libelle(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === 'www.google.com' && u.pathname === '/search')
      return u.searchParams.get('q') ?? url;
    return url.replace(/^https?:\/\/(www\.)?/, '');
  } catch {
    return url;
  }
}
const estRecherche = (url: string) => url.startsWith('https://www.google.com/search?');

/**
 * Boutons du volet : ils servent aussi d'onglets (le bouton actif est en relief ; le recliquer ferme le volet).
 * Sur téléphone, seul « Fichiers » est proposé.
 */
export function BoutonsVolet({
  ouvert,
  onBasculer,
  telephone,
  seulement,
}: {
  ouvert: OngletVolet | null;
  onBasculer: (onglet: OngletVolet) => void;
  telephone?: boolean;
  /** Onglets proposés (le Chat n'a que le navigateur : pas d'espace de travail). */
  seulement?: OngletVolet[];
}) {
  return (
    <div className="volet-boutons" role="toolbar" aria-label="Outils">
      {ONGLETS.filter(
        (o) => (!telephone || o.id === 'fichiers') && (!seulement || seulement.includes(o.id)),
      ).map((o) => (
        <button
          key={o.id}
          type="button"
          className="volet-bouton"
          aria-pressed={ouvert === o.id}
          aria-label={ouvert === o.id ? `Fermer ${o.label.toLowerCase()}` : o.label}
          title={ouvert === o.id ? `${o.label} (cliquer pour fermer)` : o.label}
          onClick={() => onBasculer(o.id)}
        >
          <Icon name={o.icone} size={19} stroke={1.8} />
        </button>
      ))}
    </div>
  );
}

// ---------- Annotations ----------
type Outil = 'pointeur' | 'crayon' | 'cadre' | 'texte';
type Point = { x: number; y: number }; // en % de la vue
type Marque =
  | { type: 'pointeur'; n: number; p: Point }
  | { type: 'texte'; n: number; p: Point; note: string }
  | { type: 'cadre'; n: number; a: Point; b: Point }
  | { type: 'crayon'; n: number; points: Point[] };

const OUTILS: { id: Outil; label: string; icone: 'pointeur' | 'pencil' | 'carre' | 'type' }[] = [
  { id: 'pointeur', label: 'Pointer un endroit', icone: 'pointeur' },
  { id: 'crayon', label: 'Dessiner', icone: 'pencil' },
  { id: 'cadre', label: 'Encadrer une zone', icone: 'carre' },
  { id: 'texte', label: 'Ajouter une note', icone: 'type' },
];

function zone(p: Point): string {
  const v = p.y < 33 ? 'en haut' : p.y > 66 ? 'en bas' : 'au milieu';
  const h = p.x < 33 ? 'à gauche' : p.x > 66 ? 'à droite' : 'au centre';
  return v === 'au milieu' && h === 'au centre' ? 'au centre' : `${v} ${h}`;
}
function centre(m: Marque): Point {
  if (m.type === 'cadre') return { x: (m.a.x + m.b.x) / 2, y: (m.a.y + m.b.y) / 2 };
  if (m.type === 'crayon') {
    const s = m.points.reduce((acc, q) => ({ x: acc.x + q.x, y: acc.y + q.y }), { x: 0, y: 0 });
    return { x: s.x / m.points.length, y: s.y / m.points.length };
  }
  return m.p;
}

/** Capture d'écran : JPEG en data URL et sa taille en pixels (pour donner à Six des coordonnées exactes). */
export type Capture = { url: string; w: number; h: number };

/**
 * Description des repères pour Six, avec leurs coordonnées : en % de la page et en pixels sur la capture jointe
 * (origine en haut à gauche). Six sait ainsi exactement où regarder pour comprendre ce que la personne veut.
 */
function decrire(url: string, marques: Marque[], cap: Capture | null): string {
  const px = (p: Point) =>
    cap ? ` (pixel ${Math.round((p.x / 100) * cap.w)}, ${Math.round((p.y / 100) * cap.h)})` : '';
  const pc = (p: Point) => `x ${Math.round(p.x)} %, y ${Math.round(p.y)} %${px(p)}`;
  const boite = (ps: Point[]) => {
    const xs = ps.map((q) => q.x);
    const ys = ps.map((q) => q.y);
    return {
      a: { x: Math.min(...xs), y: Math.min(...ys) },
      b: { x: Math.max(...xs), y: Math.max(...ys) },
    };
  };
  const lignes = marques.map((m) => {
    const ou = zone(centre(m));
    if (m.type === 'pointeur') return `- Repère ${m.n} (pointé ${ou}) : ${pc(m.p)}`;
    if (m.type === 'texte')
      return `- Note ${m.n} (${ou}) en ${pc(m.p)} : « ${m.note.trim() || '…'} »`;
    const { a, b } = m.type === 'cadre' ? boite([m.a, m.b]) : boite(m.points);
    const quoi = m.type === 'cadre' ? 'Zone encadrée' : 'Trait dessiné';
    return `- ${quoi} ${m.n} (${ou}) : du coin ${pc(a)} au coin ${pc(b)}`;
  });
  const entete = cap
    ? `[Capture du navigateur de Six jointe, ${cap.w} × ${cap.h} pixels, page ${url}. Coordonnées depuis le coin en haut à gauche de la capture.]`
    : `[Page ${url} (capture impossible : regarde l'adresse). Coordonnées en % de la page, depuis le coin en haut à gauche.]`;
  return `${entete}\nRepères posés par la personne, à regarder en priorité pour comprendre ce qu'elle veut :\n${lignes.join('\n')}`;
}

/**
 * Partage de l'onglet, ouvert une seule fois quand on passe en mode repères (une page d'un autre site ne peut pas
 * être dessinée depuis l'app : on passe par le partage d'écran du navigateur, l'onglet courant est proposé d'office).
 * Chaque repère prend ensuite une image de ce partage, découpée sur la zone du navigateur de Six.
 */
export type Partage = { flux: MediaStream; video: HTMLVideoElement };

export async function ouvrirPartage(): Promise<Partage | null> {
  const md = navigator.mediaDevices as MediaDevices | undefined;
  if (!md?.getDisplayMedia) return null;
  try {
    const flux = await md.getDisplayMedia({
      video: { displaySurface: 'browser', frameRate: 15 },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
    } as DisplayMediaStreamOptions);
    const video = document.createElement('video');
    video.srcObject = flux;
    video.muted = true;
    await video.play();
    return { flux, video };
  } catch {
    return null; // partage refusé ou non pris en charge
  }
}

export function fermerPartage(p: Partage | null) {
  p?.flux.getTracks().forEach((t) => t.stop());
}

async function prendreImage(p: Partage, zone: HTMLElement): Promise<Capture | null> {
  if (p.flux.getVideoTracks().every((t) => t.readyState === 'ended')) return null;
  // Laisse le temps à l'écran de montrer le dernier repère (et de cacher la barre d'outils).
  await new Promise((r) => setTimeout(r, 180));
  const vw = p.video.videoWidth;
  const vh = p.video.videoHeight;
  if (!vw || !vh) return null;
  // Onglet courant : l'image a les proportions de la fenêtre, on découpe la zone. Sinon (écran entier ou autre
  // fenêtre choisie), on garde l'image entière.
  const memeOnglet = Math.abs(vw / vh - window.innerWidth / window.innerHeight) < 0.03;
  const r = zone.getBoundingClientRect();
  const fx = vw / window.innerWidth;
  const fy = vh / window.innerHeight;
  const src = memeOnglet
    ? { x: r.left * fx, y: r.top * fy, w: r.width * fx, h: r.height * fy }
    : { x: 0, y: 0, w: vw, h: vh };
  const echelle = Math.min(1, 1400 / Math.max(src.w, src.h));
  const toile = document.createElement('canvas');
  toile.width = Math.round(src.w * echelle);
  toile.height = Math.round(src.h * echelle);
  toile
    .getContext('2d')
    ?.drawImage(p.video, src.x, src.y, src.w, src.h, 0, 0, toile.width, toile.height);
  return { url: toile.toDataURL('image/jpeg', 0.82), w: toile.width, h: toile.height };
}

/**
 * Mode repères : chaque repère terminé (point posé, cadre ou trait relâché, note écrite) part tout seul vers la
 * barre de Six, avec une capture de la page et les coordonnées de tous les repères. Pas de bouton « Envoyer ».
 */
function Annotations({
  url,
  partage,
  onRepere,
  onQuitter,
}: {
  url: string;
  partage: Partage | null;
  onRepere: (description: string, capture: Capture | null) => void;
  onQuitter: () => void;
}) {
  const [outil, setOutil] = useState<Outil>('pointeur');
  const [marques, setMarques] = useState<Marque[]>([]);
  const [enCours, setEnCours] = useState<Marque | null>(null);
  const [prise, setPrise] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const suivant = marques.length + 1;

  // Envoi automatique, un court instant après le dernier changement (plus long pendant qu'on écrit une note).
  const onRepereRef = useRef(onRepere);
  useEffect(() => {
    onRepereRef.current = onRepere;
  }, [onRepere]);
  useEffect(() => {
    if (!marques.length) return;
    const ecrit = marques.some((m) => m.type === 'texte' && !m.note.trim());
    const t = setTimeout(
      () =>
        void (async () => {
          const zone = surface.current?.parentElement;
          let cap: Capture | null = null;
          if (partage && zone) {
            setPrise(true);
            cap = await prendreImage(partage, zone);
            setPrise(false);
          }
          onRepereRef.current(decrire(url, marques, cap), cap);
        })(),
      ecrit ? 1500 : 350,
    );
    return () => clearTimeout(t);
  }, [marques, partage, url]);

  const position = (e: { clientX: number; clientY: number }): Point => {
    const r = surface.current?.getBoundingClientRect() ?? new DOMRect(0, 0, 1, 1);
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)),
    };
  };
  // Le tracé en cours est aussi gardé dans une référence : le relâchement lit toujours la dernière position, même
  // si l'affichage n'a pas encore suivi.
  const trace = useRef<Marque | null>(null);
  const majTrace = (m: Marque | null) => {
    trace.current = m;
    setEnCours(m);
  };
  const bas = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.annot-note')) return;
    const p = position(e);
    if (outil === 'pointeur') setMarques((m) => [...m, { type: 'pointeur', n: suivant, p }]);
    else if (outil === 'texte')
      setMarques((m) => [...m, { type: 'texte', n: suivant, p, note: '' }]);
    else {
      e.currentTarget.setPointerCapture(e.pointerId);
      majTrace(
        outil === 'cadre'
          ? { type: 'cadre', n: suivant, a: p, b: p }
          : { type: 'crayon', n: suivant, points: [p] },
      );
    }
  };
  const bouge = (e: ReactPointerEvent<HTMLDivElement>) => {
    const t = trace.current;
    if (!t) return;
    const p = position(e);
    majTrace(
      t.type === 'cadre'
        ? { ...t, b: p }
        : t.type === 'crayon'
          ? { ...t, points: [...t.points, p] }
          : t,
    );
  };
  const haut = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (trace.current) bouge(e);
    const t = trace.current;
    if (!t) return;
    const assezGrand =
      t.type === 'cadre'
        ? Math.abs(t.a.x - t.b.x) + Math.abs(t.a.y - t.b.y) > 2
        : t.type === 'crayon' && t.points.length > 2;
    if (assezGrand) setMarques((m) => [...m, t]);
    majTrace(null);
  };

  const tout = enCours ? [...marques, enCours] : marques;
  return (
    <>
      <div
        ref={surface}
        className={`annot-surface outil-${outil}${prise ? ' prise' : ''}`}
        onPointerDown={bas}
        onPointerMove={bouge}
        onPointerUp={haut}
        onPointerCancel={haut}
      >
        <svg
          className="annot-svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {tout.map((m) =>
            m.type === 'cadre' ? (
              <rect
                key={m.n}
                x={Math.min(m.a.x, m.b.x)}
                y={Math.min(m.a.y, m.b.y)}
                width={Math.abs(m.a.x - m.b.x)}
                height={Math.abs(m.a.y - m.b.y)}
                vectorEffect="non-scaling-stroke"
              />
            ) : m.type === 'crayon' ? (
              <polyline
                key={m.n}
                points={m.points.map((q) => `${q.x},${q.y}`).join(' ')}
                vectorEffect="non-scaling-stroke"
              />
            ) : null,
          )}
        </svg>
        {tout.map((m) => {
          const c =
            m.type === 'cadre'
              ? { x: Math.min(m.a.x, m.b.x), y: Math.min(m.a.y, m.b.y) }
              : centre(m);
          const pos = { left: `${c.x}%`, top: `${c.y}%` };
          if (m.type === 'texte')
            return (
              <div key={m.n} className="annot-note" style={pos}>
                <span className="annot-num">{m.n}</span>
                <input
                  // La note vient d'être posée : on écrit tout de suite dedans.
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  aria-label={`Note ${m.n}`}
                  placeholder="Ta note"
                  value={m.note}
                  onChange={(e) =>
                    setMarques((ms) =>
                      ms.map((x) =>
                        x.n === m.n && x.type === 'texte' ? { ...x, note: e.target.value } : x,
                      ),
                    )
                  }
                />
              </div>
            );
          return (
            <span key={m.n} className={`annot-num annot-${m.type}`} style={pos}>
              {m.n}
            </span>
          );
        })}
      </div>
      <div
        className={`annot-barre${prise ? ' cache' : ''}`}
        role="toolbar"
        aria-label="Repères pour Six"
      >
        {OUTILS.map((o) => (
          <button
            key={o.id}
            type="button"
            className="volet-action"
            aria-pressed={outil === o.id}
            aria-label={o.label}
            title={o.label}
            onClick={() => setOutil(o.id)}
          >
            <Icon name={o.icone} size={16} stroke={1.9} />
          </button>
        ))}
        <span className="annot-sep" aria-hidden="true" />
        <button
          type="button"
          className="volet-action"
          aria-label="Effacer les repères"
          title="Effacer les repères"
          disabled={!marques.length}
          onClick={() => setMarques([])}
        >
          <Icon name="undo" size={16} stroke={1.9} />
        </button>
        <button
          type="button"
          className="volet-action"
          aria-label="Quitter les repères"
          title="Quitter les repères"
          onClick={onQuitter}
        >
          <Icon name="x" size={16} stroke={2} />
        </button>
      </div>
      {!partage && (
        <p className="annot-echec">
          Capture non autorisée : Six reçoit l&apos;adresse et les coordonnées des repères, sans
          image.
        </p>
      )}
    </>
  );
}

/** Élément de la discussion ouvert dans l'aperçu du volet : texte ou image. */
type Fichier = { nom: string; texte?: string; image?: string };

// Espace de travail de Cosinus (dossier local, voir lib/espace-travail.ts) : explorateur dans components/Explorateur.
const URL_ESPACE = '/api/sixtouch/espace';

/** Enregistre un texte de Six dans `resultats/` de l'espace de travail. Renvoie le chemin, ou lève une erreur. */
async function enregistrerDansEspace(
  nom: string,
  contenu: string,
  dossier: string,
): Promise<string> {
  // « cloud:<id> » : environnement cloud (enregistré dans le Cloud du compte).
  const cloud = dossier.startsWith('cloud:') ? dossier.slice(6) : '';
  const r = await recuperer(cloud ? '/api/cloud/espace' : URL_ESPACE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      cloud ? { e: cloud, nom, contenu } : { nom, contenu, ...(dossier ? { dossier } : {}) },
    ),
  });
  const d = (await r.json().catch(() => ({}))) as { chemin?: string; error?: string };
  if (!r.ok || !d.chemin) throw new Error(d.error ?? 'Enregistrement impossible.');
  return d.chemin;
}

function nomPourReponse(texte: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const mots = texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .split('-')
    .filter(Boolean)
    .slice(0, 6)
    .join('-');
  return `six-${date}${mots ? `-${mots}` : ''}.md`;
}

export function Volet({
  onglet,
  onOnglet,
  onFermer,
  messages,
  onExporter,
  onJoindre,
  onAnnoter,
  telephone,
  dossier = '',
  dossiers = [],
  contexte,
}: {
  /** Discussion affichée (« chat:… » ou « cosinus:… ») : historique, onglets et session web lui sont propres. */
  contexte: string;
  onglet: OngletVolet;
  onOnglet: (onglet: OngletVolet) => void;
  onFermer: () => void;
  messages: ChatMessage[];
  onExporter: (m: ChatMessage) => void;
  /** Fichiers de l'espace de travail à joindre à la barre de Six. */
  onJoindre: (fichiers: File[]) => void;
  /** Texte préparé par l'annotation, à placer dans la saisie du Chat. */
  onAnnoter: (description: string, capture: Capture | null) => void;
  /** Téléphone : pas de navigateur ; les liens s'ouvrent dans un onglet. */
  telephone: boolean;
  /** Cosinus : dossier de l'environnement de la discussion (vide : dossier par défaut). */
  dossier?: string;
  /** Tous les dossiers de l'environnement (le premier = dossier de travail), affichables dans l'explorateur. */
  dossiers?: string[];
}) {
  // ---- Largeur : appliquée à la page par la variable --volet-largeur (voir globals.css) ----
  const [largeur, setLargeurBrut] = useState(() => lireReglagesVolet().largeur);
  const avantAgrandi = useRef<number | null>(null);
  const appliquer = useCallback((l: number) => {
    document.documentElement.style.setProperty('--volet-largeur', `${l}px`);
    setLargeurBrut(l);
  }, []);
  useEffect(() => {
    appliquer(borner(lireReglagesVolet().largeur));
    const surRedim = () => appliquer(borner(lireReglagesVolet().largeur));
    window.addEventListener('resize', surRedim);
    return () => window.removeEventListener('resize', surRedim);
  }, [appliquer]);
  const fixerLargeur = (l: number) => {
    const b = borner(l);
    appliquer(b);
    ecrire(CLE_REGLAGES, { ...lireReglagesVolet(), largeur: b });
  };
  // Glisser : on écoute toute la fenêtre (et pas seulement la poignée), pour suivre le pointeur partout et ne jamais
  // rater le relâchement, même au-dessus de la page affichée dans le navigateur.
  const debutGlisse = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const depart = { x: e.clientX, l: largeur };
    let courante = largeur;
    avantAgrandi.current = null;
    const html = document.documentElement;
    html.classList.add('volet-glisse');
    const bouger = (ev: PointerEvent) => {
      courante = borner(depart.l + depart.x - ev.clientX);
      appliquer(courante);
    };
    const finir = () => {
      window.removeEventListener('pointermove', bouger);
      window.removeEventListener('pointerup', finir);
      window.removeEventListener('pointercancel', finir);
      html.classList.remove('volet-glisse');
      fixerLargeur(courante);
    };
    window.addEventListener('pointermove', bouger);
    window.addEventListener('pointerup', finir);
    window.addEventListener('pointercancel', finir);
  };
  const clavierPoignee = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const pas = e.shiftKey ? 80 : 24;
    if (e.key === 'ArrowLeft') fixerLargeur(largeur + pas);
    else if (e.key === 'ArrowRight') fixerLargeur(largeur - pas);
    else return;
    e.preventDefault();
  };
  const agrandi = largeur >= largeurMax() - 2;
  const basculerAgrandi = () => {
    if (agrandi) fixerLargeur(avantAgrandi.current ?? LARGEUR_DEFAUT);
    else {
      avantAgrandi.current = largeur;
      fixerLargeur(largeurMax());
    }
  };

  // ---- Navigateur : historique propre au volet, gardé sur l'appareil ----
  // Le volet n'existe que côté navigateur (il s'ouvre après le chargement) : on peut lire l'appareil dès le départ.
  // Chaque discussion a son historique : rien de ce qui est visité dans l'une ne s'affiche dans une autre.
  const cleNav = `${CLE_NAV}:${contexte}`;
  const lireNav = (cle: string) => navPropre(lire<Nav>(cle, { pile: [], pos: -1, visites: [] }));
  const [navEtat, setNavBrut] = useState<{ cle: string; nav: Nav }>(() => ({
    cle: cleNav,
    nav: lireNav(cleNav),
  }));
  // Autre discussion : son propre historique (lu sur l'appareil) remplace celui de la précédente.
  if (navEtat.cle !== cleNav) setNavBrut({ cle: cleNav, nav: lireNav(cleNav) });
  const nav = navEtat.nav;
  const setNav = useCallback(
    (f: Nav | ((n: Nav) => Nav)) =>
      setNavBrut((e) => ({ cle: e.cle, nav: typeof f === 'function' ? f(e.nav) : f })),
    [],
  );
  useEffect(() => {
    ecrire(navEtat.cle, navEtat.nav);
  }, [navEtat]);
  const url = nav.pos >= 0 ? (nav.pile[nav.pos] ?? '') : '';
  const [saisie, setSaisie] = useState('');
  const [rechargement, setRechargement] = useState(0);
  // Version lecture : beaucoup de sites refusent d'être affichés dans une autre app. Le serveur le vérifie
  // (app/api/page-lecture) et donne alors une version lecture (texte, intertitres, liens), sans script du site.
  const [lecture, setLecture] = useState<PageLecture | null>(null);
  const [modeLecture, setModeLecture] = useState(false);
  const [verification, setVerification] = useState(false);
  // Navigateur complet (local) : la page tourne dans Edge sur l'ordinateur. Utilisé d'office pour les sites qui
  // refusent l'affichage intégré ; la version lecture reste le secours là où il n'existe pas (version en ligne).
  const [bloque, setBloque] = useState(false);
  // Sur l'ordinateur, toutes les pages s'ouvrent dans le navigateur complet (fluide, et aucun site ne refuse) ;
  // « cadre » : la personne préfère l'affichage intégré pour cette page (bouton globe), si le site l'accepte.
  const [cadre, setCadre] = useState(false);
  const [indispo, setIndispo] = useState('');
  const indispoRef = useRef('');
  const completRef = useRef<PoigneeNavigateur>(null);
  const [sessionAgent, setSessionAgent] = useState<string | undefined>(undefined);
  useEffect(() => {
    setSessionAgent(undefined);
    const suivreAgent = () => {
      const courant = JSON.parse(
        sessionStorage.getItem(`six-navigateur-agent:${contexte}`) || '{}',
      ) as {
        url?: string;
        session?: string;
      };
      // Seules les vraies pages web entrent dans l'historique (pas « about:blank » d'un onglet qui démarre).
      if (!courant.url || !/^https?:\/\//.test(courant.url)) return;
      const u = courant.url;
      // Le volet montre en direct l'onglet que Six pilote.
      if (courant.session) setSessionAgent(courant.session);
      setCadre(false);
      setModeLecture(false);
      setNav((n) =>
        n.pile[n.pos] === u
          ? n
          : {
              pile: [...n.pile.slice(0, n.pos + 1), u],
              pos: n.pos + 1,
              visites: [u, ...n.visites.filter((v) => v !== u)].slice(0, HISTORIQUE_MAX),
            },
      );
    };
    suivreAgent();
    window.addEventListener('six-navigateur-agent', suivreAgent);
    return () => window.removeEventListener('six-navigateur-agent', suivreAgent);
  }, [contexte, setNav]);
  // La vérification télécharge la page : seulement quand elle sert (affichage intégré, version en ligne, ou version
  // lecture demandée). Avec le navigateur complet, la page n'est pas téléchargée deux fois.
  const [lectureDemandee, setLectureDemandee] = useState(false);
  const besoinVerif = Boolean(indispo) || cadre || lectureDemandee;
  useEffect(() => {
    setModeLecture(false);
    setLectureDemandee(false);
    setBloque(false);
  }, [url]);
  useEffect(() => {
    setLecture(null);
    // La recherche Google en mode « intégrable » s'affiche toujours : pas besoin de vérifier.
    if (!url || !besoinVerif || url.startsWith('https://www.google.com/search?igu=1')) return;
    let actif = true;
    setVerification(true);
    entetesCompte()
      .then((headers) => fetch(`/api/page-lecture?url=${encodeURIComponent(url)}`, { headers }))
      .then((r) => (r.ok ? (r.json() as Promise<PageLecture>) : null))
      .then((d) => {
        if (!actif || !d) return;
        setLecture(d);
        setBloque(!d.integrable);
        if (!d.integrable && indispoRef.current) setModeLecture(true);
      })
      .catch(() => {})
      .finally(() => {
        if (actif) setVerification(false);
      });
    return () => {
      actif = false;
    };
  }, [url, rechargement, besoinVerif]);
  // Application de bureau (apps/bureau) : un vrai navigateur natif prend la place de la page, pour tous les sites.
  const [natif] = useState(() => Boolean(pontBureau()));
  // La discussion est annoncée au navigateur dès que le volet s'affiche (même sans page ouverte) : la barre
  // d'onglets ne montre jamais ceux d'une autre discussion.
  useEffect(() => {
    if (natif) void pontBureau()?.navigateur.contexte?.(contexte);
  }, [natif, contexte]);
  const complet = !natif && Boolean(url) && !indispo && (!cadre || bloque);
  const pilote = natif || complet;
  const completIndisponible = (raison: string) => {
    indispoRef.current = raison;
    setIndispo(raison);
    if (bloque) setModeLecture(true);
  };
  const [historique, setHistorique] = useState(false);
  const [annoter, setAnnoterBrut] = useState(false);
  // Partage de l'onglet pour les captures : ouvert au clic sur le pointeur (le navigateur exige un geste), coupé en
  // sortant du mode repères ou en fermant le volet.
  const [partage, setPartage] = useState<Partage | null>(null);
  const partageRef = useRef<Partage | null>(null);
  const setAnnoter = useCallback((v: boolean) => {
    setAnnoterBrut(v);
    if (!v) {
      fermerPartage(partageRef.current);
      partageRef.current = null;
      setPartage(null);
    }
  }, []);
  useEffect(() => () => fermerPartage(partageRef.current), []);
  const demarrerReperes = async () => {
    setHistorique(false);
    if (annoter) return setAnnoter(false);
    const p = await ouvrirPartage();
    partageRef.current = p;
    setPartage(p);
    // Si la personne arrête le partage depuis le bandeau du navigateur, les repères continuent sans image.
    p?.flux.getVideoTracks()[0]?.addEventListener('ended', () => {
      partageRef.current = null;
      setPartage(null);
    });
    setAnnoterBrut(true);
  };
  const champ = useRef<HTMLInputElement>(null);
  const [apercu, setApercu] = useState<Fichier | null>(null);
  // Espace de travail : la liste se recharge après chaque enregistrement ; un message court dit ce qui s'est passé.
  const [versionEspace, setVersionEspace] = useState(0);
  // L'agent a enregistré un fichier (SevenChat envoie « six-espace-maj ») : la liste se recharge.
  useEffect(() => {
    const maj = () => setVersionEspace((v) => v + 1);
    window.addEventListener('six-espace-maj', maj);
    return () => window.removeEventListener('six-espace-maj', maj);
  }, []);
  const [info, setInfo] = useState('');
  useEffect(() => {
    if (!info) return;
    const t = setTimeout(() => setInfo(''), 4000);
    return () => clearTimeout(t);
  }, [info]);
  const enregistrer = async (m: ChatMessage) => {
    try {
      await enregistrerDansEspace(nomPourReponse(m.content), m.content, dossier);
      setVersionEspace((v) => v + 1);
    } catch (e) {
      setInfo(e instanceof Error ? e.message : 'Enregistrement impossible.');
    }
  };

  useEffect(() => {
    setSaisie(url ? libelle(url) : '');
    setAnnoter(false);
  }, [url, setAnnoter]);

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (annoter) setAnnoter(false);
      else onFermer();
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [onFermer, annoter, setAnnoter]);

  const ouvrir = (cible: string) => {
    const u = adresseVersUrl(cible);
    if (!u) return;
    if (telephone) {
      window.open(u, '_blank', 'noopener,noreferrer');
      return;
    }
    setNav((n) => {
      const pile = [...n.pile.slice(0, n.pos + 1), u].slice(-HISTORIQUE_MAX);
      const visites = [u, ...n.visites.filter((v) => v !== u)].slice(0, HISTORIQUE_MAX);
      return { pile, pos: pile.length - 1, visites };
    });
    // App de bureau : ouvert tout de suite dans l'onglet actif (même adresse que la précédente dans un nouvel onglet).
    if (natif) completRef.current?.ouvrir?.(u);
    setHistorique(false);
    onOnglet('navigateur');
  };
  const aller = (delta: number) =>
    setNav((n) => ({ ...n, pos: Math.min(n.pile.length - 1, Math.max(0, n.pos + delta)) }));
  const valider = (e: FormEvent) => {
    e.preventDefault();
    ouvrir(saisie);
    champ.current?.blur();
  };
  const accueil = () => {
    setNav((n) => ({ ...n, pile: [...n.pile.slice(0, n.pos + 1), ''], pos: n.pos + 1 }));
    setHistorique(false);
  };

  const { documents, reponses, liens } = useMemo(() => {
    const documents: Fichier[] = [];
    const reponses: { m: ChatMessage; n: number }[] = [];
    const liens = new Set<string>();
    messages.forEach((m) => {
      for (const p of m.pieces ?? []) documents.push({ nom: p.nom, image: p.apercu });
      if (m.role === 'assistant') reponses.push({ m, n: reponses.length + 1 });
      for (const l of m.content.match(LIEN) ?? []) liens.add(l);
    });
    return { documents, reponses, liens: [...liens] };
  }, [messages]);

  const listeLiens = (titre: string) =>
    liens.length > 0 && (
      <div className="volet-liste">
        <h3>{titre}</h3>
        {liens.map((l) => (
          <button key={l} type="button" className="volet-ligne" onClick={() => ouvrir(l)}>
            <Icon name="globe" size={15} stroke={1.8} />
            <span>{libelle(l)}</span>
          </button>
        ))}
      </div>
    );

  const listeVisites = nav.visites.length > 0 && (
    <div className="volet-liste">
      <h3>
        Récents
        <button
          type="button"
          className="volet-effacer"
          onClick={() => setNav({ pile: url ? [url] : [], pos: url ? 0 : -1, visites: [] })}
        >
          Effacer
        </button>
      </h3>
      {nav.visites.map((v) => (
        <div key={v} className="volet-ligne-visite">
          <button type="button" className="volet-ligne" onClick={() => ouvrir(v)}>
            <Icon name={estRecherche(v) ? 'search' : 'globe'} size={15} stroke={1.8} />
            <span>{libelle(v)}</span>
          </button>
          <button
            type="button"
            className="volet-retirer"
            aria-label={`Retirer « ${libelle(v)} » de l'historique`}
            title="Retirer de l'historique"
            onClick={() => setNav((n) => ({ ...n, visites: n.visites.filter((x) => x !== v) }))}
          >
            <Icon name="x" size={13} stroke={2} />
          </button>
        </div>
      ))}
    </div>
  );

  const navigateur = onglet === 'navigateur' && !telephone;
  return (
    <aside className="volet" aria-label={navigateur ? 'Navigateur' : 'Fichiers'}>
      {/* Un séparateur qui prend le focus et porte une valeur est un élément interactif selon ARIA (poignée de
          redimensionnement) ; la règle de lint ne connaît pas ce cas. */}
      {/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
      <div
        className="volet-poignee"
        role="separator"
        aria-orientation="vertical"
        aria-label="Largeur du volet (flèches gauche et droite, double-clic pour agrandir)"
        aria-valuenow={largeur}
        aria-valuemin={LARGEUR_MIN}
        tabIndex={0}
        onPointerDown={debutGlisse}
        onDoubleClick={basculerAgrandi}
        onKeyDown={clavierPoignee}
      />
      {/* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}

      {navigateur ? (
        <div className="volet-corps volet-nav">
          {natif && (
            <OngletsNatifs
              onNouvel={() => {
                setSaisie('');
                champ.current?.focus();
              }}
            />
          )}
          <form className="volet-barre" onSubmit={valider}>
            <button
              type="button"
              className="volet-action"
              aria-label="Page précédente"
              disabled={nav.pos <= 0 && !pilote}
              onClick={() => (pilote && !modeLecture ? completRef.current?.retour() : aller(-1))}
            >
              <Icon name="back" size={15} stroke={2} />
            </button>
            <button
              type="button"
              className="volet-action volet-suivant"
              aria-label="Page suivante"
              disabled={nav.pos >= nav.pile.length - 1 && !pilote}
              onClick={() => (pilote && !modeLecture ? completRef.current?.avant() : aller(1))}
            >
              <Icon name="back" size={15} stroke={2} />
            </button>
            <button
              type="button"
              className="volet-action"
              aria-label="Recharger"
              disabled={!url}
              onClick={() => setRechargement((n) => n + 1)}
            >
              <Icon name="refresh" size={14} stroke={2} />
            </button>
            <input
              ref={champ}
              className="volet-adresse"
              type="text"
              inputMode="url"
              enterKeyHint="go"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Adresse ou recherche"
              aria-label="Adresse ou recherche"
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              className="volet-action"
              aria-label="Annoter la page pour Six"
              aria-pressed={annoter}
              title="Pointer ou annoter pour Six"
              disabled={!url}
              onClick={() => void demarrerReperes()}
            >
              <Icon name="pointeur" size={15} stroke={1.9} />
            </button>
            <button
              type="button"
              className="volet-action"
              aria-label="Historique"
              aria-pressed={historique}
              title="Historique"
              onClick={() => {
                setAnnoter(false);
                setHistorique((h) => !h);
              }}
            >
              <Icon name="memoire" size={15} stroke={1.9} />
            </button>
            {!natif && (
              <button
                type="button"
                className="volet-action"
                aria-label="Navigateur complet"
                aria-pressed={complet}
                title={
                  indispo
                    ? indispo
                    : bloque
                      ? 'Ce site refuse l’affichage intégré : il reste dans le navigateur complet'
                      : complet
                        ? 'Passer à l’affichage intégré'
                        : 'Revenir au navigateur complet'
                }
                disabled={!url || Boolean(indispo) || bloque}
                onClick={() => {
                  setModeLecture(false);
                  setCadre((c) => !c);
                }}
              >
                <Icon name="globe" size={15} stroke={1.9} />
              </button>
            )}
            {natif ? (
              <BoutonMenuNatif />
            ) : (
              <>
                <button
                  type="button"
                  className="volet-action"
                  aria-label={modeLecture ? "Afficher la page d'origine" : 'Version lecture'}
                  aria-pressed={modeLecture}
                  title={
                    lecture && !lecture.integrable
                      ? "Ce site refuse l'affichage intégré : version lecture"
                      : modeLecture
                        ? "Page d'origine"
                        : 'Version lecture (texte seul)'
                  }
                  disabled={!url || (Boolean(lecture) && !lecture?.blocs.length)}
                  onClick={() => {
                    setLectureDemandee(true);
                    setModeLecture((m) => !m);
                  }}
                >
                  <Icon name="file" size={15} stroke={1.9} />
                </button>
                <a
                  className={`volet-action volet-a-part${url ? '' : ' inactif'}`}
                  href={url || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Ouvrir à part, dans un onglet"
                  title="Ouvrir à part (si la page reste blanche ou refuse de s'afficher ici)"
                  aria-disabled={!url}
                >
                  <Icon name="up" size={15} stroke={2} />
                </a>
              </>
            )}
            <button
              type="button"
              className="volet-action"
              aria-label={agrandi ? 'Réduire le volet' : 'Agrandir le volet'}
              title={agrandi ? 'Réduire' : 'Agrandir'}
              onClick={basculerAgrandi}
            >
              <Icon name="panneau" size={15} stroke={1.8} />
            </button>
          </form>
          {natif && <RechercheNatif onHistorique={() => setHistorique(true)} />}
          {historique ? (
            <div className="volet-defile">
              <button type="button" className="volet-ligne" onClick={accueil}>
                <Icon name="plus" size={15} stroke={1.8} />
                <span>Nouvelle page</span>
              </button>
              {listeVisites || (
                <p className="volet-rien">Aucune page visitée pour l&apos;instant.</p>
              )}
            </div>
          ) : url ? (
            <div className="volet-scene">
              {modeLecture && lecture ? (
                <article className="volet-lecture" aria-label="Version lecture">
                  {!lecture.integrable && (
                    <p className="volet-lecture-note">
                      Ce site refuse d&apos;être affiché dans une autre app : voici sa version
                      lecture.
                      {indispo
                        ? " La page d'origine s'ouvre à part avec la flèche."
                        : ' Le bouton globe le rouvre dans le navigateur complet.'}
                    </p>
                  )}
                  <h1>{lecture.titre}</h1>
                  {lecture.blocs.map((b, i) => {
                    const Balise = b.type === 'li' ? 'p' : b.type;
                    return (
                      <Balise key={i} className={b.type === 'li' ? 'volet-lecture-li' : undefined}>
                        {b.type === 'li' ? `• ${b.texte}` : b.texte}
                      </Balise>
                    );
                  })}
                  {lecture.liens.length > 0 && (
                    <div className="volet-liste">
                      <h3>Liens de la page</h3>
                      {lecture.liens.map((l) => (
                        <button
                          key={l.url}
                          type="button"
                          className="volet-ligne"
                          onClick={() => ouvrir(l.url)}
                        >
                          <Icon name="globe" size={15} stroke={1.8} />
                          <span>{l.texte}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              ) : natif && url ? (
                <NavigateurNatif
                  key={contexte}
                  contexte={contexte}
                  url={url}
                  rechargement={rechargement}
                  poignee={completRef}
                  masque={annoter}
                  onAdresse={(u) => {
                    if (document.activeElement !== champ.current) setSaisie(libelle(u));
                  }}
                />
              ) : complet ? (
                <NavigateurComplet
                  url={url}
                  rechargement={rechargement}
                  poignee={completRef}
                  sessionAgent={sessionAgent}
                  onAdresse={(u) => {
                    if (document.activeElement !== champ.current) setSaisie(libelle(u));
                  }}
                  onIndisponible={completIndisponible}
                />
              ) : verification ? null : (
                // Affiché seulement après la vérification : un site qui refuse l'affichage intégré part directement
                // dans le navigateur complet, sans passer par une page bloquée.
                <iframe
                  key={`${nav.pos}-${rechargement}`}
                  className="volet-cadre"
                  src={url}
                  title="Page ouverte dans le navigateur de Six"
                  referrerPolicy="no-referrer"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                />
              )}
              {verification && <span className="volet-complet-charge" aria-hidden="true" />}
              {annoter && (
                <Annotations
                  url={url}
                  partage={partage}
                  onQuitter={() => setAnnoter(false)}
                  onRepere={onAnnoter}
                />
              )}
            </div>
          ) : (
            <div className="volet-vide">
              <Icon name="globe" size={28} stroke={1.5} />
              <p>Tape une adresse ou une recherche.</p>
              <p className="volet-vide-sous">
                Bientôt, Six naviguera ici pour faire ses recherches, et tu verras chaque page
                qu&apos;il consulte.
              </p>
              {listeVisites}
              {listeLiens('Liens de la discussion')}
            </div>
          )}
        </div>
      ) : (
        <div className="volet-corps volet-fichiers">
          {apercu ? (
            <div className="volet-apercu">
              <button type="button" className="volet-retour" onClick={() => setApercu(null)}>
                <Icon name="back" size={15} stroke={2} /> Fichiers
              </button>
              <h3>{apercu.nom}</h3>
              {apercu.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- image locale (data URL)
                <img className="volet-apercu-image" src={apercu.image} alt={apercu.nom} />
              ) : (
                <pre>{apercu.texte ?? 'Aperçu non disponible pour ce fichier.'}</pre>
              )}
            </div>
          ) : (
            <>
              {info && (
                <p className="volet-info" role="status">
                  {info}
                </p>
              )}
              <Explorateur
                dossier={dossier}
                dossiers={dossiers}
                version={versionEspace}
                onJoindre={onJoindre}
                onInfo={setInfo}
                enDessous={
                  <>
                    {documents.length + reponses.length + liens.length === 0 && (
                      <p className="volet-rien volet-rien-discussion">
                        Les pièces jointes, les réponses de Six et les liens de cette discussion
                        apparaîtront aussi ici.
                      </p>
                    )}
                    {documents.length > 0 && (
                      <div className="volet-liste">
                        <h3>Pièces jointes</h3>
                        {documents.map((d, i) => (
                          <button
                            key={i}
                            type="button"
                            className="volet-ligne"
                            onClick={() => setApercu(d)}
                          >
                            <Icon name="file" size={15} stroke={1.8} />
                            <span>{d.nom}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {reponses.length > 0 && (
                      <div className="volet-liste">
                        <h3>Réponses de Six</h3>
                        {reponses.map(({ m, n }) => (
                          <div key={n} className="volet-ligne">
                            <Icon name="sparkles" size={15} stroke={1.8} />
                            <button
                              type="button"
                              className="volet-ligne-texte"
                              onClick={() => setApercu({ nom: `Réponse ${n}`, texte: m.content })}
                            >
                              {m.content.slice(0, 80)}
                            </button>
                            <button
                              type="button"
                              className="volet-action"
                              aria-label={`Exporter la réponse ${n} en PDF`}
                              title="Exporter en PDF"
                              onClick={() => onExporter(m)}
                            >
                              <Icon name="down" size={15} stroke={2} />
                            </button>
                            <button
                              type="button"
                              className="volet-action"
                              aria-label={`Enregistrer la réponse ${n} dans l'espace de travail`}
                              title="Enregistrer dans l'espace de travail"
                              onClick={() => void enregistrer(m)}
                            >
                              <Icon name="dossier" size={15} stroke={1.9} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {listeLiens('Liens cités')}
                  </>
                }
              />
            </>
          )}
        </div>
      )}
    </aside>
  );
}
