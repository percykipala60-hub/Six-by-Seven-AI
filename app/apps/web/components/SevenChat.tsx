'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppBar } from './AppBar';
import { Icon } from './Icon';
import { BoutonPartager } from './BoutonPartager';
import { estBureau } from '@/lib/plateforme';
import { CarteLieux } from './CarteLieux';
import { Logo } from './Logo';
import { PiecesJointes } from './PiecesJointes';
import { ArtefactPanneau, Artefacts, type ArtefactOuvert } from './Artefacts';
import { extraireArtefacts, versionsDe } from '@/lib/artefacts';
import { extrairePdf } from '@/lib/lire-document';
import { SKILLS, choisirSkill, type ChoixSkill } from '@/lib/skills-cosinus';
import {
  BoutonsVolet,
  GRAND_VOLET,
  Volet,
  garderOngletVolet,
  lireReglagesVolet,
  type OngletVolet,
} from './Volet';
import { memoireActive } from '@/lib/memoire';
import { entetesCompte } from '@/lib/premium-client';
import { CHAT_MAX_BYTES, CHAT_MAX_CONTENT, CHAT_MAX_MESSAGES } from '@/lib/api-schemas';
import { detecterOrdre } from '@/lib/seven-ordres';
import type { ChatMessage, ChatResult, PieceAffichee } from '@/lib/types';
import {
  ICONE_PIECE,
  IMAGES_MAX,
  lireImage,
  lireVideo,
  pieceCapture,
  versAffichage,
  type Piece,
} from '@/lib/pieces-jointes';
import {
  titreDe,
  MAX_MSG,
  ecouterChats,
  garderChat,
  lireChat,
  nouvelId,
  type ModeChat,
} from '@/lib/seven-chats';

// Les discussions sont gardées sur l'appareil (lib/seven-chats), tant que la mémoire de Six est active.
// Un document importé (texte ou PDF) est envoyé dans le message : on le borne pour
// rester dans la limite du serveur (20 000 caractères) et raisonnable côté coûts.
const TAILLE_DOC_MAX = 12_000;
const MAX_FICHIER = 20 * 1024 * 1024;
const MAX_VIDEO = 500 * 1024 * 1024; // lue sur l'appareil, seules quelques images partent
// Document joint sans question : Six dit en bref ce qu'il a compris, sans reproduire le fichier.
const CONSIGNE_DOCUMENT =
  '— Consigne de réponse : en 6 lignes maximum, dis-moi en BREF et clairement ce que tu as compris de ce document : sa nature, son sujet et 3 à 4 points clés en puces. Ne reproduis surtout pas son contenu.';
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
  if (n >= morceaux.length) return <>{texte}</>;
  // Pendant l'écriture : la partie visible est cachée aux lecteurs d'écran, qui lisent la réponse
  // entière une seule fois (sinon le fil, annoncé à voix haute, répéterait chaque étape).
  return (
    <>
      <span aria-hidden="true">{morceaux.slice(0, n).join('')}</span>
      <span className="sr">{texte}</span>
    </>
  );
}

function preparerRequete(historique: ChatMessage[], content: string): string {
  const dernier: ChatMessage = { role: 'user', content };
  // Les aperçus des pièces jointes restent sur l'appareil : seuls le rôle et le texte partent au serveur.
  const serialiser = (messages: ChatMessage[]) =>
    JSON.stringify({ messages: messages.map(({ role, content }) => ({ role, content })) });
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

// Web Speech API : la dictée se fait dans le navigateur, aucune clé serveur n'est requise.
// Pris en charge par Chrome, Edge et Safari ; pas par Firefox (on le détecte honnêtement).
interface ReconnaissanceVocale {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
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

/** Erreur de micro dont le message s'affiche tel quel. */
class ErreurMicro extends Error {}

const MESSAGE_PAS_DE_MICRO =
  'Aucun micro détecté sur cet appareil. Branche un micro ou écris ton message.';

async function plateforme(): Promise<'ios' | 'android' | 'web'> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    const p = Capacitor.getPlatform();
    return p === 'ios' || p === 'android' ? p : 'web';
  } catch {
    return 'web';
  }
}

/** Où réactiver le micro après un refus, selon l'appareil. */
async function messageMicroRefuse(): Promise<string> {
  const p = await plateforme();
  if (p === 'ios')
    return 'Accès au micro refusé. Ouvre Réglages > Six, active Micro et Reconnaissance vocale, puis réessaie.';
  if (p === 'android')
    return 'Accès au micro refusé. Ouvre Paramètres > Applications > Six > Autorisations, active Micro, puis réessaie.';
  return 'Accès au micro refusé. Autorise le micro pour ce site : clique sur l’icône 🔒 (ou ℹ️) à gauche de l’adresse, puis autorise le microphone.';
}

