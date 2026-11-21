'use client';

import { useEffect, useState } from 'react';
import { HealthResponseSchema } from '@six/shared';

type Status =
  | { kind: 'checking' }
  | { kind: 'online'; version: string }
  | { kind: 'offline'; reason: 'network' | 'invalid' };

const TIMEOUT_MS = 8000;

/** Vérifie que l'API répond. En 3G, une réponse lente ou absente donne un message clair, jamais un écran blanc. */
export function ApiStatus({ apiUrl }: { apiUrl: string }) {
  const [status, setStatus] = useState<Status>({ kind: 'checking' });

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let unmounted = false;

    fetch(`${apiUrl}/health`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const parsed = HealthResponseSchema.safeParse(await response.json());
        if (unmounted) return;
        setStatus(
          parsed.success
            ? { kind: 'online', version: parsed.data.version }
            : { kind: 'offline', reason: 'invalid' },
        );
      })
      .catch(() => {
        if (!unmounted) setStatus({ kind: 'offline', reason: 'network' });
      })
      .finally(() => clearTimeout(timer));

    return () => {
      unmounted = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [apiUrl]);

  const label =
    status.kind === 'checking'
      ? 'Connexion au serveur…'
      : status.kind === 'online'
        ? `Serveur en ligne · v${status.version}`
        : status.reason === 'network'
          ? 'Serveur injoignable. Vérifie ta connexion.'
          : 'Réponse du serveur inattendue.';

  const dot =
    status.kind === 'online'
      ? 'bg-accent'
      : status.kind === 'offline'
        ? 'bg-alert'
        : 'bg-muted animate-pulse';

  return (
    <p
      role="status"
      aria-live="polite"
      data-status={status.kind}
      className="inline-flex min-h-12 items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-3 text-left text-sm text-muted"
    >
      <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${dot}`} />
      {label}
    </p>
  );
}
