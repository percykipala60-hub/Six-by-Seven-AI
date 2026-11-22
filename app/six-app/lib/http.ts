import { NextResponse } from "next/server";
import { ProviderError } from "./providers";

const WINDOW_MS = 60_000;
const MAX_REQ = 20;
const hits = new Map<string, number[]>();

/**
 * Adresse du client, pour la limite de débit.
 * L'en-tête X-Forwarded-For peut être inventé par n'importe qui : on ne le lit que si TRUST_PROXY indique
 * combien de relais de confiance (l'hébergeur) le complètent, et on prend l'adresse ajoutée par le dernier relais
 * de confiance, jamais celle fournie par le client. Sans TRUST_PROXY, toutes les requêtes partagent une même limite.
 */
export function clientKey(req: Request): string {
  const hops = Number(process.env.TRUST_PROXY || 0);
  if (Number.isInteger(hops) && hops > 0) {
    const list = (req.headers.get("x-forwarded-for") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const ip = list[list.length - hops];
    if (ip) return ip;
  }
  return "direct";
}

/** Limite de 20 requêtes par minute et par adresse (en mémoire, par serveur). */
export function rateLimited(req: Request): boolean {
  const key = clientKey(req);
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) {
    // Nettoyage des adresses inactives (on ne vide jamais tout : ce serait une remise à zéro pour tous).
    for (const [k, times] of hits) if (now - times[times.length - 1] >= WINDOW_MS) hits.delete(k);
  }
  return recent.length > MAX_REQ;
}

/** Sites autorisés à appeler l'API : le site lui-même, plus ALLOWED_ORIGINS (séparés par des virgules). */
function allowedOrigin(req: Request, origin: string): boolean {
  const own = new URL(req.url).origin;
  const extra = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return origin === own || extra.includes(origin);
}

/**
 * Refuse les appels venant d'un autre site. Un navigateur envoie toujours l'en-tête Origin ou Sec-Fetch-Site
 * sur ces requêtes : une requête sans aucun des deux ne vient pas de l'app.
 * Limite : un script peut imiter ces en-têtes. La vraie protection de la clé reste les comptes et quotas,
 * plus le plafond quotidien (AI_DAILY_LIMIT) et la limite de dépense chez le fournisseur.
 */
export function foreignOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin) return !allowedOrigin(req, origin);
  const site = req.headers.get("sec-fetch-site");
  if (site) return site !== "same-origin" && site !== "none";
  return process.env.ALLOW_NO_ORIGIN !== "1";
}

/** Contrôles communs à toutes les routes d'IA. Renvoie une réponse d'erreur, ou null si la requête peut continuer. */
export function guard(req: Request): NextResponse | null {
  if (foreignOrigin(req)) return fail(403, "Requête non autorisée.");
  if (rateLimited(req)) return fail(429, "Trop de demandes. Attends une minute.");
  return null;
}

export function fail(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** Lit un JSON de petite taille. Refuse d'abord selon la taille annoncée. Ne journalise jamais le contenu. */
export async function readJson(req: Request, maxBytes = 20_000): Promise<Record<string, unknown> | null> {
  const announced = Number(req.headers.get("content-length") ?? 0);
  if (announced > maxBytes) return null;
  const text = await req.text();
  if (text.length > maxBytes) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function providerFail(e: unknown): NextResponse {
  if (e instanceof ProviderError) return fail(502, e.message);
  return fail(500, "Erreur inattendue. Réessaie.");
}
