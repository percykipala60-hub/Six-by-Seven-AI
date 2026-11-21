"use client";

import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { anonymize, markMe, restore } from "@/lib/anonymize";
import { guessMe, isGenericSpeaker, looksLikeWhatsApp, parseWhatsApp, speakerLabels, speakers as listSpeakers, toConversation } from "@/lib/whatsapp";
import { SCAM_THRESHOLD } from "@/lib/scam";
import { MAX_CHARS, type AdjustResult, type Analysis, type Canal, type Longueur, type Nuance, type RepliesResult, type Ton } from "@/lib/types";
import { MAX_IMAGES, OcrError, readScreenshots } from "@/lib/ocr";
import { ZipError, readChatFromZip } from "@/lib/zip";
import { loadStyle } from "@/lib/style";
import { ecouterCompte, lireCompte, salutation } from "@/lib/compte";
import { NOTE_MAX, ajouterSuivi, consigneMemoire, ecrireNote, memoireActive, noteContact, retenirChoix } from "@/lib/memoire";
import { AppBar } from "./AppBar";
import { Dock } from "./Dock";
import { Icon } from "./Icon";
import { Logo } from "./Logo";
import { Suivis } from "./Suivis";

type Step = "home" | "whatsapp" | "import" | "mask" | "analyzing" | "understand" | "scam" | "replies" | "adjust" | "done";

// Le parcours se lit en 4 étapes, quel que soit l'écran (Six 2.0, docs/design/six-v2-maquettes.html).
// L'objectif se choisit sur « Comprendre », le ton et la longueur se changent sur place sur « Répondre ».
const ETAPES = ["Coller", "Protéger", "Comprendre", "Répondre"];
const ETAPE: Record<Step, number> = { home: 0, whatsapp: 0, import: 0, mask: 1, analyzing: 2, understand: 2, scam: 2, replies: 3, adjust: 3, done: 3 };

// Exemples fictifs pour essayer Six sans conversation à soi (les noms sont masqués comme les autres).
const EXEMPLES: { titre: string; icon: "chat" | "shield" | "alert"; texte: string }[] = [
  {
    titre: "Mon patron menace de me renvoyer",
    icon: "alert",
    texte: "Patron : Une information confidentielle a fuité depuis ton poste. Si tu ne me donnes pas une explication valable d'ici demain, c'est le licenciement.",
  },
  {
    titre: "« Tu as disparu ! » : un reproche ?",
    icon: "chat",
    texte: "Junior : Eh grand frère, tu as disparu !! On dit quoi ? Depuis ton nouveau travail tu nous as oubliés 😂\nJunior : Samedi on fait la fête chez Maman, il faut passer hein. Sinon on va voir.",
  },
  {
    titre: "« Votre compte mobile money est bloqué »",
    icon: "shield",
    texte: "Service client : Votre compte mobile money est bloqué. Envoyez votre code PIN immédiatement pour le débloquer, sinon il sera supprimé.",
  },
];

// Repères du masquage (« [TÉL 1] ») : libellé lisible et bilan par sorte.
const SORTES: Record<string, [string, string]> = {
  PERSONNE: ["nom", "noms"], PRÉNOM: ["nom", "noms"], NOM: ["nom", "noms"], TÉL: ["numéro", "numéros"], CODE: ["code", "codes"],
  COMPTE: ["compte", "comptes"], EMAIL: ["e-mail", "e-mails"], LIEN: ["lien", "liens"], ADRESSE: ["adresse", "adresses"], PSEUDO: ["pseudo", "pseudos"],
};
const lisible = (repere: string) => {
  const m = /^\[(.+) (\d+)\]$/.exec(repere);
  return m ? `${m[1].charAt(0)}${m[1].slice(1).toLowerCase()} ${m[2]}` : repere;
};
const TONS: { id: Ton; label: string }[] = [
  { id: "amical", label: "Amical" },
  { id: "professionnel", label: "Professionnel" },
  { id: "ferme", label: "Ferme" },
  { id: "court", label: "Court" },
  { id: "chaleureux", label: "Chaleureux" },
];
const LONGUEURS: { id: Longueur; label: string }[] = [
  { id: "courte", label: "Courte" },
  { id: "moyenne", label: "Moyenne" },
  { id: "detaillee", label: "Détaillée" },
];
// Le secrétaire : quand rappeler de suivre une conversation (demain et après : 9 h, heure du téléphone).
const aNeufHeures = (jours: number) => {
  const d = new Date();
  d.setDate(d.getDate() + jours);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
};
const RAPPELS: [string, () => number][] = [
  ["Dans 1 heure", () => Date.now() + 3_600_000],
  ["Ce soir", () => { const d = new Date(); d.setHours(19, 0, 0, 0); return Math.max(d.getTime(), Date.now() + 3_600_000); }],
  ["Demain", () => aNeufHeures(1)],
  ["Dans 3 jours", () => aNeufHeures(3)],
];
const RETOUCHES = ["Plus court", "Plus ferme", "Plus doux", "Moins formel", "Ajouter une excuse"];
// Ordre : priorités de la matrice des réseaux (docs/Matrice_reseaux_Six.xlsx).
const CANAUX: { id: Canal; label: string }[] = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "sms", label: "SMS" },
  { id: "email", label: "E-mail" },
  { id: "facebook", label: "Facebook (public)" },
  { id: "messenger", label: "Messenger" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "tiktok", label: "TikTok" },
  { id: "telegram", label: "Telegram" },
  { id: "instagram", label: "Instagram" },
  { id: "x", label: "X (public)" },
];

