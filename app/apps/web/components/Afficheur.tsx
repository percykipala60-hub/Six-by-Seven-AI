'use client';
/* eslint-disable jsx-a11y/media-has-caption -- vidéos et sons de la personne lus sur l'appareil : aucun sous-titre n'existe */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { lireDocx, type BlocDocx } from '@/lib/docx';
import { lirePptx, type Diapo } from '@/lib/lire-pptx';
import { genreApercu, lireCsv, ressembleATexte } from '@/lib/arbre';
import { lireXlsx, type Feuille } from '@/lib/xlsx';
import { contenuZip } from '@/lib/zip';
import { recuperer, useSourceMedia } from '@/lib/recuperer';

/**
 * Afficheur interne de Six, comme le panneau de fichiers de Claude : chaque fichier s'ouvre dans l'app, sans passer
 * par Edge, Word ou PowerPoint.
 * - photo (SVG compris, affiché comme une image : son script ne s'exécute pas) ; vidéo et audio : le lecteur ;
 * - PDF : les pages (pdf.js) ; Word : une page blanche avec titres, listes et tableaux ;
 * - Excel : chaque feuille en tableau (valeurs enregistrées) ; ZIP : la liste de son contenu ;
 * - PowerPoint : une diapositive par carte 16:9 (titre et texte ; images et animations non reproduites) ;
 * - Markdown : mis en forme ; CSV : un tableau ; texte et code : avec numéros de ligne ;
 * - un autre fichier s'affiche en texte s'il en contient ; sinon, « pas d'aperçu ».
 * Rien n'est jamais exécuté (une page HTML s'affiche comme du texte). « Ouvrir ailleurs » reste en secours.
 */

const PAGES_MAX = 60;
const TEXTE_MAX = 400_000;

export function Afficheur({ nom, url }: { nom: string; url: string }) {
  const genre = genreApercu(nom);
  // Fichiers du Cloud : lus avec la session du compte (blob: pour les images, vidéos et sons).
  const media = useSourceMedia(url);
  return (
    <div className="afficheur">
      {genre === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element -- fichier local de l'espace
        media && <img className="afficheur-image" src={media} alt={nom} />
      ) : genre === 'video' ? (
        media && <video className="afficheur-media" src={media} controls preload="metadata" />
      ) : genre === 'audio' ? (
        media && <audio className="afficheur-audio" src={media} controls preload="metadata" />
      ) : genre === 'tableur' ? (
        <AfficheurXlsx url={url} />
      ) : genre === 'archive' ? (
        <AfficheurZip url={url} />
      ) : genre === 'pdf' ? (
        <AfficheurPdf url={url} />
      ) : genre === 'docx' ? (
        <AfficheurDocx url={url} />
      ) : genre === 'pptx' ? (
        <AfficheurPptx url={url} />
      ) : genre === 'markdown' || genre === 'tableau' || genre === 'texte' ? (
        <AfficheurTexte url={url} genre={genre} />
      ) : (
        <AfficheurInconnu url={url} />
      )}
      {media && (
        <a className="afficheur-ailleurs" href={media} target="_blank" rel="noopener noreferrer">
          Ouvrir ailleurs
        </a>
      )}
    </div>
  );
}

/** Charge un fichier (octets ou texte) et suit l'état de chargement. */
function useFichier<T>(url: string, lire: (r: Response) => Promise<T>) {
  const [donnees, setDonnees] = useState<T | null>(null);
  const [erreur, setErreur] = useState('');
  const lireRef = useRef(lire);
  lireRef.current = lire;
  useEffect(() => {
    let annule = false;
    setDonnees(null);
    setErreur('');
    recuperer(url)
      .then((r) => {
        if (!r.ok) throw new Error('fichier introuvable.');
        return lireRef.current(r);
      })
      .then((d) => !annule && setDonnees(d))
      .catch((e: unknown) => {
        if (!annule)
          setErreur(`Lecture impossible : ${e instanceof Error ? e.message : 'réessayez.'}`);
      });
    return () => {
      annule = true;
    };
  }, [url]);
  return { donnees, erreur };
}

