/**
 * Chat de l'app de bureau : la demande passe-t-elle par le web (ouvrir un site, chercher en ligne, cliquer,
 * remplir) ? Alors Six pilote le navigateur interne ; sinon il répond directement, plus vite.
 */
const NAVIGATION =
  /\b(ouvre|ouvrir|va sur|aller sur|rends-toi sur|navigue|naviguer|clique|cliquer|remplis|remplir|connecte-toi sur|cherche sur (le )?(web|internet|google)|recherche sur (le )?(web|internet|google)|sur le site|site web|page web|dans le navigateur|onglet)\b|https?:\/\/|www\.|\b[a-z0-9-]+\.(com|org|net|fr|cd|io|gov|edu)\b/i;

export function demandeNavigation(question: string): boolean {
  return NAVIGATION.test(question);
}