// Comment récupérer une conversation, réseau par réseau. Fichier = l'app sait exporter en .txt/.zip (Six le lit).
// Copie/capture = l'app n'exporte pas : on recopie les messages ou on prend une capture (lue sur le téléphone).
const EXPORTS: Record<Canal, { label: string; fichier: boolean; etapes: string[]; note?: string; lien?: string }> = {
  whatsapp: {
    label: "WhatsApp",
    fichier: true,
    lien: "whatsapp://",
    etapes: ["Ouvre la discussion voulue.", "Trois points, puis **Plus**, puis **Exporter la discussion**, puis **Sans médias**.", "Dans la liste qui s'ouvre, choisis **Six**."],
    note: "Six n'apparaît qu'une fois installé sur ton écran d'accueil (menu du navigateur, Installer l'application). Sinon, enregistre l'export et choisis-le ci-dessous.",
  },
  sms: {
    label: "SMS",
    fichier: true,
    lien: "sms:",
    etapes: ["Ouvre la discussion voulue.", "Appuie longuement sur les messages, puis **Partager** ou **Copier**.", "Colle-les dans Six, ou enregistre et choisis le fichier."],
    note: "Certains téléphones proposent aussi « Exporter la discussion » en texte dans les réglages de l'app SMS.",
  },
  telegram: {
    label: "Telegram",
    fichier: true,
    lien: "tg://",
    etapes: ["Sur ordinateur : ouvre la discussion, puis le menu, puis **Exporter l'historique**.", "Choisis le format **texte**, sans médias.", "Colle le texte dans Six, ou choisis le fichier exporté."],
    note: "Sur téléphone, Telegram n'exporte pas en fichier : copie les messages ou prends une capture.",
  },
  email: {
    label: "E-mail",
    fichier: false,
    lien: "mailto:",
    etapes: ["Ouvre le fil d'e-mail voulu.", "Sélectionne le texte de l'échange, puis **Copier**.", "Colle-le dans Six."],
  },
  facebook: {
    label: "Facebook",
    fichier: false,
    lien: "fb://",
    etapes: ["Ouvre la discussion depuis Facebook (Messenger).", "Appuie longuement sur les messages, puis **Copier**.", "Colle dans Six, ou prends une capture."],
  },
  messenger: {
    label: "Messenger",
    fichier: false,
    lien: "fb-messenger://",
    etapes: ["Ouvre la discussion dans Messenger.", "Appuie longuement sur les messages, puis **Copier**.", "Colle-les dans Six, ou prends une capture."],
  },
  linkedin: {
    label: "LinkedIn",
    fichier: false,
    lien: "linkedin://",
    etapes: ["Ouvre la messagerie LinkedIn.", "Copie l'échange, ou prends une capture de l'écran.", "Colle dans Six."],
  },
  tiktok: {
    label: "TikTok",
    fichier: false,
    lien: "tiktok://",
    etapes: ["Ouvre tes messages TikTok.", "Copie l'échange, ou prends une capture.", "Colle dans Six."],
  },
  instagram: {
    label: "Instagram",
    fichier: false,
    lien: "instagram://",
    etapes: ["Ouvre la discussion (Messagerie Instagram).", "Appuie longuement sur le message, puis **Copier**.", "Colle dans Six, ou prends une capture."],
  },
  x: {
    label: "X",
    fichier: false,
    lien: "twitter://",
    etapes: ["Ouvre ta conversation privée sur X.", "Copie les messages, ou prends une capture.", "Colle dans Six."],
  },
};

