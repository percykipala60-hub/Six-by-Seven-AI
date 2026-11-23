'use client';

import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { anonymize, markMe, restore } from '@/lib/anonymize';
import {
  guessMe,
  isGenericSpeaker,
  looksLikeWhatsApp,
  parseWhatsApp,
  speakerLabels,
  speakers as listSpeakers,
  toConversation,
} from '@/lib/whatsapp';
import { SCAM_THRESHOLD } from '@/lib/scam';
import {
  MAX_CHARS,
  type AdjustResult,
  type Analysis,
  type Canal,
  type Longueur,
  type Nuance,
  type RepliesResult,
  type Ton,
} from '@/lib/types';
import { MAX_IMAGES, OcrError, prechaufferLecteur, readScreenshots } from '@/lib/ocr';
import { ZipError, readChatFromZip } from '@/lib/zip';
import { loadStyle } from '@/lib/style';
import { entetesCompte } from '@/lib/premium-client';
import { EVT_CAPTURE, prendreCapture } from '@/lib/raccourcis-ios';
import { ecouterCompte, lireCompte, phraseAccueil, salutation } from '@/lib/compte';
import {
  NOTE_MAX,
  ajouterSuivi,
  consigneMemoire,
  ecrireNote,
  memoireActive,
  noteContact,
  retenirChoix,
} from '@/lib/memoire';
import {
  effacerConversationGardee,
  garderConversation,
  lireConversations,
  type ConversationGardee,
} from '@/lib/conversations';
import { Ecrit } from './Anime';
import { AppBar } from './AppBar';
import { AppsRow } from './Dock';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { Reflexion } from './Reflexion';

/* eslint-disable jsx-a11y/no-noninteractive-element-interactions -- Drag/drop is optional; import buttons are keyboard accessible. */

// Repères du masquage (« [TÉL 1] ») : libellé lisible et bilan par sorte.
const SORTES: Record<string, [string, string]> = {
  PERSONNE: ['nom', 'noms'],
  PRÉNOM: ['nom', 'noms'],
  NOM: ['nom', 'noms'],
  TÉL: ['numéro', 'numéros'],
  CODE: ['code', 'codes'],
  COMPTE: ['compte', 'comptes'],
  EMAIL: ['e-mail', 'e-mails'],
  LIEN: ['lien', 'liens'],
  ADRESSE: ['adresse', 'adresses'],
  PSEUDO: ['pseudo', 'pseudos'],
};
const lisible = (repere: string) => {
  const m = /^\[(.+) (\d+)\]$/.exec(repere);
  return m ? `${m[1].charAt(0)}${m[1].slice(1).toLowerCase()} ${m[2]}` : repere;
};
const TONS: { id: Ton; label: string }[] = [
  { id: 'amical', label: 'Amical' },
  { id: 'professionnel', label: 'Professionnel' },
  { id: 'ferme', label: 'Ferme' },
  { id: 'court', label: 'Court' },
  { id: 'chaleureux', label: 'Chaleureux' },
];
const LONGUEURS: { id: Longueur; label: string }[] = [
  { id: 'courte', label: 'Courte' },
  { id: 'moyenne', label: 'Moyenne' },
  { id: 'detaillee', label: 'Détaillée' },
];
// Le secrétaire : quand rappeler de suivre une conversation (demain et après : 9 h, heure du téléphone).
const aNeufHeures = (jours: number) => {
  const d = new Date();
  d.setDate(d.getDate() + jours);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
};
const RAPPELS: [string, () => number][] = [
  ['Dans 1 heure', () => Date.now() + 3_600_000],
  [
    'Ce soir',
    () => {
      const d = new Date();
      d.setHours(19, 0, 0, 0);
      return Math.max(d.getTime(), Date.now() + 3_600_000);
    },
  ],
  ['Demain', () => aNeufHeures(1)],
  ['Dans 3 jours', () => aNeufHeures(3)],
];
const RETOUCHES = ['Plus court', 'Plus ferme', 'Plus doux', 'Moins formel', 'Ajouter une excuse'];
// Ordre : priorités de la matrice des réseaux (docs/Matrice_reseaux_Six.xlsx).
const CANAUX: { id: Canal; label: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'sms', label: 'SMS' },
  { id: 'email', label: 'E-mail' },
  { id: 'facebook', label: 'Facebook (public)' },
  { id: 'messenger', label: 'Messenger' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'x', label: 'X (public)' },
];

// Comment récupérer une conversation, réseau par réseau. Fichier = l'app sait exporter en .txt/.zip (Six le lit).
// Copie/capture = l'app n'exporte pas : on recopie les messages ou on prend une capture (lue sur le téléphone).
const EXPORTS: Record<
  Canal,
  { label: string; fichier: boolean; etapes: string[]; note?: string; lien?: string }
> = {
  whatsapp: {
    label: 'WhatsApp',
    fichier: true,
    lien: 'whatsapp://',
    etapes: [
      'Ouvre la discussion voulue.',
      'Trois points, puis **Plus**, puis **Exporter la discussion**, puis **Sans médias**.',
      "Dans la liste qui s'ouvre, choisis **Six**.",
    ],
    note: "Six n'apparaît qu'une fois installé sur ton écran d'accueil (menu du navigateur, Installer l'application). Sinon, enregistre l'export et choisis-le ci-dessous.",
  },
  sms: {
    label: 'SMS',
    fichier: true,
    lien: 'sms:',
    etapes: [
      'Ouvre la discussion voulue.',
      'Appuie longuement sur les messages, puis **Partager** ou **Copier**.',
      'Colle-les dans Six, ou enregistre et choisis le fichier.',
    ],
    note: "Certains téléphones proposent aussi « Exporter la discussion » en texte dans les réglages de l'app SMS.",
  },
  telegram: {
    label: 'Telegram',
    fichier: true,
    lien: 'tg://',
    etapes: [
      "Sur ordinateur : ouvre la discussion, puis le menu, puis **Exporter l'historique**.",
      'Choisis le format **texte**, sans médias.',
      'Colle le texte dans Six, ou choisis le fichier exporté.',
    ],
    note: "Sur téléphone, Telegram n'exporte pas en fichier : copie les messages ou prends une capture.",
  },
  email: {
    label: 'E-mail',
    fichier: false,
    lien: 'mailto:',
    etapes: [
      "Ouvre le fil d'e-mail voulu.",
      "Sélectionne le texte de l'échange, puis **Copier**.",
      'Colle-le dans Six.',
    ],
  },
  facebook: {
    label: 'Facebook',
    fichier: false,
    lien: 'fb://',
    etapes: [
      'Ouvre la discussion depuis Facebook (Messenger).',
      'Appuie longuement sur les messages, puis **Copier**.',
      'Colle dans Six, ou prends une capture.',
    ],
  },
  messenger: {
    label: 'Messenger',
    fichier: false,
    lien: 'fb-messenger://',
    etapes: [
      'Ouvre la discussion dans Messenger.',
      'Appuie longuement sur les messages, puis **Copier**.',
      'Colle-les dans Six, ou prends une capture.',
    ],
  },
  linkedin: {
    label: 'LinkedIn',
    fichier: false,
    lien: 'linkedin://',
    etapes: [
      'Ouvre la messagerie LinkedIn.',
      "Copie l'échange, ou prends une capture de l'écran.",
      'Colle dans Six.',
    ],
  },
  tiktok: {
    label: 'TikTok',
    fichier: false,
    lien: 'tiktok://',
    etapes: [
      'Ouvre tes messages TikTok.',
      "Copie l'échange, ou prends une capture.",
      'Colle dans Six.',
    ],
  },
  instagram: {
    label: 'Instagram',
    fichier: false,
    lien: 'instagram://',
    etapes: [
      'Ouvre la discussion (Messagerie Instagram).',
      'Appuie longuement sur le message, puis **Copier**.',
      'Colle dans Six, ou prends une capture.',
    ],
  },
  x: {
    label: 'X',
    fichier: false,
    lien: 'twitter://',
    etapes: [
      'Ouvre ta conversation privée sur X.',
      'Copie les messages, ou prends une capture.',
      'Colle dans Six.',
    ],
  },
};

