'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';

/**
 * Navigateur complet du volet (local) : la page tourne dans Edge sur l'ordinateur (app/api/navigateur).
 * - Images : Edge les diffuse dès que la page change ; on les reçoit en continu (GET, une ligne JSON par image),
 *   rendues à la densité de l'écran et affichées à leur taille réelle, donc nettes.
 * - Souris : survol (effets de survol du site, curseur de la page reproduit), appui et relâchement séparés
 *   (sélection de texte, glisser), double et triple clic. Molette.
 * - Clavier : lettres, touches de navigation et raccourcis courants ; coller passe par le presse-papiers de l'appareil.
 */

type Action =
  | { action: 'ouvrir'; url: string }
  | { action: 'survol'; x: number; y: number }
  | { action: 'appuyer'; x: number; y: number; bouton: 'left' | 'right' | 'middle'; clics: number }
  | { action: 'relacher'; x: number; y: number; bouton: 'left' | 'right' | 'middle'; clics: number }
  | { action: 'defiler'; dx: number; dy: number; x: number; y: number }
  | { action: 'taper'; texte: string }
  | { action: 'touche'; touche: string }
  | { action: 'retour' }
  | { action: 'avant' }
  | { action: 'recharger' }
  | { action: 'fermer' };
type Evenement = { t: 'etat'; url: string; titre: string; charge: boolean } | { t: 'vivant' };

export type PoigneeNavigateur = {
  retour: () => void;
  avant: () => void;
  /** Ouvrir une adresse dans l'onglet actif, même si c'est la même que la précédente (app de bureau). */
  ouvrir?: (url: string) => void;
};

