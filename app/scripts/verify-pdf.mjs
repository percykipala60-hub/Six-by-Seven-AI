// Vérification ponctuelle des PDF générés (node scripts/verify-pdf.mjs)
import { readFileSync } from 'node:fs';

// Octets WinAnsi 0x80-0x9F → Unicode (pour relire les – — ’ « » etc.)
const OCTETS = new Map([
  [0x80, '€'],
  [0x85, '…'],
  [0x91, '‘'],
  [0x92, '’'],
  [0x93, '“'],
  [0x94, '”'],
  [0x95, '•'],
  [0x96, '–'],
  [0x97, '—'],
  [0xa0, ' '],
  [0xab, '«'],
  [0xbb, '»'],
]);

function extractText(file) {
  const s = readFileSync(file).toString('latin1');
  const texts = [];
  const re = /\((?:[^()\\]|\\.)*\)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    texts.push(
      m[0]
        .slice(1, -1)
        .replace(/\\([0-7]{1,3})/g, (_, o) => {
          const byte = Number.parseInt(o, 8);
          return OCTETS.get(byte) ?? String.fromCharCode(byte);
        })
        .replace(/\\([()\\])/g, '$1'),
    );
  }
  return texts.join(' ');
}

const dg = extractText('docs/decisions-a-voter.pdf');
const tech = extractText('docs/faisabilite-six.pdf');
const complet = extractText('docs/faisabilite-et-decisions.pdf');

const attendus = {
  'docs/decisions-a-voter.pdf': [
    'Décisions à prendre',
    'Décision 1',
    'Décision 2',
    'Décision 3',
    'Décision 4',
    'lingala',
    '30 à 60',
    '250–450',
    '13 octobre',
    'moyen de paiement',
    "L'IA propose",
  ],
  'docs/faisabilite-six.pdf': [
    'Problèmes de faisabilité',
    'Problème 1',
    'Problème 4',
    'Ollama',
    'Hetzner',
    'Render Starter',
    '13 octobre',
  ],
  'docs/faisabilite-et-decisions.pdf': [
    'Dossier complet',
    'Sommaire',
    'Partie 1',
    'Partie 2',
    'Partie 3',
    'Partie 4',
    'Partie 5',
    'Décision 1',
    'Décision 4',
    'Problème 1',
    'Problème 4',
    '30 à 60',
    '250–450',
    '13 octobre',
    "L'IA propose",
  ],
};

let echecs = 0;
for (const [file, mots] of Object.entries(attendus)) {
  const txt = file.includes('et-decisions') ? complet : file.includes('decisions') ? dg : tech;
  for (const mot of mots) {
    const ok = txt.includes(mot);
    if (!ok) echecs++;
    console.log(`${file} | ${ok ? 'OK  ' : 'MISS'} ${mot}`);
  }
}
process.exit(echecs ? 1 : 0);