/** Texte simple où **…** devient du gras. Pas de HTML injecté : le contenu vient du code, jamais de l'IA ni de l'utilisateur. */
function Gras({ text }: { text: string }) {
  return (
    <>{text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))}</>
  );
}

/** Passages à ne pas prendre au premier degré, relevés par l'analyse. */
function Nuances({ items }: { items: Nuance[] }) {
  if (!items.length) return null;
  return (
    <div className="card nuances">
      <div className="lbl">À ne pas prendre au premier degré</div>
      {items.map((n, i) => (
        <div className="nuance" key={i}>
          <q>
            <Masque text={n.expression} />
          </q>
          {n.premier_degre && (
            <p className="lit">
              <span className="sr">Au pied de la lettre : </span>
              <Masque text={n.premier_degre} />
            </p>
          )}
          <p className="small">
            <b>Sens probable :</b> <Masque text={n.sens_probable} />
          </p>
        </div>
      ))}
    </div>
  );
}

/** Texte masqué en clair, pour un titre : « [PERSONNE 1] » devient « Personne 1 ». */
const enClair = (text: string) => text.replace(/\[[A-ZÉÈ]+ \d+\]/g, (r) => lisible(r));

/** Texte masqué où les repères (« [TÉL 1] ») deviennent des pastilles lisibles (« Tél 1 »). */
function Masque({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\[[A-ZÉÈ]+ \d+\])/).map((p, i) =>
        /^\[[A-ZÉÈ]+ \d+\]$/.test(p) ? (
          <span className="mask" key={i} title={p}>
            {lisible(p)}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/** Aperçu exact de ce qui part vers l'IA, affiché comme des messages : « Moi » à droite, les autres à gauche. */
function Convo({ text }: { text: string }) {
  const msgs: { who: string; text: string }[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const m = /^([^:\n]{1,40}?)\s?:\s(.*)$/.exec(line);
    if (m) msgs.push({ who: m[1].trim(), text: m[2] });
    else if (msgs.length) msgs[msgs.length - 1].text += `\n${line}`;
    else msgs.push({ who: '', text: line });
  }
  return (
    <div className="convo" aria-label="Conversation masquée">
      {msgs.map((m, i) => (
        <div className={`msg${m.who === 'Moi' ? ' me' : ''}`} key={i}>
          {m.who && m.who !== msgs[i - 1]?.who && (
            <div className="who">
              <Masque text={m.who} />
            </div>
          )}
          <Masque text={m.text} />
        </div>
      ))}
    </div>
  );
}

async function post<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await entetesCompte()) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Pas de réseau. Ton texte est gardé, réessaie dans un instant.');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Erreur inattendue. Réessaie.');
  return data as T;
}

