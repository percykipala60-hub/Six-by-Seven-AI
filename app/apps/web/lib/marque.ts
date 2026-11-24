/**
 * Noms de marque, à un seul endroit : pour changer le nom de l'entreprise, il suffit de modifier ENTREPRISE.
 *
 * Règle d'affichage : « Six » est le nom mis en avant partout (titres, en-têtes, logo). L'entreprise n'apparaît que
 * de façon discrète (pied de page, mentions, réponse de Six quand on lui demande qui l'a créé).
 *
 * Ne changent pas avec la marque : le domaine sixbysevenai.com et les identifiants des stores (com.sevenai.six…),
 * qui ne peuvent pas être renommés sans republier l'app.
 */
export const PRODUIT = 'Six';
export const ENTREPRISE = 'Seven.AI';
/** Signature discrète (pied de page, propriétés des documents). */
export const SIGNATURE = `${PRODUIT} · ${ENTREPRISE}`;
