// .env lu par Node lui-même (Node 20.12 et plus) ; absent, les variables viennent de l'environnement.
try {
  process.loadEnvFile();
} catch {
  /* pas de fichier .env */
}
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts.js';
import { ALL_LEVELS as LEVELS } from '../client/src/data/levels.js';
import { lireRequete } from './validation.js';
import { lireListeOrigines, lireOrigine } from './origins.js';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY manquante dans le fichier .env (voir .env.example).');
  process.exit(1);
}

const app = express();
// 3010 par défaut : le 3001 est souvent déjà pris par un autre projet local (audit du 17/10/2026).
const PORT = Number(process.env.PORT) || 3010;
// N'annonce pas le serveur utilisé : rien à gagner à le dire. Aucun en-tête inutile dans les réponses.
app.disable('x-powered-by');
// Sonnet actuel, celui que six-app utilise pour rédiger ; réglable sans toucher au code.
// (claude-sonnet-4-5, prévu au départ, n'est plus disponible avec la clé du projet et arrive en fin de vie le 30/11/2026.)
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';
// Modèles qui savent basculer côté serveur vers un modèle de repli en cas de refus (même liste que six-app).
const FALLBACK_MODELS = new Set([
  'claude-sonnet-5-5',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-fable-5-1',
]);
// 30 s par essai, une seule nouvelle tentative : le joueur n'attend jamais plusieurs minutes.
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 30_000,
  maxRetries: 1,
});

const ORIGINS = lireListeOrigines(process.env.ALLOWED_ORIGINS);
app.use(cors({ origin: ORIGINS, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }));
app.use(express.json({ limit: '32kb' }));

// Refus explicite des appels hors du jeu : le CORS ne suffit pas face à un client qui n'est pas
// un navigateur. Les outils locaux (curl, scripts de test) continuent de fonctionner.
app.use((req, res, next) => {
  const { autorise, raison } = lireOrigine(req.get('origin'), req.ip, ORIGINS);
  if (autorise) return next();
  console.warn('Appel refusé —', raison);
  return res.status(403).json({ error: 'Origine non autorisée.' });
});

// Limite simple par adresse IP : 20 évaluations par minute (coût de l'IA).
const LIMITE = 20;
const fenetre = new Map();
function tropDeRequetes(ip) {
  const maintenant = Date.now();
  const recents = (fenetre.get(ip) || []).filter((t) => maintenant - t < 60_000);
  recents.push(maintenant);
  fenetre.set(ip, recents);
  return recents.length > LIMITE;
}
// Oublie les adresses inactives depuis une minute : la liste ne grossit pas sans fin.
setInterval(() => {
  const maintenant = Date.now();
  for (const [ip, temps] of fenetre)
    if (maintenant - temps[temps.length - 1] >= 60_000) fenetre.delete(ip);
}, 60_000).unref();

// Réponse imposée à Claude : le format JSON est garanti par les sorties structurées.
const EVALUATION_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'integer', description: 'Note de 0 à 100 selon le barème strict' },
    feedback: {
      type: 'string',
      description: 'Évaluation globale, 2 à 4 phrases, sévère et constructive',
    },
    points_forts: { type: 'array', items: { type: 'string' } },
    axes_amelioration: { type: 'array', items: { type: 'string' } },
  },
  required: ['score', 'feedback', 'points_forts', 'axes_amelioration'],
  additionalProperties: false,
};

/** Secours si le texte n'est pas du JSON pur (ancien modèle, format inattendu). */
function parseClaudeJson(raw) {
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first === -1 || last === -1) throw new Error('Aucun JSON trouvé');
  return JSON.parse(cleaned.slice(first, last + 1));
}

const liste = (v) =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, 5) : [];

app.post('/api/evaluate', async (req, res) => {
  if (tropDeRequetes(req.ip))
    return res
      .status(429)
      .json({ error: 'Trop de réponses en une minute. Attends un peu, puis réessaie.' });

  // Le serveur prend la situation dans ses propres niveaux : il ne sert pas de relais vers l'IA pour n'importe quel texte.
  const lu = lireRequete(req.body, LEVELS);
  if (lu.erreur) return res.status(400).json({ error: lu.erreur });
  const { level, playerAnswer } = lu;

  try {
    const message = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 4000, // la réflexion du modèle compte dans ce plafond
      // Consigne identique pour tous les joueurs : mise en cache, relue à environ 0,1x du prix.
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: EVALUATION_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: buildUserPrompt({
            scenario: level.scenario,
            playerAnswer,
            criteria: level.criteria,
          }),
        },
      ],
      ...(FALLBACK_MODELS.has(MODEL)
        ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }
        : {}),
    });
    if (message.stop_reason === 'refusal') {
      return res
        .status(422)
        .json({ error: 'Cette réponse ne peut pas être évaluée. Reformule-la.' });
    }
    const raw = message.content.find((b) => b.type === 'text')?.text || '';
    let parsed;
    try {
      parsed = parseClaudeJson(raw);
    } catch (e) {
      console.error('Réponse de Claude illisible :', e.message);
      return res.status(502).json({ error: "L'évaluation a échoué. Réessaie." });
    }
    const score = Math.min(100, Math.max(0, Math.round(Number(parsed.score) || 0)));
    return res.json({
      score,
      feedback: String(parsed.feedback || ''),
      points_forts: liste(parsed.points_forts),
      axes_amelioration: liste(parsed.axes_amelioration),
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      console.error('Clé API refusée.');
      return res.status(502).json({ error: "Le service d'évaluation est mal configuré." });
    }
    if (err instanceof Anthropic.RateLimitError)
      return res
        .status(503)
        .json({ error: "Trop de demandes vers l'IA. Réessaie dans un instant." });
    if (err instanceof Anthropic.APIConnectionError)
      return res
        .status(503)
        .json({ error: "L'IA ne répond pas. Vérifie la connexion et réessaie." });
    console.error('Erreur Anthropic :', err.status ?? '', err.message);
    return res.status(500).json({ error: "L'évaluation a échoué. Réessaie." });
  }
});

// JSON mal formé ou trop gros : message court, sans page d'erreur qui montrerait les fichiers du serveur.
app.use((err, _req, res, _next) => {
  const trop = err?.type === 'entity.too.large';
  res
    .status(trop ? 413 : 400)
    .json({ error: trop ? 'Réponse trop longue.' : 'Requête illisible.' });
});

app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', model: MODEL, levels: LEVELS.length }),
);

app.listen(PORT, () => {
  console.log(`Serveur d'évaluation prêt sur http://localhost:${PORT} (modèle ${MODEL})`);
});
