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

for (const [prefixe, nom, url] of [
  ['OPENAI', 'ChatGPT', 'https://api.openai.com/v1/chat/completions'],
  ['OPENROUTER', 'OpenRouter', 'https://openrouter.ai/api/v1/chat/completions'],
]) {
  const cle = env(`${prefixe}_API_KEY`);
  if (!cle) {
    console.log(`${nom} : ${prefixe}_API_KEY absente (ignoré).`);
    continue;
  }
  const models = [
    ['analyse', env(`${prefixe}_MODEL_ANALYSE`) || env(`${prefixe}_MODEL`)],
    ['rédaction', env(`${prefixe}_MODEL_REDACTION`) || env(`${prefixe}_MODEL`)],
  ];
  for (const [role, model] of models) {
    if (!model) {
      console.log(
        `${nom} / ${role} : aucun modèle défini (${prefixe}_MODEL ou ${prefixe}_MODEL_${role === 'analyse' ? 'ANALYSE' : 'REDACTION'}).`,
      );
      continue;
    }
    checks.push({
      nom: `${nom} / ${role} / ${model}`,
      run: () =>
        fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${cle}`,
          },
          body: JSON.stringify({
            model,
            max_completion_tokens: 10,
            messages: [{ role: 'user', content: 'Réponds par le mot OK.' }],
          }),
        }),
    });
  }
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
