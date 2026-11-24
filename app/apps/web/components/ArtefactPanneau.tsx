'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Diapositives } from './Diapositives';
import { Icon } from './Icon';
import { THEMES, lirePresentation } from '@/lib/presentation';
import {
  LIBELLE_TYPE,
  iconeArtefact,
  blocsDocument,
  lireTableau,
  nomFichier,
  typeMime,
  type Artefact,
} from '@/lib/artefacts';

/**
 * Panneau d'un artefact (lib/artefacts.ts) : à côté de la discussion sur grand écran (comme le volet de Cosinus,
 * html[data-artefact] dans globals.css), en plein écran sur téléphone. Copier, télécharger, passer d'une version à
 * l'autre ; une page HTML s'affiche dans un cadre isolé (scripts permis, sans accès à l'app ni au réseau de l'app).
 *
 * Chargé à la demande (next/dynamic) : rien de ce code ne pèse sur l'ouverture du Chat.
 */
export default function ArtefactPanneau({
  artefact,
  version: versionInitiale,
  onFermer,
}: {
  artefact: Artefact;
  version?: number;
  onFermer: () => void;
}) {
  const dernier = artefact.versions.length - 1;
  const [version, setVersion] = useState(versionInitiale ?? dernier);
  const [source, setSource] = useState(false); // HTML et tableau : voir le texte brut
  const [copie, setCopie] = useState(false);
  const panneau = useRef<HTMLElement>(null);
  useEffect(() => {
    setVersion(Math.min(versionInitiale ?? dernier, dernier));
    setSource(false);
  }, [artefact.id, versionInitiale, dernier]);
  const contenu = artefact.versions[Math.min(version, dernier)]?.contenu ?? '';
  // Présentation : diapositives lues dans le JSON de Six ; le thème se change ici (aperçu et fichier .pptx).
  const presentation = useMemo(
    () => (artefact.type === 'presentation' ? lirePresentation(contenu) : null),
    [artefact.type, contenu],
  );
  const [theme, setTheme] = useState('');
  useEffect(() => setTheme(presentation?.theme ?? ''), [presentation]);
  const [export_, setExport] = useState<'' | 'encours' | 'erreur'>('');

  useEffect(() => {
    const html = document.documentElement;
    html.dataset.artefact = 'ouvert';
    const surTouche = (e: KeyboardEvent) => e.key === 'Escape' && onFermer();
    document.addEventListener('keydown', surTouche);
    panneau.current?.focus();
    return () => {
      delete html.dataset.artefact;
      document.removeEventListener('keydown', surTouche);
    };
  }, [onFermer]);

  async function copier() {
    try {
      await navigator.clipboard.writeText(contenu);
      setCopie(true);
      setTimeout(() => setCopie(false), 1600);
    } catch {
      setCopie(false);
    }
  }

  async function telechargerPresentation() {
    if (!presentation) return;
    setExport('encours');
    try {
      const { telechargerPptx } = await import('@/lib/pptx');
      await telechargerPptx(presentation, nomFichier(artefact), theme);
      setExport('');
    } catch {
      setExport('erreur');
    }
  }

  function telecharger() {
    if (presentation) {
      void telechargerPresentation();
      return;
    }
    const url = URL.createObjectURL(new Blob([contenu], { type: typeMime(artefact) }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nomFichier(artefact);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const apercu =
    artefact.type === 'html' ||
    artefact.type === 'tableau' ||
    (artefact.type === 'presentation' && presentation !== null);
  return (
    <aside
      ref={panneau}
      className="volet artefact-panneau"
      aria-label={`Artefact : ${artefact.titre}`}
      tabIndex={-1}
    >
      <div className="artefact-tete">
        <span className="artefact-icone" aria-hidden="true">
          <Icon name={iconeArtefact(artefact.type)} />
        </span>
        <div className="grow">
          <h2 className="artefact-titre" title={artefact.titre}>
            {artefact.titre}
          </h2>
          <p className="artefact-sous">
            {LIBELLE_TYPE[artefact.type]}
            {artefact.langage && artefact.type === 'code' ? ` · ${artefact.langage}` : ''}
          </p>
        </div>
        <button
          type="button"
          className="volet-action"
          aria-label="Fermer l’artefact"
          title="Fermer"
          onClick={onFermer}
        >
          <Icon name="x" size={18} />
        </button>
      </div>
      <div className="artefact-barre">
        {artefact.versions.length > 1 && (
          <div className="artefact-versions" role="group" aria-label="Versions">
            <button
              type="button"
              className="volet-action"
              aria-label="Version précédente"
              disabled={version <= 0}
              onClick={() => setVersion((v) => Math.max(0, v - 1))}
            >
              <Icon name="back" size={16} />
            </button>
            <span aria-live="polite">
              Version {Math.min(version, dernier) + 1} sur {artefact.versions.length}
            </span>
            <button
              type="button"
              className="volet-action"
              aria-label="Version suivante"
              disabled={version >= dernier}
              onClick={() => setVersion((v) => Math.min(dernier, v + 1))}
            >
              <Icon name="chevron" size={16} />
            </button>
          </div>
        )}
        {apercu && (
          <div className="artefact-onglets" role="group" aria-label="Affichage">
            <button
              type="button"
              className="volet-onglet"
              aria-pressed={!source}
              onClick={() => setSource(false)}
            >
              {artefact.type === 'html'
                ? 'Aperçu'
                : artefact.type === 'presentation'
                  ? 'Diapositives'
                  : 'Tableau'}
            </button>
            <button
              type="button"
              className="volet-onglet"
              aria-pressed={source}
              onClick={() => setSource(true)}
            >
              {artefact.type === 'html' ? 'Code' : 'Texte'}
            </button>
          </div>
        )}
        {presentation && !source && (
          <label className="artefact-theme">
            <span className="sr">Thème de la présentation</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nom}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="grow" />
        <button
          type="button"
          className="volet-action"
          aria-label={copie ? 'Copié' : 'Copier'}
          title={copie ? 'Copié' : 'Copier'}
          onClick={() => void copier()}
        >
          <Icon name={copie ? 'check' : 'copy'} size={17} />
        </button>
        <button
          type="button"
          className="volet-action"
          aria-label={`Télécharger (${nomFichier(artefact)})`}
          title={presentation ? 'Télécharger en PowerPoint (.pptx)' : 'Télécharger'}
          disabled={export_ === 'encours'}
          onClick={telecharger}
        >
          <Icon name="down" size={17} />
        </button>
      </div>
      {export_ === 'erreur' && (
        <p role="alert" className="seven-erreur artefact-alerte">
          Le fichier PowerPoint n’a pas pu être créé. Réessaie.
        </p>
      )}
      <div className="artefact-corps">
        {presentation && !source ? (
          <Diapositives presentation={presentation} theme={theme || presentation.theme} />
        ) : artefact.type === 'html' && !source ? (
          <iframe
            className="artefact-cadre"
            title={`Aperçu : ${artefact.titre}`}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            srcDoc={contenu}
          />
        ) : artefact.type === 'tableau' && !source ? (
          <Tableau texte={contenu} />
        ) : artefact.type === 'document' ? (
          <Document texte={contenu} />
        ) : (
          <pre className="artefact-code">
            <code>{contenu}</code>
          </pre>
        )}
      </div>
    </aside>
  );
}

function Tableau({ texte }: { texte: string }) {
  const lignes = useMemo(() => lireTableau(texte), [texte]);
  if (!lignes.length) return <p className="volet-rien">Ce tableau est vide.</p>;
  const [entete, ...corps] = lignes;
  return (
    <div className="artefact-tableau">
      <table>
        <thead>
          <tr>
            {entete.map((c, i) => (
              <th key={i} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
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

function Document({ texte }: { texte: string }) {
  const blocs = useMemo(() => blocsDocument(texte), [texte]);
  return (
    <div className="artefact-doc">
      {blocs.map((b, i) => {
        if (b.genre === 'titre') {
          const Titre = b.niveau === 1 ? 'h3' : b.niveau === 2 ? 'h4' : 'h5';
          return <Titre key={i}>{b.texte}</Titre>;
        }
        if (b.genre === 'liste') {
          const Liste = b.ordonnee ? 'ol' : 'ul';
          return (
            <Liste key={i}>
              {b.elements.map((e, j) => (
                <li key={j}>{e}</li>
              ))}
            </Liste>
          );
        }
        if (b.genre === 'code')
          return (
            <pre key={i} className="artefact-code">
              <code>{b.texte}</code>
            </pre>
          );
        return <p key={i}>{b.texte}</p>;
      })}
    </div>
  );
}