/** Coupe au début, sur une limite de ligne, pour rester sous la limite sans casser un repère. */
function fit(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(text.length - max);
  const nl = cut.indexOf('\n');
  return nl > -1 && nl < 200 ? cut.slice(nl + 1) : cut;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

// Ce que Six fait pendant qu'il réfléchit (composant Reflexion) : des phrases sur le travail, pas une barre de progression.
const PHASES_LIRE = [
  'Je masque les noms sur ton téléphone…',
  'Je lis la conversation…',
  "Je cherche ce que l'autre veut dire…",
  "Je vérifie s'il y a une arnaque…",
];
const PHASES_ECRIRE = ['Je choisis le ton…', "J'écris trois réponses…", 'Je les relis…'];
const PHASES_REECRIRE = ['Six réécrit les réponses…', 'Je relis…'];
const PRUDENT = 'Répondre prudemment sans rien révéler';

/** Contexte de la conversation en cours, lu par les appels qui s'enchaînent sans attendre un nouveau rendu. */
interface Contexte {
  outgoing: string;
  mapping: Record<string, string>;
  contact: string;
}

/** Tension de la conversation (0 à 100) dite en un mot. */
const niveauTension = (t: number) =>
  t < 25 ? 'Calme' : t < 50 ? 'Légère' : t < 75 ? 'Tendue' : 'Très tendue';

const interlocuteur = (people: string[], me: string) =>
  people.find((p) => p !== me && p.toLowerCase() !== 'moi' && !isGenericSpeaker(p)) ?? '';

/**
 * Six sur un seul écran, comme une messagerie d'IA : on colle la conversation, elle part masquée,
 * Six réfléchit puis répond dans le fil (ce qu'il a compris, l'alerte arnaque, trois réponses).
 * La barre de saisie sert ensuite à préciser ce qu'on veut ; les réponses sont réécrites sur place.
 */
export function Flow() {
  const started = useRef(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const wordInput = useRef<HTMLInputElement>(null);
  const champ = useRef<HTMLTextAreaElement>(null);
  const ctx = useRef<Contexte | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrPct, setOcrPct] = useState(0);
  const [shots, setShots] = useState<File[]>([]); // captures en cours de lecture (elles restent sur le téléphone)
  const [dragging, setDragging] = useState(false);
  const [attach, setAttach] = useState(false); // feuille d'import (« + » de la barre de saisie)
  // Salutation lue après le rendu (heure, prénom), remise à jour chaque minute : elle suit le moment de la journée.
  const [hello, setHello] = useState({ mot: 'Bonjour', phrase: '', prenom: '' });
  useEffect(() => {
    const lire = () =>
      setHello({ mot: salutation(), phrase: phraseAccueil(), prenom: lireCompte().prenom });
    lire();
    const minute = window.setInterval(lire, 60_000);
    const arreter = ecouterCompte(lire);
    return () => {
      window.clearInterval(minute);
      arreter();
    };
  }, []);
  const [backHint, setBackHint] = useState(false);
  const [canal, setCanal] = useState<Canal | ''>(''); // réseau où partira la réponse ("" = forme de la conversation)
  const [source, setSource] = useState<Canal>('whatsapp'); // application choisie sur l'écran d'export
  const [tuto, setTuto] = useState(false); // mode d'emploi de l'export ouvert
  const [ton, setTon] = useState<Ton>('professionnel');
  const [longueur, setLongueur] = useState<Longueur>('moyenne');
  useEffect(() => {
    try {
      const c = localStorage.getItem('six-canal') ?? '';
      if (CANAUX.some((k) => k.id === c)) setCanal(c as Canal);
      const t = localStorage.getItem('six-ton');
      if (TONS.some((k) => k.id === t)) setTon(t as Ton);
      const l = localStorage.getItem('six-longueur');
      if (LONGUEURS.some((k) => k.id === l)) setLongueur(l as Longueur);
    } catch {
      /* préférences indisponibles : valeurs par défaut */
    }
  }, []);

  function chooseCanal(c: Canal | '') {
    setCanal(c);
    remember('six-canal', c);
  }

  // Deux écrans seulement : le fil (accueil) et le guide d'export d'une app.
  const [step, setStep] = useState<'home' | 'whatsapp'>('home');
  useEffect(() => {
    const root = document.documentElement;
    if (step === 'home') delete root.dataset.parcours;
    else root.dataset.parcours = step;
    window.scrollTo(0, 0);
    return () => {
      delete root.dataset.parcours;
    };
  }, [step]);
  const [raw, setRaw] = useState(''); // barre de saisie : la conversation à coller
  const [message, setMessage] = useState(''); // barre de saisie pendant le fil : une précision pour Six
  const [conv, setConv] = useState('');
  const [names, setNames] = useState<string[]>([]);
  const [people, setPeople] = useState<string[]>([]); // étiquettes de la conversation (vrais noms, restent sur le téléphone)
  const [me, setMe] = useState(''); // qui est l'utilisateur dans la conversation
  const [meGuessed, setMeGuessed] = useState(false); // vrai tant que c'est Six qui a deviné (à vérifier)
  const [quiOuvert, setQuiOuvert] = useState(false);
  const [note, setNote] = useState('');
  const [newName, setNewName] = useState('');
  const [addWord, setAddWord] = useState(false); // champ « Masquer un autre mot » ouvert
  useEffect(() => {
    if (addWord) wordInput.current?.focus();
  }, [addWord]);
  const [restoreNames, setRestoreNames] = useState(true);
  const [apercuOuvert, setApercuOuvert] = useState(false); // texte envoyé (masqué) déplié
  const [memoOn, setMemoOn] = useState(false); // mémoire de Six active (lue après le rendu : localStorage)
  const [noteMemo, setNoteMemo] = useState(''); // ce que l'utilisateur sait de son interlocuteur
  const [suivi, setSuivi] = useState<{ qui: string; quoi: string; canal: Canal | '' } | null>(null);
  const [suiviNote, setSuiviNote] = useState('');
  const [analysing, setAnalysing] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [objectif, setObjectif] = useState('');
  const [consignes, setConsignes] = useState<string[]>([]); // ce que l'utilisateur a précisé dans la barre de saisie
  // Réglage ouvert sous les réponses : objectif, ton ou autres options (longueur, réseau, vrais noms).
  const [options, setOptions] = useState<'' | 'objectif' | 'ton' | 'plus'>('');
  const basculer = (p: 'objectif' | 'ton' | 'plus') => setOptions((o) => (o === p ? '' : p));
  const [replies, setReplies] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  // Écriture lettre par lettre : le résumé, puis les réponses une par une (A, puis B, puis C).
  const [resumeFini, setResumeFini] = useState(false);
  const [tape, setTape] = useState(0);
  useEffect(() => setResumeFini(false), [analysis]);
  const [edition, setEdition] = useState(false); // la réponse choisie est ouverte pour être retouchée
  const [text, setText] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [finalText, setFinalText] = useState('');
  const [copied, setCopied] = useState(true);
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [gardees, setGardees] = useState<ConversationGardee[]>([]); // conversations terminées gardées (mémoire active)
  // Conversations gardées : lues au démarrage et à chaque changement de mémoire (activation, effacement).
  useEffect(() => {
    const lire = () => {
      const on = memoireActive();
      setMemoOn(on);
      setGardees(on ? lireConversations() : []);
    };
    lire();
    window.addEventListener('six-memoire', lire);
    return () => window.removeEventListener('six-memoire', lire);
  }, []);

  // Le presse-papiers n'est lu que lorsque la personne touche « Coller » : jamais en arrière-plan.

  const actif = Boolean(conv); // une conversation est dans le fil
  const saisie = actif ? message : raw;

  // La barre de saisie grandit avec le texte, jusqu'à 7 lignes environ.
  useEffect(() => {
    const t = champ.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight, 180)}px`;
  }, [saisie]);

  const masked = useMemo(() => (conv ? anonymize(conv, names) : null), [conv, names]);
  // L'interlocuteur : le premier participant qui n'est pas l'utilisateur (sert à la mémoire et aux suivis).
  const contact = useMemo(() => interlocuteur(people, me), [people, me]);
  useEffect(() => {
    const on = memoireActive();
    setMemoOn(on);
    setNoteMemo(on && contact ? noteContact(contact) : '');
  }, [contact]);
  // Texte envoyé à l'IA : masqué, et les messages de l'utilisateur marqués « Moi » pour qu'elle écrive du bon côté.
  const outgoing = useMemo(
    () => (masked ? markMe(masked.text, me, masked.mapping) : ''),
    [masked, me],
  );

  // Le fil descend vers le dernier message de Six quand il arrive.
  useEffect(() => {
    const el = document.querySelector('[data-dernier]');
    if (!el) return;
    const doux = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'start', behavior: doux ? 'smooth' : 'auto' });
  }, [analysing, analysis, busy, replies, consignes.length, finalText]);

  // Un texte reçu depuis une notification Android est chargé localement, sans envoi automatique.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    try {
      const notification = sessionStorage.getItem('six-notification-draft');
      if (notification) {
        sessionStorage.removeItem('six-notification-draft');
        setRaw(notification);
        return;
      }
    } catch {
      setError("Le message reçu n'a pas pu être récupéré. Il n'a pas été envoyé.");
    }
    const action = new URLSearchParams(window.location.search).get('action');
    if (action === 'whatsapp') {
      setStep('whatsapp');
      window.history.replaceState(null, '', '/');
    } else if (action) {
      window.history.replaceState(null, '', '/');
    }
  }, []);

  useEffect(() => {
    const importSharedDraft = () => {
      try {
        const draft = sessionStorage.getItem('six-notification-draft');
        if (!draft) return;
        sessionStorage.removeItem('six-notification-draft');
        setRaw(draft);
      } catch {
        setError("Le message partagé n'a pas pu être récupéré. Il n'a pas été envoyé.");
      }
    };
    window.addEventListener('six-shared-draft', importSharedDraft);
    return () => window.removeEventListener('six-shared-draft', importSharedDraft);
  }, []);

  // Capture reçue du raccourci iPhone « Analyser une capture avec Six » : lue comme une capture importée.
  const addShotsRef = useRef<(files: File[]) => void>(() => {});
  useEffect(() => {
    const importerCapture = () => {
      const f = prendreCapture();
      if (f) addShotsRef.current([f]);
    };
    importerCapture();
    window.addEventListener(EVT_CAPTURE, importerCapture);
    return () => window.removeEventListener(EVT_CAPTURE, importerCapture);
  }, []);

  // Une discussion tient souvent sur plusieurs captures : on les range de la plus ancienne à la plus récente.
  const sortShots = (files: File[]) => [...files].sort((a, b) => a.lastModified - b.lastModified);

  // Une capture choisie, collée ou déposée est lue tout de suite, puis part dans le fil (comme une photo envoyée à une IA).
  function addShots(list: FileList | File[] | null) {
    const files = sortShots(Array.from(list ?? []).filter((f) => f.type.startsWith('image/')));
    if (imageInput.current) imageInput.current.value = '';
    if (!files.length || ocrBusy) return;
    setError(
      files.length > MAX_IMAGES
        ? `${MAX_IMAGES} captures au maximum : les premières sont lues.`
        : '',
    );
    void readShots(files.slice(0, MAX_IMAGES));
  }
  useEffect(() => {
    addShotsRef.current = addShots;
  });

  async function readShots(files: File[]) {
    if (!files.length) return;
    setShots(files);
    setError('');
    setOcrBusy(true);
    setOcrPct(0);
    try {
      const read = await readScreenshots(files, setOcrPct);
      prepare(
        read,
        false,
        `Lu sur ${files.length > 1 ? `tes ${files.length} captures, dans l'ordre` : 'ta capture'}, sur ton téléphone. « Moi » = tes messages, « Autre » = l'autre personne.`,
      );
    } catch (e) {
      setError(
        e instanceof OcrError
          ? e.message
          : 'La lecture de la capture a échoué. Colle le texte à la place.',
      );
    } finally {
      setOcrBusy(false);
      setShots([]);
    }
  }

  // Coller une image (Ctrl+V d'une capture) ou déposer des fichiers dans la zone.
  function onPasteZone(e: ClipboardEvent) {
    if (actif) return;
    const images = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
    if (images.length) {
      e.preventDefault();
      addShots(images);
    }
  }

  function onDropZone(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (actif) return;
    const files = Array.from(e.dataTransfer.files);
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length) addShots(images);
    const doc = files.find((f) => !f.type.startsWith('image/'));
    if (doc) void loadFile(doc);
    const dropped = e.dataTransfer.getData('text/plain');
    if (!files.length && dropped) setRaw((r) => (r.trim() ? `${r.trim()}\n${dropped}` : dropped));
  }

  function effacerConversation() {
    ctx.current = null;
    setConv('');
    setNames([]);
    setPeople([]);
    setMe('');
    setMeGuessed(false);
    setQuiOuvert(false);
    setNote('');
    setAddWord(false);
    setAnalysis(null);
    setAnalysing(false);
    setObjectif('');
    setConsignes([]);
    setReplies([]);
    setEdition(false);
    setText('');
    setHistory([]);
    setOptions('');
    setMessage('');
  }

  function reset() {
    effacerConversation();
    setAttach(false);
    setSuivi(null);
    setSuiviNote('');
    setShots([]);
    setBackHint(false);
    setStep('home');
    setRaw('');
    setFinalText('');
    setError('');
    setBusy(false);
  }

  async function pasteFromClipboard() {
    try {
      setRaw(await navigator.clipboard.readText());
      setError('');
    } catch {
      setError(
        'Le collage automatique est refusé. Appuie longuement dans la zone, puis choisis Coller.',
      );
    }
  }

  async function loadFile(file: File | undefined, auto = false) {
    if (!file) return;
    if (file.size > 50_000_000) {
      setError('Ce fichier est trop gros. Exporte la discussion sans médias.');
      return;
    }
    let t: string;
    try {
      const buffer = await file.arrayBuffer();
      const head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
      const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04; // « PK »
      if (isZip) {
        t = (await readChatFromZip(buffer)).text;
      } else {
        t = new TextDecoder('utf-8').decode(buffer);
        const sample = t.slice(0, 2000);
        const controls = [...sample].filter((char) => {
          const code = char.charCodeAt(0);
          return code <= 8 || (code >= 14 && code <= 31);
        }).length;
        if (controls > 20) {
          setError(
            "Ce fichier n'est pas une discussion. Choisis le fichier .txt ou .zip exporté par WhatsApp.",
          );
          if (auto) setStep('whatsapp');
          return;
        }
      }
    } catch (e) {
      setError(e instanceof ZipError ? e.message : "Ce fichier n'a pas pu être lu.");
      if (auto) setStep('whatsapp');
      return;
    }
    if (!t.trim()) {
      setError('Ce fichier est vide. Exporte à nouveau la discussion depuis WhatsApp.');
      if (auto) setStep('whatsapp');
      return;
    }
    setError('');
    if (auto) prepare(t, true);
    else setRaw(t);
  }

  /** Prépare la conversation collée (export WhatsApp reconnu, limite de taille), puis l'envoie masquée. */
  function prepare(src?: string, fromFile = false, lu = '') {
    let t = (src ?? raw).trim();
    const original = t;
    let known: string[] = [];
    let info = lu;
    let c = canal;
    if (looksLikeWhatsApp(t)) {
      const chat = parseWhatsApp(t);
      if (chat.messages.length) {
        const r = toConversation(chat.messages, MAX_CHARS - 300);
        t = r.text;
        known = chat.authors.filter((a) => !isGenericSpeaker(a));
        info = `Export WhatsApp reconnu : ${r.kept} derniers messages gardés sur ${r.total}.`;
        c = 'whatsapp';
        setCanal('whatsapp'); // la réponse repartira dans WhatsApp (pour cette conversation seulement)
      } else {
        // Format pas entièrement reconnu : on garde la fin du texte brut plutôt que rien.
        t = fit(original, MAX_CHARS - 300);
        info =
          "Format de l'export pas entièrement reconnu : vérifie que les noms sont bien masqués.";
      }
    } else if (t.length > MAX_CHARS - 300) {
      t = fit(t, MAX_CHARS - 300);
      info = 'Seuls les derniers messages sont gardés (limite de 2000 caractères).';
    }
    if (!known.length) known = speakerLabels(t);
    if (!t) {
      setError(
        fromFile
          ? 'Aucun message lisible dans ce fichier. Colle la conversation à la place.'
          : "Colle une conversation d'abord.",
      );
      setStep('home');
      return;
    }
    effacerConversation();
    setError('');
    setFinalText('');
    setSuivi(null);
    setBackHint(false);
    setAttach(false);
    setStep('home');
    const who = listSpeakers(t);
    const guess = guessMe(who, t);
    setConv(t);
    setNames(known);
    setPeople(who);
    setMe(guess);
    setMeGuessed(guess !== '' && guess.toLowerCase() !== 'moi');
    setNote(info);
    setRaw('');
    void lancer({ conv: t, names: known, me: guess, people: who, canal: c });
  }

  /** Masque sur le téléphone, envoie le texte masqué à l'analyse, puis écrit trois réponses (sauf arnaque probable). */
  async function lancer(o: {
    conv: string;
    names: string[];
    me: string;
    people: string[];
    canal?: Canal | '';
  }) {
    const m = anonymize(o.conv, o.names);
    const proche = interlocuteur(o.people, o.me);
    ctx.current = {
      outgoing: markMe(m.text, o.me, m.mapping),
      mapping: m.mapping,
      contact: proche,
    };
    setAnalysis(null);
    setReplies([]);
    setEdition(false);
    setError('');
    setAnalysing(true);
    let a: Analysis;
    try {
      a = await post<Analysis>('/api/analyze', {
        conversation: fit(ctx.current.outgoing, MAX_CHARS),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inattendue.');
      setAnalysing(false);
      return;
    }
    setAnalysis(a);
    setDemo(a.demo);
    const goal = a.objectifs[0] ?? '';
    setObjectif(goal);
    setAnalysing(false);
    if (a.arnaque.score < SCAM_THRESHOLD)
      await generate({ goal: goal || 'Répondre de façon adaptée', canal: o.canal });
  }

  function relancer(o: { names?: string[]; me?: string } = {}) {
    if (!conv) return;
    void lancer({ conv, names: o.names ?? names, me: o.me ?? me, people, canal });
  }

  /**
   * Demande 3 réponses. Changer l'objectif, le ton, la longueur ou le réseau, ou écrire une précision, relance la rédaction
   * sur place (les nouvelles valeurs sont passées ici, l'état React n'étant à jour qu'au rendu suivant).
   */
  async function generate(
    o: {
      goal?: string;
      ton?: Ton;
      longueur?: Longueur;
      canal?: Canal | '';
      consignes?: string[];
    } = {},
  ) {
    const c0 = ctx.current;
    if (!c0) return;
    const goal = o.goal ?? (objectif || 'Répondre de façon adaptée');
    const c = o.canal ?? canal;
    setBusy(true);
    setError('');
    setEdition(false);
    try {
      const extra = [...(o.consignes ?? consignes), consigneMemoire(c0.contact, c0.mapping)]
        .filter(Boolean)
        .join('. ');
      const r = await post<RepliesResult>('/api/replies', {
        conversation: fit(c0.outgoing, MAX_CHARS),
        objectif: goal,
        ton: o.ton ?? ton,
        longueur: o.longueur ?? longueur,
        precision: extra || undefined,
        style: loadStyle(),
        canal: c || undefined,
      });
      setReplies(r.reponses);
      // Afficher et rendre les trois propositions utilisables dès la réponse du serveur.
      // Leur écriture lettre par lettre, en série, ajoutait plusieurs secondes d'attente.
      setTape(r.reponses.length);
      setDemo(r.demo);
      setSelected(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inattendue.');
    } finally {
      setBusy(false);
    }
  }

  function remember(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* préférence non gardée */
    }
  }

  // Dans le fil : changer un réglage réécrit tout de suite les 3 propositions.
  function changeObjectif(g: string) {
    if (g === objectif && replies.length) return;
    setObjectif(g);
    void generate({ goal: g });
  }

  function changeTon(t: Ton) {
    if (t === ton && replies.length) return;
    setTon(t);
    remember('six-ton', t);
    void generate({ ton: t });
  }

  function changeLongueur(l: Longueur) {
    if (l === longueur) return;
    setLongueur(l);
    remember('six-longueur', l);
    void generate({ longueur: l });
  }

  function changeCanal(c: Canal | '') {
    if (c === canal) return;
    chooseCanal(c);
    void generate({ canal: c });
  }

  /** Barre de saisie : sans conversation, elle envoie ce qui est collé ; dans le fil, elle ajoute une précision. */
  function envoyer() {
    if (!actif) {
      prepare();
      return;
    }
    const t = message.trim();
    if (!t || busy || analysing) return;
    const n = [...consignes, t];
    setConsignes(n);
    setMessage('');
    if (analysis) {
      const goal =
        analysis.arnaque.score >= SCAM_THRESHOLD && !replies.length ? PRUDENT : undefined;
      if (goal) setObjectif(goal);
      void generate({ consignes: n, goal });
    }
  }

  async function applyConsigne(c: string) {
    if (!c.trim()) return;
    setBusy(true);
    setError('');
    try {
      const r = await post<AdjustResult>('/api/adjust', { reponse: text, consigne: c });
      setHistory((h) => [...h, text]);
      setText(r.reponse);
      setDemo(r.demo);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inattendue.');
    } finally {
      setBusy(false);
    }
  }

  async function finish(reply: string) {
    const mapping = ctx.current?.mapping ?? masked?.mapping ?? {};
    const out = restoreNames ? restore(reply, mapping) : reply;
    setCopied(await copyText(out));
    setFinalText(out);
    if (memoOn) retenirChoix(reply); // des nombres seulement (mots, emoji, tu/vous), jamais le texte
    // Mémoire active : la conversation terminée (texte déjà masqué + réponse) est gardée sur ce
    // téléphone, jusqu'à ce que la personne l'efface. Rien ne part vers le compte.
    // L'extrait vient du texte masqué (noms et numéros remplacés), jamais de la conversation d'origine.
    const masque = ctx.current?.outgoing ?? outgoing;
    if (memoOn && masque.trim()) {
      garderConversation({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        quand: Date.now(),
        canal: canal ? (EXPORTS[canal]?.label ?? canal) : '',
        extrait: masque.trim().split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 140),
        reponse: out,
      });
      setGardees(lireConversations());
    }
    // Le secrétaire propose un suivi : avec qui, pour quoi, sur quel réseau. Rien de la conversation.
    setSuivi({ qui: contact || 'Cette conversation', quoi: restore(objectif, mapping), canal });
    setSuiviNote('');
    setBackHint(false);
    // La conversation est effacée de la mémoire de l'appli dès la copie.
    effacerConversation();
  }

  /** Rouvre une conversation gardée : la réponse de Six s'affiche à nouveau, prête à recopier. */
  function rouvrirConversation(g: ConversationGardee) {
    reset();
    setFinalText(g.reponse);
    setCopied(false);
  }

  // Réponse gardée ouverte depuis le menu latéral (« Réponses ») : /?g=<id>.
  const params = useSearchParams();
  const router = useRouter();
  const gardeeDemandee = params.get('g');
  useEffect(() => {
    if (!gardeeDemandee) return;
    const g = lireConversations().find((c) => c.id === gardeeDemandee);
    if (g) rouvrirConversation(g);
    router.replace('/', { scroll: false });
    // rouvrirConversation ne dépend que des réglages de l'écran : on ne relance que pour une nouvelle demande.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gardeeDemandee]);

  function supprimerGardee(id: string) {
    effacerConversationGardee(id);
    setGardees(lireConversations());
  }

  /* ---------- Écrans ---------- */

  if (step === 'whatsapp') {
    const ex = EXPORTS[source];
    const viaCopie = () => {
      chooseCanal(source); // la réponse prendra la forme de ce réseau
      setStep('home');
    };
    return (
      <main className="screen">
        <div className="top">
          <button
            className="back"
            onClick={() => {
              setError('');
              setStep('home');
            }}
            aria-label="Retour"
          >
            <Icon name="back" />
          </button>
          <h1 className="top-title">Importer une conversation</h1>
        </div>
        <div className="intro">
          <h2>
            D&apos;où vient la <em>conversation</em> ?
          </h2>
          <p className="muted">
            Choisis l&apos;application. Six t&apos;explique comment récupérer la discussion, et
            adapte ses réponses à ce réseau.
          </p>
        </div>
        <div className="chips one" role="group" aria-label="Application">
          {(Object.keys(EXPORTS) as Canal[]).map((id) => (
            <button
              key={id}
              className="chip"
              aria-pressed={source === id}
              onClick={() => {
                setSource(id);
                setError('');
              }}
            >
              {EXPORTS[id].label}
            </button>
          ))}
        </div>
        <section className="card stack guide" aria-labelledby="guide-titre">
          <div className="row sp">
            <h3 className="lbl" id="guide-titre">
              {ex.label} : {ex.fichier ? 'exporter la discussion' : 'copier ou capturer'}
            </h3>
            <span className={`badge${ex.fichier ? ' ok' : ''}`}>
              {ex.fichier ? 'Fichier lu par Six' : "Pas d'export"}
            </span>
          </div>
          <p className="muted small">
            {ex.fichier
              ? `${ex.label} sait exporter la discussion : Six lit le fichier et garde les derniers messages.`
              : `${ex.label} ne fournit pas de fichier d'export. Six lit la capture sur ton téléphone, elle n'est jamais envoyée.`}
          </p>
          <button className="link" aria-expanded={tuto} onClick={() => setTuto((v) => !v)}>
            <Icon name="bulb" size={16} /> {tuto ? "Masquer le mode d'emploi" : 'Comment ça marche'}
          </button>
          {tuto && (
            <>
              <ol className="howto">
                {ex.etapes.map((e, i) => (
                  <li key={i}>
                    <span>
                      <Gras text={e} />
                    </span>
                  </li>
                ))}
              </ol>
              {ex.note && <p className="muted small">{ex.note}</p>}
            </>
          )}
        </section>
        <div className="stack">
          {ex.fichier && (
            <label className="example">
              <span className="ex-ico">
                <Icon name="file" size={18} />
              </span>
              <span className="grow">J&apos;ai déjà exporté : choisir le fichier</span>
              <Icon name="chevron" size={18} />
              <input
                type="file"
                accept=".txt,.zip,text/plain,application/zip,application/x-zip-compressed,application/octet-stream"
                className="sr"
                onChange={(e) => {
                  void loadFile(e.target.files?.[0], true);
                  e.target.value = '';
                }}
              />
            </label>
          )}
          <button className="example" onClick={viaCopie}>
            <span className="ex-ico">
              <Icon name="image" size={18} />
            </span>
            <span className="grow">Prendre une capture d&apos;écran</span>
            <Icon name="chevron" size={18} />
          </button>
          <button className="example" onClick={viaCopie}>
            <span className="ex-ico">
              <Icon name="clip" size={18} />
            </span>
            <span className="grow">Copier-coller les messages</span>
            <Icon name="chevron" size={18} />
          </button>
        </div>
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        {ex.lien && (
          <div className="foot">
            <a className="btn primary" href={ex.lien}>
              <Icon name="chat" /> Ouvrir {ex.label}
            </a>
          </div>
        )}
      </main>
    );
  }

  const fil = actif || Boolean(finalText);
  const occupe = analysing || busy;

  // Bilan du masquage (« 2 noms · 1 numéro ») à partir des repères présents dans ce qui part.
  const reperes = Array.from(new Set(outgoing.match(/\[[A-ZÉÈ]+ \d+\]/g) ?? []));
  const bilan = new Map<string, [string, string, number]>();
  for (const r of reperes) {
    const [un, plusieurs] = SORTES[r.slice(1).split(' ')[0]] ?? ['autre', 'autres'];
    const n = (bilan.get(un)?.[2] ?? 0) + 1;
    bilan.set(un, [un, plusieurs, n]);
  }
  const plusieursPersonnes =
    people.length > 0 && !(people.length === 1 && people[0].toLowerCase() === 'moi');
  const arnaque = analysis ? analysis.arnaque.score >= SCAM_THRESHOLD : false;
  const objectifs = analysis
    ? Array.from(new Set([...analysis.objectifs, ...(arnaque ? [PRUDENT] : [])]))
    : [];
  // Le message de Six le plus récent reçoit data-dernier : le fil y descend quand il change.
  const dernierBloc = finalText
    ? 'fin'
    : replies.length || busy || (analysis && error)
      ? 'reponses'
      : 'analyse';

  // Fin : l'app où partira la réponse, connue si l'utilisateur l'a choisie (réseau) ou s'il a importé un export.
  const appli = canal ? EXPORTS[canal] : undefined;
  function revenir() {
    setBackHint(true);
    window.close(); // ferme Six s'il a été ouvert par un partage (Android)
    // Sinon (iPhone, app ouverte à la main) : on rouvre la messagerie, la réponse est déjà copiée.
    if (appli?.lien) {
      const lien = appli.lien;
      window.setTimeout(() => {
        if (!document.hidden) window.location.href = lien;
      }, 250);
    }
  }

  return (
    <main
      className={`screen home${fil ? ' chat' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!actif) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDropZone}
    >
      <AppBar page="accueil" onNouvelle={reset} />
      <div className="home-body">
        {!fil && !ocrBusy && (
          <div className="hello">
            <Logo label="" />
            <h1>{hello.prenom ? `${hello.mot}, ${hello.prenom}` : hello.mot}</h1>
            <p className="muted">{hello.phrase}</p>
          </div>
        )}

        {actif && (
          <div className="fil">
            <section className="envoi" aria-labelledby="part-titre">
              <button
                type="button"
                className="envoi-tete"
                aria-expanded={apercuOuvert}
                onClick={() => setApercuOuvert((v) => !v)}
              >
                <Icon name="lock" size={18} stroke={1.9} />
                <span className="envoi-txt">
                  <span id="part-titre">Texte envoyé, masqué</span>
                  <span className="envoi-bilan">
                    {bilan.size
                      ? [...bilan.values()]
                          .map(([un, plusieurs, n]) => `${n} ${n > 1 ? plusieurs : un}`)
                          .join(' · ')
                      : 'Rien à masquer trouvé'}
                  </span>
                </span>
                <span className="envoi-voir">{apercuOuvert ? 'Masquer' : 'Voir'}</span>
              </button>
              {apercuOuvert && (
                <>
                  <Convo text={outgoing} />
                  {note && <p className="muted small">{note}</p>}
                  <div className="envoi-acts">
                    <button
                      className="link"
                      aria-expanded={addWord}
                      onClick={() => setAddWord((v) => !v)}
                      disabled={occupe}
                    >
                      <Icon name="shield" size={16} /> Masquer un autre mot
                    </button>
                    {plusieursPersonnes && (
                      <button
                        className="link"
                        aria-expanded={quiOuvert}
                        onClick={() => setQuiOuvert((v) => !v)}
                        disabled={occupe}
                      >
                        <Icon name="user" size={16} /> {me ? `Tu es ${me}` : "Tu n'as pas écrit"}
                      </button>
                    )}
                  </div>
                  {addWord && (
                    <form
                      className="row"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const n = newName.trim();
                        if (!n) return;
                        const next = names.includes(n) ? names : [...names, n];
                        setNames(next);
                        setNewName('');
                        setAddWord(false);
                        relancer({ names: next }); // le nouveau mot est masqué, puis Six relit la conversation
                      }}
                    >
                      <label className="sr" htmlFor="nm">
                        Mot à masquer
                      </label>
                      <input
                        ref={wordInput}
                        id="nm"
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Un nom, un lieu, un détail…"
                      />
                      <button className="btn ghost small" type="submit">
                        Masquer
                      </button>
                    </form>
                  )}
                  {quiOuvert && plusieursPersonnes && (
                    <div className="stack">
                      <div
                        className="seg"
                        role="group"
                        aria-label="Qui es-tu dans la conversation ?"
                      >
                        {[...people, ''].map((p) => (
                          <button
                            key={p || 'personne'}
                            aria-pressed={me === p}
                            onClick={() => {
                              setMe(p);
                              setMeGuessed(false);
                              setQuiOuvert(false);
                              if (p !== me) relancer({ me: p });
                            }}
                          >
                            {p || "Je n'ai pas écrit"}
                          </button>
                        ))}
                      </div>
                      <p className="muted small">
                        Ce nom reste sur ton téléphone : l&apos;IA voit seulement « Moi ».
                      </p>
                    </div>
                  )}
                </>
              )}
              {meGuessed && me && !quiOuvert && (
                <p className="muted small">
                  Six pense que tu es {me}.{' '}
                  <button
                    type="button"
                    className="link-inline"
                    onClick={() => {
                      setApercuOuvert(true);
                      setQuiOuvert(true);
                    }}
                  >
                    Changer
                  </button>
                </p>
              )}
            </section>

            <section
              className="six"
              aria-label="Réponse de Six"
              data-dernier={dernierBloc === 'analyse' ? '' : undefined}
            >
              <span className="six-ava" aria-hidden="true">
                <Logo small label="" />
              </span>
              <div className="six-corps">
                {analysing && <Reflexion compact phases={[...PHASES_LIRE, ...PHASES_ECRIRE]} />}
                {!analysing && !analysis && error && (
                  <>
                    <p className="err" role="alert">
                      {error}
                    </p>
                    <button className="btn ghost small" onClick={() => relancer()}>
                      <Icon name="refresh" size={18} /> Réessayer
                    </button>
                  </>
                )}
                {analysis && arnaque && (
                  <div className="alert stack" role="alert">
                    <div className="row">
                      <Icon name="alert" size={22} />
                      <h2 className="fil-titre">Ce message ressemble à une arnaque</h2>
                    </div>
                    <ul className="raisons">
                      {(analysis.arnaque.raisons.length
                        ? analysis.arnaque.raisons
                        : ['Plusieurs signes inhabituels']
                      ).map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                    <p className="small">
                      Ne donne jamais de code PIN, de mot de passe ni d&apos;argent à quelqu&apos;un
                      qui te le demande par message.
                    </p>
                    <details>
                      <summary className="link">Comment bloquer ce contact</summary>
                      <p className="muted small">
                        Six ne peut pas bloquer à ta place. Dans WhatsApp : ouvre la discussion,
                        touche le nom en haut, puis « Bloquer ». Pour un SMS : appuie longuement sur
                        la conversation, puis « Bloquer ». Tu peux aussi signaler le numéro à ton
                        opérateur.
                      </p>
                    </details>
                    {!replies.length && !busy && (
                      <div className="row wrap">
                        <button className="btn ghost small" onClick={() => changeObjectif(PRUDENT)}>
                          Répondre prudemment
                        </button>
                        <button className="btn ghost small" onClick={reset}>
                          Ignorer et quitter
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {analysis && (
                  <div className="read">
                    <h2 className="lbl" id="compris">
                      Ce que Six a compris
                    </h2>
                    <p>
                      <Ecrit
                        texte={analysis.resume}
                        rendu={(t) => <Masque text={t} />}
                        onFin={() => setResumeFini(true)}
                      />
                    </p>
                    {resumeFini && (
                      <dl className="faits">
                        {analysis.intention && (
                          <div>
                            <dt>Intention</dt>
                            <dd>
                              <Masque text={analysis.intention} />
                            </dd>
                          </div>
                        )}
                        {analysis.ton_detecte && (
                          <div>
                            <dt>Ton</dt>
                            <dd>
                              <Masque text={analysis.ton_detecte} />
                            </dd>
                          </div>
                        )}
                        <div>
                          <dt>Tension</dt>
                          <dd>{niveauTension(analysis.tension)}</dd>
                        </div>
                        <div>
                          <dt>Arnaque</dt>
                          <dd className={arnaque ? 'fait-risque' : 'fait-sur'}>
                            {arnaque
                              ? `Risque élevé (${analysis.arnaque.score} %)`
                              : `Aucun signe (${analysis.arnaque.score} %)`}
                          </dd>
                        </div>
                      </dl>
                    )}
                    {resumeFini && <Nuances items={analysis.nuances ?? []} />}
                    {resumeFini && analysis.question && (
                      <p className="question">
                        <b>Six te demande :</b> {analysis.question}
                        <span className="muted small">
                          {' '}
                          Réponds dans la barre en bas si tu veux.
                        </span>
                      </p>
                    )}
                    {resumeFini && memoOn && contact && (
                      <details className="memo">
                        <summary className="link">Ce que Six sait de {contact}</summary>
                        <label className="sr" htmlFor="memo">
                          Ce que tu sais de {contact}
                        </label>
                        <textarea
                          id="memo"
                          rows={2}
                          maxLength={NOTE_MAX}
                          value={noteMemo}
                          onChange={(e) => setNoteMemo(e.target.value)}
                          onBlur={() => ecrireNote(contact, noteMemo)}
                          placeholder="Ex : mon petit frère, on se tutoie, il aime plaisanter"
                        />
                        <p className="muted small">
                          Gardé sur ton téléphone pour les prochaines fois. Envoyé avec ta demande,
                          nom masqué.
                        </p>
                      </details>
                    )}
                  </div>
                )}
              </div>
            </section>

            {analysis &&
              consignes.map((c, i) => (
                <p className="bulle-moi" key={i}>
                  {c}
                </p>
              ))}

            {analysis && (busy || replies.length > 0 || error) && (
              <section
                className="six suite"
                aria-label="Réponses proposées par Six"
                data-dernier={dernierBloc === 'reponses' ? '' : undefined}
              >
                <div className="six-corps">
                  {demo && (
                    <p className="demo">
                      Réponses d’exemple : l’IA de Six n’est pas encore branchée.
                    </p>
                  )}
                  {busy && (
                    <Reflexion compact phases={replies.length ? PHASES_REECRIRE : PHASES_ECRIRE} />
                  )}
                  {replies.length > 0 && (
                    <>
                      <h2 className="lbl">Réponses proposées</h2>
                      <div
                        className={`stack bubbles${busy ? ' busy' : ''}`}
                        data-canal={canal || undefined}
                        aria-busy={busy}
                        role="group"
                        aria-label="Réponses proposées"
                      >
                        {replies.map((r, i) =>
                          i > tape ? null : (
                            <div className="pick" key={i}>
                              <button
                                className="reply"
                                aria-pressed={selected === i}
                                onClick={() => {
                                  setSelected(i);
                                  setEdition(false);
                                }}
                                disabled={busy}
                              >
                                <b>Proposition {'ABC'[i]}</b>
                                <span className="reply-text">
                                  <Masque text={r} />
                                </span>
                              </button>
                              {selected === i && !edition && tape > i && (
                                <div className="acts">
                                  <button className="act" disabled={busy} onClick={() => finish(r)}>
                                    <Icon name="copy" size={16} /> Copier
                                  </button>
                                  <button
                                    className="act doux"
                                    disabled={busy}
                                    onClick={() => {
                                      setText(r);
                                      setHistory([]);
                                      setEdition(true);
                                    }}
                                  >
                                    <Icon name="pencil" size={16} /> Ajuster
                                  </button>
                                </div>
                              )}
                              {selected === i && edition && (
                                <div className="retouche stack">
                                  <label className="sr" htmlFor="txt">
                                    Ta réponse
                                  </label>
                                  <textarea
                                    id="txt"
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                  />
                                  <div
                                    className="chips"
                                    role="group"
                                    aria-label="Retouches rapides"
                                  >
                                    {RETOUCHES.map((c) => (
                                      <button
                                        className="chip soft"
                                        key={c}
                                        disabled={busy}
                                        onClick={() => applyConsigne(c)}
                                      >
                                        {c}
                                      </button>
                                    ))}
                                  </div>
                                  <div className="row wrap">
                                    <button
                                      className="btn primary small"
                                      disabled={!text.trim() || busy}
                                      onClick={() => finish(text)}
                                    >
                                      <Icon name="copy" size={16} /> Valider et copier
                                    </button>
                                    <button
                                      className="btn ghost small"
                                      disabled={!history.length || busy}
                                      onClick={() => {
                                        setText(history[history.length - 1]);
                                        setHistory((h) => h.slice(0, -1));
                                      }}
                                    >
                                      <Icon name="undo" size={16} /> Annuler
                                    </button>
                                    <button
                                      className="btn ghost small"
                                      onClick={() => setEdition(false)}
                                      disabled={busy}
                                    >
                                      Fermer
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ),
                        )}
                      </div>
                    </>
                  )}
                  {error && (
                    <>
                      <p className="err" role="alert">
                        {error}
                      </p>
                      <button
                        className="btn ghost small"
                        onClick={() => generate()}
                        disabled={busy}
                      >
                        <Icon name="refresh" size={18} /> Réessayer
                      </button>
                    </>
                  )}
                  {((replies.length > 0 && tape >= replies.length) ||
                    (Boolean(error) && replies.length === 0 && !busy)) && (
                    <div className="reglages-fil">
                      {/* Trois boutons ; chacun ouvre ses choix sur place, un seul à la fois. */}
                      <div
                        className="reglages-boutons"
                        role="group"
                        aria-label="Ajuster les réponses"
                      >
                        {objectifs.length > 0 && (
                          <button
                            type="button"
                            className="reglage"
                            aria-expanded={options === 'objectif'}
                            onClick={() => basculer('objectif')}
                          >
                            <span className="reglage-nom">Objectif</span>
                            <span className="reglage-val">
                              {objectif ? enClair(objectif) : 'Au choix'}
                            </span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="reglage"
                          aria-expanded={options === 'ton'}
                          onClick={() => basculer('ton')}
                        >
                          <span className="reglage-nom">Ton</span>
                          <span className="reglage-val">
                            {TONS.find((t) => t.id === ton)?.label}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="reglage"
                          aria-expanded={options === 'plus'}
                          onClick={() => basculer('plus')}
                        >
                          <span className="reglage-nom">Options</span>
                          <span className="reglage-val">
                            {LONGUEURS.find((l) => l.id === longueur)?.label}
                          </span>
                        </button>
                      </div>
                      {options === 'objectif' && (
                        <div className="chips" role="group" aria-label="Objectif">
                          {objectifs.map((g) => (
                            <button
                              className="chip"
                              key={g}
                              aria-pressed={objectif === g}
                              disabled={busy}
                              onClick={() => {
                                changeObjectif(g);
                                setOptions('');
                              }}
                            >
                              <Masque text={g} />
                            </button>
                          ))}
                        </div>
                      )}
                      {options === 'ton' && (
                        <div className="chips" role="group" aria-label="Ton">
                          {TONS.map((t) => (
                            <button
                              className="chip"
                              key={t.id}
                              aria-pressed={ton === t.id}
                              disabled={busy}
                              onClick={() => {
                                changeTon(t.id);
                                setOptions('');
                              }}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      )}
                      {options === 'plus' && (
                        <div className="stack">
                          <div className="chips" role="group" aria-label="Longueur">
                            {LONGUEURS.map((l) => (
                              <button
                                className="chip"
                                key={l.id}
                                aria-pressed={longueur === l.id}
                                disabled={busy}
                                onClick={() => changeLongueur(l.id)}
                              >
                                {l.label}
                              </button>
                            ))}
                          </div>
                          <label className="lbl" htmlFor="canal">
                            Où vas-tu répondre ?
                          </label>
                          <select
                            id="canal"
                            className="select"
                            value={canal}
                            disabled={busy}
                            onChange={(e) => changeCanal(e.target.value as Canal | '')}
                          >
                            {CANAUX.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                            <option value="">Autre (forme de la conversation)</option>
                          </select>
                          <label
                            className="lg-ligne reglage-noms"
                            htmlFor="restore-names"
                            aria-label="Remettre les vrais noms dans la réponse copiée"
                          >
                            <span className="lg-txt">
                              <span className="lg-label">Remettre les vrais noms</span>
                              <span className="lg-sous">
                                Dans la réponse copiée, sur ton téléphone
                              </span>
                            </span>
                            <input
                              id="restore-names"
                              type="checkbox"
                              role="switch"
                              className="lg-sw"
                              checked={restoreNames}
                              onChange={(e) => setRestoreNames(e.target.checked)}
                            />
                          </label>
                        </div>
                      )}
                      <button
                        type="button"
                        className="autres"
                        onClick={() => generate()}
                        disabled={busy}
                      >
                        <Icon name="refresh" size={16} />
                        {replies.length > 0
                          ? 'Trois autres réponses'
                          : 'Réessayer avec ces réglages'}
                      </button>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        )}

        {!actif && finalText && (
          <div className="fil">
            <section className="six" aria-label="Réponse copiée" data-dernier="">
              <span className="six-ava" aria-hidden="true">
                <Logo small label="" />
              </span>
              <div className="six-corps">
                <h2 className="fait">
                  <Icon name="check" size={22} stroke={2.6} /> Réponse{' '}
                  <em>{copied ? 'copiée' : 'prête'}</em>
                </h2>
                <p className="muted">
                  {copied
                    ? 'Colle-la dans ta conversation et envoie-la toi-même.'
                    : 'La copie automatique a échoué : sélectionne le texte ci-dessous et copie-le.'}
                </p>
                <div className="card">
                  <p style={{ whiteSpace: 'pre-wrap', userSelect: 'all' }}>{finalText}</p>
                </div>
                <button className="btn primary" onClick={revenir}>
                  {appli ? `Revenir à ${appli.label}` : 'Revenir à ma conversation'}
                </button>
                {backHint && !appli && (
                  <div className="stack">
                    <p className="muted small">
                      Ouvre l&apos;app de ta conversation, puis colle la réponse et envoie-la :
                    </p>
                    <AppsRow label="Revenir dans ton app" />
                  </div>
                )}
                {suivi && (
                  <section className="card stack secretaire" aria-labelledby="sec-titre">
                    <h3 className="lbl" id="sec-titre">
                      <Icon name="bell" size={14} /> Le secrétaire de Six
                    </h3>
                    {suiviNote ? (
                      <p role="status">
                        <Icon name="check" size={16} /> {suiviNote}
                      </p>
                    ) : (
                      <>
                        <p>
                          Te rappeler de suivre{' '}
                          <b>
                            {suivi.qui === 'Cette conversation' ? 'cette conversation' : suivi.qui}
                          </b>{' '}
                          ?
                        </p>
                        <div className="chips" role="group" aria-label="Quand te le rappeler">
                          {RAPPELS.map(([label, delai]) => (
                            <button
                              key={label}
                              className="chip"
                              onClick={() => {
                                ajouterSuivi({ ...suivi, quand: delai() });
                                setSuiviNote(
                                  `Noté : ${label.toLowerCase()}. Tu le retrouves dans le menu, rubrique « À suivre ».`,
                                );
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </section>
                )}
                <button className="btn ghost" onClick={reset}>
                  Nouvelle conversation
                </button>
                <p className="muted small row">
                  <Icon name="lock" /> La conversation vient d&apos;être effacée de l&apos;appareil.
                </p>
              </div>
            </section>
          </div>
        )}

        {!actif && ocrBusy && (
          <div className="card" role="status">
            <div className="row sp">
              <span>Six lit {shots.length > 1 ? 'tes captures' : 'ta capture'}…</span>
              <b>{ocrPct} %</b>
            </div>
            <div className="meter" style={{ marginTop: 8 }}>
              <i style={{ width: `${ocrPct}%`, background: 'var(--accent-b)' }} />
            </div>
          </div>
        )}
        {!actif && error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        {!fil && !ocrBusy && gardees.length > 0 && (
          <section className="lg gardees" aria-label="Conversations gardées">
            <h2 className="lg-titre">Conversations gardées</h2>
            <div className="lg-liste">
              {gardees.map((g) => (
                <div className="lg-ligne lg-statique gardee" key={g.id}>
                  <button
                    type="button"
                    className="gardee-ouvrir"
                    onClick={() => rouvrirConversation(g)}
                  >
                    <span className="lg-ico" aria-hidden="true">
                      <Icon name="chat" size={22} stroke={1.75} />
                    </span>
                    <span className="lg-txt">
                      <span className="lg-label gardee-titre">
                        {g.extrait ? enClair(g.extrait) : 'Conversation'}
                      </span>
                      <span className="lg-sous">
                        {g.canal ? `${g.canal} · ` : ''}
                        {new Date(g.quand).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'long',
                        })}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="lg-texte"
                    aria-label="Effacer cette conversation gardée"
                    onClick={() => supprimerGardee(g.id)}
                  >
                    Effacer
                  </button>
                </div>
              ))}
            </div>
            <p className="lg-pied">Gardées sur ce téléphone tant que tu les conserves.</p>
          </section>
        )}
      </div>

      <div className="home-foot">
        {!actif && attach && (
          <div className="attach" id="six-import">
            <button
              className="attach-item"
              onClick={() => {
                setAttach(false);
                void pasteFromClipboard();
              }}
            >
              <Icon name="clip" size={22} stroke={1.75} />
              <span className="attach-txt">
                <span>Coller</span>
                <span className="attach-sous">Le message que tu as copié</span>
              </span>
            </button>
            <button
              className="attach-item"
              disabled={ocrBusy}
              onClick={() => {
                setAttach(false);
                imageInput.current?.click();
              }}
            >
              <Icon name="image" size={22} stroke={1.75} />
              <span className="attach-txt">
                <span>Captures d&apos;écran</span>
                <span className="attach-sous">Lues sur ton téléphone, jamais envoyées</span>
              </span>
            </button>
            <button
              className="attach-item"
              onClick={() => {
                setAttach(false);
                setStep('whatsapp');
              }}
            >
              <Icon name="file" size={22} stroke={1.75} />
              <span className="attach-txt">
                <span>Fichier d&apos;export</span>
                <span className="attach-sous">Discussion exportée depuis ta messagerie</span>
              </span>
            </button>
          </div>
        )}
        <div className={`saisie${dragging ? ' over' : ''}`}>
          {!actif && (
            <button
              className={`saisie-btn${attach ? ' on' : ''}`}
              aria-label={attach ? "Fermer l'import" : 'Importer'}
              aria-expanded={attach}
              aria-controls="six-import"
              onClick={() => {
                if (!attach) prechaufferLecteur();
                setAttach((v) => !v);
              }}
            >
              <Icon name="plus" size={22} />
            </button>
          )}
          <label className="sr" htmlFor="conv">
            {actif ? 'Préciser ce que tu veux' : 'Nouvelle conversation'}
          </label>
          <textarea
            id="conv"
            ref={champ}
            rows={1}
            value={saisie}
            onChange={(e) => (actif ? setMessage(e.target.value) : setRaw(e.target.value))}
            onPaste={onPasteZone}
            placeholder={actif ? 'Précise ce que tu veux…' : 'Colle une conversation…'}
          />
          <button
            className="send"
            aria-label={actif ? 'Envoyer la précision' : 'Envoyer à Six'}
            title={actif ? 'Envoyer la précision' : 'Envoyer à Six'}
            onClick={envoyer}
            disabled={!saisie.trim() || ocrBusy || (actif && (occupe || !analysis))}
          >
            <Icon name="up" size={20} stroke={2.4} />
          </button>
        </div>
        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          multiple
          className="sr"
          tabIndex={-1}
          aria-hidden="true"
          disabled={ocrBusy}
          onChange={(e) => addShots(e.target.files)}
        />
        <p className="privacy-line">
          <Icon name="lock" size={13} /> Masqué sur ton téléphone
          {memoOn ? ', gardé ici seulement' : ", rien n'est gardé"}
          {!actif && raw.length > 0 && <span>({raw.length} caractères)</span>}
        </p>
      </div>
    </main>
  );
}
