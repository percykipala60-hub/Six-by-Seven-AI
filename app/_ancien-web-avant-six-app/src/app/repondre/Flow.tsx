'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  LANGUAGES,
  remask,
  shieldDrafts,
  unmask,
  type AnalyseResponse,
  type CoachResponse,
  type Language,
  type Longueur,
  type ReplyApiResponse,
  type Tone,
} from '@six/shared';
import {
  ajusterSix,
  analyseSix,
  ApiError,
  askSix,
  coachSix,
  FAILURE_TEXT,
  sendFeedback,
  type ApiFailure,
} from '@/lib/api';
import { loadChoices, rememberChoice } from '@/lib/choices';
import {
  CHARS_SENT,
  prepare,
  previewMask,
  readConversation,
  recapOf,
  segments,
  styleOf,
  type Conversation,
  type MaskPreview,
} from '@/lib/conversation';
import { takeSharedConversation } from '@/lib/partage';
import { updateSettings, useSettings } from '@/lib/settings';
import { readExportFile } from '@/lib/zip';
import {
  Actions,
  Bubble,
  FilRow,
  PrimaryButton,
  SecondaryButton,
  SixSays,
} from '../components/Fil';
import { OTPCode } from '../components/otp-badge';
import { QRCode } from '../components/QRCode';
import {
  associerOTP,
  dissocierOTP,
  conversationPourOTP,
} from '@/lib/partage';
import { générerOTP, codeNet } from '@/lib/otp';
import { RecapCard } from '../components/RecapCard';
import { ScamCard } from '../components/ScamCard';
import {
  Card,
  Chip,
  copyText,
  LevelGauge,
  RadioRow,
  Segmented,
  StepHeader,
  Title,
  Toggle,
} from '../components/ui';

type Step =
  | 'import'
  | 'qui'
  | 'alerte'
  | 'masque'
  | 'analyse'
  | 'compris'
  | 'objectif'
  | 'ton'
  | 'redaction'
  | 'reponses'
  | 'ajuster'
  | 'copie';

const NUMBER: Partial<Record<Step, number>> = {
  import: 1,
  qui: 1,
  masque: 2,
  analyse: 3,
  compris: 4,
  objectif: 5,
  ton: 6,
  redaction: 7,
  reponses: 8,
  ajuster: 9,
  copie: 10,
};
const TOTAL = 10;

const TONS_ECRAN: { value: Tone; label: string }[] = [
  { value: 'naturel', label: 'Comme d’habitude' },
  { value: 'amical', label: 'Amical' },
  { value: 'professionnel', label: 'Professionnel' },
  { value: 'ferme', label: 'Ferme' },
  { value: 'chaleureux', label: 'Chaleureux' },
  { value: 'court', label: 'Court' },
];
const APERCU: Record<Tone, string> = {
  naturel: 'Comme tu écris d’habitude à cette personne.',
  amical: '« Pas de souci, je m’en occupe ce soir. »',
  professionnel: '« Bonjour, je finalise le dossier et vous l’envoie à 17h30. »',
  ferme: '« Je t’envoie le dossier à 17h30, pas avant. »',
  chaleureux: '« Merci pour ta patience, tu l’auras à 17h30 sans faute ! »',
  court: '« Ok, 17h30. »',
};
const LONGUEURS: { value: Longueur; label: string }[] = [
  { value: 'court', label: 'Court' },
  { value: 'moyen', label: 'Moyen' },
  { value: 'detaille', label: 'Détaillé' },
];
const LANGUES: Record<Language, string> = {
  fr: 'Français',
  ln: 'Lingala (Kinshasa)',
  en: 'English',
};
const RETOUCHES = [
  { value: 'plus-court', label: 'Plus court' },
  { value: 'plus-ferme', label: 'Plus ferme' },
  { value: 'plus-doux', label: 'Plus doux' },
  { value: 'moins-formel', label: 'Moins formel' },
  { value: 'excuse', label: 'Ajouter une excuse' },
  { value: 'emoji', label: 'Ajouter un emoji' },
] as const;
const KIND_LABEL = { nom: 'nom', tel: 'numéro', email: 'e-mail', num: 'nombre' } as const;
const TENSION_LABELS = ['Calme', 'Pressant', 'Tendu'] as const;
const TENSION_INDEX = { calme: 0, pressant: 1, tendu: 2 } as const;
const COACH_LABEL = {
  assertif: 'Assertif',
  empathique: 'Empathique',
  clair: 'Clair',
  'a-eviter': 'À éviter',
};

