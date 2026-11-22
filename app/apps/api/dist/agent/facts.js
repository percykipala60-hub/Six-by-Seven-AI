import { normalize } from './scam.js';
/**
 * Faits vérifiables cités dans un texte : heures, dates et montants.
 * Sert à empêcher l'IA d'inventer « 23h » ou « 5 000 FC » qui n'existent nulle part.
 */
export function extractFacts(text) {
    const t = normalize(text);
    const facts = new Set();
    for (const m of t.matchAll(/\b([01]?\d|2[0-3]) ?(?:h|:)(?: ?([0-5]\d))?\b/g)) {
        facts.add(`${Number(m[1])}h${m[2] ?? ''}`);
    }
    for (const m of t.matchAll(/\b(\d{1,2})[/.](\d{1,2})(?:[/.]\d{2,4})?\b/g)) {
        facts.add(`${Number(m[1])}/${Number(m[2])}`);
    }
    for (const m of t.matchAll(/(\d[\d .]*\d|\d)\s?(fc|cdf|francs?|\$|usd|dollars?|euros?|€)/g)) {
        facts.add(`${(m[1] ?? '').replace(/[ .]/g, '')} ${m[2]?.replace(/s$/, '')}`);
    }
    return [...facts];
}
//# sourceMappingURL=facts.js.map