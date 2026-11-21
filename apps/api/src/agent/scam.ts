/** Règles anti-arnaque : partagées avec la PWA (règles locales d'abord, sans réseau). */
export {
  detectScam,
  looksLikePhoneNumber,
  normalize,
  type ScamLevel,
  type ScamReport,
} from '@six/shared';
