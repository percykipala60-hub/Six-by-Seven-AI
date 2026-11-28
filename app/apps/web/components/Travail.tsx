'use client';
import { cleHistorique } from '@/lib/historique-compte';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppBar } from './AppBar';
import { Artefacts } from './Artefacts';
import { Icon, type IconName } from './Icon';
import { extraireArtefacts } from '@/lib/artefacts';
import { entetesCompte } from '@/lib/premium-client';
import { ecouterCompte } from '@/lib/compte';
import { SKILLS } from '@/lib/skills-cosinus';
import { ajouterDocumentProjet, type Projet, type Tache } from '@/lib/travail';
import { lireTexteFichier } from '@/lib/lire-document';
import {
  chatsDuProjet,
  CLE_BROUILLON_PROJET,
  ecouterChats,
  lireChats,
  rangerChat,
  sortirDuProjet,
  type ChatSeven,
} from '@/lib/seven-chats';
import styles from './Travail.module.css';
type Etat = { projets: Projet[]; taches: Tache[]; planification: boolean };
type Modele = {
  icone: IconName;
  titre: string;
  description: string;
  demande: string;
  repetition: 'unique' | '24h' | '7j';
};
/** Modèles de tâches : ils pré-remplissent le formulaire, rien n'est créé sans « Créer ». */
const MODELES: Modele[] = [
  {
    icone: 'sun',
    titre: 'Plan de la journée',
    description: 'Les priorités du jour, rédigées à partir du contexte de votre projet.',
    demande:
      'Rédige un plan de journée réaliste : trois priorités, l’ordre conseillé et le temps à prévoir pour chacune.',
    repetition: '24h',
  },
  {
    icone: 'check',
    titre: 'Bilan hebdomadaire',
    description: 'Chaque semaine, les avancées, les points bloquants et la suite.',
    demande:
      'Fais le bilan de la semaine pour ce projet : ce qui a avancé, ce qui bloque, et les trois prochaines étapes.',
    repetition: '7j',
  },
  {
    icone: 'file',
    titre: 'Programme de révision',
    description: 'Un planning de révision clair, découpé par jour.',
    demande:
      'Rédige un programme de révision pour les sept prochains jours à partir du contexte du projet, découpé par jour.',
    repetition: '7j',
  },
  {
    icone: 'bulb',
    titre: 'Idées du jour',
    description: 'Trois idées concrètes pour faire avancer votre projet.',
    demande:
      'Propose trois idées concrètes et faciles à lancer aujourd’hui pour faire avancer ce projet.',
    repetition: '24h',
  },
];
const dateCourte = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const etatTache = (t: Tache) =>
  t.execution && !t.execution.fin
    ? 'En cours'
    : t.etat === 'terminee'
      ? 'Terminée'
      : t.etat === 'pause'
        ? 'En pause'
        : 'Programmée';
const REPETITION = { unique: 'Une seule fois', '24h': 'Chaque jour', '7j': 'Chaque semaine' };

