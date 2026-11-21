import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Client Supabase (projet « six », Paris) : connexion par code et mémoire synchronisée.
 * La clé publishable est publique par conception ; les données sont protégées par les règles d'accès (RLS)
 * de la table `memoires` : chacun ne lit et n'écrit que sa propre ligne.
 * Sans les deux variables, Six reste en mode invité et ce module n'est jamais chargé.
 */
const URL_SUPABASE =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://omlrwtzfqmfwjmwxmehe.supabase.co';
const CLE =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tbHJ3dHpmcW1md2ptd3htZWhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwMTcxNjUsImV4cCI6MjEwNzU5MzE2NX0.gO1jdCoQK1Cp2T4r8WhuDlaGDYo3PnVW7B7tYRMw-2w';

export const CONNEXION_DISPONIBLE = Boolean(URL_SUPABASE && CLE);

let client: Promise<SupabaseClient | null> | null = null;

/** Chargé à la demande (bibliothèque d'environ 50 Ko) : l'accueil reste léger sur un petit réseau. */
export function supabase(): Promise<SupabaseClient | null> {
  if (!CONNEXION_DISPONIBLE || typeof window === 'undefined') return Promise.resolve(null);
  client ??= import('@supabase/supabase-js')
    .then(({ createClient }) =>
      createClient(URL_SUPABASE, CLE, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'six-auth',
        },
      }),
    )
    .catch(() => {
      client = null;
      return null;
    });
  return client;
}
