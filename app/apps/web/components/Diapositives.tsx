'use client';

import { useMemo, type CSSProperties } from 'react';
import { poserDiapositive, type Element } from '@/lib/presentation-mise-en-page';
import { theme as themeDe, type Presentation } from '@/lib/presentation';

/**
 * Aperçu d'une présentation : chaque diapositive est dessinée avec la même mise en page que le fichier .pptx
 * (positions en %, tailles de police rapportées à la largeur de la diapositive par les unités de conteneur).
 */
export function Diapositives({
  presentation,
  theme,
}: {
  presentation: Presentation;
  theme: string;
}) {
  const t = themeDe(theme);
  const posees = useMemo(
    () => presentation.diapositives.map((d, i) => poserDiapositive(t, d, i)),
    [presentation, t],
  );
  return (
    <ol className="diapos" aria-label={`${posees.length} diapositives`}>
      {posees.map((p, i) => (
        <li key={i} className="diapo-cadre">
          <div
            className="diapo"
            style={{ background: p.fond }}
            role="img"
            aria-label={`Diapositive ${i + 1} : ${presentation.diapositives[i].titre}`}
          >
            {p.elements.map((e, k) => (
              <ElementDiapo key={k} e={e} />
            ))}
          </div>
          <span className="diapo-numero" aria-hidden="true">
            {i + 1}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Taille de police : points d'une diapositive de 960 pt de large → % de la largeur du conteneur. */
const cqw = (pt: number) => `${(pt / 960) * 100}cqw`;

function ElementDiapo({ e }: { e: Element }) {
  const boite: CSSProperties = {
    left: `${e.x}%`,
    top: `${e.y}%`,
    width: `${e.w}%`,
    height: `${e.h}%`,
  };
  if (e.genre === 'forme') {
    if (e.forme === 'ligne')
      return (
        <svg className="diapo-el" style={{ ...boite, overflow: 'visible' }} aria-hidden="true">
          <line
            x1="0"
            y1="0"
            x2="100%"
            y2="100%"
            stroke={e.contour}
            style={{ strokeWidth: cqw(e.epaisseur ?? 1) }}
          />
        </svg>
      );
    return (
      <span
        className={`diapo-el diapo-${e.forme}`}
        aria-hidden="true"
        style={{
          ...boite,
          background: e.fond ?? 'transparent',
          opacity: e.transparence ? 1 - e.transparence / 100 : undefined,
          border: e.contour ? `${cqw(e.epaisseur ?? 1)} solid ${e.contour}` : undefined,
        }}
      />
    );
  }
  const style: CSSProperties = {
    ...boite,
    color: e.couleur,
    fontFamily: `${e.police}, ${e.police === 'Georgia' ? 'serif' : 'sans-serif'}`,
    fontSize: cqw(e.taille),
    fontWeight: e.gras ? 700 : 400,
    fontStyle: e.italique ? 'italic' : undefined,
    textTransform: e.majuscules ? 'uppercase' : undefined,
    textAlign: e.align ?? 'left',
    justifyContent:
      e.valign === 'middle' ? 'center' : e.valign === 'bottom' ? 'flex-end' : 'flex-start',
  };
  return (
    <div className="diapo-el diapo-texte" style={style}>
      {e.puces ? (
        <ul>
          {e.puces.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      ) : (
        <span>{e.texte}</span>
      )}
    </div>
  );
}
