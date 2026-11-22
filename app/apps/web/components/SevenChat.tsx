'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppBar } from './AppBar';
import { useConfirmer } from './Confirmer';
import { Icon } from './Icon';
import { memoireActive } from '@/lib/memoire';
import { detecterOrdre } from '@/lib/seven-ordres';
import type { ChatMessage, ChatResult } from '@/lib/types';

const CLE_SEVEN = 'seven-ai-chat';
// L'historique est gardé sur l'appareil jusqu'à ce que la personne l'efface elle-même
// (bouton poubelle du compositeur), ou jusqu'à ce qu'elle coupe la mémoire de Six.
const MAX_MSG = 200;
// Un document importé (texte ou PDF) est envoyé dans le message : on le borne pour
// rester dans la limite du serveur (20 000 caractères) et raisonnable côté coûts.
const TAILLE_DOC_MAX = 12_000;
const PAGES_PDF_MAX = 20;

function lireHistorique(): ChatMessage[] {
  if (!memoireActive()) return []; // mémoire coupée : Seven AI oublie tout, l'historique est vide
  try {
    const brut = localStorage.getItem(CLE_SEVEN);
    if (!brut) return [];
    const liste = JSON.parse(brut) as ChatMessage[];
    if (!Array.isArray(liste)) return [];
    return liste
      .filter(
        (m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
      )
      .slice(-MAX_MSG);
  } catch {
    return [];
  }
}

function garderHistorique(messages: ChatMessage[]) {
  if (!memoireActive()) return; // mémoire coupée : rien n'est gardé
  try {
    localStorage.setItem(CLE_SEVEN, JSON.stringify(messages.slice(-MAX_MSG)));
  } catch {
    /* historique non gardé */
  }
}

/** Extrait le texte d'un PDF côté navigateur (pdfjs-dist, chargé à la demande). */
async function extrairePdf(fichier: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  const pdf = await pdfjs.getDocument({ data: await fichier.arrayBuffer() }).promise;
  const morceaux: string[] = [];
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
  if (pdf.numPages > PAGES_PDF_MAX)
    texte += `\n\n[… ${pdf.numPages - PAGES_PDF_MAX} pages non importées]`;
  return texte.trim();
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
function dicterTexte(): Promise<string> {
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
    rec.onerror = () => reject(new Error('erreur dictée'));
    rec.onend = () => (recu ? resolve(recu) : reject(new Error('dictée vide')));
    try {
      rec.start();
    } catch {
      reject(new Error('micro indisponible'));
    }
  });
}

/**
 * La page Seven AI : la conversation avec l'assistant intégré de Six, comme une page dédiée
 * de l'app (même modèle que « Quoi dire ? » ou « Espace jeu »). On discute avec Seven AI
 * comme avec un assistant généraliste ; elle connaît parfaitement son identité et celle de Six.
 * L'historique reste sur l'appareil (localStorage). Trois entrées en plus du texte :
 * import de documents (texte/PDF), messages vocaux (transcription), et ordres de pilotage
 * (« ouvre les réglages ») que Six exécute directement.
 */
