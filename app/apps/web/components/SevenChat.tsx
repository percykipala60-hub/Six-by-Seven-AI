'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppBar } from './AppBar';
import { useConfirmer } from './Confirmer';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { memoireActive } from '@/lib/memoire';
import { entetesCompte } from '@/lib/premium-client';
import { CHAT_MAX_BYTES, CHAT_MAX_CONTENT, CHAT_MAX_MESSAGES } from '@/lib/api-schemas';
import { detecterOrdre } from '@/lib/seven-ordres';
import type { ChatMessage, ChatResult } from '@/lib/types';
import { MAX_MSG, effacerChat, garderChat, lireChat, nouvelId } from '@/lib/seven-chats';

// Les discussions sont gardées sur l'appareil (lib/seven-chats), tant que la mémoire de Six est active.
// Un document importé (texte ou PDF) est envoyé dans le message : on le borne pour
// rester dans la limite du serveur (20 000 caractères) et raisonnable côté coûts.
const TAILLE_DOC_MAX = 12_000;
const PAGES_PDF_MAX = 20;
const MAX_FICHIER = 20 * 1024 * 1024;
const encoder = new TextEncoder();

/**
 * Affiche une réponse qui vient d'arriver mot après mot, au lieu d'un bloc qui surgit d'un coup.
 * Durée bornée (environ 2,5 s même pour un long texte) ; rien d'animé si la personne préfère moins
 * d'animations. `onPas` est appelé à chaque étape (le fil suit l'écriture).
 */
function TexteProgressif({ texte, onPas }: { texte: string; onPas?: () => void }) {
  const morceaux = useMemo(() => texte.split(/(\s+)/), [texte]);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setN(morceaux.length);
      return;
    }
    const pas = Math.max(1, Math.ceil(morceaux.length / 160)); // ~160 étapes au plus
    const t = setInterval(() => {
      setN((x) => {
        const suivant = Math.min(morceaux.length, x + pas);
        if (suivant >= morceaux.length) clearInterval(t);
        return suivant;
      });
    }, 16);
    return () => clearInterval(t);
  }, [morceaux]);
  useEffect(() => {
    onPas?.();
  }, [n, onPas]);
  return <>{n >= morceaux.length ? texte : morceaux.slice(0, n).join('')}</>;
}

function preparerRequete(historique: ChatMessage[], content: string): string {
  const dernier: ChatMessage = { role: 'user', content };
  const serialiser = (messages: ChatMessage[]) => JSON.stringify({ messages });
  let corps = serialiser([dernier]);
  if (content.length > CHAT_MAX_CONTENT || encoder.encode(corps).length > CHAT_MAX_BYTES) {
    throw new Error('Le message est trop long. Raccourcis-le avant de réessayer.');
  }
  const contexte = [dernier];
  for (const message of historique.slice(-(CHAT_MAX_MESSAGES - 1)).reverse()) {
    if (!message.content.trim() || message.content.length > CHAT_MAX_CONTENT) break;
    const candidat = serialiser([message, ...contexte]);
    if (encoder.encode(candidat).length > CHAT_MAX_BYTES) break;
    contexte.unshift(message);
    corps = candidat;
  }
  return corps;
}

/** Extrait le texte d'un PDF côté navigateur (pdfjs-dist, chargé à la demande). */
async function extrairePdf(fichier: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  const chargement = pdfjs.getDocument({ data: await fichier.arrayBuffer() });
  const morceaux: string[] = [];
  try {
    const pdf = await chargement.promise;
    const pages = Math.min(pdf.numPages, PAGES_PDF_MAX);
    for (let n = 1; n <= pages; n++) {
      const page = await pdf.getPage(n);
      const contenu = await page.getTextContent();
      morceaux.push(
        contenu.items
          .map((it) => ('str' in it ? it.str : ''))
          .join(' ')
          .trim(),
      );
    }
    let texte = morceaux.filter(Boolean).join('\n\n');
    if (!texte)
      throw new Error(
        'Aucun texte extractible. Pour un PDF numérisé, utilise une version avec du texte sélectionnable.',
      );
    if (pdf.numPages > PAGES_PDF_MAX)
      texte += `\n\n[… ${pdf.numPages - PAGES_PDF_MAX} pages non importées]`;
    return texte.trim();
  } finally {
    await chargement.destroy();
  }
}

