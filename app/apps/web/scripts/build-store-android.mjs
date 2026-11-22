import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';

const webDir = process.cwd();
const androidDir = resolve(webDir, 'android');
const serverUrl = process.env.CAP_SERVER_URL;
const signing = [
  'ANDROID_KEYSTORE_FILE',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD',
];

function fail(message) {
  console.error(`[android:store] ${message}`);
  process.exit(1);
}

if (!existsSync(resolve(webDir, 'package.json')) || !existsSync(androidDir))
  fail('Lance cette commande depuis apps/web.');
if (!serverUrl) fail('CAP_SERVER_URL HTTPS est requis pour la version Play Store.');

let parsedUrl;
try {
  parsedUrl = new URL(serverUrl);
} catch {
  fail('CAP_SERVER_URL doit être une URL HTTPS valide.');
}
if (
  parsedUrl.protocol !== 'https:' ||
  parsedUrl.pathname !== '/' ||
  parsedUrl.search ||
  parsedUrl.hash
)
  fail('CAP_SERVER_URL doit être une origine HTTPS, sans chemin ni paramètres.');

for (const name of signing) {
  if (!process.env[name]) fail(`${name} doit être configuré dans l'environnement.`);
}
if (!isAbsolute(process.env.ANDROID_KEYSTORE_FILE))
  fail('ANDROID_KEYSTORE_FILE doit être un chemin absolu.');
if (!existsSync(resolve(process.env.ANDROID_KEYSTORE_FILE)))
  fail('Le fichier ANDROID_KEYSTORE_FILE est introuvable.');

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, env: process.env, stdio: 'inherit' });
  if (result.error) fail(`Impossible de lancer ${command}: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const npmExec = process.platform === 'win32' ? 'npx.cmd' : 'npx';
run(npmExec, ['cap', 'sync', 'android'], webDir);

const gradle = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
run(gradle, ['bundleRelease'], androidDir);

console.info(
  `[android:store] AAB signé créé : ${resolve(androidDir, 'app/build/outputs/bundle/release/app-release.aab')}`,
);