function displayName(name: string | undefined): string {
  return (name ?? 'ton contact').replace(/\p{Extended_Pictographic}|️/gu, '').trim();
}
function firstName(name: string | undefined): string {
  const clean = displayName(name);
  return /^\+?\d|^\[TEL/.test(clean) ? 'cette personne' : (clean.split(/\s+/)[0] ?? clean);
}

/** « 3 noms, 1 numéro et 1 e-mail » : ce que l'utilisateur voit, pas chaque apparition. */
function hiddenSummary(preview: MaskPreview, ignored: ReadonlySet<number>): string {
  const distinct = {
    nom: new Set<string>(),
    tel: new Set<string>(),
    email: new Set<string>(),
    num: new Set<string>(),
  };
  preview.spans.forEach((span, index) => {
    if (ignored.has(index)) return;
    distinct[span.kind].add(
      span.kind === 'tel' ? span.value.replace(/\D/g, '').slice(-9) : span.value.toLowerCase(),
    );
  });
  const parts = (
    [
      [distinct.nom.size, 'nom', 'noms'],
      [distinct.tel.size, 'numéro', 'numéros'],
      [distinct.email.size, 'e-mail', 'e-mails'],
      [distinct.num.size, 'nombre', 'nombres'],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => `${n} ${n > 1 ? many : one}`);
  return parts.length > 1
    ? `${parts.slice(0, -1).join(', ')} et ${parts.at(-1) ?? ''}`
    : (parts[0] ?? '');
}

export function Flow({
  apiUrl,
  initialSource = 'texte',
  shared = false,
}: {
  apiUrl: string;
  initialSource?: 'texte' | 'fichier';
  shared?: boolean;
}) {
  const settings = useSettings();
  const [step, setStep] = useState<Step>('import');
  const [source, setSource] = useState<'texte' | 'fichier'>(initialSource);
  const [raw, setRaw] = useState('');
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const [readError, setReadError] = useState('');
  const [conversation, setConversation] = useState<Conversation | undefined>();
  const [extraNames, setExtraNames] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [ignored, setIgnored] = useState<Set<number>>(new Set());
  const [table, setTable] = useState<Record<string, string>>({});
  const [masked, setMasked] = useState('');
  const [moiMasked, setMoiMasked] = useState<string | undefined>();
  const [analysis, setAnalysis] = useState<AnalyseResponse | undefined>();
  const [correction, setCorrection] = useState('');
  const [correcting, setCorrecting] = useState(false);
  const [objectif, setObjectif] = useState('');
  const [autre, setAutre] = useState('');
  const [precision, setPrecision] = useState('');
  const [ton, setTon] = useState<Tone>(settings.ton);
  const [longueur, setLongueur] = useState<Longueur>(settings.longueur);
  const [langue, setLangue] = useState<Language>(settings.langue);
  const [response, setResponse] = useState<ReplyApiResponse | undefined>();
  const [local, setLocal] = useState(false);
  const [selected, setSelected] = useState(0);
  const [texte, setTexte] = useState('');
  const [original, setOriginal] = useState('');
  const [libre, setLibre] = useState('');
  const [coach, setCoach] = useState<CoachResponse | undefined>();
  const [busy, setBusy] = useState('');
  const [failure, setFailure] = useState<ApiFailure | undefined>();
  const [retryOnline, setRetryOnline] = useState(true);
  const [canRetry, setCanRetry] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [otpCode, setOtpCode] = useState<string | undefined>();
  const [otpHref, setOtpHref] = useState<string | undefined>();
  const pending = useRef<(() => void) | undefined>(undefined);
  const abort = useRef<AbortController | undefined>(undefined);

  const preview = useMemo(
    () =>
      conversation ? previewMask(conversation, extraNames, settings.economie ? 8 : 12) : undefined,
    [conversation, extraNames, settings.economie],
  );
  const show = useCallback(
    (text: string) => (settings.remettreNoms ? unmask(text, table) : text),
    [settings.remettreNoms, table],
  );
  const name = firstName(conversation?.other);

  // Téléphone lent (3G, iPhone) : ce qui a été collé AVANT que l'app soit prête est dans le
  // champ mais pas encore dans l'état. On le récupère, sinon « Continuer » reste grisé.
  useEffect(() => {
    const typed = pasteRef.current?.value;
    if (typed) setRaw((current) => current || typed);
  }, []);

  // Partage depuis WhatsApp (Android) : le texte arrive par le service worker, jamais par l'URL.
  useEffect(() => {
    if (!shared) return;
    void takeSharedConversation().then((text) => {
      if (text) setRaw(text);
    });
    window.history.replaceState(null, '', '/repondre');
  }, [shared]);

  // Chronomètre des attentes : avec un modèle local, ça peut durer.
  useEffect(() => {
    if (step !== 'analyse' && step !== 'redaction') return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [step]);

  // Pas de réseau : rien n'est perdu, on renvoie dès que le réseau revient (si l'utilisateur veut).
  useEffect(() => {
    const onOnline = () => {
      if (retryOnline && pending.current) pending.current();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [retryOnline]);

  function go(next: Step) {
    setStep(next);
    window.scrollTo(0, 0);
  }

  function reset() {
    abort.current?.abort();
    pending.current = undefined;
    setCanRetry(false);
    setRaw('');
    setConversation(undefined);
    setExtraNames([]);
    setIgnored(new Set());
    setTable({});
    setMasked('');
    setAnalysis(undefined);
    setCorrection('');
    setObjectif('');
    setAutre('');
    setPrecision('');
    setResponse(undefined);
    setCoach(undefined);
    setFailure(undefined);
    setFeedbackSent(false);
    setShowRecap(false);
    go('import');
  }

  function read(me?: string) {
    const result = readConversation(raw, me);
    if (!result.ok) {
      setReadError(result.reason);
      return;
    }
    setReadError('');
    const c = result.conversation;
    setConversation(c);
    setIgnored(new Set());
    if (!c.me && !me && c.authors.length > 1) return go('qui');
    if (c.scam.niveau === 'eleve') return go('alerte');
    go('masque');
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    // Import manuel : l'utilisateur choisit lui-même le fichier exporté (.txt ou .zip).
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      setRaw(await readExportFile(file));
      setReadError('');
    } catch (error) {
      setReadError(error instanceof Error ? error.message : 'Fichier illisible.');
    }
  }

  async function pasteFromClipboard() {
    try {
      setRaw(await navigator.clipboard.readText());
    } catch {
      setReadError('Le navigateur refuse l’accès au presse-papiers : colle avec un appui long.');
    }
  }

  /** Lance une demande au serveur ; en cas de coupure, la garde pour la renvoyer. */
  async function run<T>(
    label: string,
    action: (signal: AbortSignal) => Promise<T>,
    onDone: (value: T) => void,
    onFail: Step,
  ) {
    const controller = new AbortController();
    abort.current = controller;
    setFailure(undefined);
    setElapsed(0);
    setBusy(label);
    const attempt = async () => {
      try {
        const value = await action(controller.signal);
        pending.current = undefined;
        setCanRetry(false);
        setBusy('');
        onDone(value);
      } catch (error) {
        setBusy('');
        const kind = error instanceof ApiError ? error.kind : 'serveur';
        if (kind === 'annule') return go(onFail);
        setFailure(kind);
        if (kind === 'reseau') {
          pending.current = () => void run(label, action, onDone, onFail);
          setCanRetry(true);
        }
        go(onFail);
      }
    };
    await attempt();
  }

  function sendMasked() {
    if (!conversation || !preview) return;
    const prepared = prepare(conversation, preview, ignored);
    setTable(prepared.table);
    setMasked(prepared.masked);
    setMoiMasked(prepared.moi);
    if (settings.economie) return go('ton');
    go('analyse');
    void run(
      'analyse',
      (signal) =>
        analyseSix(
          apiUrl,
          {
            conversation: prepared.masked,
            langue,
            moteur: settings.moteur,
            ...(prepared.moi ? { moi: prepared.moi } : {}),
          },
          signal,
        ),
      (result) => {
        setAnalysis(result);
        setObjectif(result.objectifs[0] ?? '');
        go('compris');
      },
      'masque',
    );
  }

  function answerScamOffline() {
    if (!conversation) return;
    const drafts = shieldDrafts(conversation.scam.regles);
    setLocal(true);
    setTable({});
    setResponse({
      ...drafts,
      arnaque: { niveau: conversation.scam.niveau, raisons: conversation.scam.raisons },
      ...(conversation.other ? { interlocuteur: conversation.other } : {}),
      bouclier: true,
      secours: false,
      avertissements: [],
      version: 'bouclier-local',
      modele: 'aucun',
      ms: 0,
    });
    choose(drafts.reponses, 0);
    go('reponses');
  }

  function choose(reponses: ReplyApiResponse['reponses'], index: number) {
    setSelected(index);
    const value = show(reponses[index]?.texte ?? '');
    setTexte(value);
    setOriginal(value);
    setCoach(undefined);
  }

  function generate() {
    const finalObjectif = (objectif === '__autre' ? autre : objectif).trim();
    const finalPrecision = [precision, correction].filter(Boolean).join(' ; ');
    go('redaction');
    void run(
      'redaction',
      (signal) =>
        askSix(
          apiUrl,
          {
            conversation: masked,
            ton,
            langue,
            longueur,
            moteur: settings.moteur,
            ...(moiMasked ? { moi: moiMasked } : {}),
            ...(finalObjectif ? { objectif: remask(finalObjectif, table).slice(0, 300) } : {}),
            ...(finalPrecision ? { precision: remask(finalPrecision, table).slice(0, 200) } : {}),
            ...(conversation ? { style: styleOf(conversation, loadChoices()) } : {}),
          },
          signal,
        ),
      (result) => {
        setLocal(false);
        setResponse(result);
        choose(result.reponses, 0);
        go('reponses');
      },
      'ton',
    );
  }

  async function adjust(consigne?: (typeof RETOUCHES)[number]['value']) {
    if (!masked || (!consigne && !libre.trim())) return;
    setBusy('ajuster');
    setFailure(undefined);
    try {
      const result = await ajusterSix(apiUrl, {
        conversation: masked,
        texte: remask(texte, table),
        langue,
        moteur: settings.moteur,
        ...(consigne ? { consigne } : {}),
        ...(libre.trim() ? { libre: remask(libre.trim(), table) } : {}),
        ...(moiMasked ? { moi: moiMasked } : {}),
      });
      setTexte(show(result.texte));
      setLibre('');
    } catch (error) {
      setFailure(error instanceof ApiError ? error.kind : 'serveur');
    } finally {
      setBusy('');
    }
  }

  async function explain() {
    if (local || !masked) {
      // Bouclier hors ligne : l'explication est connue d'avance.
      setCoach({
        points: [
          {
            type: 'assertif',
            titre: 'Tu ne cèdes rien',
            explication: 'Aucun code, aucun argent : c’est la seule bonne réponse à une arnaque.',
          },
          {
            type: 'clair',
            titre: 'Court et net',
            explication: 'Pas besoin de te justifier face à un inconnu.',
          },
        ],
        secours: true,
        modele: 'aucun',
        ms: 0,
      });
      return;
    }
    setBusy('coach');
    try {
      setCoach(
        await coachSix(apiUrl, {
          conversation: masked,
          texte: remask(texte, table),
          moteur: settings.moteur,
          ...(moiMasked ? { moi: moiMasked } : {}),
        }),
      );
    } catch (error) {
      setFailure(error instanceof ApiError ? error.kind : 'serveur');
    } finally {
      setBusy('');
    }
  }

  async function copyAndFinish() {
    await copyText(texte);
    const style = response?.reponses[selected]?.style;
    if (style) rememberChoice(style);
    // On efface la conversation de la page : seul le message choisi reste à l'écran.
    setRaw('');
    setConversation(undefined);
    setMasked('');
    setTable({});
    setAnalysis(undefined);
    setFeedbackSent(false);
    go('copie');
  }

  const offlinePanel = failure ? (
    <div
      role="alert"
      className="mx-5 mb-3 flex flex-col gap-3 rounded-[20px] border border-alert/60 bg-alert/10 px-4 py-3.5"
    >
      {failure === 'reseau' ? (
        <>
          <p className="font-display text-[17px] font-semibold">
            Pas de réseau ? <span className="text-accent-soft">Rien n’est perdu</span>
          </p>
          <p className="text-[14px] text-muted">
            Ta conversation reste ici, sur ton téléphone.{' '}
            {canRetry ? 'Six repartira dès que le réseau revient.' : ''}
          </p>
          {canRetry ? (
            <Toggle
              checked={retryOnline}
              onChange={setRetryOnline}
              label="Envoyer au retour du réseau"
            />
          ) : null}
          {canRetry ? (
            <PrimaryButton onClick={() => pending.current?.()}>Réessayer maintenant</PrimaryButton>
          ) : null}
        </>
      ) : (
        <p className="text-[14px] text-alert-soft">{FAILURE_TEXT[failure]}</p>
      )}
    </div>
  ) : null;

  // ————— 1. Import —————
  if (step === 'import') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col">
        <StepHeader step={1} total={TOTAL} onBack={() => window.history.back()} />
        <Title
          accent="conversation"
          sub="Texte copié ou export WhatsApp. Six la lit sur ton téléphone."
        >
          Colle ta{' '}
        </Title>
        <div className="flex flex-col gap-4 px-5">
          <div className="flex gap-2">
            <Chip pressed={source === 'texte'} onClick={() => setSource('texte')}>
              Texte
            </Chip>
            <Chip pressed={source === 'fichier'} onClick={() => setSource('fichier')}>
              WhatsApp .txt / .zip
            </Chip>
          </div>
          {source === 'texte' ? (
            <div className="flex flex-col gap-2">
              <label htmlFor="conversation" className="sr-only">
                Conversation à coller
              </label>
              <textarea
                id="conversation"
                ref={pasteRef}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                rows={10}
                placeholder={
                  'Christelle: Tu as fini ta partie ?\nMoi: Pas encore\nChristelle: Le prof veut tout demain à 8h'
                }
                className="w-full resize-y rounded-[20px] bg-surface px-4 py-3 text-[15px] leading-relaxed ring-1 ring-line placeholder:text-muted/70"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <p className="text-right text-[12px] text-muted tabular-nums">
                {raw.length.toLocaleString('fr-FR')} caractères · les derniers{' '}
                {CHARS_SENT.toLocaleString('fr-FR')} au plus seront envoyés
              </p>
              <div className="grid grid-cols-2 gap-2">
                <SecondaryButton onClick={() => void pasteFromClipboard()}>Coller</SecondaryButton>
                <SecondaryButton onClick={() => setRaw('')}>Effacer</SecondaryButton>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Card label="Dans WhatsApp">
                <p className="text-[14px] leading-relaxed text-muted">
                  Ouvre la discussion › ⋮ › Plus ›{' '}
                  <strong className="text-text">Exporter la discussion</strong> ›{' '}
                  <strong className="text-text">Sans médias</strong>. Enregistre le fichier, puis
                  choisis-le ici.
                </p>
              </Card>
              <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-[20px] border border-dashed border-accent px-4 py-3 text-[15px] text-accent-soft">
                Choisir le fichier .txt ou .zip
                <input
                  type="file"
                  accept=".txt,.zip,text/plain,application/zip"
                  onChange={importFile}
                  className="sr-only"
                />
              </label>
              {raw ? (
                <p className="text-[14px] text-muted" role="status">
                  Fichier lu :{' '}
                  {readConversation(raw).ok
                    ? 'discussion reconnue.'
                    : 'aucune discussion reconnue.'}
                </p>
              ) : null}
            </div>
          )}
          {readError ? (
            <p role="alert" className="text-[14px] text-alert-soft">
              {readError}
            </p>
          ) : null}
        </div>
        <Actions>
          <PrimaryButton onClick={() => read()} disabled={!raw.trim()}>
            Continuer
          </PrimaryButton>
        </Actions>
      </main>
    );
  }

  if (step === 'qui' && conversation) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col">
        <StepHeader step={1} total={TOTAL} onBack={() => go('import')} />
        <Title accent="toi" sub="Pour savoir à qui répondre.">
          Lequel est{' '}
        </Title>
        <div className="flex flex-col gap-2 px-5">
          {conversation.authors.map((author) => (
            <RadioRow key={author} checked={false} onSelect={() => read(author)}>
              {author}
            </RadioRow>
          ))}
        </div>
      </main>
    );
  }

  // ————— Alerte arnaque (risque élevé, détecté sur le téléphone) —————
  if (step === 'alerte' && conversation) {
    const fromOther = conversation.messages
      .filter((m) => m.author === conversation.other)
      .slice(-3);
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col">
        <StepHeader kicker="Alerte" onBack={() => go('import')} />
        <div className="px-5 pb-3">
          <div className="rounded-[20px] border-2 border-alert bg-alert/10 px-4 py-4">
            <h1 className="font-display text-[26px] leading-tight font-bold">
              Ce message ressemble à <span className="text-alert">une arnaque</span>
            </h1>
            <p className="mt-2 text-[14px] text-muted">
              {shieldDrafts(conversation.scam.regles).resume}
            </p>
          </div>
        </div>
        <div className="flex flex-col">
          {fromOther.map((m, i) => (
            <FilRow key={i} six={false}>
              <Bubble author={displayName(conversation.other)}>{m.text}</Bubble>
            </FilRow>
          ))}
        </div>
        <div className="px-5">
          <ScamCard niveau={conversation.scam.niveau} raisons={conversation.scam.raisons} />
        </div>
        <Actions>
          <PrimaryButton onClick={answerScamOffline}>Répondre prudemment</PrimaryButton>
          <details className="rounded-2xl border border-line px-4 py-3 text-[14px]">
            <summary className="min-h-6 cursor-pointer">Bloquer le contact</summary>
            <p className="mt-2 text-muted">
              Six ne peut pas bloquer à ta place. Dans WhatsApp : ouvre la discussion › touche le
              nom ou le numéro en haut › <strong className="text-text">Bloquer</strong>. Tu peux
              aussi le signaler.
            </p>
          </details>
          <SecondaryButton onClick={reset}>Ignorer</SecondaryButton>
        </Actions>
      </main>
    );
  }

  // ————— 2. Anonymisation —————
  if (step === 'masque' && conversation && preview) {
    const lines = segments(preview.text, preview.spans);
    const hidden = hiddenSummary(preview, ignored);
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col">
        <StepHeader step={2} total={TOTAL} onBack={() => go('import')} />
        <Title
          accent="protégées"
          sub="Avant tout envoi, Six masque ce qui identifie quelqu’un. Touche pour corriger."
        >
          Données{' '}
        </Title>
        <div className="flex flex-col">
          {lines.map(({ line }, li) => {
            const message = preview.messages[li];
            const mine = Boolean(message?.author && message.author === conversation.me);
            const authorLength = message?.author ? message.author.length + 2 : 0;
            let consumed = 0;
            return (
              <FilRow key={li} six={false}>
                <Bubble mine={mine}>
                  {line.map((part, pi) => {
                    const start = consumed;
                    consumed += part.text.length;
                    if (part.span === undefined) {
                      return (
                        <span key={pi}>{part.text.slice(Math.max(0, authorLength - start))}</span>
                      );
                    }
                    if (start < authorLength) return null;
                    const span = preview.spans[part.span];
                    const isHidden = !ignored.has(part.span);
                    const index = part.span;
                    return (
                      <button
                        key={pi}
                        type="button"
                        aria-pressed={isHidden}
                        aria-label={
                          isHidden
                            ? `${KIND_LABEL[span?.kind ?? 'nom']} caché, toucher pour le montrer`
                            : `${part.text}, visible, toucher pour le cacher`
                        }
                        onClick={() => {
                          const next = new Set(ignored);
                          if (next.has(index)) next.delete(index);
                          else next.add(index);
                          setIgnored(next);
                        }}
                        className={
                          isHidden
                            ? 'mx-0.5 inline-flex min-h-7 items-center rounded-full bg-accent/25 px-2.5 align-baseline text-[13px] font-semibold text-accent-soft'
                            : 'underline decoration-alert decoration-dotted underline-offset-4'
                        }
                      >
                        {isHidden ? `[${KIND_LABEL[span?.kind ?? 'nom']}]` : part.text}
                      </button>
                    );
                  })}
                </Bubble>
              </FilRow>
            );
          })}
          <FilRow dot>
            <SixSays>
              {hidden
                ? `J’ai masqué ${hidden}. Je peux en oublier : relis, et touche un élément pour le montrer ou le cacher.`
                : 'Je n’ai rien trouvé à masquer. Relis : s’il y a un nom ou un numéro, ajoute-le.'}
            </SixSays>
          </FilRow>
        </div>
        <div className="flex flex-col gap-3 px-5 pt-1">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newName.trim().length >= 2) setExtraNames([...extraNames, newName.trim()]);
              setNewName('');
            }}
          >
            <label htmlFor="cacher" className="sr-only">
              Masquer un autre nom
            </label>
            <input
              id="cacher"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Masquer un autre nom…"
              autoComplete="off"
              className="min-h-12 grow rounded-2xl bg-surface px-4 text-[15px] ring-1 ring-line"
            />
            <button
              type="submit"
              className="min-h-12 rounded-2xl px-4 text-[15px] ring-1 ring-line"
            >
              Masquer
            </button>
          </form>
          <Card>
            <Toggle
              checked={settings.remettreNoms}
              onChange={(value) => updateSettings({ remettreNoms: value })}
              label="Remettre les vrais noms dans la réponse finale"
              hint="Sur ton téléphone, jamais sur nos serveurs"
            />
          </Card>
        </div>
        {offlinePanel}
        <Actions>
          <PrimaryButton onClick={sendMasked}>C’est bon</PrimaryButton>
        </Actions>
      </main>
    );
  }

  // ————— 3 et 7. Attente (analyse, rédaction) —————
  if (step === 'analyse' || step === 'redaction') {
    const analysing = step === 'analyse';
    const items = analysing
      ? [
          'Nettoyage et masquage',
          'Tri des messages importants',
          'Recherche d’arnaque et de tension',
          'Rédaction du résumé',
        ]
      : [
          'Lecture de ton objectif',
          'Rédaction de trois brouillons',
          'Vérification : faits, ton, longueur',
          'Corrections si besoin',
        ];
    // Les deux premières étapes sont faites sur le téléphone avant l'envoi ; la 3e est en cours.
    const doneCount = 2;
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col" aria-busy="true">
        <StepHeader step={NUMBER[step]} total={TOTAL} />
        <div className="flex flex-col items-center gap-3 px-5 pt-8 pb-6 text-center">
          <span
            aria-hidden="true"
            className="relative h-14 w-1 overflow-hidden rounded-full bg-accent/20"
          >
            <span className="six-fil-anim absolute inset-0 bg-accent" />
          </span>
          <h1 className="font-display text-[24px] font-bold">
            Six <span className="text-accent">{analysing ? 'lit' : 'écrit'}</span>{' '}
            {analysing ? 'la conversation…' : 'tes brouillons…'}
          </h1>
          <p className="text-[13px] text-muted tabular-nums" role="status" aria-live="polite">
            {elapsed} s · ça prend quelques secondes en 3G
          </p>
        </div>
        <ul className="flex flex-col gap-2 px-5">
          {items.map((item, i) => {
            const state = i < doneCount ? 'fait' : i === doneCount ? 'en cours' : 'à venir';
            return (
              <li
                key={item}
                className="flex min-h-12 items-center gap-3 rounded-2xl bg-surface px-4 text-[15px]"
              >
                <span
                  aria-hidden="true"
                  className={`flex size-5 items-center justify-center rounded-full text-[11px] ${
                    state === 'fait'
                      ? 'bg-accent text-on-accent'
                      : state === 'en cours'
                        ? 'animate-pulse ring-2 ring-accent'
                        : 'ring-2 ring-line'
                  }`}
                >
                  {state === 'fait' ? '✓' : ''}
                </span>
                <span className={state === 'à venir' ? 'text-muted' : ''}>{item}</span>
                <span className="sr-only"> : {state}</span>
              </li>
            );
          })}
        </ul>
        <Actions>
          <SecondaryButton onClick={() => abort.current?.abort()}>Annuler</SecondaryButton>
        </Actions>
      </main>
    );
  }

  // ————— 4. Compréhension —————
  if (step === 'compris' && analysis && conversation) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col">
        <StepHeader step={4} total={TOTAL} onBack={() => go('masque')} />
        <Title accent="j’ai compris" sub="Six explique avant de proposer. Tu peux corriger.">
          Voilà ce que{' '}
        </Title>
        <div className="flex flex-col gap-3 px-5">
          <Card label="Résumé">
            <p className="text-[15px] leading-relaxed">{show(analysis.resume)}</p>
          </Card>
          <Card label="Tension">
            <LevelGauge
              levels={TENSION_LABELS}
              index={TENSION_INDEX[analysis.tension]}
              label="Tension"
            />
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <Card label="Son intention">
              <p className="text-[15px]">{show(analysis.intention)}</p>
            </Card>
            <Card label="Son ton">
              <p className="text-[15px]">{show(analysis.ton)}</p>
            </Card>
          </div>
          <ScamCard niveau={analysis.arnaque.niveau} raisons={analysis.arnaque.raisons} />
          {analysis.secours ? (
            <p className="text-[13px] text-alert-soft">
              Le modèle n’a pas pu analyser : Six continue avec une lecture simple.
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setShowRecap(!showRecap)}
            aria-expanded={showRecap}
            className="min-h-11 self-start text-[14px] text-accent-soft underline underline-offset-4"
          >
            {showRecap ? 'Masquer le récap' : 'Voir le récap de la conversation'}
          </button>
          {showRecap ? <RecapCard recap={recapOf(conversation)} name={name} /> : null}
          {correcting ? (
            <label className="flex flex-col gap-2">
              <span className="text-[13px] text-muted">Qu’est-ce que Six a mal compris ?</span>
              <textarea
                value={correction}
                onChange={(e) => setCorrection(e.target.value.slice(0, 200))}
                rows={2}
                placeholder="ex. ce n’est pas urgent, on a déjà réglé ça hier"
                className="rounded-2xl bg-surface px-4 py-3 text-[15px] ring-1 ring-line"
              />
            </label>
          ) : null}
        </div>
        <Actions>
          <PrimaryButton onClick={() => go('objectif')}>
            {correcting ? 'Continuer avec ma correction' : 'Oui, c’est ça'}
          </PrimaryButton>
          {!correcting ? (
            <SecondaryButton onClick={() => setCorrecting(true)}>Corriger</SecondaryButton>
          ) : null}
        </Actions>
      </main>
    );
  }

  // ————— 5. Objectif —————
  if (step === 'objectif' && analysis) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col">
        <StepHeader step={5} total={TOTAL} onBack={() => go('compris')} />
        <Title
          accent="obtenir"
          after=" ?"
          sub="Choisis un objectif. Le plus probable est déjà coché."
        >
          Que veux-tu{' '}
        </Title>
        <div role="radiogroup" aria-label="Objectif" className="flex flex-col gap-2 px-5">
          {analysis.objectifs.map((o) => (
            <RadioRow key={o} checked={objectif === o} onSelect={() => setObjectif(o)}>
              {show(o)}
            </RadioRow>
          ))}
          <RadioRow checked={objectif === '__autre'} onSelect={() => setObjectif('__autre')}>
            Autre…
          </RadioRow>
          {objectif === '__autre' ? (
            <input
              value={autre}
              onChange={(e) => setAutre(e.target.value.slice(0, 200))}
              placeholder="ex. proposer de se voir dimanche"
              aria-label="Ton objectif"
              className="min-h-12 rounded-2xl bg-surface px-4 text-[15px] ring-1 ring-line"
            />
          ) : null}
        </div>
        {analysis.question ? (
          <div className="px-5 pt-4">
            <Card label="Six te pose une question">
              <p className="mb-3 text-[15px]">{show(analysis.question.texte)}</p>
              <div className="flex flex-wrap gap-2">
                {analysis.question.options.map((option) => (
                  <Chip
                    key={option}
                    pressed={precision === `${analysis.question?.texte ?? ''} ${option}`}
                    onClick={() => setPrecision(`${analysis.question?.texte ?? ''} ${option}`)}
                  >
                    {option}
                  </Chip>
                ))}
                <Chip pressed={precision === ''} onClick={() => setPrecision('')}>
                  Passer
                </Chip>
              </div>
            </Card>
          </div>
        ) : null}
        <Actions>
          <PrimaryButton
            onClick={() => go('ton')}
            disabled={objectif === '__autre' && !autre.trim()}
          >
            Continuer
          </PrimaryButton>
        </Actions>
      </main>
    );
  }

  // ————— 6. Ton et longueur —————
  if (step === 'ton') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col">
        <StepHeader step={6} total={TOTAL} onBack={() => go(analysis ? 'objectif' : 'masque')} />
        <Title accent="ton" after=" ?" sub="Préréglé avec l’option la plus probable.">
          Quel{' '}
        </Title>
        <div className="flex flex-col gap-4 px-5">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Ton">
            {TONS_ECRAN.map((t) => (
              <Chip key={t.value} pressed={ton === t.value} onClick={() => setTon(t.value)}>
                {t.label}
              </Chip>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
              Longueur
            </p>
            <Segmented
              value={longueur}
              options={LONGUEURS}
              onChange={setLongueur}
              label="Longueur"
            />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
              Langue
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Langue">
              {LANGUAGES.map((l) => (
                <Chip key={l} pressed={langue === l} onClick={() => setLangue(l)}>
                  {LANGUES[l]}
                </Chip>
              ))}
            </div>
          </div>
          <Card label="Aperçu du ton" className="ring-1 ring-accent/40">
            <p className="text-[15px] text-accent-soft italic">{APERCU[ton]}</p>
          </Card>
        </div>
        {offlinePanel}
        <Actions>
          <PrimaryButton onClick={generate}>Générer 3 réponses</PrimaryButton>
        </Actions>
      </main>
    );
  }

  // ————— 8. Trois réponses —————
  if (step === 'reponses' && response) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col">
        <StepHeader step={8} total={TOTAL} onBack={() => (local ? go('alerte') : go('ton'))} />
        <Title
          accent="réponses"
          after=" pour toi"
          sub={
            response.bouclier
              ? 'Écrites par Six sans IA : on ne négocie pas avec une arnaque.'
              : `Pour répondre à ${firstName(show(response.interlocuteur ?? ''))}. Tu choisis.`
          }
        >
          Trois{' '}
        </Title>
        {response.arnaque.niveau === 'moyen' || response.arnaque.niveau === 'eleve' ? (
          <div className="px-5 pb-3">
            <ScamCard niveau={response.arnaque.niveau} raisons={response.arnaque.raisons} />
          </div>
        ) : null}
        {response.secours ? (
          <p className="px-5 pb-3 text-[13px] text-alert-soft">
            Le modèle n’a pas répondu correctement : réponses de secours, simples et sûres.
          </p>
        ) : null}
        <div role="radiogroup" aria-label="Trois brouillons" className="flex flex-col gap-2.5 px-5">
          {response.reponses.map((reponse, index) => {
            const isSelected = selected === index;
            const warnings = response.avertissements.filter((w) => w.brouillon === index);
            return (
              <button
                key={index}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => choose(response.reponses, index)}
                className={`flex flex-col gap-1.5 rounded-[20px] px-4 py-3 text-left transition-colors ${
                  isSelected ? 'bg-accent/15 ring-2 ring-accent' : 'bg-surface ring-1 ring-line'
                }`}
              >
                <span className="flex justify-between text-[13px]">
                  <span className="font-semibold">
                    {'ABC'[index]} · {reponse.style}
                  </span>
                  {isSelected ? <span className="text-accent-soft">✓ Choisie</span> : null}
                </span>
                <span className="text-[15px] leading-snug whitespace-pre-wrap">
                  {show(reponse.texte)}
                </span>
                {warnings.map((w) => (
                  <span key={w.message} className="text-[12px] text-alert-soft">
                    Six n’a pas pu corriger : ce brouillon {w.message}.
                  </span>
                ))}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-3 gap-2 px-5 pt-3">
          {!local ? (
            <SecondaryButton
              compact
              onClick={() => {
                sendFeedback(apiUrl, { utile: false, version: response.version });
                generate();
              }}
            >
              Autres
            </SecondaryButton>
          ) : (
            <span />
          )}
          <SecondaryButton compact onClick={() => go('ajuster')}>
            Ajuster
          </SecondaryButton>
          <SecondaryButton compact onClick={() => void explain()}>
            Pourquoi ?
          </SecondaryButton>
        </div>
        {busy === 'coach' ? (
          <p className="px-5 pt-3 text-[14px] text-muted" role="status">
            Six prépare l’explication…
          </p>
        ) : null}
        {coach ? (
          <div className="px-5 pt-3">
            <Card label="Pourquoi cette réponse ?">
              <ul className="flex flex-col gap-2.5">
                {coach.points.map((p) => (
                  <li key={p.titre} className="flex flex-col">
                    <span
                      className={`text-[13px] font-semibold ${p.type === 'a-eviter' ? 'text-alert-soft' : 'text-accent-soft'}`}
                    >
                      {COACH_LABEL[p.type]} · {p.titre}
                    </span>
                    <span className="text-[14px] text-muted">{p.explication}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        ) : null}
        {offlinePanel}
        <Actions>
          <PrimaryButton onClick={() => void copyAndFinish()}>
            Copier la réponse {'ABC'[selected]}
          </PrimaryButton>
        </Actions>
      </main>
    );
  }

  // ————— 9. Ajustement —————
  if (step === 'ajuster' && response) {
    const waiting = busy === 'ajuster';
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col">
        <StepHeader step={9} total={TOTAL} onBack={() => go('reponses')} />
        <Title accent="à ta façon" sub="Une retouche en un geste, ou modifie toi-même.">
          Ajuste{' '}
        </Title>
        <div className="flex flex-col gap-4 px-5">
          <Card label={`Réponse ${'ABC'[selected]}`}>
            <label htmlFor="texte" className="sr-only">
              Ton message
            </label>
            <textarea
              id="texte"
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              rows={4}
              aria-busy={waiting}
              className="w-full resize-y bg-transparent text-[15px] leading-relaxed"
            />
          </Card>
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
              Retouches rapides
            </p>
            <div className="flex flex-wrap gap-2">
              {RETOUCHES.map((r) => (
                <Chip
                  key={r.value}
                  disabled={waiting || local}
                  onClick={() => void adjust(r.value)}
                >
                  {r.label}
                </Chip>
              ))}
            </div>
            {local ? (
              <p className="text-[12px] text-muted">Hors ligne : modifie le texte toi-même.</p>
            ) : null}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void adjust();
            }}
          >
            <input
              value={libre}
              onChange={(e) => setLibre(e.target.value.slice(0, 200))}
              placeholder="Ou dis-le avec tes mots…"
              aria-label="Ta retouche, avec tes mots"
              disabled={waiting || local}
              className="min-h-12 grow rounded-2xl bg-surface px-4 text-[15px] ring-1 ring-line"
            />
            <button
              type="submit"
              disabled={waiting || local || !libre.trim()}
              className="min-h-12 rounded-2xl px-4 text-[15px] ring-1 ring-line disabled:opacity-50"
            >
              OK
            </button>
          </form>
          {waiting ? (
            <p role="status" className="text-[14px] text-accent-soft italic">
              Six retouche…
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <SecondaryButton onClick={() => go('reponses')}>Annuler</SecondaryButton>
            <SecondaryButton onClick={() => setTexte(original)}>Version d’origine</SecondaryButton>
          </div>
        </div>
        {offlinePanel}
        <Actions>
          <PrimaryButton onClick={() => void copyAndFinish()} disabled={!texte.trim() || waiting}>
            Valider et copier
          </PrimaryButton>
        </Actions>
      </main>
    );
  }

  // ————— 10. Copié —————
  if (step === 'copie') {
    const code = otpCode;

    function partagerOTP() {
      const brut = générerOTP();
      const net = codeNet(brut);
      dissocierOTP(net);
      associerOTP(net, masked ?? '');
      setOtpCode(net);
      setOtpHref(`${window.location.origin}/repondre?otp=${encodeURIComponent(net)}`);
    }

    function chargerConversationDestinataire() {
      const masqué = conversationPourOTP(code ?? '');
      if (!masqué) return;
      setRaw(masqué);
      setConversation(undefined);
      setMasked('');
      setTable({});
      setAnalysis(undefined);
      setResponse(undefined);
      go('masque');
    }

    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col">
        <StepHeader step={10} total={TOTAL} />
        <div className="flex flex-col items-center gap-3 px-5 pt-6 pb-4 text-center">
          <span
            className="flex size-14 items-center justify-center rounded-2xl bg-accent text-[28px] text-on-accent"
            aria-hidden="true"
          >
            ✓
          </span>
          <h1 className="font-display text-[26px] font-bold">
            Réponse <span className="text-accent">copiée</span>
          </h1>
          <p className="text-[14px] text-muted">
            Colle-la dans ta conversation et envoie-la toi-même.
          </p>
        </div>
        <div className="px-5">
          <Card>
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap select-all">{texte}</p>
          </Card>
        </div>
        <div className="px-5 pt-4">
          {feedbackSent ? (
            <p className="text-[14px] text-muted" role="status">
              Merci, c’est noté (sans aucun texte).
            </p>
          ) : (
            <Card label="Cette réponse t’a aidé ?">
              <div className="flex gap-2">
                {[true, false].map((utile) => (
                  <Chip
                    key={String(utile)}
                    onClick={() => {
                      sendFeedback(apiUrl, {
                        utile,
                        brouillon: selected,
                        version: response?.version ?? 'inconnue',
                      });
                      setFeedbackSent(true);
                    }}
                  >
                    {utile ? 'Oui' : 'Non'}
                  </Chip>
                ))}
              </div>
            </Card>
          )}
        </div>

        {code ? (
          <div className="px-5 pb-4">
            <p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">
              Partager cette conversation
            </p>
            <div className="flex flex-col gap-4">
              <OTPCode
                code={otpCode ?? ''}
                texteMasqué={masked ?? ''}
                onCopie={partagerOTP}
              />
              <div className="flex justify-center">
                <p className="mb-2 text-center text-[13px] text-muted">
                  Ton ami scanne ce code ou tape le code à la main.
                </p>
                {otpHref ? (
                  <QRCode value={otpHref} />
                ) : (
                  <div className="h-24 w-24 animate-pulse rounded-lg bg-surface" />
                )}
              </div>
              <p className="text-[12px] text-muted">
                Le destinataire ouvre l'appli et entre le code. La conversation chargée côté destinataire ne contient que le texte masqué : aucun nom, aucun numéro, aucun message original.
              </p>
              <SecondaryButton compact onClick={chargerConversationDestinataire}>
                Charger la conversation partagée
              </SecondaryButton>
            </div>
          </div>
        ) : (
          <div className="mt-2 text-center text-[13px] text-muted">
            Partage cette réponse par WhatsApp, ou crée un code de partage pour que ton ami ouvre la même conversation masquée sur son téléphone.
          </div>
        )}

        <Actions>
          <a
            href={`whatsapp://send?text=${encodeURIComponent(texte)}`}
            className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-accent px-5 py-3 font-display text-base font-semibold text-on-accent"
          >
            Ouvrir WhatsApp
          </a>
          <SecondaryButton onClick={reset}>Nouvelle conversation</SecondaryButton>
        </Actions>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-5">
      <p className="text-muted">On recommence.</p>
      <PrimaryButton onClick={reset}>Nouvelle conversation</PrimaryButton>
    </main>
  );
}
