import { extractFacts } from './facts.js';
import { normalize } from './scam.js';
/** Phrases d'assistant ou de conseiller : un brouillon doit sonner comme l'utilisateur. */
const ADVISOR = [
    /\bje (vais|peux) t'aider\b/,
    /\bje suis la pour (t'ecouter|t'aider|vous aider)\b/,
    /\ben tant qu'(ia|assistant|intelligence artificielle)\b/,
    /\bn'hesite pas a (me|nous) (contacter|dire)\b/,
    /\b(analyser|identifier) (tes|les|vos) (preoccupations|themes|emotions|sentiments)\b/,
    /\bje comprends que tu (te sens|ressens)\b/,
    /\bvoici (une|des|trois|3) (reponses?|propositions?|suggestions?)\b/,
];
/** Récits personnels typiques qu'un modèle invente pour « meubler ». */
const LIFE_STORY = /\b(que )?j'ai (vu|lu|regarde|ecoute|fait|achete|mange|visite|teste|decouvert)\b.{0,40}\b(recemment|hier|ce week-end|la semaine derniere|l'autre jour)\b/;
const THINGS = [
    'film',
    'serie',
    'livre',
    'roman',
    'concert',
    'match',
    'voyage',
    'restaurant',
    'jeu',
    'chanson',
    'album',
    'cadeau',
    'soiree',
    'fete',
];
const PLACEHOLDER = /\[(prenom|personne|tel|telephone|numero|email|lieu|nom)[^\]]*\]/i;
const GIVES_SECRET = /\b(mon|le) (code|pin|mot de passe)\b.{0,15}(est|c'est|:)\s*\d/;
const YIELDS_TO_SCAM = /\b(je (t'|vous )?(envoie|transfere|depose|donne)|voici (mon|le) code|d'accord je (paie|paye|envoie)|je vais payer)\b/;
function words(text) {
    return new Set(normalize(text)
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 2));
}
function similarity(a, b) {
    const wa = words(a);
    const wb = words(b);
    if (wa.size === 0 || wb.size === 0)
        return 0;
    let common = 0;
    for (const w of wa)
        if (wb.has(w))
            common++;
    return common / Math.min(wa.size, wb.size);
}
/**
 * Contrôle des brouillons par du code, pas par une IA : rapide, gratuit, et identique
 * quel que soit le modèle (Llama, Mistral, Gemini, Claude…). Chaque problème est décrit
 * en une phrase que le modèle peut corriger.
 */
export function checkDrafts(suggestions, context) {
    const issues = [];
    const allowed = new Set(extractFacts(context.source));
    suggestions.reponses.forEach((reponse, index) => {
        issues.push(...checkText(reponse.texte, index, context, allowed));
    });
    const texts = suggestions.reponses.map((r) => r.texte);
    for (let i = 1; i < texts.length; i++) {
        for (let j = 0; j < i; j++) {
            if (similarity(texts.at(i) ?? '', texts.at(j) ?? '') > 0.8) {
                issues.push({
                    index: i,
                    code: 'doublon',
                    message: `répète presque mot pour mot le brouillon ${j + 1}`,
                });
                break;
            }
        }
    }
    return issues;
}
/** Contrôle d'UN brouillon (aussi utilisé pour une retouche : même exigence partout). */
export function checkText(texte, index, context, allowed = new Set(extractFacts(context.source))) {
    const issues = [];
    const reponse = { texte };
    const raw = reponse.texte.trim();
    const text = normalize(raw);
    if (raw.length < 2) {
        issues.push({ index, code: 'vide', message: 'est vide' });
        return issues;
    }
    if (ADVISOR.some((pattern) => pattern.test(text))) {
        issues.push({
            index,
            code: 'conseiller',
            message: 'parle comme un assistant ou un conseiller au lieu d’être le message de l’utilisateur',
        });
    }
    const invented = extractFacts(raw).filter((fact) => !allowed.has(fact));
    if (invented.length > 0) {
        issues.push({
            index,
            code: 'fait-invente',
            message: `cite ${invented.map((f) => `« ${f} »`).join(', ')}, absent de la conversation`,
        });
    }
    // Un code donné, ou une suite de 4 à 8 chiffres qui n'apparaît pas dans la conversation.
    const digits = raw.match(/\b\d{4,8}\b/g) ?? [];
    if (GIVES_SECRET.test(text) || digits.some((d) => !context.source.includes(d))) {
        issues.push({
            index,
            code: 'secret',
            message: 'contient un code ou une suite de chiffres sensible',
        });
    }
    // Un remplaçant présent dans la conversation (« [NOM 1] ») est voulu : le téléphone remettra
    // le vrai nom. Seul un remplaçant inventé par le modèle est une faute.
    const placeholders = raw.match(new RegExp(PLACEHOLDER.source, 'gi')) ?? [];
    if (placeholders.some((p) => !context.source.includes(p))) {
        issues.push({
            index,
            code: 'masque',
            message: 'contient encore un nom masqué entre crochets',
        });
    }
    if (raw.length > 350) {
        issues.push({
            index,
            code: 'trop-long',
            message: 'est trop long pour un message WhatsApp (350 caractères max)',
        });
    }
    const sourceText = normalize(context.source);
    if (LIFE_STORY.test(text) && !LIFE_STORY.test(sourceText)) {
        issues.push({
            index,
            code: 'vie-inventee',
            message: 'raconte quelque chose de ta vie qui n’est pas dans la conversation',
        });
    }
    else {
        const thing = THINGS.find((t) => new RegExp(`\\b${t}s?\\b`).test(text) && !new RegExp(`\\b${t}s?\\b`).test(sourceText));
        if (thing) {
            issues.push({
                index,
                code: 'vie-inventee',
                message: `parle d’un ${thing} dont la conversation ne parle pas`,
            });
        }
    }
    if (/\bje (te |vous )?peux\b/.test(text) && /\bje ne (te |vous )?peux pas\b/.test(text)) {
        issues.push({
            index,
            code: 'incoherent',
            message: 'se contredit (« je peux » puis « je ne peux pas »)',
        });
    }
    // « ok merci je suis là merci » : un tic répété sonne faux.
    const seen = new Set();
    const repeated = text
        .split(/[^a-z']+/)
        .filter((w) => w.length >= 3 && !['les', 'des', 'que', 'pas', 'est', 'une', 'pour'].includes(w))
        .find((w) => (seen.has(w) ? true : (seen.add(w), false)));
    if (repeated &&
        text.split(/\s+/).length <= 15 &&
        !issues.some((i) => i.index === index && i.code === 'incoherent')) {
        issues.push({ index, code: 'repetition', message: `répète « ${repeated} »` });
    }
    if (context.registre === 'vous' && /\b(tu|te|toi|ton|ta|tes)\b|\bt'/.test(text)) {
        issues.push({
            index,
            code: 'registre',
            message: 'tutoie alors qu’il faut vouvoyer cette personne',
        });
    }
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (context.motsMoyens && wordCount > Math.max(12, Math.round(context.motsMoyens * 2.2))) {
        issues.push({
            index,
            code: 'style',
            message: `fait ${wordCount} mots alors que l’utilisateur écrit d’habitude environ ${Math.round(context.motsMoyens)} mots`,
        });
    }
    if ((context.scam === 'eleve' || context.scam === 'moyen') && YIELDS_TO_SCAM.test(text)) {
        issues.push({
            index,
            code: 'cede-arnaque',
            message: 'accepte la demande alors que le message ressemble à une arnaque',
        });
    }
    return issues;
}
//# sourceMappingURL=check.js.map