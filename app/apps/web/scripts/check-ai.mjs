// Contrôle rapide des clés d'API : envoie une toute petite demande à chaque service configuré.
// Usage : npm run check-ai   (coûte quelques centimes au plus). N'affiche jamais les clés.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
for (const f of ['.env.local', '.env']) {
  const path = join(root, f);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const env = (n) => (process.env[n] ?? '').trim();

const checks = [];
if (env('ANTHROPIC_API_KEY')) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY'), maxRetries: 0 });
  for (const [role, model] of [
    ['analyse', env('CLAUDE_MODEL_ANALYSE') || 'claude-haiku-4-5-20251001'],
    ['rédaction', env('CLAUDE_MODEL_REDACTION') || 'claude-sonnet-5-5'],
  ]) {
    checks.push({
      nom: `Claude / ${role} / ${model}`,
      run: async () => {
        try {
          await client.messages.create({
            model,
            max_tokens: 16,
            messages: [{ role: 'user', content: 'Réponds par le mot OK.' }],
          });
          return { ok: true, status: 200 };
        } catch (e) {
          if (e instanceof Anthropic.APIError && typeof e.status === 'number')
            return { ok: false, status: e.status };
          throw e;
        }
      },
    });
  }
} else {
  console.log('Claude : ANTHROPIC_API_KEY absente (ignoré).');
}

if (env('OPENAI_API_KEY')) {
  const models = [
    ['analyse', env('OPENAI_MODEL_ANALYSE') || env('OPENAI_MODEL')],
    ['rédaction', env('OPENAI_MODEL_REDACTION') || env('OPENAI_MODEL')],
  ];
  for (const [role, model] of models) {
    if (!model) {
      console.log(
        `ChatGPT / ${role} : aucun modèle défini (OPENAI_MODEL ou OPENAI_MODEL_${role === 'analyse' ? 'ANALYSE' : 'REDACTION'}).`,
      );
      continue;
    }
    checks.push({
      nom: `ChatGPT / ${role} / ${model}`,
      run: () =>
        fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${env('OPENAI_API_KEY')}`,
          },
          body: JSON.stringify({
            model,
            max_completion_tokens: 10,
            messages: [{ role: 'user', content: 'Réponds par le mot OK.' }],
          }),
        }),
    });
  }
} else {
  console.log('ChatGPT : OPENAI_API_KEY absente (ignoré).');
}

const HINTS = {
  400: 'demande refusée (nom de modèle ou paramètre invalide ?)',
  401: 'clé refusée (clé fausse, expirée ou mal copiée)',
  403: 'accès refusé (clé sans droit sur ce modèle ?)',
  404: 'modèle introuvable (vérifie le nom dans la doc du fournisseur)',
  429: 'trop de demandes ou crédit épuisé',
};

let failed = 0;
for (const c of checks) {
  try {
    const res = await c.run();
    if (res.ok) console.log(`OK      ${c.nom}`);
    else {
      failed++;
      console.log(
        `ÉCHEC   ${c.nom} → HTTP ${res.status} : ${HINTS[res.status] ?? 'erreur du service'}`,
      );
    }
  } catch {
    failed++;
    console.log(`ÉCHEC   ${c.nom} → pas de réseau`);
  }
}
if (!checks.length) console.log("Aucune clé configurée : l'app reste en mode démonstration.");
process.exit(failed ? 1 : 0);
