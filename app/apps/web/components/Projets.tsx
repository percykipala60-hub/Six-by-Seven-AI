'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppBar } from './AppBar';
import { ArtefactPanneau, CarteArtefact, type ArtefactOuvert } from './Artefacts';
import { useConfirmer } from './Confirmer';
import { Icon } from './Icon';
import {
  artefactsDuProjet,
  detacherDuProjet,
  ecouterArtefacts,
  lireArtefacts,
} from '@/lib/artefacts';
import { lireTexteFichier } from '@/lib/lire-document';
import { memoireActive } from '@/lib/memoire';
import {
  DOCS_MAX,
  INSTRUCTIONS_MAX,
  NOM_MAX,
  ajouterDocument,
  creerProjet,
  ecouterProjets,
  ecrireInstructions,
  lireProjets,
  renommerProjet,
  retirerDocument,
  supprimerProjet,
  type Projet,
} from '@/lib/projets';
import {
  chatsDuProjet,
  ecouterChats,
  lireChats,
  rangerChat,
  sortirDuProjet,
  type ChatSeven,
} from '@/lib/seven-chats';

const FICHIER_MAX = 20 * 1024 * 1024;

/**
 * Projets : regrouper des discussions (Chat, Cosinus) avec des consignes et des documents que Six garde en tête dans
 * chaque réponse, et retrouver les artefacts produits. /projets : la liste ; /projets?p=… : un projet.
 */
export function ProjetsPage() {
  const params = useSearchParams();
  const ouvert = params.get('p') ?? '';
  const [projets, setProjets] = useState<Projet[]>([]);
  const [chats, setChats] = useState<ChatSeven[]>([]);
  const [pret, setPret] = useState(false);
  useEffect(() => {
    const lire = () => {
      setProjets(lireProjets());
      setPret(true);
    };
    lire();
    return ecouterProjets(lire);
  }, []);
  useEffect(() => {
    const lire = () => setChats(lireChats());
    lire();
    return ecouterChats(lire);
  }, []);
  const projet = ouvert ? projets.find((p) => p.id === ouvert) : undefined;

  return (
    <>
      <AppBar page="projets" titre={projet ? projet.nom : 'Projets'} />
      <main className="screen projets-ecran">
        {ouvert && pret && !projet ? (
          <div className="projets-vide card dash">
            <p>Ce projet n’existe plus sur cet appareil.</p>
            <Link href="/projets" className="btn ghost small">
              Voir mes projets
            </Link>
          </div>
        ) : projet ? (
          <DetailProjet key={projet.id} projet={projet} chats={chats} />
        ) : (
          <ListeProjets projets={projets} chats={chats} />
        )}
      </main>
    </>
  );
}

