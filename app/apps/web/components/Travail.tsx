'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AppBar } from './AppBar';
import { Artefacts } from './Artefacts';
import { extraireArtefacts } from '@/lib/artefacts';
import { entetesCompte } from '@/lib/premium-client';
import { ecouterCompte } from '@/lib/compte';
import { SKILLS } from '@/lib/skills-cosinus';
import { ajouterDocumentProjet, type Projet, type Tache } from '@/lib/travail';
import { lireTexteFichier } from '@/lib/lire-document';
import {
  chatsDuProjet,
  ecouterChats,
  lireChats,
  rangerChat,
  sortirDuProjet,
  type ChatSeven,
} from '@/lib/seven-chats';
import styles from './Travail.module.css';
type Etat = { projets: Projet[]; taches: Tache[]; planification: boolean };
export function TravailPage({ onglet }: { onglet: 'projets' | 'taches' }) {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [revision, setRevision] = useState(0);
  const [edition, setEdition] = useState<Projet | null>(null);
  useEffect(
    () =>
      ecouterCompte(() => {
        setEtat(null);
        setEdition(null);
        setRevision((r) => r + 1);
      }),
    [],
  );
  useEffect(() => {
    const c = new AbortController();
    setErreur('');
    void (async () => {
      try {
        const r = await fetch('/api/travail', {
          headers: await entetesCompte(),
          cache: 'no-store',
          signal: c.signal,
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (!c.signal.aborted) setEtat(d);
      } catch (e) {
        if (!c.signal.aborted) {
          setEtat(null);
          setErreur(e instanceof Error ? e.message : 'Chargement impossible.');
        }
      }
    })();
    return () => c.abort();
  }, [revision]);
  async function modifier(commande: unknown) {
    setOccupe(true);
    setErreur('');
    try {
      const r = await fetch('/api/travail', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(await entetesCompte()) },
        body: JSON.stringify(commande),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setRevision((r) => r + 1);
      return true;
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Opération impossible.');
      return false;
    } finally {
      setOccupe(false);
    }
  }
  const titre = onglet === 'projets' ? 'Projets' : 'Tâches planifiées';
  return (
    <>
      <AppBar page={onglet} titre={titre} />
      <main className={styles.page}>
        <h1>{titre}</h1>
        <nav className={styles.actions}>
          <Link href="/projets">Projets</Link>
          <Link href="/taches">Tâches planifiées</Link>
        </nav>
        {erreur && (
          <p role="alert">
            {erreur} <Link href="/reglages?v=compte">Mon compte</Link>
          </p>
        )}
        {!etat && !erreur && <p role="status">Chargement…</p>}
        {etat && (
          <>
            <p>
              {onglet === 'projets'
                ? 'Garde le contexte de chaque projet et réutilise-le dans Cosinus. Ces informations sont enregistrées sur ton compte, sur le serveur de Six.'
                : 'Six rédige ou analyse à l’heure prévue, même lorsque l’application est fermée. Retrouve le dernier résultat ici. Les demandes sont conservées sur le serveur ; les fichiers de ton téléphone ne sont pas accessibles automatiquement.'}
            </p>
            {onglet === 'taches' && !etat.planification && (
              <p role="status">
                Le moteur de planification n’est pas actif sur ce serveur. La création sera
                disponible après son activation.
              </p>
            )}
            <form
              key={edition?.id ?? 'nouveau'}
              className={styles.formulaire}
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const f = new FormData(form);
                const donnees =
                  onglet === 'projets'
                    ? { titre: f.get('titre'), contexte: f.get('contexte') }
                    : {
                        titre: f.get('titre'),
                        demande: f.get('demande'),
                        prochaine: new Date(String(f.get('date'))).toISOString(),
                        fuseau: Intl.DateTimeFormat().resolvedOptions().timeZone,
                        repetition: f.get('repetition'),
                        skill: f.get('skill'),
                        ...(f.get('projetId') ? { projetId: f.get('projetId') } : {}),
                      };
                if (
                  await modifier({
                    action: onglet === 'projets' ? 'projet' : 'tache',
                    donnees,
                    ...(edition ? { id: edition.id } : {}),
                  })
                ) {
                  form.reset();
                  setEdition(null);
                }
              }}
            >
              <h2>
                {edition
                  ? 'Modifier le projet'
                  : onglet === 'projets'
                    ? 'Nouveau projet'
                    : 'Nouvelle tâche'}
              </h2>
              <label>
                Titre
                <input name="titre" required maxLength={100} defaultValue={edition?.titre} />
              </label>
              {onglet === 'projets' ? (
                <label>
                  Contexte et consignes
                  <textarea
                    name="contexte"
                    maxLength={12000}
                    rows={5}
                    defaultValue={edition?.contexte}
                  />
                </label>
              ) : (
                <>
                  <label>
                    Demande à exécuter
                    <textarea
                      name="demande"
                      required
                      maxLength={12000}
                      rows={5}
                      placeholder="Exemple : rédige un programme de révision à partir de ce contexte…"
                    />
                  </label>
                  <label>
                    Date et heure locales
                    <input name="date" type="datetime-local" required />
                  </label>
                  <p>
                    L’heure choisie est celle de ton appareil. Les répétitions se font toutes les 24
                    heures ou tous les 7 jours, même lors d’un changement d’heure.
                  </p>
                  <label>
                    Répétition
                    <select name="repetition">
                      <option value="unique">Une seule fois</option>
                      <option value="24h">Toutes les 24 heures</option>
                      <option value="7j">Tous les 7 jours</option>
                    </select>
                  </label>
                  <label>
                    Focus
                    <select name="skill">
                      <option value="auto">Automatique</option>
                      {SKILLS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nom}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Projet
                    <select name="projetId">
                      <option value="">Sans projet</option>
                      {etat.projets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.titre}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <div className={styles.actions}>
                <button disabled={occupe || (onglet === 'taches' && !etat.planification)}>
                  {edition ? 'Enregistrer' : 'Créer'}
                </button>
                {edition && (
                  <button type="button" onClick={() => setEdition(null)}>
                    Annuler
                  </button>
                )}
              </div>
            </form>
            <button type="button" disabled={occupe} onClick={() => setRevision((r) => r + 1)}>
              Actualiser
            </button>
            {onglet === 'projets' ? (
              <>
                {!etat.projets.length && <p>Aucun projet pour le moment.</p>}
                {etat.projets.map((p) => (
                  <article className={styles.carte} key={p.id}>
                    <h2>{p.titre}</h2>
                    <p className={styles.texte}>{p.contexte}</p>
                    <ExtrasProjet projet={p} occupe={occupe} modifier={modifier} />
                    <div className={styles.actions}>
                      <Link href={`/chat?projet=${p.id}`}>Nouvelle discussion</Link>
                      <Link href={`/cosinus?projet=${p.id}`}>Ouvrir dans Cosinus</Link>
                      <button
                        disabled={occupe}
                        onClick={() => {
                          setEdition(p);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        Modifier
                      </button>
                      <button
                        disabled={occupe}
                        onClick={() => {
                          if (
                            window.confirm(
                              'Supprimer ce projet ? Ses discussions restent, hors projet.',
                            )
                          )
                            void modifier({ action: 'supprimer', type: 'projet', id: p.id }).then(
                              (ok) => ok && sortirDuProjet(p.id),
                            );
                        }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </article>
                ))}
              </>
            ) : (
              <>
                {!etat.taches.length && <p>Aucune tâche planifiée.</p>}
                {etat.taches.map((t) => {
                  const resultat = extraireArtefacts(t.execution?.resultat ?? '');
                  const enCours = t.execution && !t.execution.fin;
                  return (
                    <article className={styles.carte} key={t.id}>
                      <h2>{t.titre}</h2>
                      <p>
                        {enCours
                          ? 'En cours'
                          : t.etat === 'terminee'
                            ? 'Terminée'
                            : t.etat === 'pause'
                              ? 'En pause'
                              : 'Programmée'}{' '}
                        · {new Date(t.prochaine).toLocaleString()} · {t.fuseau}
                      </p>
                      <p className={styles.texte}>{t.demande}</p>
                      {t.execution?.erreur && <p role="status">{t.execution.erreur}</p>}
                      {t.execution?.resultat && (
                        <details>
                          <summary>Voir le dernier résultat</summary>
                          <p className={styles.texte}>{resultat.texte}</p>
                          <Artefacts fichiers={resultat.artefacts} />
                        </details>
                      )}
                      <div className={styles.actions}>
                        {t.etat !== 'terminee' && (
                          <button
                            disabled={occupe || Boolean(enCours)}
                            onClick={() =>
                              void modifier({
                                action: 'etat',
                                id: t.id,
                                etat: t.etat === 'pause' ? 'active' : 'pause',
                              })
                            }
                          >
                            {t.etat === 'pause' ? 'Reprendre' : 'Suspendre'}
                          </button>
                        )}
                        <button
                          disabled={occupe || Boolean(enCours)}
                          onClick={() => {
                            if (window.confirm('Supprimer cette tâche et son résultat ?'))
                              void modifier({ action: 'supprimer', type: 'tache', id: t.id });
                          }}
                        >
                          Supprimer
                        </button>
                      </div>
                    </article>
                  );
                })}
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}

const FICHIER_MAX = 20 * 1024 * 1024;

/**
 * Documents et discussions d'un projet. Les documents sont lus sur l'appareil puis gardés avec le projet sur le
 * serveur ; les discussions restent sur l'appareil (réglage Mémoire), rangées dans le projet par leur projetId.
 */
function ExtrasProjet({
  projet,
  occupe,
  modifier,
}: {
  projet: Projet;
  occupe: boolean;
  modifier: (commande: unknown) => Promise<boolean>;
}) {
  const [chats, setChats] = useState<ChatSeven[]>([]);
  const [lecture, setLecture] = useState(false);
  const [erreur, setErreur] = useState('');
  const [aRanger, setARanger] = useState('');
  const fichiers = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const lire = () => setChats(lireChats());
    lire();
    return ecouterChats(lire);
  }, []);
  const documents = projet.documents ?? [];
  const discussions = chatsDuProjet(projet.id, chats);
  const horsProjet = chats.filter((c) => !c.projetId);
  const enregistrer = (docs: { nom: string; texte: string }[]) =>
    modifier({
      action: 'projet',
      id: projet.id,
      donnees: { titre: projet.titre, contexte: projet.contexte, documents: docs },
    });

  async function ajouter(liste: FileList | null) {
    const f = liste?.[0];
    if (!f) return;
    setErreur('');
    setLecture(true);
    try {
      if (f.size > FICHIER_MAX) throw new Error('le fichier dépasse 20 Mo.');
      const r = ajouterDocumentProjet(documents, f.name, await lireTexteFichier(f));
      if ('erreur' in r) throw new Error(r.erreur);
      await enregistrer(r.documents);
    } catch (e) {
      setErreur(
        `« ${f.name} » n’a pas été ajouté : ${e instanceof Error ? e.message : 'réessaie.'}`,
      );
    } finally {
      setLecture(false);
      if (fichiers.current) fichiers.current.value = '';
    }
  }

  return (
    <>
      <details>
        <summary>
          Documents ({documents.length}) · Discussions ({discussions.length})
        </summary>
        <p>
          Textes ou PDF lus sur ton appareil : Six s’appuie dessus dans chaque discussion du projet.
        </p>
        {documents.length > 0 && (
          <ul>
            {documents.map((d, i) => (
              <li key={`${d.nom}-${i}`}>
                {d.nom} · {Math.ceil(d.texte.length / 1000)} k caractères{' '}
                <button
                  type="button"
                  disabled={occupe}
                  onClick={() => void enregistrer(documents.filter((_, j) => j !== i))}
                >
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          ref={fichiers}
          type="file"
          accept=".txt,.md,.csv,.json,.log,.pdf"
          hidden
          onChange={(e) => void ajouter(e.target.files)}
        />
        <button
          type="button"
          disabled={occupe || lecture}
          onClick={() => fichiers.current?.click()}
        >
          {lecture ? 'Lecture du document…' : 'Ajouter un document'}
        </button>
        {erreur && <p role="alert">{erreur}</p>}
        {discussions.length > 0 && (
          <ul>
            {discussions.map((c) => (
              <li key={c.id}>
                <Link
                  href={`${c.mode === 'sixtouch' ? '/cosinus' : '/chat'}?c=${encodeURIComponent(c.id)}&projet=${projet.id}`}
                >
                  {c.mode === 'sixtouch' ? 'Cosinus' : 'Chat'} · {c.titre}
                </Link>{' '}
                <button type="button" onClick={() => rangerChat(c.id, '')}>
                  Sortir du projet
                </button>
              </li>
            ))}
          </ul>
        )}
        {horsProjet.length > 0 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (aRanger) rangerChat(aRanger, projet.id);
              setARanger('');
            }}
          >
            <label>
              Ranger une discussion dans ce projet
              <select value={aRanger} onChange={(e) => setARanger(e.target.value)}>
                <option value="">Choisir…</option>
                {horsProjet.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.mode === 'sixtouch' ? 'Cosinus · ' : 'Chat · '}
                    {c.titre}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={!aRanger}>
              Ranger
            </button>
          </form>
        )}
      </details>
    </>
  );
}