export function TravailPage({
  onglet,
  projetId,
}: {
  onglet: 'projets' | 'taches';
  projetId?: string;
}) {
  const router = useRouter();
  const [etat, setEtat] = useState<Etat | null>(null);
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [revision, setRevision] = useState(0);
  const [edition, setEdition] = useState<Projet | null>(null);
  const [ouvrirContexte, setOuvrirContexte] = useState(false);
  const [formulaire, setFormulaire] = useState(onglet === 'taches' && Boolean(projetId));
  const [modele, setModele] = useState<Modele | null>(null);
  const [ouvert, setOuvert] = useState('');
  const [recherche, setRecherche] = useState<string | null>(null);
  const [tri, setTri] = useState<'recent' | 'alpha'>('recent');
  const champTitre = useRef<HTMLInputElement>(null);
  const champRecherche = useRef<HTMLInputElement>(null);
  const rechercheOuverte = recherche !== null;
  useEffect(() => {
    if (rechercheOuverte) champRecherche.current?.focus();
  }, [rechercheOuverte]);
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
  useEffect(() => {
    if (formulaire) champTitre.current?.focus();
  }, [formulaire, edition, modele]);
  async function modifier(commande: unknown, apres?: (projet: Projet) => void) {
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
      if (apres && typeof d?.id === 'string') apres(d);
      setRevision((r) => r + 1);
      return true;
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Opération impossible.');
      return false;
    } finally {
      setOccupe(false);
    }
  }
  function ouvrirFormulaire(m: Modele | null = null) {
    setEdition(null);
    setModele(m);
    setFormulaire(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function fermerFormulaire() {
    setFormulaire(false);
    setEdition(null);
    setOuvrirContexte(false);
    setModele(null);
  }
  const filtre = (recherche ?? '').trim().toLocaleLowerCase();
  const projets = useMemo(() => {
    const l = (etat?.projets ?? []).filter((p) => p.titre.toLocaleLowerCase().includes(filtre));
    return tri === 'alpha'
      ? [...l].sort((a, b) => a.titre.localeCompare(b.titre))
      : [...l].sort((a, b) => b.cree.localeCompare(a.cree));
  }, [etat, filtre, tri]);
  const taches = useMemo(() => {
    const l = (etat?.taches ?? []).filter((t) => t.titre.toLocaleLowerCase().includes(filtre));
    return tri === 'alpha'
      ? [...l].sort((a, b) => a.titre.localeCompare(b.titre))
      : [...l].sort((a, b) => a.prochaine.localeCompare(b.prochaine));
  }, [etat, filtre, tri]);
  const titre = onglet === 'projets' ? 'Projets' : 'Tâches planifiées';
  const projetActif = onglet === 'projets' && etat?.projets.find((p) => p.id === projetId);
  const creationBloquee = onglet === 'taches' && Boolean(etat) && !etat?.planification;
  const total = onglet === 'projets' ? (etat?.projets.length ?? 0) : (etat?.taches.length ?? 0);
  const liste = onglet === 'projets' ? projets : taches;
  const dialogue = etat && onglet === 'projets' && formulaire && (
    <FormulaireProjet
      projet={edition}
      ouvrirContexte={ouvrirContexte}
      occupe={occupe}
      erreur={erreur}
      fermer={fermerFormulaire}
      enregistrer={async (donnees) => {
        const ok = await modifier(
          { action: 'projet', donnees, ...(edition ? { id: edition.id } : {}) },
          edition
            ? undefined
            : (projet) => {
                setEtat((e) => e && { ...e, projets: [...e.projets, projet] });
                router.push(`/projets?projet=${projet.id}`);
              },
        );
        if (ok) fermerFormulaire();
      }}
    />
  );
  if (projetActif) {
    return (
      <>
        <AppBar page={onglet} titre={projetActif.titre} />
        {dialogue}
        <FicheProjet
          key={projetActif.id}
          projet={projetActif}
          occupe={occupe}
          erreur={formulaire ? '' : erreur}
          modifier={modifier}
          editer={(contexte = false) => {
            setErreur('');
            setEdition(projetActif);
            setOuvrirContexte(contexte);
            setFormulaire(true);
          }}
          supprimer={async () => {
            if (!window.confirm('Supprimer ce projet ? Ses discussions restent, hors projet.'))
              return;
            if (await modifier({ action: 'supprimer', type: 'projet', id: projetActif.id })) {
              sortirDuProjet(projetActif.id);
              router.replace('/projets');
            }
          }}
        />
      </>
    );
  }
  return (
    <>
      <AppBar page={onglet} titre={titre} />
      {dialogue}
      <main className={styles.page}>
        <header className={styles.entete}>
          <h1>{titre}</h1>
          <div className={styles.outils}>
            {recherche !== null ? (
              <input
                className={styles.recherche}
                ref={champRecherche}
                type="search"
                placeholder="Rechercher…"
                aria-label="Rechercher par titre"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                onBlur={() => !recherche && setRecherche(null)}
                onKeyDown={(e) => e.key === 'Escape' && setRecherche(null)}
              />
            ) : (
              <button
                type="button"
                className={styles.icone}
                aria-label="Rechercher"
                title="Rechercher"
                onClick={() => setRecherche('')}
              >
                <Icon name="search" />
              </button>
            )}
            <button
              type="button"
              className={styles.icone}
              aria-label={tri === 'recent' ? 'Trier par titre' : 'Trier par date'}
              title={tri === 'recent' ? 'Trier par titre' : 'Trier par date'}
              onClick={() => setTri((t) => (t === 'recent' ? 'alpha' : 'recent'))}
            >
              <Icon name="trier" />
            </button>
            <button
              type="button"
              className={styles.icone}
              aria-label="Actualiser"
              title="Actualiser"
              disabled={occupe}
              onClick={() => setRevision((r) => r + 1)}
            >
              <Icon name="refresh" />
            </button>
            <button
              type="button"
              className={styles.principal}
              disabled={!etat || creationBloquee}
              onClick={() => ouvrirFormulaire()}
            >
              <Icon name="plus" size={18} />
              {onglet === 'projets' ? 'Nouveau projet' : 'Nouvelle tâche'}
            </button>
          </div>
        </header>
        <nav className={styles.onglets} aria-label="Espace de travail">
          <Link href="/projets" aria-current={onglet === 'projets' ? 'page' : undefined}>
            Projets
          </Link>
          <Link href="/taches" aria-current={onglet === 'taches' ? 'page' : undefined}>
            Tâches planifiées
          </Link>
        </nav>
        <p className={styles.intro}>
          {onglet === 'projets'
            ? 'Gardez le contexte de chaque projet et réutilisez-le dans Chat et Cosinus. Enregistré sur votre compte, sur le serveur de Six.'
            : 'Six rédige ou analyse à l’heure prévue, même application fermée. Les demandes restent sur le serveur ; les fichiers de votre téléphone ne sont pas lus.'}
        </p>
        {erreur && (
          <p role="alert" className={styles.alerte}>
            {erreur} <Link href="/reglages?v=compte">Mon compte</Link>
          </p>
        )}
        {!etat && !erreur && (
          <p role="status" className={styles.discret}>
            Chargement…
          </p>
        )}
        {creationBloquee && (
          <p role="status" className={styles.alerte}>
            Le moteur de planification n’est pas actif sur ce serveur. La création sera disponible
            après son activation.
          </p>
        )}
        {etat && formulaire && onglet === 'taches' && !creationBloquee && (
          <form
            key={`${edition?.id ?? 'nouveau'}-${modele?.titre ?? ''}`}
            className={styles.formulaire}
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              const donnees = {
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
                  action: 'tache',
                  donnees,
                  ...(edition ? { id: edition.id } : {}),
                })
              ) {
                form.reset();
                fermerFormulaire();
              }
            }}
          >
            <div className={styles.formTete}>
              <h2>Nouvelle tâche</h2>
              <button
                type="button"
                className={styles.icone}
                aria-label="Fermer"
                onClick={fermerFormulaire}
              >
                <Icon name="x" />
              </button>
            </div>
            <label>
              Titre
              <input
                ref={champTitre}
                name="titre"
                required
                maxLength={100}
                defaultValue={edition?.titre ?? modele?.titre}
              />
            </label>
            <label>
              Demande à exécuter
              <textarea
                name="demande"
                required
                maxLength={12000}
                rows={4}
                defaultValue={modele?.demande}
                placeholder="Ex. : rédige un programme de révision à partir de ce contexte…"
              />
            </label>
            <div className={styles.colonnes}>
              <label>
                Date et heure
                <input name="date" type="datetime-local" required />
              </label>
              <label>
                Répétition
                <select name="repetition" defaultValue={modele?.repetition ?? 'unique'}>
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
                <select
                  name="projetId"
                  defaultValue={etat.projets.some((p) => p.id === projetId) ? projetId : ''}
                >
                  <option value="">Sans projet</option>
                  {etat.projets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.titre}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className={styles.discret}>
              Heure de votre appareil. Les répétitions se font toutes les 24 heures ou tous les 7
              jours, même lors d’un changement d’heure.
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.secondaire} onClick={fermerFormulaire}>
                Annuler
              </button>
              <button className={styles.principal} disabled={occupe || creationBloquee}>
                {edition ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </form>
        )}
        {etat && total === 0 && (
          <div className={styles.vide}>
            <Chrono />
            <p>
              {onglet === 'projets'
                ? 'Aucun projet pour le moment.'
                : 'Aucune tâche planifiée pour le moment.'}
            </p>
            {!formulaire && !creationBloquee && (
              <button
                type="button"
                className={styles.secondaire}
                onClick={() => ouvrirFormulaire()}
              >
                {onglet === 'projets' ? 'Créer un projet' : 'Configurer manuellement'}
              </button>
            )}
          </div>
        )}
        {etat && total > 0 && liste.length === 0 && (
          <p className={styles.discret}>Aucun résultat pour « {recherche} ».</p>
        )}
        {etat && onglet === 'projets' && projets.length > 0 && (
          <div className={styles.grille}>
            {projets.map((p) => (
              <Link
                className={`${styles.carte} ${styles.carteProjet}`}
                key={p.id}
                href={`/projets?projet=${p.id}`}
              >
                <span className={styles.tuile}>
                  <Icon name="dossier" />
                </span>
                <span className={styles.nom}>
                  <strong>{p.titre}</strong>
                  {p.description && <small>{p.description}</small>}
                  <small>{dateCourte(p.cree)}</small>
                </span>
                <Icon name="chevron" size={18} />
              </Link>
            ))}
          </div>
        )}
        {etat && onglet === 'taches' && taches.length > 0 && (
          <div className={styles.grille}>
            {taches.map((t) => {
              const resultat = extraireArtefacts(t.execution?.resultat ?? '');
              const enCours = Boolean(t.execution && !t.execution.fin);
              const deplie = ouvert === t.id;
              return (
                <article className={`${styles.carte} ${deplie ? styles.deplie : ''}`} key={t.id}>
                  <button
                    type="button"
                    className={styles.ligne}
                    aria-expanded={deplie}
                    onClick={() => setOuvert(deplie ? '' : t.id)}
                  >
                    <span className={styles.tuile}>
                      <Icon name="horloge" />
                    </span>
                    <span className={styles.nom}>
                      <strong>{t.titre}</strong>
                      <small>
                        {REPETITION[t.repetition]} ·{' '}
                        {new Date(t.prochaine).toLocaleString(undefined, {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </small>
                    </span>
                    <span className={styles.badge} data-etat={enCours ? 'cours' : t.etat}>
                      {etatTache(t)}
                    </span>
                  </button>
                  {deplie && (
                    <div className={styles.corps}>
                      <p className={styles.texte}>{t.demande}</p>
                      <p className={styles.discret}>Fuseau : {t.fuseau}</p>
                      {t.execution?.erreur && (
                        <p role="status" className={styles.alerte}>
                          {t.execution.erreur}
                        </p>
                      )}
                      {t.execution?.resultat && (
                        <details className={styles.details}>
                          <summary>Voir le dernier résultat</summary>
                          <p className={styles.texte}>{resultat.texte}</p>
                          <Artefacts fichiers={resultat.artefacts} />
                        </details>
                      )}
                      <div className={styles.actions}>
                        {t.etat !== 'terminee' && (
                          <button
                            type="button"
                            className={styles.secondaire}
                            disabled={occupe || enCours}
                            onClick={() =>
                              void modifier({
                                action: 'etat',
                                id: t.id,
                                etat: t.etat === 'pause' ? 'active' : 'pause',
                              })
                            }
                          >
                            <Icon name={t.etat === 'pause' ? 'play' : 'pause'} size={16} />
                            {t.etat === 'pause' ? 'Reprendre' : 'Suspendre'}
                          </button>
                        )}
                        <span className={styles.espace} />
                        <button
                          type="button"
                          className={`${styles.icone} ${styles.danger}`}
                          aria-label="Supprimer"
                          title="Supprimer"
                          disabled={occupe || enCours}
                          onClick={() => {
                            if (window.confirm('Supprimer cette tâche et son résultat ?'))
                              void modifier({ action: 'supprimer', type: 'tache', id: t.id });
                          }}
                        >
                          <Icon name="trash" size={18} />
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
        {etat && onglet === 'taches' && !creationBloquee && (
          <section className={styles.modeles} aria-labelledby="modeles-titre">
            <h2 id="modeles-titre">Modèles</h2>
            <div className={styles.grilleModeles}>
              {MODELES.map((m) => (
                <button
                  type="button"
                  key={m.titre}
                  className={styles.modele}
                  onClick={() => ouvrirFormulaire(m)}
                >
                  <span className={styles.tuile}>
                    <Icon name={m.icone} />
                  </span>
                  <span className={styles.nom}>
                    <strong>{m.titre}</strong>
                    <span>{m.description}</span>
                    <small>
                      <Icon name="horloge" size={14} /> {REPETITION[m.repetition]}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}

type DocumentsProjet = NonNullable<Projet['documents']>;
const FORMATS_DOCUMENTS = '.txt,.md,.csv,.json,.log,.pdf';
const FICHIER_MAX = 20 * 1024 * 1024;

async function lireDocumentProjet(
  documents: DocumentsProjet,
  fichier: File,
): Promise<DocumentsProjet> {
  try {
    if (fichier.size > FICHIER_MAX) throw new Error('le fichier dépasse 20 Mo.');
    const resultat = ajouterDocumentProjet(
      documents,
      fichier.name,
      await lireTexteFichier(fichier),
    );
    if ('erreur' in resultat) throw new Error(resultat.erreur);
    return resultat.documents;
  } catch (e) {
    throw new Error(
      `« ${fichier.name} » n’a pas été ajouté : ${e instanceof Error ? e.message : 'réessayez.'}`,
      { cause: e },
    );
  }
}

function FormulaireProjet({
  projet,
  ouvrirContexte,
  occupe,
  erreur,
  fermer,
  enregistrer,
}: {
  projet: Projet | null;
  ouvrirContexte: boolean;
  occupe: boolean;
  erreur: string;
  fermer: () => void;
  enregistrer: (
    donnees: Pick<Projet, 'titre' | 'description' | 'contexte' | 'documents'>,
  ) => Promise<void>;
}) {
  const dialogue = useRef<HTMLDialogElement>(null);
  const champFichiers = useRef<HTMLInputElement>(null);
  const [contexteOuvert, setContexteOuvert] = useState(
    ouvrirContexte || Boolean(projet?.contexte || projet?.documents?.length),
  );
  const [documentsModifies, setDocumentsModifies] = useState<DocumentsProjet>();
  const documents = documentsModifies ?? projet?.documents ?? [];
  const [lecture, setLecture] = useState(false);
  const [erreursFichiers, setErreursFichiers] = useState<string[]>([]);

  async function ajouterFichiers(fichiers: File[]) {
    setLecture(true);
    setErreursFichiers([]);
    let suivants = documents;
    const erreurs: string[] = [];
    try {
      for (const fichier of fichiers) {
        try {
          suivants = await lireDocumentProjet(suivants, fichier);
        } catch (e) {
          erreurs.push(e instanceof Error ? e.message : 'Lecture du fichier impossible.');
        }
      }
      if (suivants !== documents) setDocumentsModifies(suivants);
      setErreursFichiers(erreurs);
    } finally {
      setLecture(false);
    }
  }
  useEffect(() => {
    const d = dialogue.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={dialogue}
      className={styles.dialogueProjet}
      aria-labelledby="titre-dialogue-projet"
      onCancel={(e) => {
        e.preventDefault();
        if (!occupe) fermer();
      }}
    >
      <form
        className={styles.formulaire}
        onSubmit={(e) => {
          e.preventDefault();
          if (occupe || lecture) return;
          const f = new FormData(e.currentTarget);
          void enregistrer({
            titre: String(f.get('titre') ?? ''),
            description: String(f.get('description') ?? ''),
            contexte: String(f.get('contexte') ?? ''),
            ...(documentsModifies ? { documents: documentsModifies } : {}),
          });
        }}
      >
        <header className={styles.formTete}>
          <h2 id="titre-dialogue-projet">{projet ? 'Modifier le projet' : 'Créer un projet'}</h2>
          <button
            type="button"
            className={styles.icone}
            aria-label="Fermer"
            disabled={occupe}
            onClick={fermer}
          >
            <Icon name="x" />
          </button>
        </header>
        <label>
          Nom du projet
          <input
            name="titre"
            required
            maxLength={100}
            defaultValue={projet?.titre}
            placeholder="Ex. Projet Bateau"
          />
        </label>
        <label>
          Objectif
          <textarea
            name="description"
            rows={3}
            maxLength={2000}
            defaultValue={projet?.description}
            placeholder="Décrivez le sujet et ce que vous voulez accomplir…"
          />
        </label>
        {contexteOuvert ? (
          <>
            <label>
              Contexte et instructions
              <textarea
                name="contexte"
                rows={4}
                maxLength={12000}
                defaultValue={projet?.contexte}
                placeholder="Ajoutez les informations et les consignes utiles à Six."
              />
            </label>
            <div>
              <input
                ref={champFichiers}
                type="file"
                accept={FORMATS_DOCUMENTS}
                multiple
                hidden
                onChange={(e) => {
                  const fichiers = Array.from(e.currentTarget.files ?? []);
                  e.currentTarget.value = '';
                  if (fichiers.length) void ajouterFichiers(fichiers);
                }}
              />
              <button
                type="button"
                className={styles.secondaire}
                disabled={lecture || occupe}
                onClick={() => champFichiers.current?.click()}
              >
                <Icon name="clip" size={16} />{' '}
                {lecture ? 'Lecture des fichiers…' : 'Ajouter des fichiers'}
              </button>
              {documents.length > 0 && (
                <ul className={styles.listeProjet} aria-label="Fichiers de contexte">
                  {documents.map((document, i) => (
                    <li key={`${document.nom}-${i}`}>
                      {document.nom}
                      <button
                        type="button"
                        className={styles.secondaire}
                        disabled={lecture || occupe}
                        aria-label={`Retirer ${document.nom}`}
                        onClick={() =>
                          setDocumentsModifies(documents.filter((_, index) => index !== i))
                        }
                      >
                        Retirer
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {erreursFichiers.length > 0 && (
                <ul role="alert" className={styles.alerte}>
                  {erreursFichiers.map((message, i) => (
                    <li key={i}>{message}</li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <button
            type="button"
            className={styles.secondaire}
            onClick={() => setContexteOuvert(true)}
          >
            <Icon name="plus" size={16} /> Ajouter du contexte
          </button>
        )}
        {erreur && (
          <p role="alert" className={styles.alerte}>
            {erreur}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.secondaire} disabled={occupe} onClick={fermer}>
            Annuler
          </button>
          <button className={styles.principal} disabled={occupe || lecture}>
            {projet ? 'Enregistrer' : 'Créer le projet'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function FicheProjet({
  projet,
  occupe,
  erreur,
  modifier,
  editer,
  supprimer,
}: {
  projet: Projet;
  occupe: boolean;
  erreur: string;
  modifier: (commande: unknown) => Promise<boolean>;
  editer: (contexte?: boolean) => void;
  supprimer: () => Promise<void>;
}) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [erreurSession, setErreurSession] = useState('');
  return (
    <main className={`${styles.page} ${styles.ficheProjet}`}>
      <Link href="/projets" className={styles.retourProjet}>
        <Icon name="back" size={16} /> Tous les projets
      </Link>
      <header className={styles.entete}>
        <h1>{projet.titre}</h1>
        <div className={styles.outils}>
          <button
            type="button"
            className={styles.icone}
            onClick={() => editer()}
            disabled={occupe}
            aria-label="Modifier le projet"
            title="Modifier le projet"
          >
            <Icon name="pencil" size={18} />
          </button>
          <button
            type="button"
            className={`${styles.icone} ${styles.danger}`}
            onClick={() => void supprimer()}
            disabled={occupe}
            aria-label="Supprimer le projet"
            title="Supprimer le projet"
          >
            <Icon name="trash" size={18} />
          </button>
        </div>
      </header>
      {projet.description && <p className={styles.resumeProjet}>{projet.description}</p>}
      {erreur && (
        <p role="alert" className={styles.alerte}>
          {erreur}
        </p>
      )}
      <ExtrasProjet projet={projet} occupe={occupe} modifier={modifier} editer={editer}>
        <form
          className={styles.composeurProjet}
          onSubmit={(e) => {
            e.preventDefault();
            if (!message.trim()) return;
            try {
              sessionStorage.setItem(
                cleHistorique(CLE_BROUILLON_PROJET),
                JSON.stringify({ projetId: projet.id, texte: message.trim() }),
              );
              router.push(`/chat?projet=${projet.id}&brouillon=1`);
            } catch {
              setErreurSession('Le brouillon n’a pas pu être transféré vers Chat.');
            }
          }}
        >
          <label htmlFor="session-projet">Nouvelle discussion</label>
          <textarea
            id="session-projet"
            rows={3}
            maxLength={12000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Sur quoi veux-tu avancer ?"
          />
          <div className={styles.actions}>
            <Link href={`/cosinus?projet=${projet.id}`} className={styles.secondaire}>
              <Icon name="sixtouch" size={16} /> Cosinus
            </Link>
            <button className={styles.principal} disabled={!message.trim()}>
              Continuer dans Chat <Icon name="suivant" size={15} />
            </button>
          </div>
          {erreurSession && <p role="alert">{erreurSession}</p>}
        </form>
      </ExtrasProjet>
    </main>
  );
}

/** Illustration de l'état vide : un chronomètre au trait, dans les couleurs du thème. */
function Chrono() {
  return (
    <svg className={styles.chrono} viewBox="0 0 120 120" aria-hidden="true">
      <rect x="48" y="8" width="24" height="10" rx="3" />
      <path d="M60 18v8" />
      <circle cx="60" cy="68" r="40" className={styles.cadran} />
      <path d="M60 44v26l16 -9" />
    </svg>
  );
}

/**
 * Documents et discussions d'un projet. Les documents sont lus sur l'appareil puis gardés avec le projet sur le
 * serveur ; les discussions restent sur l'appareil (réglage Mémoire), rangées dans le projet par leur projetId.
 */
function ExtrasProjet({
  projet,
  occupe,
  modifier,
  editer,
  children,
}: {
  projet: Projet;
  occupe: boolean;
  modifier: (commande: unknown) => Promise<boolean>;
  editer: (contexte?: boolean) => void;
  children: React.ReactNode;
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
      await enregistrer(await lireDocumentProjet(documents, f));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture du fichier impossible.');
    } finally {
      setLecture(false);
      if (fichiers.current) fichiers.current.value = '';
    }
  }

  return (
    <div className={styles.espaceProjet}>
      <section className={styles.activiteProjet} aria-label="Activité du projet">
        {children}
        <h2>Discussions récentes</h2>
        {discussions.length === 0 && (
          <p className={styles.discret}>Aucune discussion dans ce projet.</p>
        )}
        <ul className={styles.listeProjet}>
          {discussions.map((c) => (
            <li key={c.id}>
              <Link
                href={`${c.mode === 'sixtouch' ? '/cosinus' : '/chat'}?c=${encodeURIComponent(c.id)}&projet=${projet.id}`}
              >
                {c.titre}
              </Link>
              <small>{dateCourte(new Date(c.maj).toISOString())}</small>
              <button
                type="button"
                className={styles.icone}
                title="Sortir du projet"
                aria-label={`Sortir « ${c.titre} » du projet`}
                onClick={() => rangerChat(c.id, '')}
              >
                <Icon name="x" size={16} />
              </button>
            </li>
          ))}
        </ul>
        {horsProjet.length > 0 && (
          <form
            className={styles.rangerProjet}
            onSubmit={(e) => {
              e.preventDefault();
              if (aRanger) rangerChat(aRanger, projet.id);
              setARanger('');
            }}
          >
            <label>
              Ranger une discussion
              <select value={aRanger} onChange={(e) => setARanger(e.target.value)}>
                <option value="">Choisir…</option>
                {horsProjet.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.titre}
                  </option>
                ))}
              </select>
            </label>
            <button className={styles.secondaire} disabled={!aRanger}>
              Ranger
            </button>
          </form>
        )}
      </section>
      <aside className={styles.ressourcesProjet} aria-label="Ressources du projet">
        <div className={styles.ressourceProjet}>
          <Icon name="file" />
          <span>Instructions</span>
          <button
            type="button"
            className={styles.secondaire}
            onClick={() => editer(true)}
            disabled={occupe}
          >
            {projet.contexte ? 'Modifier' : 'Ajouter'}
          </button>
        </div>
        <div className={styles.ressourceProjet}>
          <Icon name="dossier" />
          <span>
            Contexte{' '}
            <small>
              {documents.length} {documents.length === 1 ? 'document' : 'documents'}
            </small>
          </span>
          <button
            type="button"
            className={styles.secondaire}
            disabled={occupe || lecture}
            onClick={() => fichiers.current?.click()}
          >
            {lecture ? 'Lecture…' : 'Ajouter'}
          </button>
        </div>
        <p>
          Textes ou PDF lus sur votre appareil : Six s’appuie dessus dans chaque discussion du
          projet.
        </p>
        {documents.length > 0 && (
          <ul className={styles.listeProjet}>
            {documents.map((d, i) => (
              <li key={`${d.nom}-${i}`}>
                {d.nom} · {Math.ceil(d.texte.length / 1000)} k caractères{' '}
                <button
                  type="button"
                  className={styles.secondaire}
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
          accept={FORMATS_DOCUMENTS}
          hidden
          onChange={(e) => void ajouter(e.target.files)}
        />
        {erreur && <p role="alert">{erreur}</p>}
        <div className={styles.ressourceProjet}>
          <Icon name="memoire" />
          <span>Mémoire des discussions</span>
          <Link className={styles.secondaire} href="/reglages?v=memoire">
            Voir
          </Link>
        </div>
        <div className={styles.ressourceProjet}>
          <Icon name="horloge" />
          <span>Tâches planifiées</span>
          <Link className={styles.secondaire} href={`/taches?projet=${projet.id}`}>
            Ouvrir
          </Link>
        </div>
        <p className={styles.priveProjet}>
          <Icon name="lock" size={14} /> Projet privé
        </p>
      </aside>
    </div>
  );
}
