import {
  AnalyseResponseSchema,
  CoachResponseSchema,
  ReplyApiResponseSchema,
  SujetsResponseSchema,
  TexteResponseSchema,
  TonResponseSchema,
  type AjusterRequest,
  type AnalyseRequest,
  type CoachRequest,
  type Feedback,
  type ReplyApiRequest,
  type SujetsRequest,
  type TonRequest,
} from '@six/shared';

export type ApiFailure =
  | 'reseau' // pas de connexion, serveur éteint
  | 'lent' // trop long (3G, modèle local)
  | 'limite' // trop de demandes
  | 'serveur' // erreur côté serveur ou réponse non conforme
  | 'annule';

export class ApiError extends Error {
  constructor(readonly kind: ApiFailure) {
    super(kind);
    this.name = 'ApiError';
  }
}

/** Un modèle local sur processeur peut prendre plusieurs minutes ; Claude, quelques secondes. */
const TIMEOUT_MS = 10 * 60 * 1000;

interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

async function post<T>(
  apiUrl: string,
  path: string,
  body: unknown,
  schema: Parser<T>,
  signal?: AbortSignal,
): Promise<T> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ApiError('reseau');
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: combined,
      cache: 'no-store',
      // Aucun cookie, aucune information d'identification envoyée.
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    if (signal?.aborted) throw new ApiError('annule');
    if (timeout.aborted) throw new ApiError('lent');
    throw new ApiError('reseau');
  }
  if (response.status === 429) throw new ApiError('limite');
  if (!response.ok) throw new ApiError('serveur');
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new ApiError('serveur');
  return parsed.data;
}

export const askSix = (apiUrl: string, body: ReplyApiRequest, signal?: AbortSignal) =>
  post(apiUrl, '/v1/reponses', body, ReplyApiResponseSchema, signal);
export const analyseSix = (apiUrl: string, body: AnalyseRequest, signal?: AbortSignal) =>
  post(apiUrl, '/v1/analyse', body, AnalyseResponseSchema, signal);
export const ajusterSix = (apiUrl: string, body: AjusterRequest, signal?: AbortSignal) =>
  post(apiUrl, '/v1/ajuster', body, TexteResponseSchema, signal);
export const coachSix = (apiUrl: string, body: CoachRequest, signal?: AbortSignal) =>
  post(apiUrl, '/v1/coach', body, CoachResponseSchema, signal);
export const tonSix = (apiUrl: string, body: TonRequest, signal?: AbortSignal) =>
  post(apiUrl, '/v1/verifier-ton', body, TonResponseSchema, signal);
export const sujetsSix = (apiUrl: string, body: SujetsRequest, signal?: AbortSignal) =>
  post(apiUrl, '/v1/sujets', body, SujetsResponseSchema, signal);

/** « Utile oui/non » : un booléen et un numéro de brouillon, jamais de texte. Échec silencieux. */
export function sendFeedback(apiUrl: string, feedback: Feedback): void {
  void fetch(`${apiUrl}/v1/retour`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(feedback),
    credentials: 'omit',
    keepalive: true,
  }).catch(() => undefined);
}

export const FAILURE_TEXT: Record<ApiFailure, string> = {
  reseau: 'Pas de réseau, ou serveur injoignable. Rien n’est perdu : réessaie quand ça revient.',
  lent: 'Le serveur met trop de temps à répondre. Réessaie dans un instant.',
  limite: 'Beaucoup de demandes en ce moment. Attends une minute, puis réessaie.',
  serveur: 'Le serveur a eu un problème. Réessaie ; ta conversation n’a pas été gardée.',
  annule: 'Demande annulée.',
};
