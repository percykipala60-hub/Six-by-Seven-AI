/**
 * Démarrage à froid, comme un membre de l'équipe : lance `pnpm dev`, attend le serveur et l'app,
 * puis vérifie une vraie réponse de l'API (une arnaque : le bouclier répond sans modèle d'IA).
 *
 *   pnpm verifier
 *
 * Utilisé en CI sous Windows et Linux. Rien n'est envoyé ailleurs qu'à localhost.
 */
import { spawn, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// Les oublis les plus fréquents, expliqués avant de lancer quoi que ce soit.
const missing = [
  ['apps/api/.env', 'Copy-Item apps\\api\\.env.example apps\\api\\.env'],
  ['apps/web/.env.local', 'Copy-Item apps\\web\\.env.example apps\\web\\.env.local'],
].filter(([file]) => !existsSync(file));
if (missing.length) {
  console.log('✖ Fichier de réglages manquant. Dans PowerShell, à la racine du projet :');
  for (const [, command] of missing) console.log(`    ${command}`);
  process.exit(1);
}

const API = 'http://localhost:4000';
const WEB = 'http://localhost:3000';
const LIMIT_MS = 180_000;

// Groupe de processus à part (Linux, macOS) pour tout arrêter d'un coup à la fin.
const dev = spawn('pnpm', ['dev'], {
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: process.platform !== 'win32',
});
let log = '';
dev.stdout.on('data', (d) => (log += d));
dev.stderr.on('data', (d) => (log += d));

function stop(code, message) {
  console.log(message);
  if (code !== 0) console.log(`\n--- journal de pnpm dev ---\n${log.slice(-4000)}`);
  try {
    if (process.platform === 'win32')
      execSync(`taskkill /pid ${dev.pid} /T /F`, { stdio: 'ignore' });
    else process.kill(-(dev.pid ?? 0));
  } catch {
    dev.kill('SIGTERM');
  }
  process.exit(code);
}

async function waitFor(url, label) {
  const started = Date.now();
  while (Date.now() - started < LIMIT_MS) {
    if (dev.exitCode !== null) stop(1, `✖ pnpm dev s'est arrêté avant que ${label} réponde.`);
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log(`✔ ${label} répond (${Math.round((Date.now() - started) / 1000)} s)`);
        return;
      }
    } catch {
      // pas encore prêt
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  stop(1, `✖ ${label} ne répond pas après ${LIMIT_MS / 1000} s.`);
}

await waitFor(`${API}/health`, 'Le serveur');
await waitFor(`${WEB}/`, "L'accueil de Six");

const res = await fetch(`${API}/v1/reponses`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: WEB },
  body: JSON.stringify({
    conversation:
      '[TEL 1]: Service M-Pesa : votre compte sera bloqué. Envoyez votre code PIN tout de suite.',
  }),
});
const body = await res.json().catch(() => ({}));
if (res.status !== 200 || body.bouclier !== true || body.arnaque?.niveau !== 'eleve') {
  stop(1, `✖ /v1/reponses ne répond pas comme prévu (HTTP ${res.status}).`);
}
if (res.headers.get('access-control-allow-origin') !== WEB) {
  stop(1, "✖ L'app ne serait pas autorisée à appeler le serveur (CORS).");
}
stop(0, '✔ Réponse de l’agent reçue (arnaque détectée, bouclier actif). Six démarre correctement.');