export function SevenChatPage() {
  const router = useRouter();
  const [demande, demander] = useConfirmer();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [saisie, setSaisie] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const [demo, setDemo] = useState(false);
  const [memOn, setMemOn] = useState(false); // mémoire de Six active (gate de conservation de l'historique)
  const [enregistre, setEnregistre] = useState(false); // micro en cours d'enregistrement
  const charge = useRef(false); // l'historique est lu une seule fois
  const fin = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunksAudio = useRef<Blob[]>([]);

  useEffect(() => {
    if (charge.current) return;
    charge.current = true;
    setMessages(lireHistorique());
    setMemOn(memoireActive());
    champ.current?.focus();
  }, []);

  // Si la mémoire est coupée ou réactivée ailleurs (Réglages), l'écran suit.
  useEffect(() => {
    const lire = () => {
      setMemOn(memoireActive());
      if (!memoireActive()) setMessages([]);
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
    garderHistorique(fil);
  }

  async function envoyer(texte: string, affichage?: string) {
    if (occupe || !texte.trim()) return;
    // « affichage » (optionnel) : ce qu'on montre dans la bulle et qu'on garde dans l'historique.
    // « texte » : ce qui part vers l'IA. Pour un document importé, la bulle reste courte
    // (« 📄 nom du fichier ») pendant que l'IA reçoit le contenu complet avec sa consigne.
    const visible = (affichage ?? texte).trim();
    const fil = [...messages, { role: 'user' as const, content: visible }].slice(-MAX_MSG);
    const pourApi = affichage
      ? [...messages, { role: 'user' as const, content: texte.trim() }].slice(-MAX_MSG)
      : fil;
    pousser(fil);
    setSaisie('');
    setOccupe(true);
    setErreur('');

    // Pilotage : un ordre (« ouvre les réglages ») navigue directement, sans appel à l'IA.
    // Un document importé ne doit jamais déclencher un ordre : on le saute (affichage présent).
    const ordre = affichage ? null : detecterOrdre(texte);
    if (ordre) {
      pousser([...fil, { role: 'assistant' as const, content: ordre.reponse }].slice(-MAX_MSG));
      setOccupe(false);
      router.push(ordre.cible);
      return;
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: pourApi }),
      });
      const data = (await res.json().catch(() => ({}))) as ChatResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Erreur inattendue. Réessaie.');
      pousser([...fil, { role: 'assistant' as const, content: data.reponse }].slice(-MAX_MSG));
      setDemo(data.demo);
    } catch (e) {
      setErreur(
        e instanceof Error ? e.message : 'Seven AI ne répond pas pour le moment. Réessaie.',
      );
    } finally {
      setOccupe(false);
    }
  }

  // — Import de document (texte ou PDF) : contenu complet envoyé à l'IA, bulle d'affichage courte. —
  async function importerDoc(fichier: File | undefined) {
    if (!fichier || occupe) return;
    setOccupe(true);
    setErreur('');
    try {
      const estPdf = fichier.type === 'application/pdf' || /\.pdf$/i.test(fichier.name);
      let texte = estPdf ? await extrairePdf(fichier) : await fichier.text();
      if (!texte.trim()) throw new Error('Ce fichier ne contient pas de texte lisible.');
      if (texte.length > TAILLE_DOC_MAX)
        texte = `${texte.slice(0, TAILLE_DOC_MAX)}\n\n[… document tronqué]`;
      // L'IA reçoit le contenu + la consigne ; la bulle affichée reste « 📄 nom du fichier ».
      // Consigne : dire en BREF ce qu'elle a compris — jamais reproduire le fichier.
      await envoyer(
        `[Document importé : ${fichier.name}]\n\n${texte}\n\n— Consigne de réponse : en 6 lignes maximum, dis-moi en BREF et clairement ce que tu as compris de ce document : sa nature, son sujet et 3 à 4 points clés en puces. Ne reproduis surtout pas son contenu.`,
        `📄 ${fichier.name}`,
      );
    } catch (e) {
      setErreur(
        e instanceof Error
          ? `Lecture de « ${fichier.name} » impossible : ${e.message}`
          : 'Lecture du document impossible. Réessaie.',
      );
    } finally {
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
    if (occupe) return;
    setErreur('');

    // Le micro navigateur n'existe qu'en contexte sécurisé (HTTPS ou localhost).
    // En HTTP simple (adresse IP, preview distante) : on l'explique au lieu d'un échec opaque.
    if (!window.isSecureContext || typeof navigator.mediaDevices?.getUserMedia !== 'function') {
      setErreur(
        window.isSecureContext
          ? 'Ce navigateur ne permet pas le micro. Ouvre Six en HTTPS (six-by-sevenai.onrender.com) ou sur localhost.'
          : 'Le micro demande une connexion sécurisée : ouvre Six en HTTPS (six-by-sevenai.onrender.com), pas en HTTP.',
      );
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setErreur(
        'Ce navigateur ne sait pas enregistrer de vocal. Mets-le à jour ou écris ton message.',
      );
      return;
    }

    try {
      const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksAudio.current = [];
      const mr = new MediaRecorder(flux);
      mediaRecorder.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksAudio.current.push(e.data);
      };
      mr.onerror = () => {
        setEnregistre(false);
        flux.getTracks().forEach((t) => t.stop());
        setErreur('Enregistrement interrompu. Réessaie.');
      };
      mr.onstop = () => {
        flux.getTracks().forEach((t) => t.stop());
        setEnregistre(false);
        const blob = new Blob(chunksAudio.current, { type: mr.mimeType || 'audio/webm' });
        if (blob.size === 0) return;
        void envoyerVocal(blob);
      };
      mr.start();
      setEnregistre(true);
    } catch (e) {
      const nom = e instanceof DOMException ? e.name : '';
      if (nom === 'NotAllowedError' || nom === 'SecurityError')
        setErreur(
          'Accès au micro refusé. Autorise le micro pour ce site : clique sur l’icône 🔒 (ou ℹ️) à gauche de l’adresse, puis autorise le microphone.',
        );
      else if (nom === 'NotFoundError' || nom === 'OverconstrainedError')
        setErreur('Aucun micro détecté sur cet appareil. Branche un micro ou écris ton message.');
      else setErreur('Le micro n’a pas répondu. Réessaie, ou écris ton message en attendant.');
    }
  }

  async function envoyerVocal(blob: Blob) {
    setOccupe(true);
    setErreur('');
    try {
      const form = new FormData();
      form.append('audio', blob, 'message.webm');
      const res = await fetch('/api/chat/transcription', { method: 'POST', body: form });
      const data = (await res.json().catch(() => ({}))) as { texte?: string; error?: string };
      if (!res.ok || !data.texte) throw new Error(data.error ?? 'Transcription impossible.');
      await envoyer(data.texte);
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
          const texte = await dicterTexte();
          if (texte.trim()) await envoyer(texte.trim());
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
      await telechargerPdfSeven([m], 'Réponse de Seven AI');
    } catch {
      setErreur('Export PDF impossible sur cet appareil. Réessaie.');
    }
  }

  const propositions = ['Qui es-tu ?', "C'est quoi Six ?", 'Aide-moi à répondre à un message'];

  return (
    <main className="screen seven-screen">
      <AppBar page="seven-ai" titre="Seven AI" />
      {demande}
      <div className="seven-fil" aria-live="polite">
        {messages.length === 0 && !occupe && (
          <div className="seven-vide">
            <span className="seven-vide-icone" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element -- logo SVG du site vitrine, next/image n'apporte rien */}
              <img src="/seven-ai.svg" alt="" className="seven-logo-img" />
            </span>
            <h1>
              Seven <em>AI</em>
            </h1>
            <p>
              Salut ! Je suis <b>Seven AI</b>, l&apos;assistant intégré de Six. Pose-moi une
              question, importe un document, envoie un vocal — ou donne-moi un ordre comme « ouvre
              les réglages » et Six obéit.
            </p>
            <div className="seven-suggestions">
              {propositions.map((p) => (
                <button key={p} type="button" onClick={() => void envoyer(p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`seven-msg ${m.role}`}>
            {m.role === 'assistant' && (
              <span className="seven-msg-logo" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element -- marque SVG en 14px, next/image n'apporte rien */}
                <img src="/seven-ai-mark.svg" alt="" className="seven-logo-img sm" />
              </span>
            )}
            <div className="seven-bulle">{m.content}</div>
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
        {occupe && (
          <div className="seven-msg assistant">
            <span className="seven-msg-logo" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element -- marque SVG en 14px, next/image n'apporte rien */}
              <img src="/seven-ai-mark.svg" alt="" className="seven-logo-img sm" />
            </span>
            <div className="seven-bulle seven-reflexion">Seven AI réfléchit…</div>
          </div>
        )}
        {erreur && <p className="seven-erreur">{erreur}</p>}
        {demo && messages.length > 0 && !occupe && (
          <p className="seven-note-demo">Mode démonstration : aucune IA connectée.</p>
        )}
        {!memOn && (
          <p className="seven-note-demo">
            Mémoire désactivée : Seven AI oublie tout à chaque visite. Active-la dans Réglages →
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
        {messages.length > 0 && !occupe && (
          <button
            type="button"
            className="seven-effacer"
            aria-label="Effacer la conversation avec Seven AI"
            title="Effacer la conversation"
            onClick={() =>
              demander({
                titre: 'Effacer la conversation ?',
                texte: 'Tous les messages échangés avec Seven AI seront effacés de ce téléphone.',
                action: 'Effacer',
                danger: true,
                onConfirmer: () => {
                  try {
                    localStorage.removeItem(CLE_SEVEN);
                  } catch {
                    /* stockage bloqué : rien à effacer */
                  }
                  setMessages([]);
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
          disabled={occupe}
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
          placeholder="Écris à Seven AI…"
          aria-label="Écrire à Seven AI"
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
        <button type="submit" disabled={occupe || !saisie.trim()} aria-label="Envoyer">
          <Icon name="up" size={18} />
        </button>
      </form>
    </main>
  );
}