/** Message à afficher quand la dictée échoue ('' : arrêtée par la personne, rien à dire). */
async function messageErreurDictee(e: unknown): Promise<string> {
  if (e instanceof ErreurMicro) return e.message;
  const m = e instanceof Error ? e.message : '';
  if (m === 'Dictée arrêtée.') return '';
  if (m === 'refus') return messageMicroRefuse();
  if (m === 'dictée vide') return 'Je n’ai rien entendu. Réessaie en parlant juste après le clic.';
  return 'La dictée a échoué. Réessaie, ou écris ton message.';
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
    rec.onerror = (e) => {
      signal.removeEventListener('abort', arreter);
      const code = e?.error ?? '';
      if (code === 'not-allowed') reject(new Error('refus'));
      else if (code === 'service-not-allowed')
        reject(
          new ErreurMicro(
            'Le service de dictée est indisponible dans cette application. La transcription audio doit être configurée sur le serveur.',
          ),
        );
      else if (code === 'no-speech') reject(new Error('dictée vide'));
      else if (code === 'audio-capture') reject(new ErreurMicro(MESSAGE_PAS_DE_MICRO));
      else if (code === 'network')
        reject(new ErreurMicro('La dictée a besoin d’Internet. Vérifie ta connexion et réessaie.'));
      else reject(new Error('erreur dictée'));
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
 * L'espace « Chat » : la conversation libre avec Six, comme une page dédiée
 * de l'app (même modèle que « Quoi dire ? » ou « Espace jeu »). On discute avec Six
 * comme avec un assistant généraliste ; elle connaît parfaitement son identité et celle de Six.
 * L'historique reste sur l'appareil (localStorage). Trois entrées en plus du texte :
 * import de documents (texte/PDF), messages vocaux (transcription), et ordres de pilotage
 * (« ouvre les réglages ») que Six exécute directement.
 */
/**
 * Écran de discussion, en deux espaces :
 * - « chat » (/chat) : discussion libre avec Six, sans navigateur ni fichiers ;
 * - « sixtouch » (/cosinus) : Six travaille pour toi (agent) ; seul espace avec le volet navigateur et fichiers.
 */
export function SevenChatPage({ mode = 'chat' }: { mode?: ModeChat } = {}) {
  const router = useRouter();
  const sixtouch = mode === 'sixtouch';
  const [skill, setSkill] = useState<ChoixSkill>('auto');
  const base = sixtouch ? '/cosinus' : '/chat';
  // Volet d'outils à droite (navigateur, fichiers). Son onglet ouvert est gardé sur l'appareil : sur grand écran,
  // on le retrouve en revenant dans le Chat (sur téléphone il s'ouvrirait en plein écran, donc on ne le rouvre pas).
  const [volet, setVoletBrut] = useState<OngletVolet | null>(null);
  const setVolet = useCallback((onglet: OngletVolet | null) => {
    setVoletBrut(onglet);
    garderOngletVolet(onglet);
  }, []);
  const basculerVolet = useCallback(
    (onglet: OngletVolet) => setVolet(volet === onglet ? null : onglet),
    [volet, setVolet],
  );
  const fermerVolet = useCallback(() => setVolet(null), [setVolet]);
  // App de bureau : les boutons Navigateur et Fichiers de la barre du haut ouvrent ou ferment le volet de Cosinus,
  // et la barre montre lequel est ouvert.
  useEffect(() => {
    if (!sixtouch) return;
    const commande = (e: Event) => {
      const d = (e as CustomEvent<{ type?: string; onglet?: string }>).detail;
      if (d?.type === 'volet' && (d.onglet === 'navigateur' || d.onglet === 'fichiers'))
        basculerVolet(d.onglet);
    };
    window.addEventListener('six-bureau', commande);
    return () => window.removeEventListener('six-bureau', commande);
  }, [sixtouch, basculerVolet]);
  useEffect(() => {
    const pont = (window as unknown as { sixBureau?: { signaler?: (e: object) => void } })
      .sixBureau;
    pont?.signaler?.({ volet: sixtouch ? volet : null, cosinus: sixtouch });
    return () => pont?.signaler?.({ volet: null, cosinus: false });
  }, [volet, sixtouch]);
  // Cosinus : étapes de l'agent reçues pendant la tâche en cours.
  const [etapesEnCours, setEtapesEnCours] = useState<string[]>([]);
  // Pièces jointes en attente dans la barre (carrés) : images, vidéos, documents, capture du navigateur.
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [attentePieces, setAttentePieces] = useState<PieceAffichee[]>([]);
  // Téléphone : pas de navigateur (trop encombrant), seulement les fichiers.
  const [telephone, setTelephone] = useState(false);
  // Le navigateur n'existe que dans l'app de bureau (comme Cowork : le web et le téléphone n'ont pas de
  // navigateur intégré) ; ailleurs, le volet de Cosinus n'a que les fichiers.
  const [bureau, setBureau] = useState(false);
  const sansNavigateur = telephone || !bureau;
  useEffect(() => {
    const surBureau = estBureau();
    setBureau(surBureau);
    const mq = window.matchMedia(GRAND_VOLET);
    const lireTaille = () => {
      setTelephone(!mq.matches);
      if (!mq.matches || !surBureau) setVoletBrut((v) => (v === 'navigateur' ? null : v));
    };
    lireTaille();
    if (mq.matches && sixtouch) {
      const onglet = lireReglagesVolet().onglet;
      setVoletBrut(onglet === 'navigateur' && !surBureau ? 'fichiers' : onglet);
    }
    mq.addEventListener('change', lireTaille);
    return () => mq.removeEventListener('change', lireTaille);
  }, [sixtouch]);
  useEffect(() => {
    const html = document.documentElement;
    if (volet) html.dataset.volet = 'ouvert';
    else delete html.dataset.volet;
    return () => {
      delete html.dataset.volet;
    };
  }, [volet]);
  const params = useSearchParams();
  const demandee = params.get('c') ?? ''; // discussion ouverte depuis le menu ; vide : nouvelle discussion
  // Projet de la discussion : celui où elle est rangée, sinon celui de l'adresse (/chat?projet=…, /cosinus?projet=…).
  const projetDemande = params.get('projet') ?? '';
  const [projetId, setProjetId] = useState('');
  // Artefact ouvert dans le panneau, à côté de la discussion (un seul panneau à droite : il ferme le volet).
  const [artefactOuvert, setArtefactOuvert] = useState<ArtefactOuvert | null>(null);
  const fermerArtefact = useCallback(() => setArtefactOuvert(null), []);
  const ouvrirArtefact = useCallback(
    (a: ArtefactOuvert) => {
      setVolet(null);
      setArtefactOuvert(a);
    },
    [setVolet],
  );
  useEffect(() => {
    if (volet) setArtefactOuvert(null);
  }, [volet]);
  const chatId = useRef('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [saisie, setSaisie] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const [transcription, setTranscription] = useState<boolean | null>(null);
  const [dernierEchec, setDernierEchec] = useState<{
    texte: string;
    affichage?: string;
    document?: string;
    jointes?: Piece[];
  }>();
  const documentActif = useRef('');
  const [documentAReimporter, setDocumentAReimporter] = useState(false);
  const [enAttente, setEnAttente] = useState(''); // question envoyée, réponse pas encore arrivée
  const [lectureDoc, setLectureDoc] = useState(false); // lecture locale d'un fichier (non annulable)
  const operation = useRef<AbortController | null>(null);
  const arretVolontaire = useRef(false); // la personne a touché « Arrêter »

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

  /**
   * Cosinus : la réponse de l'agent arrive en flux (une ligne JSON par étape, puis la fin). Chaque étape s'affiche
   * dès qu'elle arrive. Une tâche d'agent peut durer plusieurs minutes : délai de 5 minutes.
   */
  async function requeteAgent(
    url: string,
    init: RequestInit,
  ): Promise<ChatResult & { etapes?: string[]; fichiers?: string[] }> {
    const controleur = new AbortController();
    operation.current = controleur;
    const delai = setTimeout(() => controleur.abort(new Error('Délai dépassé. Réessaie.')), 300000);
    try {
      const res = await fetch(url, { ...init, signal: controleur.signal });
      if (!(res.headers.get('content-type') ?? '').includes('ndjson')) {
        const data = (await res.json().catch(() => ({}))) as ChatResult & { error?: string };
        if (!res.ok) throw new Error(data.error ?? 'Erreur inattendue. Réessaie.');
        return data;
      }
      const lecteur = res.body?.getReader();
      if (!lecteur) throw new Error('Réponse vide. Réessaie.');
      const decodeur = new TextDecoder();
      let reste = '';
      for (;;) {
        const { done, value } = await lecteur.read();
        if (done) break;
        reste += decodeur.decode(value, { stream: true });
        const lignes = reste.split('\n');
        reste = lignes.pop() ?? '';
        for (const ligne of lignes) {
          if (!ligne.trim()) continue;
          const o = JSON.parse(ligne) as {
            type: string;
            texte?: string;
            reponse?: string;
            etapes?: string[];
            fichiers?: string[];
            error?: string;
            session?: string;
            url?: string;
          };
          if (o.type === 'navigateur' && o.session && o.url) {
            sessionStorage.setItem(
              'six-navigateur-agent',
              JSON.stringify({ session: o.session, url: o.url }),
            );
            // Seule l'app de bureau montre ce que Six fait dans le navigateur.
            if (estBureau()) setVoletBrut('navigateur');
            window.dispatchEvent(new Event('six-navigateur-agent'));
          }
          if (o.type === 'etape' && o.texte) {
            const t = o.texte;
            setEtapesEnCours((e) => [...e, t]);
          } else if (o.type === 'erreur')
            throw new Error(o.error ?? 'Erreur inattendue. Réessaie.');
          else if (o.type === 'fin')
            return {
              reponse: o.reponse ?? '',
              demo: false,
              etapes: o.etapes,
              fichiers: o.fichiers,
            };
        }
      }
      throw new Error('La tâche s’est interrompue avant la fin. Réessaie.');
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
      if ((await plateforme()) !== 'web') {
        const { dicterSurTelephone } = await import('@/lib/dictee-native');
        try {
          return await dicterSurTelephone(controleur.signal);
        } catch (e) {
          if (
            e instanceof Error &&
            !['refus', 'Dictée arrêtée.', 'dictée vide'].includes(e.message)
          )
            throw new ErreurMicro(e.message);
          throw e;
        }
      }
      return await dicterTexte(controleur.signal);
    } finally {
      clearTimeout(delai);
      if (operation.current === controleur) operation.current = null;
    }
  }
  const verrouMicro = useRef(false);
  const [memOn, setMemOn] = useState(false); // mémoire de Six active (gate de conservation de l'historique)
  const [enregistre, setEnregistre] = useState(false); // micro en cours d'enregistrement
  const filRef = useRef<HTMLDivElement>(null);
  const [animee, setAnimee] = useState(-1); // index de la réponse en train de s'écrire
  // Le fil suit l'écriture seulement si la personne est déjà en bas : si elle remonte lire, on la
  // laisse tranquille. On fait défiler le fil lui-même, jamais la page (sur iPhone, faire défiler la
  // page déplace tout l'écran, clavier ouvert).
  const suivreFin = useCallback((force = false, doux = false) => {
    const fil = filRef.current;
    if (!fil) return;
    const reste = fil.scrollHeight - fil.scrollTop - fil.clientHeight;
    if (!force && reste >= 120) return;
    // Glissement doux pour une nouvelle bulle ; saut direct pour une longue distance (discussion
    // qu'on ouvre), sinon le glissement est lent ou interrompu et le fil reste en haut.
    const glisser = doux && reste < fil.clientHeight;
    fil.scrollTo({ top: fil.scrollHeight, behavior: glisser ? 'smooth' : 'auto' });
  }, []);
  const champ = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);
  const dossierInput = useRef<HTMLInputElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunksAudio = useRef<Blob[]>([]);

  // Ouvre la discussion demandée par l'adresse (menu latéral), ou une nouvelle discussion vide.
  useEffect(() => {
    operation.current?.abort();
    const chat = demandee ? lireChat(demandee) : undefined;
    chatId.current = chat?.id ?? nouvelId();
    setProjetId(chat ? (chat.projetId ?? projetDemande) : projetDemande);
    setArtefactOuvert(null);
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
    if (window.matchMedia('(pointer: fine)').matches) champ.current?.focus();
  }, [demandee, projetDemande]);

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

  // Discussion ouverte effacée depuis le menu : l'écran repart sur une discussion vide.
  // (Le nombre de messages est lu dans une référence : aucun effet de bord pendant le rendu.)
  const nbMessages = useRef(0);
  useEffect(() => {
    nbMessages.current = messages.length;
  }, [messages]);
  useEffect(
    () =>
      ecouterChats(() => {
        const id = chatId.current;
        // Mémoire coupée : rien n'est gardé, donc une discussion absente de la liste n'a pas été effacée.
        if (!id || nbMessages.current === 0 || !memoireActive() || lireChat(id)) return;
        operation.current?.abort();
        chatId.current = nouvelId();
        documentActif.current = '';
        setMessages([]);
        setDocumentAReimporter(false);
        setDernierEchec(undefined);
        setErreur('');
        if (window.location.search.includes('c=')) router.replace(base);
      }),
    [router, base],
  );

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

  // Le fil descend vers la réponse quand elle arrive (et vers la question qu'on vient d'envoyer).
  useEffect(() => {
    suivreFin(true, true);
  }, [messages, occupe, suivreFin]);

  function pousser(fil: ChatMessage[]) {
    setMessages(fil);
    garderChat(chatId.current, fil, mode, projetId || undefined);
  }

  /**
   * Envoie un message. « jointes » : les pièces de la barre (par défaut celles en attente). Les documents partent
   * avec la question (ou, sans question, avec une consigne de résumé bref) ; les images (photos, images d'une vidéo,
   * capture du navigateur) partent à côté du texte, avec leur description (repères, instants de la vidéo).
   */
  async function envoyer(
    texte: string,
    affichage?: string,
    document?: string,
    jointes: Piece[] = affichage ? [] : pieces,
    depuisVocal = false,
  ) {
    if (!depuisVocal && (occupe || enregistre)) return;
    const docs = jointes.filter((p) => p.genre === 'document');
    const visuels = jointes.filter((p) => p.genre !== 'document');
    const images = visuels.flatMap((p) => p.images);
    const question = texte.trim();
    if (!question && !jointes.length) return;
    if (images.length > IMAGES_MAX) {
      setErreur(
        `Six lit ${IMAGES_MAX} images au plus par message (ici ${images.length}). Retire une pièce jointe.`,
      );
      return;
    }
    // Les ordres de navigation (« ouvre les réglages ») restent permis même sans le document.
    if (documentAReimporter && !affichage && !docs.length && !detecterOrdre(texte)) {
      setErreur(
        'Réimporte le document pour continuer cette conversation, ou efface le fil pour commencer une nouvelle discussion.',
      );
      return;
    }
    // Ce qui part vers l'IA : la question, les documents complets, la description des images.
    let pourIA = question;
    let docEnvoye = document;
    if (docs.length) {
      docEnvoye = docs.map((d) => `[Document importé : ${d.nom}]\n\n${d.texte ?? ''}`).join('\n\n');
      pourIA = `${docEnvoye}\n\n${question ? `Ma demande : ${question}` : CONSIGNE_DOCUMENT}`;
    }
    if (visuels.length) {
      const contextes = visuels.map((p) => p.contexte).filter(Boolean);
      pourIA = [
        pourIA || "Regarde ce que je t'envoie et dis-moi ce que tu en comprends.",
        ...contextes,
      ]
        .join('\n\n')
        .trim();
    }
    // Ce qu'on montre dans la bulle (et garde dans l'historique) : la question, sinon le nom des pièces.
    const etiquettes = jointes.map((p) => `${ICONE_PIECE[p.genre]} ${p.nom}`).join(', ');
    const visible = (affichage ?? (question || etiquettes)).trim();
    const affichees = jointes.map(versAffichage);
    const fil = [
      ...messages,
      {
        role: 'user' as const,
        content: visible,
        ...(affichees.length ? { pieces: affichees } : {}),
      },
    ].slice(-MAX_MSG);
    setDernierEchec(undefined);
    setOccupe(true);
    setErreur('');
    setEnAttente(visible); // la question s'affiche tout de suite, en attendant la réponse
    setAttentePieces(affichees);
    setSaisie(''); // et quitte la barre, comme dans les autres assistants (« Réessayer » la garde en cas d'échec)
    if (!affichage) setPieces([]);
    arretVolontaire.current = false;

    // Pilotage : un ordre (« ouvre les réglages ») navigue directement, sans appel à l'IA.
    // Un message avec document ou pièce jointe ne doit jamais déclencher un ordre.
    const ordre = affichage || jointes.length ? null : detecterOrdre(texte);
    if (ordre) {
      pousser([...fil, { role: 'assistant' as const, content: ordre.reponse }].slice(-MAX_MSG));
      setSaisie('');
      setEnAttente('');
      setAttentePieces([]);
      setOccupe(false);
      router.push(ordre.cible);
      return;
    }

    try {
      // Un document déjà importé plus tôt dans la discussion sert de référence aux questions suivantes.
      const contexteDoc = affichage || docs.length ? '' : documentActif.current;
      const texteSeul = preparerRequete(
        messages,
        contexteDoc ? pourIA + '\n\nDocument de référence :\n' + contexteDoc : pourIA,
      );
      // Cosinus : le serveur donne à Six ses consignes d'agent de travail.
      const corps =
        images.length || sixtouch || projetId
          ? JSON.stringify({
              ...(JSON.parse(texteSeul) as object),
              ...(!sixtouch && projetId ? { projetId } : {}),
              ...(sixtouch
                ? {
                    mode: 'sixtouch',
                    skill,
                    ...(projetId ? { projetId } : {}),
                    navigateurSession: JSON.parse(
                      sessionStorage.getItem('six-navigateur-agent') || '{}',
                    ).session,
                  }
                : {}),
              ...(images.length
                ? {
                    images: images.map((d) => ({
                      type: 'image/jpeg',
                      data: d.slice(d.indexOf(',') + 1),
                    })),
                  }
                : {}),
            })
          : texteSeul;
      const initEnvoi: RequestInit = {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(await entetesCompte()) },
        body: corps,
      };
      setEtapesEnCours([]);
      let data: ChatResult & { error?: string; etapes?: string[]; fichiers?: string[] };
      if (sixtouch) data = await requeteAgent('/api/chat', initEnvoi);
      else {
        const res = await requete('/api/chat', initEnvoi);
        data = (await res.json().catch(() => ({}))) as ChatResult & { error?: string };
        if (!res.ok) throw new Error(data.error ?? 'Erreur inattendue. Réessaie.');
      }
      if (typeof data.reponse !== 'string' || !data.reponse.trim()) {
        throw new Error('Six a renvoyé une réponse vide. Réessaie.');
      }
      const reponseSix: ChatMessage = {
        role: 'assistant',
        content: data.reponse,
        ...(data.etapes?.length ? { etapes: data.etapes } : {}),
        ...(data.fichiers?.length ? { fichiers: data.fichiers } : {}),
        ...(data.lieux?.length ? { lieux: data.lieux } : {}),
      };
      // Un fichier vient d'être enregistré par l'agent : l'onglet Fichiers se met à jour.
      if (data.fichiers?.length) window.dispatchEvent(new Event('six-espace-maj'));
      const suite = [...fil, reponseSix].slice(-MAX_MSG);
      setAnimee(suite.length - 1); // seule la réponse qui arrive s'écrit progressivement
      pousser(suite);
      // Un fichier livré (artefact) s'ouvre aussitôt dans le panneau, avec ses versions précédentes.
      const nouveau = extraireArtefacts(data.reponse).artefacts.at(-1);
      if (nouveau) {
        const toutes = versionsDe(
          suite.filter((x) => x.role === 'assistant').map((x) => x.content),
        ).get(nouveau.nom) ?? [nouveau];
        ouvrirArtefact({ versions: toutes, version: toutes.length - 1 });
      }
      if (docEnvoye) {
        documentActif.current = docEnvoye;
        setDocumentAReimporter(false);
      }
      setSaisie('');
    } catch (e) {
      setDernierEchec({ texte, affichage, document, jointes });
      // Arrêt demandé par la personne : pas de message d'erreur, juste « Réessayer ».
      setErreur(
        arretVolontaire.current
          ? ''
          : e instanceof Error
            ? e.message
            : 'Six ne répond pas pour le moment. Réessaie.',
      );
    } finally {
      setEnAttente('');
      setAttentePieces([]);
      setOccupe(false);
    }
  }

  // — Pièces jointes (bouton +) : préparées sur l'appareil, puis montrées en carrés dans la barre. Elles partent avec
  // le prochain message. Images réduites, vidéos découpées en images, documents lus (texte ou PDF). —
  async function importerFichiers(liste: FileList | File[] | null) {
    const fichiers = Array.from(liste ?? []).filter(
      (f) =>
        !f.webkitRelativePath
          .split('/')
          .some(
            (partie) =>
              partie.startsWith('.') || ['node_modules', 'dist', 'build'].includes(partie),
          ),
    );
    if (!fichiers.length || occupe) return;
    if (fichiers.length + pieces.length > 100) {
      setErreur('Ajoute au plus 100 fichiers à la fois. Choisis un sous-dossier plus petit.');
      return;
    }
    setOccupe(true);
    setLectureDoc(true);
    setErreur('');
    const nouvelles: Piece[] = [];
    for (const fichier of fichiers) {
      try {
        const estVideo =
          fichier.type.startsWith('video/') ||
          /\.(mp4|mov|m4v|webm|mkv|avi|3gp)$/i.test(fichier.name);
        const estImage =
          fichier.type.startsWith('image/') ||
          /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif|svg)$/i.test(fichier.name);
        if (fichier.size > (estVideo ? MAX_VIDEO : MAX_FICHIER))
          throw new Error(`le fichier dépasse ${estVideo ? '500' : '20'} Mo.`);
        if (estImage)
          nouvelles.push({
            ...(await lireImage(fichier)),
            nom: fichier.webkitRelativePath || fichier.name,
          });
        else if (estVideo)
          nouvelles.push({
            ...(await lireVideo(fichier)),
            nom: fichier.webkitRelativePath || fichier.name,
          });
        else {
          const estPdf = fichier.type === 'application/pdf' || /\.pdf$/i.test(fichier.name);
          let texte = estPdf ? await extrairePdf(fichier) : await fichier.text();
          if (!estPdf && (texte.includes('\0') || texte.includes('\uFFFD')))
            throw new Error(
              'format binaire non pris en charge. Utilise un PDF ou un fichier texte UTF-8.',
            );
          if (!texte.trim()) throw new Error('ce fichier ne contient pas de texte lisible.');
          while (encoder.encode(JSON.stringify(texte)).length > TAILLE_DOC_MAX)
            texte = `${texte.slice(0, Math.floor(texte.length * 0.8))}\n\n[… document tronqué]`;
          nouvelles.push({
            id: nouvelId(),
            genre: 'document',
            nom: fichier.webkitRelativePath || fichier.name,
            texte,
            images: [],
          });
        }
      } catch (e) {
        setErreur(
          `Lecture de « ${fichier.name} » impossible : ${e instanceof Error ? e.message : 'réessaie.'}`,
        );
      }
    }
    setPieces((p) => [...p, ...nouvelles]);
    setLectureDoc(false);
    setOccupe(false);
    if (docInput.current) docInput.current.value = '';
    if (dossierInput.current) dossierInput.current.value = '';
    champ.current?.focus();
  }

  // — Message vocal : enregistrement navigateur, transcription serveur, envoi auto. —
  async function basculerMicro() {
    if (enregistre) {
      mediaRecorder.current?.stop(); // la fin déclenche l'envoi dans onstop
      return;
    }
    if (occupe || verrouMicro.current) return;
    setErreur('');
    verrouMicro.current = true;
    if ((await plateforme()) !== 'web') {
      setOccupe(true);
      let texte = '';
      try {
        texte = await dictee();
      } catch (e) {
        setErreur(await messageErreurDictee(e));
      } finally {
        verrouMicro.current = false;
        setOccupe(false);
      }
      if (texte.trim()) {
        setSaisie(texte.trim());
        void envoyer(texte.trim(), undefined, undefined, pieces, true);
      }
      return;
    }
    verrouMicro.current = false;
    let serviceVocal = transcription;
    if (estBureau() && serviceVocal !== true) {
      verrouMicro.current = true;
      try {
        const res = await fetch('/api/chat', { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          serviceVocal = (await res.json()).transcription === true;
          setTranscription(serviceVocal);
        }
      } catch {
        /* Le message de disponibilité ci-dessous permet de réessayer. */
      } finally {
        verrouMicro.current = false;
      }
    }
    if (serviceVocal !== true) {
      if (serviceVocal === null) {
        setErreur('Vérification du service vocal en cours. Réessaie dans quelques secondes.');
        return;
      }
      if (estBureau()) {
        setErreur(
          'La dictée de l’application de bureau demande une transcription audio configurée sur le serveur.',
        );
        return;
      }
      if (!dicteeDisponible()) {
        setErreur(
          'La dictée vocale n’est pas encore disponible sur cet appareil. Écris ton message en attendant.',
        );
        return;
      }
      verrouMicro.current = true;
      setOccupe(true);
      let texte = '';
      try {
        texte = await dictee();
      } catch (e) {
        setErreur(await messageErreurDictee(e));
      } finally {
        verrouMicro.current = false;
        setOccupe(false);
      }
      if (texte.trim()) {
        setSaisie(texte.trim());
        void envoyer(texte.trim(), undefined, undefined, pieces, true);
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
        if (blob.size === 0) {
          setErreur('Je n’ai reçu aucun son. Réessaie en parlant après le clic.');
          return;
        }
        void envoyerVocal(blob);
      };
      mr.start();
      setEnregistre(true);
    } catch (e) {
      flux?.getTracks().forEach((piste) => piste.stop());
      const nom = e instanceof DOMException ? e.name : '';
      if (nom === 'NotAllowedError' || nom === 'SecurityError')
        setErreur(await messageMicroRefuse());
      else if (nom === 'NotFoundError' || nom === 'OverconstrainedError')
        setErreur(MESSAGE_PAS_DE_MICRO);
      else setErreur('Le micro n’a pas répondu. Réessaie, ou écris ton message en attendant.');
    } finally {
      verrouMicro.current = false;
    }
  }

  async function envoyerVocal(blob: Blob) {
    setOccupe(true);
    setErreur('');
    let texte = '';
    try {
      const form = new FormData();
      form.append('audio', blob);
      const res = await requete('/api/chat/transcription', { method: 'POST', body: form });
      const data = (await res.json().catch(() => ({}))) as { texte?: string; error?: string };
      if (!res.ok || !data.texte) throw new Error(data.error ?? 'Transcription impossible.');
      texte = data.texte.trim();
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
          texte = (await dictee()).trim();
        } catch (err) {
          setErreur(await messageErreurDictee(err));
          return;
        }
      } else
        setErreur(e instanceof Error ? e.message : 'Transcription impossible. Réessaie ou écris.');
    } finally {
      setOccupe(false);
    }
    if (texte) {
      setSaisie(texte);
      void envoyer(texte, undefined, undefined, pieces, true);
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

  // Versions de chaque fichier livré dans la discussion (même nom = nouvelle version).
  const versions = useMemo(
    () => versionsDe(messages.filter((m) => m.role === 'assistant').map((m) => m.content)),
    [messages],
  );

  // Partager la discussion par le Cloud (Six Premium).
  const partage = (
    <BoutonPartager titre={titreDe(messages)} messages={messages} onErreur={setErreur} />
  );

  return (
    <main className="screen seven-screen">
      <AppBar
        page={sixtouch ? 'sixtouch' : 'seven-ai'}
        titre={sixtouch ? 'Cosinus' : 'Chat'}
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
          setArtefactOuvert(null);
          setProjetId('');
          if (demandee || projetDemande) router.replace(base);
          champ.current?.focus();
        }}
        outils={
          sixtouch || messages.length ? (
            <div className="seven-outils-ligne">
              {messages.length > 0 && partage}
              {sixtouch && <BoutonsVolet ouvert={volet} onBasculer={basculerVolet} telephone />}
            </div>
          ) : undefined
        }
      />
      {(sixtouch || messages.length > 0) && (
        <div className="seven-outils-flottants seven-outils-ligne">
          {messages.length > 0 && <div className="volet-boutons">{partage}</div>}
          {sixtouch && (
            <BoutonsVolet ouvert={volet} onBasculer={basculerVolet} telephone={sansNavigateur} />
          )}
        </div>
      )}
      {sixtouch && volet && (
        <Volet
          onglet={volet}
          onOnglet={setVolet}
          onFermer={fermerVolet}
          messages={messages}
          onExporter={(m) => void exporterMessage(m)}
          onJoindre={(fichiers) => void importerFichiers(fichiers)}
          telephone={sansNavigateur}
          onAnnoter={(description, capture) =>
            // Chaque repère remplace la capture précédente dans la barre (une seule capture, toujours à jour).
            void pieceCapture(description, capture).then((piece) =>
              setPieces((p) => [...p.filter((x) => x.genre !== 'capture'), piece]),
            )
          }
        />
      )}
      {artefactOuvert && (
        <ArtefactPanneau
          versions={artefactOuvert.versions}
          version={artefactOuvert.version}
          onFermer={fermerArtefact}
        />
      )}
      <div className="seven-fil" ref={filRef} aria-live="polite">
        {messages.length === 0 && !occupe && (
          <div className="seven-vide">
            <span className="six-vide-logo" aria-hidden="true">
              <Logo label="" />
            </span>
            {sixtouch ? (
              <>
                <h1>On se met au travail ?</h1>
                <p>
                  Donne-moi une tâche : un rapport, une recherche, l&apos;analyse d&apos;un
                  document, d&apos;une image ou d&apos;une vidéo.{' '}
                  {telephone
                    ? 'Tes fichiers sont en haut à droite.'
                    : 'Le navigateur et les fichiers sont en haut à droite.'}
                </p>
              </>
            ) : (
              <>
                <h1>On discute ?</h1>
                <p>
                  Pose-moi une question, joins un document ou envoie un vocal. Tu peux aussi me
                  demander d&apos;ouvrir une page, comme « ouvre les réglages ».
                </p>
              </>
            )}
          </div>
        )}
        {messages.map((m, i) => {
          const creation = m.role === 'assistant' ? extraireArtefacts(m.content) : null;
          const texte = creation?.texte ?? m.content;
          return (
            <div key={i} className={`seven-msg ${m.role}`}>
              {m.role === 'assistant' && (
                <span className="six-msg-logo" aria-hidden="true">
                  <Logo label="" small />
                </span>
              )}
              {m.pieces && <PiecesJointes pieces={m.pieces} petit />}
              {m.etapes && m.etapes.length > 0 && (
                <details className="six-etapes">
                  <summary>
                    {m.etapes.length} étape{m.etapes.length > 1 ? 's' : ''} de travail
                  </summary>
                  <ol>
                    {m.etapes.map((e, k) => (
                      <li key={k}>{e}</li>
                    ))}
                  </ol>
                </details>
              )}
              <div className="seven-bulle">
                {i === animee && m.role === 'assistant' ? (
                  <TexteProgressif texte={texte} onPas={suivreFin} />
                ) : (
                  texte
                )}
              </div>
              {creation && creation.artefacts.length > 0 && (
                <Artefacts
                  fichiers={creation.artefacts}
                  versions={versions}
                  ouvert={artefactOuvert}
                  onOuvrir={ouvrirArtefact}
                />
              )}
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
              {m.fichiers && m.fichiers.length > 0 && (
                <div className="six-fichiers-crees">
                  {m.fichiers.map((f) => (
                    <button
                      key={f}
                      type="button"
                      className="six-fichier-cree"
                      title="Voir dans les fichiers"
                      onClick={() => setVolet('fichiers')}
                    >
                      <Icon name="file" size={14} stroke={1.8} />
                      <span>{f}</span>
                    </button>
                  ))}
                </div>
              )}
              {m.role === 'assistant' && m.lieux && m.lieux.length > 0 && (
                <CarteLieux lieux={m.lieux} />
              )}
            </div>
          );
        })}

        {enAttente && (
          <div className="seven-msg user">
            <PiecesJointes pieces={attentePieces} petit />
            <div className="seven-bulle">{enAttente}</div>
          </div>
        )}
        {occupe && (
          <div className="seven-msg assistant">
            <span className="six-msg-logo" aria-hidden="true">
              <Logo label="" small />
            </span>
            <div className="six-attente" role="status">
              <span className="six-attente-texte">
                {lectureDoc
                  ? 'Six lit ton document…'
                  : sixtouch
                    ? (etapesEnCours.at(-1) ?? 'Six réfléchit à la tâche…')
                    : 'Six prépare sa réponse…'}
              </span>
              {/* Mini vague : trois voiles qui ondulent en décalé, fondus aux deux bouts (comme la vague du fond). */}
              <svg className="six-attente-vague" viewBox="0 0 120 18" aria-hidden="true">
                <defs>
                  <linearGradient id="six-vague-fondu" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0" stopColor="currentColor" stopOpacity="0" />
                    <stop offset="0.25" stopColor="currentColor" stopOpacity="1" />
                    <stop offset="0.75" stopColor="currentColor" stopOpacity="1" />
                    <stop offset="1" stopColor="currentColor" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <g stroke="url(#six-vague-fondu)">
                  <path
                    className="v1"
                    d="M-40 9 C -30 2, -20 2, -10 9 S 10 16, 20 9 S 40 2, 50 9 S 70 16, 80 9 S 100 2, 110 9 S 130 16, 140 9 S 160 2, 170 9"
                  />
                  <path
                    className="v2"
                    d="M-40 9 C -30 4, -20 4, -10 9 S 10 14, 20 9 S 40 4, 50 9 S 70 14, 80 9 S 100 4, 110 9 S 130 14, 140 9 S 160 4, 170 9"
                  />
                  <path
                    className="v3"
                    d="M-40 9 C -30 6, -20 6, -10 9 S 10 12, 20 9 S 40 6, 50 9 S 70 12, 80 9 S 100 6, 110 9 S 130 12, 140 9 S 160 6, 170 9"
                  />
                </g>
              </svg>
            </div>
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
            className="six-reessayer"
            onClick={() =>
              void envoyer(
                dernierEchec.texte,
                dernierEchec.affichage,
                dernierEchec.document,
                dernierEchec.jointes,
              )
            }
          >
            Réessayer le dernier envoi
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
      </div>

      <form
        className="seven-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void envoyer(saisie);
        }}
      >
        {!sixtouch && projetId && (
          <p style={{ width: '100%', maxWidth: 560, margin: '0 auto 8px' }}>
            Contexte du projet actif · <a href="/projets">Mes projets</a>
          </p>
        )}
        {sixtouch && (
          <div style={{ width: '100%', maxWidth: 560, margin: '0 auto 8px' }}>
            {projetId && (
              <p>
                Contexte du projet actif · <a href="/projets">Mes projets</a>
              </p>
            )}
            <label htmlFor="cosinus-skill">Skill : </label>
            <select
              id="cosinus-skill"
              value={skill}
              disabled={occupe || enregistre}
              onChange={(e) => setSkill(e.target.value as ChoixSkill)}
              style={{
                maxWidth: '100%',
                minHeight: 44,
                borderRadius: 10,
                padding: '8px 12px',
                color: 'inherit',
                background: 'Canvas',
              }}
            >
              <option value="auto">Automatique</option>
              {SKILLS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </select>
            <p style={{ margin: '4px 0', fontSize: 12, opacity: 0.75 }}>
              {skill === 'auto'
                ? 'Cosinus choisit une méthode selon ta demande.'
                : choisirSkill(skill)?.description}
            </p>
          </div>
        )}
        <div className="seven-capsule">
          <button
            type="button"
            className="seven-doc"
            aria-label="Joindre des fichiers (images, vidéos, PDF, texte)"
            title="Joindre des fichiers"
            disabled={occupe || enregistre}
            onClick={() => docInput.current?.click()}
          >
            <Icon name="plus" size={22} stroke={1.75} />
          </button>
          <input
            ref={docInput}
            type="file"
            accept={sixtouch ? undefined : '.txt,.md,.csv,.json,.log,.pdf,image/*,video/*'}
            multiple
            className="seven-doc-input"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => void importerFichiers(e.target.files)}
          />
          {sixtouch && (
            <>
              <button
                type="button"
                className="seven-doc"
                title="Ajouter un dossier"
                aria-label="Ajouter un dossier"
                disabled={occupe || enregistre}
                onClick={() => dossierInput.current?.click()}
              >
                <span aria-hidden="true">📁</span>
              </button>
              <input
                ref={(element) => {
                  dossierInput.current = element;
                  element?.setAttribute('webkitdirectory', '');
                }}
                type="file"
                multiple
                className="seven-doc-input"
                aria-label="Choisir un dossier"
                tabIndex={-1}
                onChange={(e) => void importerFichiers(e.target.files)}
              />
            </>
          )}
          <PiecesJointes
            pieces={pieces}
            onRetirer={(i) => setPieces((p) => p.filter((_, j) => j !== i))}
          />
          <input
            ref={champ}
            type="text"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder="Demander à Six"
            aria-label="Demander à Six"
            enterKeyHint="send"
          />
          {/* Micro tant que le champ est vide ; dès qu'on écrit, il laisse la place au bouton d'envoi. */}
          {occupe && !lectureDoc && !enregistre ? (
            <button
              type="button"
              className="seven-arreter"
              aria-label="Arrêter la réponse"
              title="Arrêter"
              onClick={() => {
                arretVolontaire.current = true;
                operation.current?.abort();
              }}
            >
              <span className="seven-arreter-carre" aria-hidden="true" />
            </button>
          ) : (saisie.trim() || pieces.length) && !enregistre ? (
            <button type="submit" className="seven-envoyer" disabled={occupe} aria-label="Envoyer">
              <Icon name="up" size={18} stroke={2} />
            </button>
          ) : (
            <button
              type="button"
              className={`seven-mic${enregistre ? ' rec' : ''}`}
              aria-label={enregistre ? 'Arrêter le message vocal' : 'Envoyer un message vocal'}
              title={enregistre ? 'Terminer le vocal' : 'Message vocal'}
              disabled={occupe && !enregistre}
              onClick={() => void basculerMicro()}
            >
              <Icon name={enregistre ? 'x' : 'mic'} size={20} stroke={1.75} />
            </button>
          )}
        </div>
        <p className="seven-mention">Six peut se tromper : vérifie les informations importantes.</p>
      </form>
    </main>
  );
}