function AfficheurPdf({ url }: { url: string }) {
  const zone = useRef<HTMLDivElement>(null);
  const [etat, setEtat] = useState<'chargement' | 'ok' | string>('chargement');
  const [pages, setPages] = useState(0);
  useEffect(() => {
    let annule = false;
    let detruire: (() => Promise<void>) | undefined;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();
        const r = await recuperer(url);
        if (!r.ok) throw new Error('Fichier introuvable.');
        const chargement = pdfjs.getDocument({ data: await r.arrayBuffer() });
        detruire = () => chargement.destroy();
        const doc = await chargement.promise;
        if (annule || !zone.current) return;
        const total = Math.min(doc.numPages, PAGES_MAX);
        setPages(doc.numPages);
        setEtat('ok');
        const largeur = Math.max(240, zone.current.clientWidth - 2);
        const densite = Math.min(2, window.devicePixelRatio || 1);
        for (let n = 1; n <= total && !annule; n++) {
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const vue = page.getViewport({ scale: (largeur / base.width) * densite });
          const toile = document.createElement('canvas');
          toile.width = Math.floor(vue.width);
          toile.height = Math.floor(vue.height);
          toile.style.width = `${Math.floor(vue.width / densite)}px`;
          toile.setAttribute('aria-label', `Page ${n}`);
          toile.setAttribute('role', 'img');
          const ctx = toile.getContext('2d');
          if (!ctx) break;
          zone.current?.appendChild(toile);
          await page.render({ canvas: toile, canvasContext: ctx, viewport: vue }).promise;
        }
      } catch (e) {
        if (!annule) setEtat(e instanceof Error ? e.message : 'Lecture du PDF impossible.');
      }
    })();
    const z = zone.current;
    return () => {
      annule = true;
      void detruire?.();
      z?.replaceChildren();
    };
  }, [url]);
  return (
    <>
      {etat === 'chargement' && <p className="volet-rien">Ouverture du PDF…</p>}
      {etat !== 'chargement' && etat !== 'ok' && <p className="volet-rien">{etat}</p>}
      {pages > PAGES_MAX && (
        <p className="volet-rien">
          Les {PAGES_MAX} premières pages sont affichées (sur {pages}).
        </p>
      )}
      <div ref={zone} className="afficheur-pdf" />
    </>
  );
}

function AfficheurDocx({ url }: { url: string }) {
  const { donnees: blocs, erreur } = useFichier<BlocDocx[]>(url, async (r) =>
    lireDocx(await r.arrayBuffer()),
  );
  if (erreur) return <p className="volet-rien">{erreur}</p>;
  if (!blocs) return <p className="volet-rien">Ouverture du document…</p>;
  if (!blocs.length) return <p className="volet-rien">Ce document ne contient pas de texte.</p>;
  // Tableaux : les lignes qui se suivent forment un seul tableau, comme dans Word.
  const elements: ReactNode[] = [];
  let tableau: string[][] = [];
  const fermerTableau = (cle: number) => {
    if (!tableau.length) return;
    elements.push(<Tableau key={`t${cle}`} lignes={tableau} entete />);
    tableau = [];
  };
  blocs.forEach((b, i) => {
    if (b.type === 'tableau') {
      tableau.push(b.cellules);
      return;
    }
    fermerTableau(i);
    if (b.type === 'titre') {
      const Balise = `h${Math.min(6, b.niveau + 1)}` as 'h2';
      elements.push(<Balise key={i}>{b.texte}</Balise>);
    } else if (b.type === 'liste')
      elements.push(
        <p key={i} className="afficheur-puce">
          {b.texte}
        </p>,
      );
    else elements.push(<p key={i}>{b.texte}</p>);
  });
  fermerTableau(blocs.length);
  return <article className="afficheur-page">{elements}</article>;
}