// Web Speech API : la dictée se fait dans le navigateur, aucune clé serveur n'est requise.
// Pris en charge par Chrome, Edge et Safari ; pas par Firefox (on le détecte honnêtement).
interface ReconnaissanceVocale {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type ConstructeurReconnaissance = new () => ReconnaissanceVocale;

function constructeurReconnaissance(): ConstructeurReconnaissance | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (
    (w.SpeechRecognition as ConstructeurReconnaissance | undefined) ??
    (w.webkitSpeechRecognition as ConstructeurReconnaissance | undefined) ??
    null
  );
}

export function dicteeDisponible(): boolean {
  return constructeurReconnaissance() !== null;
}

/** Écoute le micro et résout avec le texte dicté (une phrase, français). */
function dicterTexte(signal: AbortSignal): Promise<string> {
  const Ctor = constructeurReconnaissance();
  return new Promise((resolve, reject) => {
    if (!Ctor) {
      reject(new Error('non supporté'));
      return;
    }
    const rec = new Ctor();
    rec.lang = 'fr-FR';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let recu = '';
    rec.onresult = (e) => {
      recu = e.results[0]?.[0]?.transcript ?? '';
    };
    const arreter = () => {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.stop();
      reject(new Error('Dictée arrêtée.'));
    };
    signal.addEventListener('abort', arreter, { once: true });
    rec.onerror = () => {
      signal.removeEventListener('abort', arreter);
      reject(new Error('erreur dictée'));
    };
    rec.onend = () => {
      signal.removeEventListener('abort', arreter);
      if (recu) resolve(recu);
      else reject(new Error('dictée vide'));
    };
    try {
      rec.start();
    } catch {
      signal.removeEventListener('abort', arreter);
      reject(new Error('micro indisponible'));
    }
  });
}

/**
 * L'espace « Discuter » : la conversation libre avec Six, comme une page dédiée
 * de l'app (même modèle que « Quoi dire ? » ou « Espace jeu »). On discute avec Six
 * comme avec un assistant généraliste ; elle connaît parfaitement son identité et celle de Six.
 * L'historique reste sur l'appareil (localStorage). Trois entrées en plus du texte :
 * import de documents (texte/PDF), messages vocaux (transcription), et ordres de pilotage
 * (« ouvre les réglages ») que Six exécute directement.
 */
