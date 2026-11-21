// scripts/fumee.mjs — Test de fumée : le serveur répond, le modèle est bien là, et une évaluation
// complète passe. À lancer après tout changement de modèle, de beta ou de clé (npm run fumee).
//
// ⚠️  Consomme un appel à l'IA. Le serveur doit tourner (npm start).

const BASE = process.env.EVALUATION_URL || 'http://127.0.0.1:3010';
let echecs = 0;
const verifier = (condition, libelle) => {
  console.log(`${condition ? '✔' : '✘'} ${libelle}`);
  if (!condition) echecs += 1;
};

try {
  const sante = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(10_000) });
  const info = await sante.json();
  verifier(sante.ok && info.status === 'ok', `santé du serveur (${sante.status})`);
  verifier(
    typeof info.model === 'string' && info.model.length > 0,
    `modèle annoncé : ${info.model}`,
  );
  verifier(info.levels === 15, `niveaux chargés : ${info.levels}`);
} catch (e) {
  console.error(`✘ serveur injoignable sur ${BASE} : ${e.message}`);
  console.error('  Lance « npm start » dans server/ avant ce test.');
  process.exitCode = 1;
}

try {
  const res = await fetch(`${BASE}/api/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      levelId: 1,
      playerAnswer: 'Bonjour. L’attente est longue aujourd’hui, on dirait.',
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const data = await res.json().catch(() => ({}));
  verifier(res.ok, `évaluation acceptée (${res.status})`);
  verifier(
    Number.isInteger(data.score) && data.score >= 0 && data.score <= 100,
    `note dans les bornes : ${data.score}/100`,
  );
  verifier(
    typeof data.feedback === 'string' && data.feedback.length > 20,
    'retour de Six non vide',
  );
  verifier(
    Array.isArray(data.points_forts) && Array.isArray(data.axes_amelioration),
    'points forts et axes présents',
  );
} catch (e) {
  verifier(false, `évaluation impossible : ${e.message}`);
}

console.log(echecs === 0 ? '\nTest de fumée réussi.' : `\n${echecs} vérification(s) en échec.`);
// On pose le code de sortie sans appeler process.exit() : sur Windows, quitter pendant que les
// connexions fetch se ferment fait planter Node (assertion libuv) et fausse le code de retour.
process.exitCode = echecs === 0 ? 0 : 1;