function AfficheurPptx({ url }: { url: string }) {
  const { donnees: diapos, erreur } = useFichier<Diapo[]>(url, async (r) =>
    lirePptx(await r.arrayBuffer()),
  );
  if (erreur) return <p className="volet-rien">{erreur}</p>;
  if (!diapos) return <p className="volet-rien">Ouverture de la présentation…</p>;
  return (
    <div className="afficheur-diapos">
      {diapos.map((d) => (
        <section key={d.numero} className="afficheur-diapo" aria-label={`Diapositive ${d.numero}`}>
          <span className="afficheur-diapo-numero">{d.numero}</span>
          {d.titre && <h3>{d.titre}</h3>}
          {d.lignes.length > 0 && (
            <ul>
              {d.lignes.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function AfficheurTexte({ url, genre }: { url: string; genre: 'markdown' | 'tableau' | 'texte' }) {
  const { donnees: texte, erreur } = useFichier<string>(url, async (r) =>
    (await r.text()).slice(0, TEXTE_MAX),
  );
  if (erreur) return <p className="volet-rien">{erreur}</p>;
  if (texte === null) return <p className="volet-rien">Ouverture…</p>;
  if (genre === 'markdown') return <article className="afficheur-page">{markdown(texte)}</article>;
  if (genre === 'tableau') return <Tableau lignes={lireCsv(texte)} entete />;
  const lignes = texte.split(/\r?\n/);
  return (
    <pre className="afficheur-code">
      {lignes.map((l, i) => (
        <span key={i} className="afficheur-code-ligne">
          <span className="afficheur-code-numero" aria-hidden="true">
            {i + 1}
          </span>
          <span>{l || ' '}</span>
        </span>
      ))}
    </pre>
  );
}

function AfficheurXlsx({ url }: { url: string }) {
  const { donnees: feuilles, erreur } = useFichier<Feuille[]>(url, async (r) =>
    lireXlsx(await r.arrayBuffer()),
  );
  const [n, setN] = useState(0);
  if (erreur) return <p className="volet-rien">{erreur}</p>;
  if (!feuilles) return <p className="volet-rien">Ouverture du classeur…</p>;
  if (!feuilles.length) return <p className="volet-rien">Classeur vide.</p>;
  const f = feuilles[Math.min(n, feuilles.length - 1)];
  return (
    <div className="afficheur-classeur">
      {feuilles.length > 1 && (
        <div className="afficheur-feuilles" role="tablist">
          {feuilles.map((x, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === n}
              onClick={() => setN(i)}
            >
              {x.nom}
            </button>
          ))}
        </div>
      )}
      {f.lignes.length ? (
        <Tableau lignes={f.lignes} />
      ) : (
        <p className="volet-rien">Feuille vide.</p>
      )}
    </div>
  );
}

function AfficheurZip({ url }: { url: string }) {
  const { donnees: contenu, erreur } = useFichier(url, async (r) =>
    contenuZip(await r.arrayBuffer()),
  );
  if (erreur) return <p className="volet-rien">{erreur}</p>;
  if (!contenu) return <p className="volet-rien">Ouverture de l&apos;archive…</p>;
  return (
    <div className="afficheur-tableau-cadre">
      <p className="volet-rien">
        {contenu.length} élément{contenu.length > 1 ? 's' : ''} dans l&apos;archive (rien n&apos;est
        extrait).
      </p>
      <Tableau
        entete
        lignes={[
          ['Nom', 'Taille'],
          ...contenu
            .slice(0, 500)
            .map((e) => [
              e.nom,
              e.nom.endsWith('/') ? '' : `${Math.max(1, Math.round(e.taille / 1024))} Ko`,
            ]),
        ]}
      />
    </div>
  );
}

/** Type inconnu : affiché en texte s'il en contient (fichier de configuration, code…), sinon pas d'aperçu. */
function AfficheurInconnu({ url }: { url: string }) {
  const { donnees, erreur } = useFichier<{ texte: string | null }>(url, async (r) => {
    const octets = new Uint8Array(await r.arrayBuffer());
    return {
      texte: ressembleATexte(octets)
        ? new TextDecoder().decode(octets.subarray(0, TEXTE_MAX))
        : null,
    };
  });
  if (erreur) return <p className="volet-rien">{erreur}</p>;
  if (!donnees) return <p className="volet-rien">Ouverture…</p>;
  return <AfficheurTexteBrut texte={donnees.texte} />;
}

function AfficheurTexteBrut({ texte }: { texte: string | null }) {
  if (texte === null)
    return <p className="volet-rien">Pas d&apos;aperçu pour ce type de fichier.</p>;
  return (
    <pre className="afficheur-code">
      {texte.split(/\r?\n/).map((l, i) => (
        <span key={i} className="afficheur-code-ligne">
          <span className="afficheur-code-numero" aria-hidden="true">
            {i + 1}
          </span>
          <span>{l || ' '}</span>
        </span>
      ))}
    </pre>
  );
}

function Tableau({ lignes, entete }: { lignes: string[][]; entete?: boolean }) {
  if (!lignes.length) return <p className="volet-rien">Tableau vide.</p>;
  const [tete, ...corps] = entete ? lignes : [[], ...lignes];
  return (
    <div className="afficheur-tableau-cadre">
      <table className="afficheur-tableau">
        {tete.length > 0 && (
          <thead>
            <tr>
              {tete.map((c, i) => (
                <th key={i}>{c}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {corps.map((l, i) => (
            <tr key={i}>
              {l.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Gras (**texte**) dans une ligne de Markdown. */
function enLigne(t: string): ReactNode[] {
  return t
    .split(/(\*\*[^*]+\*\*)/g)
    .map((m, i) =>
      /^\*\*[^*]+\*\*$/.test(m) ? <strong key={i}>{m.slice(2, -2)}</strong> : m.replace(/`/g, ''),
    );
}

/** Markdown simple → éléments React (titres, listes, citations, tableaux, paragraphes), sans HTML brut. */
function markdown(md: string): ReactNode[] {
  const sortie: ReactNode[] = [];
  const lignes = md.split(/\r?\n/);
  let i = 0;
  while (i < lignes.length) {
    const l = lignes[i];
    const titre = /^(#{1,6})\s+(.*)$/.exec(l);
    if (titre) {
      const Balise = `h${Math.min(6, titre[1].length + 1)}` as 'h2';
      sortie.push(<Balise key={i}>{enLigne(titre[2])}</Balise>);
      i++;
    } else if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) {
      const items: string[] = [];
      const numerotee = /^\s*\d+[.)]/.test(l);
      while (i < lignes.length && /^\s*([-*•]|\d+[.)])\s+/.test(lignes[i]))
        items.push(lignes[i++].replace(/^\s*([-*•]|\d+[.)])\s+/, ''));
      const Liste = numerotee ? 'ol' : 'ul';
      sortie.push(
        <Liste key={i}>
          {items.map((t, k) => (
            <li key={k}>{enLigne(t)}</li>
          ))}
        </Liste>,
      );
    } else if (/^\s*\|/.test(l)) {
      const rangees: string[][] = [];
      while (i < lignes.length && /^\s*\|/.test(lignes[i])) {
        const r = lignes[i++]
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim());
        if (!r.every((c) => /^:?-{2,}:?$/.test(c))) rangees.push(r);
      }
      sortie.push(<Tableau key={i} lignes={rangees} entete />);
    } else if (/^>\s?/.test(l)) {
      sortie.push(<blockquote key={i}>{enLigne(l.replace(/^>\s?/, ''))}</blockquote>);
      i++;
    } else if (!l.trim()) i++;
    else {
      const para: string[] = [];
      while (
        i < lignes.length &&
        lignes[i].trim() &&
        !/^(#{1,6}\s|\s*([-*•]|\d+[.)])\s|\s*\||>)/.test(lignes[i])
      )
        para.push(lignes[i++]);
      sortie.push(<p key={i}>{enLigne(para.join(' '))}</p>);
    }
  }
  return sortie;
}