export function SevenChatPage() {
  const router = useRouter();
  const params = useSearchParams();
  const demandee = params.get('c') ?? ''; // discussion ouverte depuis le menu ; vide : nouvelle discussion
  const chatId = useRef('');
  const [demande, demander] = useConfirmer();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [saisie, setSaisie] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const [transcription, setTranscription] = useState<boolean | null>(null);
  const [dernierEchec, setDernierEchec] = useState<{
    texte: string;
    affichage?: string;
    document?: string;
  }>();
  const documentActif = useRef('');
  const [documentAReimporter, setDocumentAReimporter] = useState(false);
  const [enAttente, setEnAttente] = useState(''); // question envoyée, réponse pas encore arrivée
  const [lectureDoc, setLectureDoc] = useState(false); // lecture locale d'un fichier (non annulable)
  const operation = useRef<AbortController | null>(null);

  async function requete(url: string, init: RequestInit): Promise<Response> {
    const controleur = new AbortController();
    operation.current = controleur;
    const delai = setTimeout(() => controleur.abort(new Error('Délai dépassé. Réessaie.')), 90000);
    try {
      const response = await fetch(url, { ...init, signal: controleur.signal });
      const body = await response.text();
      return new Response(body, { status: response.status, headers: response.headers });
    } catch (error) {
      if (controleur.signal.aborted)
        throw new Error('Demande interrompue ou délai dépassé. Tu peux réessayer.', {
          cause: error,
        });
      throw error;
    } finally {
      clearTimeout(delai);
      if (operation.current === controleur) operation.current = null;
    }
  }

  async function dictee(): Promise<string> {
    const controleur = new AbortController();
    operation.current = controleur;
    const delai = setTimeout(() => controleur.abort(), 60000);
    try {
      return await dicterTexte(controleur.signal);
    } finally {
      clearTimeout(delai);
      if (operation.current === controleur) operation.current = null;
    }
  }
  const verrouMicro = useRef(false);
  const [memOn, setMemOn] = useState(false); // mémoire de Six active (gate de conservation de l'historique)
  const [enregistre, setEnregistre] = useState(false); // micro en cours d'enregistrement
  const fin = useRef<HTMLDivElement>(null);
  const [animee, setAnimee] = useState(-1); // index de la réponse en train de s'écrire
  const suivreFin = useCallback(() => {
    fin.current?.scrollIntoView({ block: 'end' });
  }, []);
  const champ = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunksAudio = useRef<Blob[]>([]);

  // Ouvre la discussion demandée par l'adresse (menu latéral), ou une nouvelle discussion vide.
  useEffect(() => {
    operation.current?.abort();
    const chat = demandee ? lireChat(demandee) : undefined;
    chatId.current = chat?.id ?? nouvelId();
    setAnimee(-1);
    const historique = chat?.messages ?? [];
    setMessages(historique);
    setSaisie('');
    setErreur('');
    setDernierEchec(undefined);
    documentActif.current = '';
    setDocumentAReimporter(
      historique.some((message) => message.role === 'user' && message.content.startsWith('📄 ')),
    );
    setMemOn(memoireActive());
    champ.current?.focus();
  }, [demandee]);

  useEffect(() => {
    const controleur = new AbortController();
    void fetch('/api/chat', { signal: controleur.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('État indisponible');
        const etat = (await res.json()) as { transcription: boolean };
        setTranscription(etat.transcription);
      })
      .catch(() => {
        if (!controleur.signal.aborted)
          setErreur('Impossible de vérifier la disponibilité de Six.');
      });
    return () => {
      controleur.abort();
      operation.current?.abort();
      const micro = mediaRecorder.current;
      if (micro) {
        micro.onstop = null;
        if (micro.state !== 'inactive') micro.stop();
        micro.stream.getTracks().forEach((piste) => piste.stop());
      }
    };
  }, []);

  // Si la mémoire est coupée ou réactivée ailleurs (Réglages), l'écran suit.
  useEffect(() => {
    const lire = () => {
      setMemOn(memoireActive());
      if (!memoireActive()) {
        setMessages([]);
        setDernierEchec(undefined);
        documentActif.current = '';
        setDocumentAReimporter(false);
        operation.current?.abort();
      }
    };
    window.addEventListener('six-memoire', lire);
    return () => window.removeEventListener('six-memoire', lire);
  }, []);

  // Le fil descend vers la réponse quand elle arrive.
  useEffect(() => {
    fin.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages, occupe]);

  function pousser(fil: ChatMessage[]) {
    setMessages(fil);
    garderChat(chatId.current, fil);
  }

  async function envoyer(texte: string, affichage?: string, document?: string) {
    if (occupe || enregistre || !texte.trim()) return;
    // Les ordres de navigation (« ouvre les réglages ») restent permis même sans le document.
    if (documentAReimporter && !affichage && !detecterOrdre(texte)) {
      setErreur(
        'Réimporte le document pour continuer cette conversation, ou efface le fil pour commencer une nouvelle discussion.',
      );
      return;
    }
    // « affichage » (optionnel) : ce qu'on montre dans la bulle et qu'on garde dans l'historique.
    // « texte » : ce qui part vers l'IA. Pour un document importé, la bulle reste courte
    // (« 📄 nom du fichier ») pendant que l'IA reçoit le contenu complet avec sa consigne.
    const visible = (affichage ?? texte).trim();
    const fil = [...messages, { role: 'user' as const, content: visible }].slice(-MAX_MSG);
    setDernierEchec(undefined);
    setOccupe(true);
    setErreur('');
    setEnAttente(visible); // la question s'affiche tout de suite, en attendant la réponse

    // Pilotage : un ordre (« ouvre les réglages ») navigue directement, sans appel à l'IA.
    // Un document importé ne doit jamais déclencher un ordre : on le saute (affichage présent).
    const ordre = affichage ? null : detecterOrdre(texte);
    if (ordre) {
      pousser([...fil, { role: 'assistant' as const, content: ordre.reponse }].slice(-MAX_MSG));
      setSaisie('');
      setEnAttente('');
      setOccupe(false);
      router.push(ordre.cible);
      return;
    }

    try {
      const question = texte.trim();
      const contexteDoc = affichage ? '' : documentActif.current;
      const corps = preparerRequete(
        messages,
        contexteDoc ? question + '\n\nDocument de référence :\n' + contexteDoc : question,
      );
      const res = await requete('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(await entetesCompte()) },
        body: corps,
      });
      const data = (await res.json().catch(() => ({}))) as ChatResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Erreur inattendue. Réessaie.');
      if (typeof data.reponse !== 'string' || !data.reponse.trim()) {
        throw new Error('Six a renvoyé une réponse vide. Réessaie.');
      }
      const suite = [...fil, { role: 'assistant' as const, content: data.reponse }].slice(-MAX_MSG);
      setAnimee(suite.length - 1); // seule la réponse qui arrive s'écrit progressivement
      pousser(suite);
      if (document) {
        documentActif.current = document;
        setDocumentAReimporter(false);
      }
      setSaisie('');
    } catch (e) {
      setDernierEchec({ texte, affichage, document });
      setErreur(e instanceof Error ? e.message : 'Six ne répond pas pour le moment. Réessaie.');
    } finally {
      setEnAttente('');
      setOccupe(false);
    }
  }

  // — Import de document (texte ou PDF) : contenu complet envoyé à l'IA, bulle d'affichage courte. —
  async function importerDoc(fichier: File | undefined) {
    if (!fichier || occupe) return;
    setOccupe(true);
    setLectureDoc(true);
    setErreur('');
    try {
      if (fichier.size > MAX_FICHIER) throw new Error('Le fichier dépasse 20 Mo.');
      const estPdf = fichier.type === 'application/pdf' || /\.pdf$/i.test(fichier.name);
      let texte = estPdf ? await extrairePdf(fichier) : await fichier.text();
      if (!texte.trim()) throw new Error('Ce fichier ne contient pas de texte lisible.');
      while (encoder.encode(JSON.stringify(texte)).length > TAILLE_DOC_MAX)
        texte = `${texte.slice(0, Math.floor(texte.length * 0.8))}\n\n[… document tronqué]`;
      // L'IA reçoit le contenu + la consigne ; la bulle affichée reste « 📄 nom du fichier ».
      // Consigne : dire en BREF ce qu'elle a compris — jamais reproduire le fichier.
      const document = `[Document importé : ${fichier.name}]\n\n${texte}`;
      setLectureDoc(false); // lecture finie : l'envoi qui suit peut être arrêté
      await envoyer(
        `${document}\n\n— Consigne de réponse : en 6 lignes maximum, dis-moi en BREF et clairement ce que tu as compris de ce document : sa nature, son sujet et 3 à 4 points clés en puces. Ne reproduis surtout pas son contenu.`,
        `📄 ${fichier.name}`,
        document,
      );
    } catch (e) {
      setErreur(
        e instanceof Error
          ? `Lecture de « ${fichier.name} » impossible : ${e.message}`
          : 'Lecture du document impossible. Réessaie.',
      );
    } finally {
      setLectureDoc(false);
      setOccupe(false);
      if (docInput.current) docInput.current.value = '';
    }
  }

  // — Message vocal : enregistrement navigateur, transcription serveur, envoi auto. —
  async function basculerMicro() {
    if (enregistre) {
      mediaRecorder.current?.stop(); // la fin déclenche l'envoi dans onstop
      return;
    }
    if (occupe || verrouMicro.current) return;
    setErreur('');
    if (transcription !== true) {
      if (!dicteeDisponible()) {
        setErreur('La transcription est indisponible et ce navigateur ne propose pas la dictée.');
        return;
      }
      verrouMicro.current = true;
      setOccupe(true);
      try {
        setSaisie(await dictee());
      } catch {
        setErreur('La dictée a échoué. Vérifie l’accès au micro et réessaie.');
      } finally {
        verrouMicro.current = false;
        setOccupe(false);
      }
      return;
    }

    // Le micro navigateur n'existe qu'en contexte sécurisé (HTTPS ou localhost).
    // En HTTP simple (adresse IP, preview distante) : on l'explique au lieu d'un échec opaque.
    if (!window.isSecureContext || typeof navigator.mediaDevices?.getUserMedia !== 'function') {
      setErreur(
        window.isSecureContext
          ? 'Ce navigateur ne permet pas le micro. Ouvre Six en HTTPS ou sur localhost.'
          : 'Le micro demande une connexion sécurisée : ouvre Six en HTTPS, pas en HTTP.',
      );
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setErreur(
        'Ce navigateur ne sait pas enregistrer de vocal. Mets-le à jour ou écris ton message.',
      );
      return;
    }

    verrouMicro.current = true;
    let flux: MediaStream | undefined;
    try {
      flux = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksAudio.current = [];
      const mr = new MediaRecorder(flux);
      mediaRecorder.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksAudio.current.push(e.data);
      };
      mr.onerror = () => {
        setEnregistre(false);
        mr.stream.getTracks().forEach((t) => t.stop());
        setErreur('Enregistrement interrompu. Réessaie.');
      };
      mr.onstop = () => {
        mr.stream.getTracks().forEach((t) => t.stop());
        setEnregistre(false);
        const blob = new Blob(chunksAudio.current, { type: mr.mimeType || 'audio/webm' });
        if (blob.size === 0) return;
        void envoyerVocal(blob);
      };
      mr.start();
      setEnregistre(true);
    } catch (e) {
      flux?.getTracks().forEach((piste) => piste.stop());
      const nom = e instanceof DOMException ? e.name : '';
      if (nom === 'NotAllowedError' || nom === 'SecurityError')
        setErreur(
          'Accès au micro refusé. Autorise le micro pour ce site : clique sur l’icône 🔒 (ou ℹ️) à gauche de l’adresse, puis autorise le microphone.',
        );
      else if (nom === 'NotFoundError' || nom === 'OverconstrainedError')
        setErreur('Aucun micro détecté sur cet appareil. Branche un micro ou écris ton message.');
      else setErreur('Le micro n’a pas répondu. Réessaie, ou écris ton message en attendant.');
    } finally {
      verrouMicro.current = false;
    }
  }

  async function envoyerVocal(blob: Blob) {
    setOccupe(true);
    setErreur('');
    try {
      const form = new FormData();
      form.append('audio', blob);
      const res = await requete('/api/chat/transcription', { method: 'POST', body: form });
      const data = (await res.json().catch(() => ({}))) as { texte?: string; error?: string };
      if (!res.ok || !data.texte) throw new Error(data.error ?? 'Transcription impossible.');
      setSaisie(data.texte);
    } catch (e) {
      // Serveur sans clé de transcription (Netlify, démo) : on retombe sur la reconnaissance
      // vocale du navigateur (Web Speech API) pour dicter le message, sans clé côté serveur.
      const msg = e instanceof Error ? e.message : '';
      const serveurIndispo =
        msg.includes('OPENAI_API_KEY') || msg.includes('Transcription impossible');
      if (serveurIndispo && dicteeDisponible()) {
        setErreur(
          'Transcription serveur indisponible : dicte ton message avec le micro du navigateur.',
        );
        try {
          const texte = await dictee();
          if (texte.trim()) setSaisie(texte.trim());
          return;
        } catch {
          setErreur(
            'La dictée navigateur a échoué. Autorise le micro puis réessaie, ou écris ton message.',
          );
          return;
        } finally {
          setOccupe(false);
        }
      }
      setErreur(e instanceof Error ? e.message : 'Transcription impossible. Réessaie ou écris.');
    } finally {
      setOccupe(false);
    }
  }

  // Export PDF d'une réponse : le PDF est construit sur l'appareil (jsPDF, chargé à la demande).
  async function exporterMessage(m: ChatMessage) {
    setErreur('');
    try {
      const { telechargerPdfSeven } = await import('@/lib/pdf-seven');
      await telechargerPdfSeven([m], 'Réponse de Six');
    } catch {
      setErreur('Export PDF impossible sur cet appareil. Réessaie.');
    }
  }

  return (
    <main className="screen seven-screen">
      <AppBar
        page="seven-ai"
        titre="Discuter"
        chatActif={messages.length ? chatId.current : undefined}
        onNouvelle={() => {
          operation.current?.abort();
          chatId.current = nouvelId();
          setMessages([]);
          setSaisie('');
          setErreur('');
          setDernierEchec(undefined);
          documentActif.current = '';
          setDocumentAReimporter(false);
          if (demandee) router.replace('/seven-ai');
          champ.current?.focus();
        }}
      />
      {demande}
      <div className="seven-fil" aria-live="polite">
        {messages.length === 0 && !occupe && (
          <div className="seven-vide">
            <span className="six-vide-logo" aria-hidden="true">
              <Logo label="" />
            </span>
            <h1>On discute ?</h1>
            <p>
              Pose-moi une question, joins un document ou envoie un vocal. Tu peux aussi me demander
              d&apos;ouvrir une page, comme « ouvre les réglages ».
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`seven-msg ${m.role}`}>
            {m.role === 'assistant' && (
              <span className="six-msg-logo" aria-hidden="true">
                <Logo label="" small />
              </span>
            )}
            <div className="seven-bulle">
              {i === animee && m.role === 'assistant' ? (
                <TexteProgressif texte={m.content} onPas={suivreFin} />
              ) : (
                m.content
              )}
            </div>
            {m.role === 'assistant' && (
              <button
                type="button"
                className="seven-pdf"
                aria-label="Exporter cette réponse en PDF"
                title="Exporter cette réponse en PDF"
                onClick={() => void exporterMessage(m)}
              >
                <Icon name="down" size={15} />
              </button>
            )}
          </div>
        ))}
        {enAttente && (
          <div className="seven-msg user">
            <div className="seven-bulle">{enAttente}</div>
          </div>
        )}
        {occupe && (
          <div className="seven-msg assistant">
            <span className="six-msg-logo" aria-hidden="true">
              <Logo label="" small />
            </span>
            <div className="seven-bulle seven-reflexion">Six réfléchit…</div>
          </div>
        )}
        {erreur && (
          <p role="alert" className="seven-erreur">
            {erreur}
          </p>
        )}
        {dernierEchec && !occupe && (
          <button
            type="button"
            onClick={() =>
              void envoyer(dernierEchec.texte, dernierEchec.affichage, dernierEchec.document)
            }
          >
            Réessayer le dernier envoi
          </button>
        )}
        {occupe && !lectureDoc && (
          <button type="button" onClick={() => operation.current?.abort()}>
            Arrêter
          </button>
        )}
        {documentAReimporter && (
          <p role="status">
            Réimporte le document pour reprendre les questions sur son contenu. Son texte est
            conservé uniquement pendant cette visite.
          </p>
        )}
        {!memOn && (
          <p className="seven-note-demo">
            Mémoire désactivée : Six oublie la discussion à chaque visite. Active-la dans Réglages →
            Mémoire pour garder vos conversations.
          </p>
        )}
        <div ref={fin} />
      </div>

      <form
        className="seven-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void envoyer(saisie);
        }}
      >
        <div className="seven-capsule">
          {messages.length > 0 && !occupe && (
            <button
              type="button"
              className="seven-effacer"
              aria-label="Effacer cette discussion"
              title="Effacer la conversation"
              onClick={() =>
                demander({
                  titre: 'Effacer cette discussion ?',
                  texte: 'Les messages de cette discussion seront effacés de ce téléphone.',
                  action: 'Effacer',
                  danger: true,
                  onConfirmer: () => {
                    effacerChat(chatId.current);
                    chatId.current = nouvelId();
                    if (demandee) router.replace('/seven-ai');
                    setMessages([]);
                    setDernierEchec(undefined);
                    documentActif.current = '';
                    setDocumentAReimporter(false);
                  },
                })
              }
            >
              <Icon name="trash" size={18} />
            </button>
          )}
          <button
            type="button"
            className="seven-doc"
            aria-label="Importer un document (texte ou PDF)"
            title="Importer un document"
            disabled={occupe || enregistre}
            onClick={() => docInput.current?.click()}
          >
            <Icon name="clip" size={18} />
          </button>
          <input
            ref={docInput}
            type="file"
            accept=".txt,.md,.csv,.json,.log,.pdf"
            className="seven-doc-input"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => void importerDoc(e.target.files?.[0])}
          />
          <input
            ref={champ}
            type="text"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder="Écris à Six…"
            aria-label="Écrire à Six"
            disabled={occupe}
          />
          <button
            type="button"
            className={`seven-mic${enregistre ? ' rec' : ''}`}
            aria-label={enregistre ? 'Arrêter le message vocal' : 'Envoyer un message vocal'}
            title={enregistre ? 'Terminer le vocal' : 'Message vocal'}
            disabled={occupe && !enregistre}
            onClick={() => void basculerMicro()}
          >
            <Icon name={enregistre ? 'x' : 'mic'} size={18} />
          </button>
          <button
            type="submit"
            disabled={occupe || enregistre || !saisie.trim()}
            aria-label="Envoyer"
          >
            <Icon name="up" size={18} />
          </button>
        </div>
        <p className="seven-mention">Six peut se tromper : vérifie les informations importantes.</p>
      </form>
    </main>
  );
}
