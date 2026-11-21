// scripts/calibrer.mjs — Harnais de calibrage du barème.
//
// Envoie des réponses témoins de qualité connue au serveur d'évaluation et affiche les notes rendues
// par Six. Sert à régler les paliers d'étoiles (client/src/engine/rewards.js) et les scores minimums
// des niveaux sur des données réelles, plutôt qu'à l'intuition.
//
// ⚠️  Chaque réponse témoin consomme un vrai appel à l'IA (donc du crédit Anthropic).
//
// Usage :
//   npm run calibrer                        # témoins intégrés (niveaux 1 et 15)
//   npm run calibrer -- --niveaux=1,3,8,15 --repetitions=2
//   npm run calibrer -- --fichier=scripts/mes-reponses.json
//
// Format du fichier de témoins (facultatif) : { "1": [{ "profil": "faible", "texte": "…" }, …], … }
// Le serveur doit tourner (npm start) ; l'adresse se règle avec EVALUATION_URL (défaut 3010).

import { computeStars, SEUILS_ETOILES } from '../../client/src/engine/rewards.js';
import { LEVELS } from '../../client/src/data/levels.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.EVALUATION_URL || 'http://127.0.0.1:3010';

// Témoins intégrés : trois niveaux de qualité par niveau, écrits pour être notés différemment.
const TEMOINS = {
  1: [
    { profil: 'faible', texte: 'Bonjour, ça va ?' },
    {
      profil: 'moyen',
      texte:
        "Bonjour. L'attente est longue aujourd'hui, on dirait. Je suis là depuis un moment aussi.",
    },
    {
      profil: 'fort',
      texte:
        "Vous savez ce qui est rassurant dans cette salle ? Personne n'a l'air d'être là pour une bonne nouvelle, et pourtant on est tous assis bien droits à faire semblant d'aller bien. Moi je triche : je relis trois fois la même affiche. Si vous voulez, je vous la raconte à voix basse, ça fera passer le temps — sinon, pas de souci, on reste chacun dans son coin, ça marche aussi.",
    },
  ],
  15: [
    {
      profil: 'faible',
      texte: "Marie, je suis vraiment désolé. Pardon. J'espère que tu pourras me pardonner.",
    },
    {
      profil: 'moyen',
      texte:
        "Marie, j'ai révélé ce que tu m'avais confié et je n'aurais pas dû. Je le regrette sincèrement. J'espère que tu arriveras à me pardonner, je ferai attention la prochaine fois.",
    },
    {
      profil: 'fort',
      texte:
        "Marie, ce que j'ai fait n'a rien d'une maladresse : j'ai pris un secret que tu m'avais confié et je l'ai mis dans les mains d'une autre personne. Les conséquences que tu as vécues, c'est moi qui les ai déclenchées, et je comprends que tu aies choisi de couper le contact. Je ne te demande rien aujourd'hui : ni ton pardon, ni de me rassurer. Je voulais juste que tu saches que je mesure ce que j'ai fait, et que si un jour tu veux me reparler, je serai là — sinon, je respecterai ça aussi.",
    },
  ],
};

const option = (nom, defaut) => {
  const trouve = process.argv.find((a) => a.startsWith(`--${nom}=`));
  return trouve ? trouve.slice(nom.length + 3) : defaut;
};

async function evaluer(levelId, playerAnswer) {
  const res = await fetch(`${BASE}/api/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ levelId, playerAnswer }),
    signal: AbortSignal.timeout(120_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const niveaux = option('niveaux', Object.keys(TEMOINS).join(','))
  .split(',')
  .map((n) => Number(n.trim()))
  .filter(Boolean);
const repetitions = Math.max(1, Number(option('repetitions', 1)) || 1);
const fichier = option('fichier', null);

let temoins = TEMOINS;
if (fichier) {
  temoins = JSON.parse(await readFile(path.resolve(ICI, '..', fichier), 'utf8'));
}

const parPalier = new Map(SEUILS_ETOILES.map((s) => [s, 0]));
const notes = [];
console.log(`Serveur : ${BASE}`);
console.log(`Paliers actuels : ${SEUILS_ETOILES.join(' / ')} (1 / 2 / 3 étoiles)\n`);

for (const id of niveaux) {
  const niveau = LEVELS.find((l) => l.id === id);
  if (!niveau) {
    console.warn(`Niveau ${id} inconnu, ignoré.`);
    continue;
  }
  for (const temoin of temoins[id] || []) {
    for (let i = 0; i < repetitions; i++) {
      process.stdout.write(`niveau ${String(id).padStart(2)} · ${temoin.profil.padEnd(7)} … `);
      try {
        const { score } = await evaluer(id, temoin.texte);
        const etoiles = computeStars(score);
        notes.push(score);
        for (const seuil of SEUILS_ETOILES)
          if (score >= seuil) parPalier.set(seuil, parPalier.get(seuil) + 1);
        const verdict =
          score >= niveau.minScore
            ? `min. ${niveau.minScore} atteint`
            : `sous le minimum (${niveau.minScore})`;
        console.log(`${score}/100 → ${etoiles} étoile(s) · ${verdict}`);
      } catch (e) {
        console.log(`erreur : ${e.message}`);
      }
    }
  }
}

if (notes.length === 0) {
  console.error('\nAucune note obtenue. Le serveur tourne-t-il ? (npm start)');
  // Code de sortie posé sans process.exit() : quitter pendant la fermeture des connexions fetch
  // fait planter Node sur Windows (assertion libuv) et fausse le code de retour.
  process.exitCode = 1;
}

notes.sort((a, b) => a - b);
const mediane = notes[Math.floor(notes.length / 2)];
console.log(`\nNotes obtenues : ${notes.join(', ')}`);
console.log(`Médiane ${mediane}/100 · min ${notes[0]} · max ${notes[notes.length - 1]}`);
for (const seuil of SEUILS_ETOILES) {
  const n = parPalier.get(seuil);
  console.log(
    `Palier ${seuil}/100 : ${n}/${notes.length} réponse(s) témoin l'atteignent${n === 0 ? '  ⚠️ palier jamais atteint, la carte peut devenir infranchissable' : ''}`,
  );
}
// Rappel du critère de finissabilité : un joueur régulier au palier « 2 étoiles » doit pouvoir ouvrir
// le niveau légendaire (30 étoiles). Voir le test « finissabilité » côté client.
console.log('\nRappel : 30 étoiles sont nécessaires pour le niveau légendaire (15 niveaux).');
