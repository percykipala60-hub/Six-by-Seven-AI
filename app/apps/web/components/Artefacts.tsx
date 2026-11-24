'use client';

import dynamic from 'next/dynamic';
import { Icon } from './Icon';
import {
  LIBELLE_TYPE,
  iconeArtefact,
  retrouver,
  type Artefact,
  type ArtefactExtrait,
  type Morceau,
} from '@/lib/artefacts';

/** Le panneau n'est chargé qu'à la première ouverture d'un artefact (réseau faible : rien de plus au démarrage). */
export const ArtefactPanneau = dynamic(() => import('./ArtefactPanneau'), { ssr: false });

export type ArtefactOuvert = { artefact: Artefact; version: number };

/** Carte d'un artefact dans une bulle de réponse : un appui l'ouvre dans le panneau. */
export function CarteArtefact({
  artefact,
  version,
  incomplet,
  ouvert,
  onOuvrir,
}: {
  artefact: Artefact;
  version: number;
  incomplet?: boolean;
  ouvert?: boolean;
  onOuvrir: () => void;
}) {
  const plusieurs = artefact.versions.length > 1;
  return (
    <button
      type="button"
      className="artefact-carte"
      aria-pressed={ouvert}
      onClick={onOuvrir}
      title="Ouvrir dans le panneau"
    >
      <span className="artefact-icone" aria-hidden="true">
        <Icon name={iconeArtefact(artefact.type)} />
      </span>
      <span className="grow">
        <b>{artefact.titre}</b>
        <span className="artefact-sous">
          {LIBELLE_TYPE[artefact.type]}
          {plusieurs ? ` · version ${version + 1}` : ''}
          {incomplet ? ' · coupé avant la fin' : ''}
        </span>
      </span>
      <Icon name="chevron" size={16} />
    </button>
  );
}

/**
 * Contenu d'une réponse découpée (lib/artefacts.ts, decouper) : le texte comme avant, chaque artefact en carte.
 * `chat` et `artefacts` retrouvent la version gardée qui correspond à ce message.
 */
export function ContenuReponse({
  morceaux,
  chat,
  artefacts,
  ouvert,
  onOuvrir,
}: {
  morceaux: Morceau[];
  chat: string;
  artefacts: Artefact[];
  ouvert?: ArtefactOuvert | null;
  onOuvrir: (a: ArtefactOuvert) => void;
}) {
  return (
    <>
      {morceaux.map((m, i) =>
        m.genre === 'texte' ? (
          <span key={i} className="artefact-texte">
            {m.texte}
          </span>
        ) : (
          <CarteAPartirDe
            key={i}
            extrait={m.artefact}
            chat={chat}
            artefacts={artefacts}
            ouvert={ouvert}
            onOuvrir={onOuvrir}
          />
        ),
      )}
    </>
  );
}

function CarteAPartirDe({
  extrait,
  chat,
  artefacts,
  ouvert,
  onOuvrir,
}: {
  extrait: ArtefactExtrait;
  chat: string;
  artefacts: Artefact[];
  ouvert?: ArtefactOuvert | null;
  onOuvrir: (a: ArtefactOuvert) => void;
}) {
  const r = retrouver(artefacts, chat, extrait);
  return (
    <CarteArtefact
      artefact={r.artefact}
      version={r.version}
      incomplet={extrait.incomplet}
      ouvert={ouvert?.artefact.id === r.artefact.id && ouvert.version === r.version}
      onOuvrir={() => onOuvrir(r)}
    />
  );
}