const TOUCHES = new Set([
  'Enter',
  'Backspace',
  'Delete',
  'Tab',
  'Escape',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);
const AVEC_MAJ = new Set(['Tab', 'ArrowLeft', 'ArrowRight']);
const AVEC_CTRL = new Set(['a', 'z', 'y', 'Backspace', 'ArrowLeft', 'ArrowRight']);
const BOUTONS = ['left', 'middle', 'right'] as const;

export function NavigateurComplet({
  url,
  rechargement,
  onAdresse,
  onIndisponible,
  poignee,
  sessionAgent,
}: {
  url: string;
  rechargement: number;
  onAdresse: (url: string) => void;
  onIndisponible: (raison: string) => void;
  poignee?: Ref<PoigneeNavigateur>;
  /** Onglet que Six pilote (outil « naviguer ») : le volet s'y rattache au lieu d'en ouvrir un autre. */
  sessionAgent?: string;
}) {
  const zone = useRef<HTMLDivElement>(null);
  const toile = useRef<HTMLCanvasElement>(null);
  const [session, setSession] = useState<string | undefined>(undefined);
  const sessionRef = useRef<string | undefined>(undefined);
  const [titre, setTitre] = useState('');
  const [charge, setCharge] = useState(true);
  const [curseur, setCurseur] = useState('default');
  const [taille, setTaille] = useState({ largeur: 0, hauteur: 0 });
  const tailleRef = useRef({ largeur: 800, hauteur: 700, densite: 1 });
  const rappels = useRef({ onAdresse, onIndisponible });
  rappels.current = { onAdresse, onIndisponible };
  const derniereUrl = useRef('');

  // Les actions partent dans l'ordre (une à la fois) ; le survol, lui, ne garde que la position la plus récente.
  const file = useRef<Action[]>([]);
  const occupe = useRef(false);
  const survol = useRef<{ x: number; y: number } | null>(null);

  const poster = useCallback(async (a: Action) => {
    const r = await fetch('/api/navigateur', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session: sessionRef.current, ...tailleRef.current, a }),
    }).catch(() => null);
    if (!r) return null;
    if (r.status === 404 || r.status === 503) {
      const d = (await r.json().catch(() => null)) as { error?: string } | null;
      rappels.current.onIndisponible(d?.error ?? 'Navigateur complet indisponible.');
      return null;
    }
    if (r.status === 410 && derniereUrl.current) {
      // Onglet fermé côté ordinateur (inactivité) : on le rouvre à la même adresse.
      sessionRef.current = undefined;
      file.current.unshift({ action: 'ouvrir', url: derniereUrl.current });
      return null;
    }
    if (!r.ok) return null;
    const d = (await r.json()) as { session: string; url: string; curseur?: string };
    if (d.session !== sessionRef.current) {
      sessionRef.current = d.session;
      setSession(d.session);
    }
    if (d.curseur) setCurseur(d.curseur);
    return d;
  }, []);

  const traiter = useCallback(async () => {
    if (occupe.current) return;
    occupe.current = true;
    try {
      while (file.current.length || survol.current) {
        const a: Action = file.current.length
          ? (file.current.shift() as Action)
          : { action: 'survol', ...(survol.current as { x: number; y: number }) };
        if (a.action === 'survol') survol.current = null;
        await poster(a);
      }
    } finally {
      occupe.current = false;
    }
  }, [poster]);

  const envoyer = useCallback(
    (a: Action) => {
      if (a.action === 'survol') survol.current = { x: a.x, y: a.y };
      else file.current.push(a);
      void traiter();
    },
    [traiter],
  );

  useImperativeHandle(
    poignee,
    () => ({
      retour: () => envoyer({ action: 'retour' }),
      avant: () => envoyer({ action: 'avant' }),
    }),
    [envoyer],
  );

  // Flux continu, binaire (voir app/api/navigateur) : [type][longueur][contenu]. Les images JPEG sont décodées hors du
  // fil principal (createImageBitmap) et dessinées sur le canevas à la prochaine image d'écran ; une image arrivée
  // pendant un décodage remplace la précédente (on n'affiche jamais une image en retard).
  useEffect(() => {
    if (!session) return;
    const arret = new AbortController();
    let attente: Blob | null = null;
    let decodage = false;
    let actif = true;
    const dessiner = async () => {
      if (decodage || !attente) return;
      decodage = true;
      const blob = attente;
      attente = null;
      try {
        const bmp = await createImageBitmap(blob);
        requestAnimationFrame(() => {
          const c = toile.current;
          if (actif && c) {
            if (c.width !== bmp.width || c.height !== bmp.height) {
              c.width = bmp.width;
              c.height = bmp.height;
            }
            c.getContext('2d')?.drawImage(bmp, 0, 0);
          }
          bmp.close();
        });
        setCharge((ch) => (ch ? false : ch));
      } catch {
        /* image tronquée : la suivante arrive */
      } finally {
        decodage = false;
        if (attente) void dessiner();
      }
    };
    void (async () => {
      const r = await fetch(`/api/navigateur?session=${session}`, { signal: arret.signal }).catch(
        () => null,
      );
      const lecteur = r?.ok ? r.body?.getReader() : undefined;
      if (!lecteur) return;
      const decodeur = new TextDecoder();
      let tampon = new Uint8Array(0);
      for (;;) {
        const { done, value } = await lecteur
          .read()
          .catch(() => ({ done: true, value: undefined }));
        if (done || !value) break;
        const suite = new Uint8Array(tampon.length + value.length);
        suite.set(tampon);
        suite.set(value, tampon.length);
        tampon = suite;
        let i = 0;
        while (tampon.length - i >= 5) {
          const v = new DataView(tampon.buffer, tampon.byteOffset + i);
          const type = v.getUint8(0);
          const n = v.getUint32(1);
          if (tampon.length - i - 5 < n) break;
          const contenu = tampon.subarray(i + 5, i + 5 + n);
          i += 5 + n;
          if (type === 1) {
            attente = new Blob([contenu.slice(1)], { type: 'image/jpeg' });
            void dessiner();
          } else if (type === 2) {
            let e: Evenement;
            try {
              e = JSON.parse(decodeur.decode(contenu)) as Evenement;
            } catch {
              continue;
            }
            if (e.t !== 'etat') continue;
            setTitre(e.titre);
            if (!e.charge) setCharge(false);
            // Pages internes d'Edge (about:blank, page d'erreur) : l'adresse affichée ne change pas.
            if (/^https?:\/\//.test(e.url) && e.url !== derniereUrl.current) {
              derniereUrl.current = e.url;
              rappels.current.onAdresse(e.url);
            }
          }
        }
        tampon = tampon.slice(i);
      }
    })();
    return () => {
      actif = false;
      arret.abort();
    };
  }, [session]);

  // Taille de la page = taille de la zone d'affichage ; densité = celle de l'écran (2 au plus).
  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    const mesurer = () => {
      const t = {
        largeur: Math.max(320, Math.round(el.clientWidth)),
        hauteur: Math.max(240, Math.round(el.clientHeight)),
        densite: Math.min(2, Math.max(1, Math.round((window.devicePixelRatio || 1) * 4) / 4)),
      };
      tailleRef.current = t;
      setTaille({ largeur: t.largeur, hauteur: t.hauteur });
    };
    mesurer();
    let t: ReturnType<typeof setTimeout> | undefined;
    const obs = new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => {
        mesurer();
        // N'importe quelle action transmet la nouvelle taille ; un survol dans le coin ne change rien à la page.
        if (sessionRef.current)
          envoyer({ action: 'survol', x: tailleRef.current.largeur - 1, y: 0 });
      }, 200);
    });
    obs.observe(el);
    return () => {
      obs.disconnect();
      clearTimeout(t);
    };
  }, [envoyer]);

  // Rattachement à l'onglet de Six (déclaré avant l'effet d'adresse : il passe en premier).
  useEffect(() => {
    if (!sessionAgent || sessionAgent === sessionRef.current) return;
    sessionRef.current = sessionAgent;
    derniereUrl.current = url;
    setSession(sessionAgent);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seulement quand l'onglet de Six change
  }, [sessionAgent]);

  // Nouvelle adresse tapée dans la barre (pas celle où la page est allée d'elle-même).
  useEffect(() => {
    if (!url || url === derniereUrl.current) return;
    setCharge(true);
    derniereUrl.current = url;
    envoyer({ action: 'ouvrir', url });
  }, [url, envoyer]);

  const premierRechargement = useRef(rechargement);
  useEffect(() => {
    if (rechargement !== premierRechargement.current) {
      setCharge(true);
      envoyer({ action: 'recharger' });
    }
  }, [rechargement, envoyer]);

  // Onglet fermé côté ordinateur quand on quitte le navigateur complet.
  useEffect(
    () => () => {
      const s = sessionRef.current;
      if (s)
        void fetch('/api/navigateur', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ session: s, a: { action: 'fermer' } }),
          keepalive: true,
        }).catch(() => {});
    },
    [],
  );

  const position = (e: { clientX: number; clientY: number }) => {
    const r = zone.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 0, y: 0 };
  };

  // Molette : les mouvements s'additionnent sur une image d'écran.
  const molette = useRef({ dx: 0, dy: 0, x: 0, y: 0, rendu: 0 });
  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    const surMolette = (e: WheelEvent) => {
      e.preventDefault();
      const m = molette.current;
      const f = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? tailleRef.current.hauteur : 1;
      m.dx += e.deltaX * f;
      m.dy += e.deltaY * f;
      const r = el.getBoundingClientRect();
      m.x = e.clientX - r.left;
      m.y = e.clientY - r.top;
      if (m.rendu) return;
      m.rendu = requestAnimationFrame(() => {
        m.rendu = 0;
        envoyer({ action: 'defiler', dx: m.dx, dy: m.dy, x: m.x, y: m.y });
        m.dx = 0;
        m.dy = 0;
      });
    };
    el.addEventListener('wheel', surMolette, { passive: false });
    return () => el.removeEventListener('wheel', surMolette);
  }, [envoyer]);

  const souris = (type: 'appuyer' | 'relacher') => (e: React.PointerEvent) => {
    if (e.button > 2) return;
    e.preventDefault();
    if (type === 'appuyer') {
      zone.current?.focus({ preventScroll: true });
      zone.current?.setPointerCapture(e.pointerId);
    }
    envoyer({
      action: type,
      ...position(e),
      bouton: BOUTONS[e.button] ?? 'left',
      clics: Math.min(3, Math.max(1, e.detail || 1)),
    });
  };

  // Frappe : les lettres partent groupées sur une image d'écran, dans l'ordre.
  const tampon = useRef({ texte: '', rendu: 0 });
  const viderTampon = useCallback(() => {
    const b = tampon.current;
    cancelAnimationFrame(b.rendu);
    b.rendu = 0;
    if (b.texte) envoyer({ action: 'taper', texte: b.texte });
    b.texte = '';
  }, [envoyer]);
  const clavier = (e: React.KeyboardEvent) => {
    if (e.altKey || e.metaKey) return;
    if (e.ctrlKey) {
      // Ctrl+V : laissé au navigateur, qui déclenche « coller » ci-dessous.
      if (!AVEC_CTRL.has(e.key)) return;
      e.preventDefault();
      viderTampon();
      envoyer({ action: 'touche', touche: `Control+${e.key}` });
      return;
    }
    if (e.key.length === 1) {
      e.preventDefault();
      const b = tampon.current;
      b.texte = (b.texte + e.key).slice(0, 500);
      b.rendu ||= requestAnimationFrame(viderTampon);
    } else if (TOUCHES.has(e.key)) {
      // Échap va à la page, pas à la fermeture du volet.
      e.preventDefault();
      viderTampon();
      envoyer({
        action: 'touche',
        touche: e.shiftKey && AVEC_MAJ.has(e.key) ? `Shift+${e.key}` : e.key,
      });
    }
  };
  const coller = (e: React.ClipboardEvent) => {
    const texte = e.clipboardData.getData('text').slice(0, 500);
    if (!texte) return;
    e.preventDefault();
    viderTampon();
    envoyer({ action: 'taper', texte });
  };

  /* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
  return (
    // La zone reçoit souris et clavier pour les transmettre à la page : c'est une application au sens ARIA
    // (la règle de lint ne connaît pas ce rôle comme interactif).
    <div
      ref={zone}
      className="volet-complet"
      role="application"
      aria-label={`Page ${titre || url} (clique, fais défiler et tape comme dans un navigateur)`}
      tabIndex={0}
      style={{ cursor: curseur }}
      onKeyDown={clavier}
      onPaste={coller}
      onPointerDown={souris('appuyer')}
      onPointerUp={souris('relacher')}
      onPointerMove={(e) => envoyer({ action: 'survol', ...position(e) })}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas
        ref={toile}
        aria-hidden="true"
        style={{ width: taille.largeur || undefined, height: taille.hauteur || undefined }}
      />
      {charge && <span className="volet-complet-charge" aria-hidden="true" />}
    </div>
  );
  /* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
}