function ListeProjets({ projets, chats }: { projets: Projet[]; chats: ChatSeven[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [nom, setNom] = useState('');
  const [erreur, setErreur] = useState('');
  const champ = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (params.get('nouveau')) champ.current?.focus();
  }, [params]);

  function creer(e: FormEvent) {
    e.preventDefault();
    const p = creerProjet(nom);
    if (!p) {
      setErreur(
        nom.trim() ? 'L’appareil n’a plus de place. Efface un projet.' : 'Donne un nom au projet.',
      );
      return;
    }
    setNom('');
    router.push(`/projets?p=${encodeURIComponent(p.id)}`);
  }

  return (
    <>
      <header className="projets-tete">
        <h1>Projets</h1>
        <p className="muted">
          Range tes discussions par sujet. Les consignes et les documents d’un projet accompagnent
          chacune de tes questions.
        </p>
      </header>
      <form className="projets-creer" onSubmit={creer}>
        <label htmlFor="projet-nom" className="sr">
          Nom du nouveau projet
        </label>
        <input
          ref={champ}
          id="projet-nom"
          type="text"
          value={nom}
          maxLength={NOM_MAX}
          placeholder="Nom du projet, par exemple « Mémoire de fin d’études »"
          onChange={(e) => {
            setNom(e.target.value);
            setErreur('');
          }}
        />
        <button type="submit" className="btn primary small" disabled={!nom.trim()}>
          <Icon name="plus" size={18} /> Créer
        </button>
      </form>
      {erreur && (
        <p role="alert" className="seven-erreur">
          {erreur}
        </p>
      )}
      {projets.length === 0 ? (
        <div className="projets-vide card dash">
          <Icon name="dossier" size={28} stroke={1.5} />
          <p>Aucun projet pour l’instant. Crée le premier ci-dessus.</p>
        </div>
      ) : (
        <ul className="projets-liste">
          {projets.map((p) => {
            const n = chatsDuProjet(p.id, chats).length;
            return (
              <li key={p.id}>
                <Link href={`/projets?p=${encodeURIComponent(p.id)}`} className="card projet-carte">
                  <span className="projet-carte-icone" aria-hidden="true">
                    <Icon name="dossier" size={20} stroke={1.75} />
                  </span>
                  <span className="grow">
                    <b>{p.nom}</b>
                    <span className="muted small">
                      {n} discussion{n > 1 ? 's' : ''} · {p.documents.length} document
                      {p.documents.length > 1 ? 's' : ''} · {dateCourte(p.maj)}
                    </span>
                  </span>
                  <Icon name="chevron" size={18} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function DetailProjet({ projet, chats }: { projet: Projet; chats: ChatSeven[] }) {
  const router = useRouter();
  const [demande, demander] = useConfirmer();
  const [renommer, setRenommer] = useState(false);
  const [nom, setNom] = useState(projet.nom);
  const [consignes, setConsignes] = useState(projet.instructions);
  const [etatConsignes, setEtatConsignes] = useState<'' | 'enregistre'>('');
  const [erreur, setErreur] = useState('');
  const [lecture, setLecture] = useState(false);
  const [aRanger, setARanger] = useState('');
  const [artefacts, setArtefacts] = useState(() => artefactsDuProjet(projet.id));
  const [artefactOuvert, setArtefactOuvert] = useState<ArtefactOuvert | null>(null);
  const fermerArtefact = useCallback(() => setArtefactOuvert(null), []);
  const fichiers = useRef<HTMLInputElement>(null);
  const champNom = useRef<HTMLInputElement>(null);
  const memoire = memoireActive();
  // « Renommer » : le champ prend le focus dès qu'il apparaît.
  useEffect(() => {
    if (renommer) champNom.current?.focus();
  }, [renommer]);

  useEffect(() => {
    const lire = () => setArtefacts(artefactsDuProjet(projet.id, lireArtefacts()));
    lire();
    return ecouterArtefacts(lire);
  }, [projet.id]);

  const discussions = chatsDuProjet(projet.id, chats);
  const horsProjet = chats.filter((c) => !c.projet);

  function enregistrerNom(e?: FormEvent) {
    e?.preventDefault();
    if (nom.trim() && nom.trim() !== projet.nom) renommerProjet(projet.id, nom);
    else setNom(projet.nom);
    setRenommer(false);
  }

  function enregistrerConsignes() {
    if (consignes === projet.instructions) return;
    ecrireInstructions(projet.id, consignes);
    setEtatConsignes('enregistre');
    setTimeout(() => setEtatConsignes(''), 1800);
  }

  async function ajouter(liste: FileList | null) {
    const tous = Array.from(liste ?? []);
    if (!tous.length) return;
    setErreur('');
    setLecture(true);
    for (const f of tous) {
      try {
        if (f.size > FICHIER_MAX) throw new Error('le fichier dépasse 20 Mo.');
        const texte = await lireTexteFichier(f);
        const e = ajouterDocument(projet.id, f.name, texte);
        if (e) throw new Error(e.charAt(0).toLowerCase() + e.slice(1));
      } catch (e) {
        setErreur(
          `« ${f.name} » n’a pas été ajouté : ${e instanceof Error ? e.message : 'réessaie.'}`,
        );
        break;
      }
    }
    setLecture(false);
    if (fichiers.current) fichiers.current.value = '';
  }

  return (
    <>
      {demande}
      <header className="projets-tete">
        {renommer ? (
          <form className="projets-creer" onSubmit={enregistrerNom}>
            <label htmlFor="projet-renommer" className="sr">
              Nouveau nom du projet
            </label>
            <input
              id="projet-renommer"
              type="text"
              value={nom}
              ref={champNom}
              maxLength={NOM_MAX}
              onChange={(e) => setNom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setNom(projet.nom);
                  setRenommer(false);
                }
              }}
            />
            <button type="submit" className="btn primary small">
              Enregistrer
            </button>
          </form>
        ) : (
          <div className="row">
            <h1 className="grow">{projet.nom}</h1>
            <button
              type="button"
              className="volet-action"
              aria-label="Renommer le projet"
              title="Renommer"
              onClick={() => setRenommer(true)}
            >
              <Icon name="pencil" size={17} />
            </button>
          </div>
        )}
        <Link href="/projets" className="projets-retour">
          <Icon name="back" size={15} /> Tous les projets
        </Link>
      </header>

      <div className="projets-actions">
        <Link href={`/chat?projet=${encodeURIComponent(projet.id)}`} className="btn primary small">
          <Icon name="discuter" size={18} /> Nouvelle discussion
        </Link>
        <Link href={`/cosinus?projet=${encodeURIComponent(projet.id)}`} className="btn ghost small">
          <Icon name="sixtouch" size={18} /> Confier un travail
        </Link>
      </div>

      <section className="projets-section" aria-labelledby="projet-consignes">
        <h2 id="projet-consignes">Consignes</h2>
        <p className="muted small">
          Ce que Six doit toujours savoir dans ce projet : ton rôle, le ton, le format attendu.
        </p>
        <textarea
          value={consignes}
          maxLength={INSTRUCTIONS_MAX}
          rows={4}
          aria-labelledby="projet-consignes"
          placeholder="Par exemple : je prépare un mémoire en économie à l’UNIKIN. Réponds avec des références et un plan clair."
          onChange={(e) => setConsignes(e.target.value)}
          onBlur={enregistrerConsignes}
        />
        <p className="projets-compte muted small" aria-live="polite">
          {etatConsignes === 'enregistre'
            ? 'Consignes enregistrées.'
            : `${consignes.length} / ${INSTRUCTIONS_MAX}`}
        </p>
      </section>

      <section className="projets-section" aria-labelledby="projet-documents">
        <h2 id="projet-documents">Documents</h2>
        <p className="muted small">
          Texte ou PDF, lus sur ton appareil. Six s’appuie dessus pour répondre ({DOCS_MAX} au
          plus).
        </p>
        {projet.documents.length > 0 && (
          <ul className="projets-lignes">
            {projet.documents.map((d) => (
              <li key={d.id} className="projets-ligne">
                <Icon name="file" size={17} stroke={1.75} />
                <span className="grow" title={d.nom}>
                  {d.nom}
                  <span className="muted small">
                    {' '}
                    · {Math.ceil(d.texte.length / 1000)} k caractères
                  </span>
                </span>
                <button
                  type="button"
                  className="drawer-chat-effacer"
                  aria-label={`Retirer « ${d.nom} »`}
                  title="Retirer"
                  onClick={() => retirerDocument(projet.id, d.id)}
                >
                  <Icon name="trash" size={15} stroke={1.75} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          ref={fichiers}
          type="file"
          accept=".txt,.md,.csv,.json,.log,.pdf"
          multiple
          className="seven-doc-input"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => void ajouter(e.target.files)}
        />
        <button
          type="button"
          className="btn ghost small"
          disabled={lecture || projet.documents.length >= DOCS_MAX}
          onClick={() => fichiers.current?.click()}
        >
          <Icon name="plus" size={18} /> {lecture ? 'Lecture du document…' : 'Ajouter un document'}
        </button>
        {erreur && (
          <p role="alert" className="seven-erreur">
            {erreur}
          </p>
        )}
      </section>

      <section className="projets-section" aria-labelledby="projet-discussions">
        <h2 id="projet-discussions">Discussions</h2>
        {!memoire && (
          <p className="muted small">
            La mémoire de Six est coupée : les discussions ne sont pas gardées. Active-la dans
            Réglages → Mémoire.
          </p>
        )}
        {discussions.length === 0 ? (
          <p className="muted small">Aucune discussion dans ce projet pour l’instant.</p>
        ) : (
          <ul className="projets-lignes">
            {discussions.map((c) => (
              <li key={c.id} className="projets-ligne">
                <Icon
                  name={c.mode === 'sixtouch' ? 'sixtouch' : 'discuter'}
                  size={17}
                  stroke={1.75}
                />
                <Link
                  href={`${c.mode === 'sixtouch' ? '/cosinus' : '/chat'}?c=${encodeURIComponent(c.id)}`}
                  className="grow projets-lien"
                  title={c.titre}
                >
                  {c.titre}
                </Link>
                <button
                  type="button"
                  className="drawer-chat-effacer"
                  aria-label={`Sortir « ${c.titre} » du projet`}
                  title="Sortir du projet"
                  onClick={() => rangerChat(c.id, '')}
                >
                  <Icon name="x" size={15} stroke={1.75} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {horsProjet.length > 0 && (
          <form
            className="projets-ranger"
            onSubmit={(e) => {
              e.preventDefault();
              if (aRanger) rangerChat(aRanger, projet.id);
              setARanger('');
            }}
          >
            <label htmlFor="projet-ranger" className="sr">
              Ranger une discussion dans ce projet
            </label>
            <select id="projet-ranger" value={aRanger} onChange={(e) => setARanger(e.target.value)}>
              <option value="">Ranger une discussion existante…</option>
              {horsProjet.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.mode === 'sixtouch' ? 'Cosinus · ' : 'Chat · '}
                  {c.titre}
                </option>
              ))}
            </select>
            <button type="submit" className="btn ghost small" disabled={!aRanger}>
              Ranger
            </button>
          </form>
        )}
      </section>

      <section className="projets-section" aria-labelledby="projet-artefacts">
        <h2 id="projet-artefacts">Artefacts</h2>
        {artefacts.length === 0 ? (
          <p className="muted small">
            Les documents, codes, pages et tableaux que Six produit dans ce projet apparaîtront ici.
          </p>
        ) : (
          <div className="projets-artefacts">
            {artefacts.map((a) => (
              <CarteArtefact
                key={a.id}
                artefact={a}
                version={a.versions.length - 1}
                ouvert={artefactOuvert?.artefact.id === a.id}
                onOuvrir={() => setArtefactOuvert({ artefact: a, version: a.versions.length - 1 })}
              />
            ))}
          </div>
        )}
      </section>

      <section className="projets-section">
        <button
          type="button"
          className="btn ghost small projets-supprimer"
          onClick={() =>
            demander({
              titre: 'Supprimer ce projet ?',
              texte: `« ${projet.nom} », ses consignes et ses documents seront effacés. Les discussions et les artefacts restent, hors projet.`,
              action: 'Supprimer',
              danger: true,
              onConfirmer: () => {
                sortirDuProjet(projet.id);
                detacherDuProjet(projet.id);
                supprimerProjet(projet.id);
                router.replace('/projets');
              },
            })
          }
        >
          <Icon name="trash" size={17} /> Supprimer le projet
        </button>
      </section>

      {artefactOuvert && (
        <ArtefactPanneau
          artefact={artefactOuvert.artefact}
          version={artefactOuvert.version}
          onFermer={fermerArtefact}
        />
      )}
    </>
  );
}

function dateCourte(t: number): string {
  if (!t) return '';
  return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