/** Texte simple où **…** devient du gras. Pas de HTML injecté : le contenu vient du code, jamais de l'IA ni de l'utilisateur. */
function Gras({ text }: { text: string }) {
  return (
    <>
      {text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))}
    </>
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
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const m = /^([^:\n]{1,40}?)\s?:\s(.*)$/.exec(line);
    if (m) msgs.push({ who: m[1].trim(), text: m[2] });
    else if (msgs.length) msgs[msgs.length - 1].text += `\n${line}`;
    else msgs.push({ who: "", text: line });
  }
  return (
    <div className="convo" aria-label="Conversation masquée">
      {msgs.map((m, i) => (
        <div className={`msg${m.who === "Moi" ? " me" : ""}`} key={i}>
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
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Pas de réseau. Ton texte est gardé, réessaie dans un instant.");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Erreur inattendue. Réessaie.");
  return data as T;
}

/** Coupe au début, sur une limite de ligne, pour rester sous la limite sans casser un repère. */
function fit(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(text.length - max);
  const nl = cut.indexOf("\n");
  return nl > -1 && nl < 200 ? cut.slice(nl + 1) : cut;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function Top({ step, onBack }: { step: Step; onBack?: () => void }) {
  const now = ETAPE[step];
  return (
    <div className="top">
      {onBack && (
        <button className="back" onClick={onBack} aria-label="Retour">
          <Icon name="back" />
        </button>
      )}
      <ol className="steps" aria-label={`Étape ${now + 1} sur ${ETAPES.length} : ${ETAPES[now]}`}>
        {ETAPES.map((e, i) => (
          <li key={e} className={i < now ? "done" : i === now ? "now" : undefined} aria-current={i === now ? "step" : undefined}>
            <i />
            {e}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Flow() {
  const params = useSearchParams();
  const started = useRef(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const pickImages = useRef(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrPct, setOcrPct] = useState(0);
  const [ocrNote, setOcrNote] = useState("");
  const [shots, setShots] = useState<File[]>([]); // captures choisies, pas encore lues : elles restent sur le téléphone
  const [dragging, setDragging] = useState(false);
  const [attach, setAttach] = useState(false); // feuille d'import (« + » de la barre de saisie)
  const [hello, setHello] = useState({ mot: "Bonjour", prenom: "" }); // salutation lue après le rendu (heure, prénom)
  const champ = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const lire = () => setHello({ mot: salutation(), prenom: lireCompte().prenom });
    lire();
    return ecouterCompte(lire);
  }, []);
  const [express, setExpress] = useState(false); // réponses directes : Six saute les écrans objectif et ton
  const [backHint, setBackHint] = useState(false);
  const expressRun = useRef(false); // vrai pour un contenu partagé vers Six : on va droit aux trois réponses
  const shotUrls = useMemo(() => shots.map((f) => URL.createObjectURL(f)), [shots]);
  useEffect(() => () => shotUrls.forEach((u) => URL.revokeObjectURL(u)), [shotUrls]);
  const [canal, setCanal] = useState<Canal | "">(""); // réseau où partira la réponse ("" = forme de la conversation)
  const [source, setSource] = useState<Canal>("whatsapp"); // application choisie sur l'écran d'export
  const [tuto, setTuto] = useState(false); // mode d'emploi de l'export ouvert
  useEffect(() => {
    try {
      setExpress(localStorage.getItem("six-express") === "1");
      const c = localStorage.getItem("six-canal") ?? "";
      if (CANAUX.some((k) => k.id === c)) setCanal(c as Canal);
      const t = localStorage.getItem("six-ton");
      if (TONS.some((k) => k.id === t)) setTon(t as Ton);
      const l = localStorage.getItem("six-longueur");
      if (LONGUEURS.some((k) => k.id === l)) setLongueur(l as Longueur);
    } catch {
      /* préférence indisponible : parcours complet */
    }
  }, []);

  function chooseCanal(c: Canal | "") {
    setCanal(c);
    try {
      localStorage.setItem("six-canal", c);
    } catch {
      /* préférence non gardée */
    }
  }

  const [step, setStep] = useState<Step>("home");
  // Pendant le parcours, la barre d'onglets s'efface et l'action principale reste collée en bas (globals.css).
  useEffect(() => {
    const root = document.documentElement;
    if (step === "home") delete root.dataset.parcours;
    else root.dataset.parcours = step;
    window.scrollTo(0, 0);
    return () => {
      delete root.dataset.parcours;
    };
  }, [step]);
  const [raw, setRaw] = useState("");
  const [conv, setConv] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [people, setPeople] = useState<string[]>([]); // étiquettes de la conversation (vrais noms, restent sur le téléphone)
  const [me, setMe] = useState(""); // qui est l'utilisateur dans la conversation
  const [meGuessed, setMeGuessed] = useState(false); // vrai tant que c'est Six qui a deviné (à vérifier)
  const [note, setNote] = useState("");
  const [newName, setNewName] = useState("");
  const [restoreNames, setRestoreNames] = useState(true);
  const [memoOn, setMemoOn] = useState(false); // mémoire de Six active (lue après le rendu : localStorage)
  const [noteMemo, setNoteMemo] = useState(""); // ce que l'utilisateur sait de son interlocuteur
  const [suivi, setSuivi] = useState<{ qui: string; quoi: string; canal: Canal | "" } | null>(null);
  const [suiviNote, setSuiviNote] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [precision, setPrecision] = useState("");
  const [objectif, setObjectif] = useState("");
  const [autre, setAutre] = useState("");
  const [reponseQuestion, setReponseQuestion] = useState("");
  const [ton, setTon] = useState<Ton>("professionnel");
  const [longueur, setLongueur] = useState<Longueur>("moyenne");
  const [addWord, setAddWord] = useState(false); // champ « Masquer un autre mot » ouvert
  const [options, setOptions] = useState(false); // réglages de la réponse (longueur, réseau) ouverts
  const [replies, setReplies] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [text, setText] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [consigne, setConsigne] = useState("");
  const [finalText, setFinalText] = useState("");
  const [copied, setCopied] = useState(true);
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // La barre de saisie grandit avec le texte, jusqu'à 7 lignes environ.
  useEffect(() => {
    const t = champ.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 180)}px`;
  }, [raw, step]);

  const masked = useMemo(() => (conv ? anonymize(conv, names) : null), [conv, names]);
  // L'interlocuteur : le premier participant qui n'est pas l'utilisateur (sert à la mémoire et aux suivis).
  const contact = useMemo(() => people.find((p) => p !== me && p.toLowerCase() !== "moi" && !isGenericSpeaker(p)) ?? "", [people, me]);
  useEffect(() => {
    const on = memoireActive();
    setMemoOn(on);
    setNoteMemo(on && contact ? noteContact(contact) : "");
  }, [contact]);
  // Texte envoyé à l'IA : masqué, et les messages de l'utilisateur marqués « Moi » pour qu'elle écrive du bon côté.
  const outgoing = useMemo(() => (masked ? markMe(masked.text, me, masked.mapping) : ""), [masked, me]);

  // Partage depuis WhatsApp et raccourcis de l'icône : le texte reçu part de l'adresse tout de suite.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const shared = [params.get("title"), params.get("text")].filter(Boolean).join("\n");
    const action = params.get("action");
    if (params.get("shared")) {
      window.history.replaceState(null, "", "/");
      void receiveShared();
    } else if (action === "whatsapp") {
      setStep("whatsapp");
      window.history.replaceState(null, "", "/");
    } else if (shared || action) {
      if (shared) setRaw(shared);
      setStep("import");
      window.history.replaceState(null, "", "/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // Reçoit ce que WhatsApp a partagé vers Six (export de discussion ou texte), gardé un instant par le service worker.
  async function receiveShared() {
    expressRun.current = true;
    try {
      const cache = await caches.open("six-share");
      const file = await cache.match("/shared-file");
      const txt = await cache.match("/shared-text");
      const count = Number((await (await cache.match("/shared-images"))?.text()) || 0);
      const images: File[] = [];
      for (let i = 0; i < count; i++) {
        const res = await cache.match(`/shared-image-${i}`);
        if (res) {
          const blob = await res.blob();
          const name = decodeURIComponent(res.headers.get("x-name") ?? `capture-${i + 1}.png`);
          images.push(new File([blob], name, { type: blob.type || "image/png", lastModified: Number(res.headers.get("x-time")) || i }));
        }
        await cache.delete(`/shared-image-${i}`);
      }
      await cache.delete("/shared-images");
      if (images.length) {
        setStep("import");
        await readShots(sortShots(images), true);
      } else if (file) {
        const blob = await file.blob();
        const name = decodeURIComponent(file.headers.get("x-name") ?? "discussion.txt");
        await cache.delete("/shared-file");
        await loadFile(new File([blob], name, { type: blob.type }), true);
      } else if (txt) {
        const text = await txt.text();
        await cache.delete("/shared-text");
        setRaw(text);
        prepare(text);
      } else {
        setStep("whatsapp");
      }
    } catch {
      setError("Le partage n'a pas pu être reçu. Choisis le fichier à la main.");
      setStep("whatsapp");
    }
  }

  // Depuis l'accueil, « Capture » ouvre directement le choix d'image.
  useEffect(() => {
    if (step === "import" && pickImages.current) {
      pickImages.current = false;
      imageInput.current?.click();
    }
  }, [step]);

  // Une discussion tient souvent sur plusieurs captures : on les range de la plus ancienne à la plus récente.
  const sortShots = (files: File[]) => [...files].sort((a, b) => a.lastModified - b.lastModified);

  function addShots(list: FileList | File[] | null) {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    if (imageInput.current) imageInput.current.value = "";
    if (!files.length) return;
    const all = [...shots, ...sortShots(files)];
    setError(all.length > MAX_IMAGES ? `${MAX_IMAGES} captures au maximum : les premières sont gardées.` : "");
    setOcrNote("");
    setShots(all.slice(0, MAX_IMAGES));
  }

  function moveShot(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= shots.length) return;
    const next = [...shots];
    [next[i], next[j]] = [next[j], next[i]];
    setShots(next);
  }

  async function readShots(files: File[], auto = false) {
    if (!files.length) return;
    setError("");
    setOcrNote("");
    setOcrBusy(true);
    setOcrPct(0);
    try {
      const read = await readScreenshots(files, setOcrPct);
      const next = !auto && raw.trim() ? `${raw.trim()}\n${read}` : read;
      setRaw(next);
      setShots([]);
      setOcrNote(
        `Texte lu sur ${files.length > 1 ? `tes ${files.length} captures, dans l'ordre` : "ta capture"}. « Moi » = tes messages, « Autre » = l'autre personne. Relis et corrige avant de continuer.`,
      );
      if (auto) prepare(next);
    } catch (e) {
      setError(e instanceof OcrError ? e.message : "La lecture de la capture a échoué. Colle le texte à la place.");
    } finally {
      setOcrBusy(false);
    }
  }

  // Coller une image (Ctrl+V d'une capture) ou déposer des fichiers dans la zone.
  function onPasteZone(e: ClipboardEvent) {
    const images = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (images.length) {
      e.preventDefault();
      addShots(images);
    }
  }

  function onDropZone(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length) addShots(images);
    const doc = files.find((f) => !f.type.startsWith("image/"));
    if (doc) void loadFile(doc);
    const dropped = e.dataTransfer.getData("text/plain");
    if (!files.length && dropped) setRaw((r) => (r.trim() ? `${r.trim()}\n${dropped}` : dropped));
  }

  function reset() {
    expressRun.current = false;
    setAttach(false);
    setSuivi(null);
    setSuiviNote("");
    setShots([]);
    setBackHint(false);
    setOcrNote("");
    setStep("home");
    setRaw("");
    setConv("");
    setNames([]);
    setPeople([]);
    setMe("");
    setMeGuessed(false);
    setNote("");
    setAnalysis(null);
    setCorrecting(false);
    setPrecision("");
    setObjectif("");
    setAutre("");
    setReponseQuestion("");
    setReplies([]);
    setText("");
    setHistory([]);
    setConsigne("");
    setAddWord(false);
    setOptions(false);
    setError("");
    setBusy(false);
  }

  function back(to: Step) {
    setError("");
    setStep(to);
  }

  async function pasteFromClipboard() {
    try {
      setRaw(await navigator.clipboard.readText());
      setError("");
    } catch {
      setError("Le collage automatique est refusé. Appuie longuement dans la zone, puis choisis Coller.");
    }
  }

  async function loadFile(file: File | undefined, auto = false) {
    if (!file) return;
    if (file.size > 50_000_000) {
      setError("Ce fichier est trop gros. Exporte la discussion sans médias.");
      return;
    }
    let text = "";
    try {
      const buffer = await file.arrayBuffer();
      const head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
      const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04; // « PK »
      if (isZip) {
        text = (await readChatFromZip(buffer)).text;
      } else {
        text = new TextDecoder("utf-8").decode(buffer);
        const sample = text.slice(0, 2000);
        const controls = (sample.match(/[\u0000-\u0008\u000e-\u001f]/g) ?? []).length;
        if (controls > 20) {
          setError("Ce fichier n'est pas une discussion. Choisis le fichier .txt ou .zip exporté par WhatsApp.");
          if (auto) setStep("whatsapp");
          return;
        }
      }
    } catch (e) {
      setError(e instanceof ZipError ? e.message : "Ce fichier n'a pas pu être lu.");
      if (auto) setStep("whatsapp");
      return;
    }
    if (!text.trim()) {
      setError("Ce fichier est vide. Exporte à nouveau la discussion depuis WhatsApp.");
      if (auto) setStep("whatsapp");
      return;
    }
    setRaw(text);
    setError("");
    if (auto) prepare(text, true);
  }

  function prepare(source?: string, fromFile = false) {
    let text = (source ?? raw).trim();
    const original = text;
    let known: string[] = [];
    let info = "";
    if (looksLikeWhatsApp(text)) {
      const chat = parseWhatsApp(text);
      if (chat.messages.length) {
        const r = toConversation(chat.messages, MAX_CHARS - 300);
        text = r.text;
        known = chat.authors.filter((a) => !isGenericSpeaker(a));
        info = `Export WhatsApp reconnu : ${r.kept} derniers messages gardés sur ${r.total}.`;
        setCanal("whatsapp"); // la réponse repartira dans WhatsApp (pour cette conversation seulement)
      } else {
        // Format pas entièrement reconnu : on garde la fin du texte brut plutôt que rien.
        text = fit(original, MAX_CHARS - 300);
        info = "Format de l'export pas entièrement reconnu : vérifie que les noms sont bien masqués.";
      }
    } else if (text.length > MAX_CHARS - 300) {
      text = fit(text, MAX_CHARS - 300);
      info = "Seuls les derniers messages sont gardés (limite de 2000 caractères).";
    }
    if (!known.length) known = speakerLabels(text);
    if (!text) {
      if (fromFile) {
        setError("Aucun message lisible dans ce fichier. Vérifie le texte ci-dessous ou colle la conversation.");
        setStep("import");
      } else {
        setError("Colle une conversation d'abord.");
      }
      return;
    }
    setError("");
    const who = listSpeakers(text);
    setConv(text);
    setNames(known);
    setPeople(who);
    const guess = guessMe(who, text);
    setMe(guess);
    setMeGuessed(guess !== "" && guess.toLowerCase() !== "moi");
    setNote(info);
    setStep("mask");
  }

  async function runAnalysis() {
    if (!masked) return;
    setError("");
    setStep("analyzing");
    try {
      const a = await post<Analysis>("/api/analyze", { conversation: fit(outgoing, MAX_CHARS) });
      setAnalysis(a);
      setDemo(a.demo);
      setObjectif(a.objectifs[0] ?? "");
      if (a.arnaque.score >= SCAM_THRESHOLD) setStep("scam");
      else if (express || expressRun.current) await generate({ goal: a.objectifs[0] ?? "", direct: true });
      else setStep("understand");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inattendue.");
      setStep("mask");
    }
  }

  /**
   * Demande 3 réponses. Sur l'écran des réponses, changer le ton, la longueur ou le réseau relance la rédaction
   * sur place (les nouvelles valeurs sont passées ici, l'état React n'étant à jour qu'au rendu suivant).
   */
  async function generate(o: { goal?: string; direct?: boolean; ton?: Ton; longueur?: Longueur; canal?: Canal | "" } = {}) {
    if (!masked) return;
    const goal = o.goal ?? (objectif === "__autre" ? autre.trim() : objectif);
    if (!goal) {
      setError("Choisis un objectif ou écris le tien.");
      setStep("understand");
      return;
    }
    const t = o.ton ?? ton;
    const l = o.longueur ?? longueur;
    const c = o.canal ?? canal;
    setBusy(true);
    setError("");
    try {
      const extra = [precision.trim(), reponseQuestion.trim() && `Réponse à la question de Six : ${reponseQuestion.trim()}`, consigneMemoire(contact, masked.mapping)]
        .filter(Boolean)
        .join(". ");
      const r = await post<RepliesResult>("/api/replies", {
        conversation: fit(outgoing, MAX_CHARS),
        objectif: goal,
        ton: t,
        longueur: l,
        precision: extra || undefined,
        style: loadStyle(),
        canal: c || undefined,
      });
      setReplies(r.reponses);
      setDemo(r.demo);
      setSelected(0);
      setStep("replies");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inattendue.");
      if (o.direct) setStep("understand"); // l'analyse est faite : on reprend le parcours à la main
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

  // Écran des réponses : changer un réglage régénère tout de suite les 3 propositions.
  function changeTon(t: Ton) {
    if (t === ton && replies.length) return;
    setTon(t);
    remember("six-ton", t);
    void generate({ ton: t });
  }

  function changeLongueur(l: Longueur) {
    if (l === longueur) return;
    setLongueur(l);
    remember("six-longueur", l);
    void generate({ longueur: l });
  }

  function changeCanal(c: Canal | "") {
    if (c === canal) return;
    chooseCanal(c);
    void generate({ canal: c });
  }

  async function applyConsigne(c: string) {
    if (!c.trim()) return;
    setBusy(true);
    setError("");
    try {
      const r = await post<AdjustResult>("/api/adjust", { reponse: text, consigne: c });
      setHistory((h) => [...h, text]);
      setText(r.reponse);
      setDemo(r.demo);
      setConsigne("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setBusy(false);
    }
  }

  async function finish(reply: string) {
    const out = restoreNames && masked ? restore(reply, masked.mapping) : reply;
    setCopied(await copyText(out));
    setFinalText(out);
    if (memoOn) retenirChoix(reply); // des nombres seulement (mots, emoji, tu/vous), jamais le texte
    // Le secrétaire propose un suivi : avec qui, pour quoi, sur quel réseau. Rien de la conversation.
    const quoi = objectif === "__autre" ? autre.trim() : objectif;
    setSuivi({ qui: contact || "Cette conversation", quoi: masked ? restore(quoi, masked.mapping) : quoi, canal });
    setSuiviNote("");
    // La conversation est effacée de la mémoire de l'appli dès la copie.
    setRaw("");
    setConv("");
    setNames([]);
    setPeople([]);
    setMe("");
    setMeGuessed(false);
    setAnalysis(null);
    setStep("done");
  }

  /* ---------- Écrans ---------- */

  const canalLabel = CANAUX.find((c) => c.id === canal)?.label.replace(/ \(public\)$/, "");
  const goalLabel = objectif === "__autre" ? autre.trim() : objectif;

  if (step === "home" || step === "import") {
    const isHome = step === "home";
    const empty = !raw.trim() && !shots.length && !ocrBusy;
    const pleine = shots.length >= MAX_IMAGES;
    return (
      <main
        className="screen home"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDropZone}
      >
        {isHome ? <AppBar page="accueil" onNouvelle={reset} /> : <Top step="import" onBack={() => back("home")} />}
        <div className="home-body">
          {isHome && empty && (
            <div className="hello">
              <Logo label="" />
              <h1>
                {hello.prenom ? `${hello.mot}, ${hello.prenom}` : hello.mot}
              </h1>
              <p className="muted">Quel message te bloque ? Colle-le, Six t&apos;aide à trouver le ton juste.</p>
            </div>
          )}
          {isHome && <Suivis />}
          {shots.length > 0 && (
            <div className="card stack">
              <div className="row sp">
                <b className="small">
                  {shots.length} capture{shots.length > 1 ? "s" : ""}, dans l&apos;ordre de lecture
                </b>
                <span className="muted small">max {MAX_IMAGES}</span>
              </div>
              <div className="thumbs">
                {shots.map((f, i) => (
                  <figure className="thumb" key={shotUrls[i]}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={shotUrls[i]} alt={`Capture ${i + 1}`} />
                    <figcaption>{i + 1}</figcaption>
                    <div className="thumb-actions">
                      <button aria-label={`Avancer la capture ${i + 1}`} disabled={i === 0 || ocrBusy} onClick={() => moveShot(i, -1)}>
                        <Icon name="back" size={18} />
                      </button>
                      <button aria-label={`Retirer la capture ${i + 1}`} disabled={ocrBusy} onClick={() => setShots(shots.filter((_, k) => k !== i))}>
                        <Icon name="x" size={18} />
                      </button>
                      <button aria-label={`Reculer la capture ${i + 1}`} disabled={i === shots.length - 1 || ocrBusy} onClick={() => moveShot(i, 1)}>
                        <Icon name="chevron" size={18} />
                      </button>
                    </div>
                  </figure>
                ))}
              </div>
              <p className="muted small">De la plus ancienne à la plus récente. Elles sont lues sur ton téléphone et ne sont jamais envoyées.</p>
              <button className="btn primary" disabled={ocrBusy} onClick={() => readShots(shots)}>
                {shots.length > 1 ? `Lire les ${shots.length} captures` : "Lire la capture"}
              </button>
            </div>
          )}
          {ocrBusy && (
            <div className="card" role="status">
              <div className="row sp">
                <span>Six lit {shots.length > 1 ? "tes captures" : "ta capture"}…</span>
                <b>{ocrPct} %</b>
              </div>
              <div className="meter" style={{ marginTop: 8 }}>
                <i style={{ width: `${ocrPct}%`, background: "var(--accent-b)" }} />
              </div>
            </div>
          )}
          {ocrNote && <p className="demo">{ocrNote}</p>}
          {error && <p className="err" role="alert">{error}</p>}
        </div>
        <div className="home-foot">
          {isHome && empty && (
            <div className="suggest" role="group" aria-label="Essayer avec un exemple">
              {EXEMPLES.map((ex) => (
                <button
                  key={ex.titre}
                  className="suggest-card"
                  onClick={() => {
                    setRaw(ex.texte);
                    prepare(ex.texte);
                  }}
                >
                  <Icon name={ex.icon} size={18} />
                  <span>{ex.titre}</span>
                </button>
              ))}
            </div>
          )}
          {isHome && empty && <Dock />}
          {attach && (
            <div className="attach" id="six-import">
              <button
                className="attach-item"
                onClick={() => {
                  setAttach(false);
                  void pasteFromClipboard();
                }}
              >
                <Icon name="clip" /> Coller depuis le presse-papiers
              </button>
              <button
                className="attach-item"
                disabled={ocrBusy || pleine}
                onClick={() => {
                  setAttach(false);
                  imageInput.current?.click();
                }}
              >
                <Icon name="image" /> Captures d&apos;écran
              </button>
              <button
                className="attach-item"
                onClick={() => {
                  setAttach(false);
                  setStep("whatsapp");
                }}
              >
                <Icon name="chat" /> Export de conversation
              </button>
            </div>
          )}
          <div className={`saisie${dragging ? " over" : ""}`}>
            <button className={`saisie-btn${attach ? " on" : ""}`} aria-label={attach ? "Fermer l'import" : "Importer"} aria-expanded={attach} aria-controls="six-import" onClick={() => setAttach((v) => !v)}>
              <Icon name="plus" size={22} />
            </button>
            <label className="sr" htmlFor="conv">
              Nouvelle conversation
            </label>
            <textarea
              id="conv"
              ref={champ}
              rows={1}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              onPaste={onPasteZone}
              placeholder="Colle le message ou la conversation…"
            />
            <button className="send" aria-label="Continuer" title="Continuer" onClick={() => prepare()} disabled={!raw.trim() || ocrBusy}>
              <Icon name="up" size={20} stroke={2.4} />
            </button>
          </div>
          <input ref={imageInput} type="file" accept="image/*" multiple className="sr" tabIndex={-1} aria-hidden="true" disabled={ocrBusy || pleine} onChange={(e) => addShots(e.target.files)} />
          <p className="privacy-line">
            <Icon name="lock" size={13} /> Masqué sur ton téléphone, rien n&apos;est gardé
            {raw.length > 0 && <span>({raw.length} caractères)</span>}
          </p>
        </div>
      </main>
    );
  }

  if (step === "whatsapp") {
    const ex = EXPORTS[source];
    const viaCopie = () => {
      chooseCanal(source); // la réponse prendra la forme de ce réseau
      setStep("import");
    };
    return (
      <main className="screen">
        <Top step="whatsapp" onBack={() => back("home")} />
        <div className="intro">
          <h2>
            D&apos;où vient la <em>conversation</em> ?
          </h2>
          <p className="muted">Choisis l&apos;application. Six t&apos;explique comment récupérer la discussion, et adapte la suite à ce réseau.</p>
        </div>
        <div className="chips one" role="group" aria-label="Application">
          {(Object.keys(EXPORTS) as Canal[]).map((id) => (
            <button
              key={id}
              className="chip"
              aria-pressed={source === id}
              onClick={() => {
                setSource(id);
                setError("");
              }}
            >
              {EXPORTS[id].label}
            </button>
          ))}
        </div>
        <section className="card stack guide" aria-labelledby="guide-titre">
          <div className="row sp">
            <h3 className="lbl" id="guide-titre">
              {ex.label} : {ex.fichier ? "exporter la discussion" : "copier ou capturer"}
            </h3>
            <span className={`badge${ex.fichier ? " ok" : ""}`}>{ex.fichier ? "Fichier lu par Six" : "Pas d'export"}</span>
          </div>
          <p className="muted small">
            {ex.fichier
              ? `${ex.label} sait exporter la discussion : Six lit le fichier et garde les derniers messages.`
              : `${ex.label} ne fournit pas de fichier d'export. Six lit la capture sur ton téléphone, elle n'est jamais envoyée.`}
          </p>
          <button className="link" aria-expanded={tuto} onClick={() => setTuto((v) => !v)}>
            <Icon name="bulb" size={16} /> {tuto ? "Masquer le mode d'emploi" : "Comment ça marche"}
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
                  e.target.value = "";
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
        {error && <p className="err" role="alert">{error}</p>}
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

  if (step === "mask" && masked) {
    // Bilan par sorte (« 2 noms · 1 numéro ») à partir des repères présents dans ce qui part.
    const reperes = Array.from(new Set(outgoing.match(/\[[A-ZÉÈ]+ \d+\]/g) ?? []));
    const bilan = new Map<string, [string, string, number]>();
    for (const r of reperes) {
      const [un, plusieurs] = SORTES[r.slice(1).split(" ")[0]] ?? ["autre", "autres"];
      const n = (bilan.get(un)?.[2] ?? 0) + 1;
      bilan.set(un, [un, plusieurs, n]);
    }
    const qui = people.length > 0 && !(people.length === 1 && people[0].toLowerCase() === "moi");
    return (
      <main className="screen">
        <Top step="mask" onBack={() => back("import")} />
        <div className="intro">
          <h2>
            Voici ce qui <em>part</em>
          </h2>
          <p className="muted">
            Six a remplacé les infos personnelles, ici, sur ton téléphone. La détection n&apos;est pas parfaite : si un détail reste visible, masque-le.
          </p>
        </div>
        {note && <p className="muted small">{note}</p>}
        <div className="summary" aria-label="Éléments masqués">
          {bilan.size ? (
            [...bilan.values()].map(([un, plusieurs, n]) => (
              <span className="pill" key={un}>
                <Icon name="check" size={14} stroke={2.6} /> {n} {n > 1 ? plusieurs : un}
              </span>
            ))
          ) : (
            <span className="pill neutre">Rien à masquer trouvé</span>
          )}
        </div>
        <Convo text={outgoing} />
        {addWord ? (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              const n = newName.trim();
              if (n) setNames((l) => (l.includes(n) ? l : [...l, n]));
              setNewName("");
            }}
          >
            <label className="sr" htmlFor="nm">Mot à masquer</label>
            <input id="nm" type="text" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Un nom, un lieu, un détail…" />
            <button className="btn ghost small" type="submit">Masquer</button>
          </form>
        ) : (
          <button className="link" onClick={() => setAddWord(true)}>
            <Icon name="plus" size={18} /> Masquer un autre mot
          </button>
        )}
        {qui && (
          <div className="stack">
            <h3 className="lbl" id="qui">Qui es-tu dans la conversation ?</h3>
            <div className="seg" role="group" aria-labelledby="qui">
              {people.map((p) => (
                <button key={p} aria-pressed={me === p} onClick={() => { setMe(p); setMeGuessed(false); }}>
                  {p}
                </button>
              ))}
              <button aria-pressed={me === ""} onClick={() => { setMe(""); setMeGuessed(false); }}>
                Je n&apos;ai pas écrit
              </button>
            </div>
            <p className="muted small">
              {me && meGuessed
                ? `Six pense que tu es ${me} (c'est l'autre qui a écrit en dernier). Sinon, touche ton nom.`
                : me
                ? `Six écrira ta réponse à toi. Ce nom reste sur ton téléphone : l'IA voit seulement « Moi ».`
                : "Tous les messages viennent de l'autre personne : Six écrira ta première réponse."}
            </p>
          </div>
        )}
        {memoOn && contact && (
          <section className="card stack memo" aria-labelledby="memo-titre">
            <div className="row sp">
              <h3 className="lbl" id="memo-titre">
                Ce que Six sait de {contact}
              </h3>
              <span className="badge">mémoire</span>
            </div>
            <label className="sr" htmlFor="memo">Ce que tu sais de {contact}</label>
            <textarea
              id="memo"
              rows={2}
              maxLength={NOTE_MAX}
              value={noteMemo}
              onChange={(e) => setNoteMemo(e.target.value)}
              onBlur={() => ecrireNote(contact, noteMemo)}
              placeholder="Ex : mon petit frère, on se tutoie, il aime plaisanter"
            />
            <p className="muted small">Gardé sur ton téléphone pour les prochaines fois. Envoyé avec ta demande, nom masqué.</p>
          </section>
        )}
        {error && <p className="err" role="alert">{error}</p>}
        <div className="foot">
          <label className="toggle">
            <span className="grow">
              <b>Remettre les vrais noms</b>
              <span className="muted small">dans la réponse, sur ton téléphone</span>
            </span>
            <input type="checkbox" className="sw" checked={restoreNames} onChange={(e) => setRestoreNames(e.target.checked)} />
          </label>
          <button className="btn primary" onClick={() => { if (memoOn && contact) ecrireNote(contact, noteMemo); void runAnalysis(); }}>Analyser</button>
        </div>
      </main>
    );
  }

  if (step === "analyzing") {
    const items = ["Nettoyage et masquage", "Tri des messages importants", "Recherche d'arnaque et de tension", "Rédaction du résumé"];
    if (express || expressRun.current) items.push("Rédaction des trois réponses");
    return (
      <main className="screen" aria-busy="true">
        <Top step="analyzing" />
        <div className="hero" style={{ paddingTop: 24 }}>
          <Logo label="" />
          <h2>
            Six <em>lit</em> la conversation…
          </h2>
          <p className="muted">Ça prend quelques secondes, même en 3G.</p>
        </div>
        <div className="stack" role="status">
          {items.map((t, i) => (
            <div className="card" key={t}>
              <div className="row">
                {i < 2 ? <Icon name="check" /> : <span style={{ width: 20 }} />}
                <span>{t}</span>
              </div>
              {i === 2 && <div className="skel" style={{ marginTop: 8 }} />}
            </div>
          ))}
        </div>
      </main>
    );
  }

  if (step === "scam" && analysis) {
    return (
      <main className="screen">
        <div className="alert" role="alert">
          <Icon name="alert" size={28} />
          <h2 style={{ marginTop: 6 }}>Ce message ressemble à une arnaque</h2>
        </div>
        <div className="card">
          <div className="lbl">Pourquoi</div>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {(analysis.arnaque.raisons.length ? analysis.arnaque.raisons : ["Plusieurs signes inhabituels"]).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
        <div className="card">
          <div className="row sp">
            <span>Niveau de risque</span>
            <b className="err">{analysis.arnaque.score} %</b>
          </div>
          <div className="meter" style={{ marginTop: 8 }}>
            <i style={{ width: `${analysis.arnaque.score}%` }} />
          </div>
        </div>
        <p className="muted small">Ne donne jamais de code PIN, de mot de passe ni d&apos;argent à quelqu&apos;un qui te le demande par message.</p>
        <div className="foot">
          <details className="card">
            <summary>Comment bloquer ce contact</summary>
            <p className="muted small" style={{ margin: "8px 0 0" }}>
              Six ne peut pas bloquer à ta place. Dans WhatsApp : ouvre la discussion, touche le nom en haut, puis « Bloquer ». Pour un SMS : appuie longuement sur la conversation, puis « Bloquer ». Tu peux aussi signaler le numéro à ton opérateur.
            </p>
          </details>
          <button
            className="btn ghost"
            onClick={() => {
              setObjectif("__autre");
              setAutre("Répondre prudemment sans rien révéler");
              setStep("understand");
            }}
          >
            Répondre prudemment
          </button>
          <button className="btn ghost" onClick={reset}>Ignorer et quitter</button>
        </div>
      </main>
    );
  }

  if (step === "understand" && analysis) {
    const label = analysis.tension < 35 ? "Calme" : analysis.tension < 65 ? "Pressant" : "Tendu";
    const sur = analysis.arnaque.score < SCAM_THRESHOLD;
    return (
      <main className="screen">
        <Top step="understand" onBack={() => back("mask")} />
        {demo && <p className="demo">Mode démonstration : aucune IA connectée, résultats génériques.</p>}
        <section className="card read" aria-labelledby="compris">
          <h2 className="lbl" id="compris">Ce que Six a compris</h2>
          <p>
            <Masque text={analysis.resume} />
          </p>
          <div className="tension">
            <b>{label}</b>
            <div className="gauge" role="img" aria-label={`Tension ${analysis.tension} sur 100`}>
              <i style={{ left: `${analysis.tension}%` }} />
            </div>
            <span className="muted small">{analysis.tension}/100</span>
          </div>
          {(analysis.intention || analysis.ton_detecte) && (
            <div className="tags">
              {analysis.intention && (
                <span className="tag">
                  <b>Intention</b> <Masque text={analysis.intention} />
                </span>
              )}
              {analysis.ton_detecte && (
                <span className="tag">
                  <b>Ton</b> <Masque text={analysis.ton_detecte} />
                </span>
              )}
            </div>
          )}
          <p className={`safe${sur ? "" : " prudence"}`}>
            <Icon name="shield" size={18} /> {sur ? "Aucune arnaque détectée" : "Prudence"} (risque {analysis.arnaque.score} %)
          </p>
          <button className="link" aria-expanded={correcting} onClick={() => setCorrecting((c) => !c)}>
            <Icon name="pencil" size={16} /> {correcting ? "Fermer la correction" : "Six s'est trompé ? Corriger"}
          </button>
          {correcting && (
            <>
              <label className="sr" htmlFor="prec">Dis à Six ce qu&apos;il a mal compris</label>
              <textarea id="prec" style={{ minHeight: 90 }} value={precision} onChange={(e) => setPrecision(e.target.value)} placeholder="Dis à Six ce qu'il a mal compris…" />
            </>
          )}
        </section>
        <Nuances items={analysis.nuances ?? []} />
        <h3 className="lbl" id="obj">Que veux-tu obtenir ?</h3>
        <div className="chips" role="group" aria-labelledby="obj">
          {analysis.objectifs.map((o) => (
            <button className="chip" key={o} aria-pressed={objectif === o} onClick={() => setObjectif(o)}>
              <Masque text={o} />
            </button>
          ))}
          <button className="chip soft" aria-pressed={objectif === "__autre"} onClick={() => setObjectif("__autre")}>
            Autre…
          </button>
        </div>
        {objectif === "__autre" && (
          <>
            <label className="sr" htmlFor="autre">Ton objectif</label>
            <input id="autre" type="text" value={autre} maxLength={120} onChange={(e) => setAutre(e.target.value)} placeholder="Ex : proposer un autre jour" />
          </>
        )}
        {analysis.question && (
          <div className="card dash">
            <div className="lbl">Six te pose une question</div>
            <p style={{ margin: "4px 0 8px" }}>{analysis.question}</p>
            <label className="sr" htmlFor="q">Ta réponse</label>
            <input id="q" type="text" value={reponseQuestion} maxLength={200} onChange={(e) => setReponseQuestion(e.target.value)} placeholder="Ta réponse (facultatif)" />
          </div>
        )}
        {error && <p className="err" role="alert">{error}</p>}
        <div className="foot">
          <button className="btn primary" onClick={() => generate()} disabled={busy || !goalLabel}>
            {busy ? "Six rédige…" : "Voir 3 réponses"}
          </button>
        </div>
      </main>
    );
  }

  if (step === "replies") {
    const lettre = "ABC"[selected];
    return (
      <main className="screen">
        <Top step="replies" onBack={() => back("understand")} />
        <h2 className="sr">Trois réponses pour toi</h2>
        <div className="chips one" role="group" aria-label="Ton">
          {TONS.map((t) => (
            <button className="chip" key={t.id} aria-pressed={ton === t.id} disabled={busy} onClick={() => changeTon(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="context">
          <span className="grow">
            Pour <b>{canalLabel ?? "cette conversation"}</b>, longueur <b>{LONGUEURS.find((l) => l.id === longueur)?.label.toLowerCase()}</b>
            {goalLabel && (
              <>
                , objectif <b><Masque text={goalLabel} /></b>
              </>
            )}
          </span>
          <button className="link" aria-expanded={options} onClick={() => setOptions((v) => !v)}>
            {options ? "Fermer" : "Modifier"}
          </button>
        </div>
        {options && (
          <div className="card stack">
            <div className="lbl" id="lg">Longueur</div>
            <div className="chips" role="group" aria-labelledby="lg">
              {LONGUEURS.map((l) => (
                <button className="chip" key={l.id} aria-pressed={longueur === l.id} disabled={busy} onClick={() => changeLongueur(l.id)}>
                  {l.label}
                </button>
              ))}
            </div>
            <label className="lbl" htmlFor="canal">Où vas-tu répondre ?</label>
            <select id="canal" className="select" value={canal} disabled={busy} onChange={(e) => changeCanal(e.target.value as Canal | "")}>
              {CANAUX.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
              <option value="">Autre (forme de la conversation)</option>
            </select>
            <p className="muted small">Six adapte la forme au réseau : SMS sans emoji, e-mail avec formules, commentaire public plus mesuré.</p>
            <button className="btn ghost small" onClick={() => setStep("understand")}>
              Changer l&apos;objectif
            </button>
          </div>
        )}
        {demo && <p className="demo">Mode démonstration : réponses génériques, sans IA.</p>}
        <div className={`stack bubbles${busy ? " busy" : ""}`} data-canal={canal || undefined} aria-busy={busy} role="group" aria-label="Réponses proposées">
          {replies.map((r, i) => (
            <div className="pick" key={i}>
              <button className="reply" aria-pressed={selected === i} onClick={() => setSelected(i)}>
                <b>Proposition {"ABC"[i]}</b>
                <span>
                  <Masque text={r} />
                </span>
              </button>
              {selected === i && (
                <div className="acts">
                  <button
                    className="act"
                    disabled={busy}
                    onClick={() => {
                      setText(r);
                      setHistory([]);
                      setStep("adjust");
                    }}
                  >
                    <Icon name="pencil" size={16} /> Ajuster
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        {busy && <p className="muted small" role="status">Six réécrit les réponses…</p>}
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn ghost small" onClick={() => generate()} disabled={busy}>
          <Icon name="refresh" size={18} /> Trois autres réponses
        </button>
        <div className="foot">
          <button className="btn primary" disabled={busy || !replies.length} onClick={() => finish(replies[selected])}>
            <Icon name="copy" /> Copier la réponse {lettre}
          </button>
        </div>
      </main>
    );
  }

  if (step === "adjust") {
    return (
      <main className="screen">
        <Top step="adjust" onBack={() => back("replies")} />
        <h2>
          Ajuste <em>à ta façon</em>
        </h2>
        <label className="lbl" htmlFor="txt">Ta réponse</label>
        <textarea id="txt" style={{ minHeight: 130 }} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="lbl">Retouches rapides</div>
        <div className="chips">
          {RETOUCHES.map((c) => (
            <button className="chip" key={c} disabled={busy} onClick={() => applyConsigne(c)}>{c}</button>
          ))}
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            applyConsigne(consigne);
          }}
        >
          <label className="sr" htmlFor="cons">Ou dis-le avec tes mots</label>
          <input id="cons" type="text" value={consigne} maxLength={200} onChange={(e) => setConsigne(e.target.value)} placeholder="Ou dis-le avec tes mots…" />
          <button className="btn ghost small" type="submit" disabled={busy || !consigne.trim()}>OK</button>
        </form>
        <div className="row">
          <button
            className="btn ghost small"
            disabled={!history.length}
            onClick={() => {
              setText(history[history.length - 1]);
              setHistory((h) => h.slice(0, -1));
            }}
          >
            <Icon name="undo" /> Annuler
          </button>
          {busy && <span className="muted small">Six retouche…</span>}
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        <div className="foot">
          <button className="btn primary" disabled={!text.trim()} onClick={() => finish(text)}>
            <Icon name="copy" /> Valider et copier
          </button>
        </div>
      </main>
    );
  }

  if (step === "done") {
    const appli = EXPORTS[canal || "whatsapp"];
    return (
      <main className="screen">
        <div className="hero" style={{ paddingTop: 24 }}>
          <div className="logo done-mark">
            <Icon name="check" size={34} />
          </div>
          <h2>
            Réponse <em>{copied ? "copiée" : "prête"}</em>
          </h2>
          <p className="muted">{copied ? "Colle-la dans ta conversation et envoie-la toi-même." : "La copie automatique a échoué : sélectionne le texte ci-dessous et copie-le."}</p>
        </div>
        <div className="card">
          <p style={{ whiteSpace: "pre-wrap", userSelect: "all" }}>{finalText}</p>
        </div>
        <button
          className="btn primary"
          onClick={() => {
            setBackHint(true);
            window.close(); // fonctionne quand Six a été ouvert par un partage ; sinon la consigne s'affiche
          }}
        >
          Revenir à ma conversation
        </button>
        {backHint && (
          <p className="muted small">Si Six reste ouvert, appuie sur la touche Retour de ton téléphone : tu retrouves ta conversation, il ne reste qu&apos;à coller et envoyer.</p>
        )}
        {appli.lien && (
          <a className="btn ghost" href={appli.lien}>
            Ouvrir {appli.label}
          </a>
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
                  Te rappeler de suivre <b>{suivi.qui === "Cette conversation" ? "cette conversation" : suivi.qui}</b> ?
                </p>
                <div className="chips" role="group" aria-label="Quand te le rappeler">
                  {RAPPELS.map(([label, delai]) => (
                    <button
                      key={label}
                      className="chip"
                      onClick={() => {
                        ajouterSuivi({ ...suivi, quand: delai() });
                        setSuiviNote(`Noté : ${label.toLowerCase()}. Ça s'affichera sur l'accueil de Six.`);
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
        <button className="btn ghost" onClick={() => { setFinalText(""); reset(); }}>Nouvelle conversation</button>
        <p className="muted small row"><Icon name="lock" /> La conversation vient d&apos;être effacée de l&apos;appareil.</p>
      </main>
    );
  }

  // Filet de sécurité : état incohérent, retour à l'accueil.
  return (
    <main className="screen">
      <p className="muted">Quelque chose s&apos;est mal passé.</p>
      <button className="btn primary" onClick={reset}>Retour à l&apos;accueil</button>
    </main>
  );
}
