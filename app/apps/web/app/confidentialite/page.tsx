import { LegalPage } from '@/components/LegalPage';

export const metadata = { title: 'Politique de confidentialité — Six' };

export default function Page() {
  return (
    <LegalPage
      titre="Politique de confidentialité"
      miseAJour="21 novembre 2026"
      intro="Cette politique explique quelles données Six traite, dans quel but, où elles sont conservées et comment vous pouvez les effacer. Notre principe : vos données restent sur votre appareil, sauf si vous choisissez vous-même de les copier sur votre compte."
      sections={[
        {
          titre: 'Responsable du traitement',
          texte: [
            'Six est un service édité par Seven.AI, Kinshasa (République démocratique du Congo). Pour toute question relative à vos données : sevenai.dc@gmail.com.',
            'Seven.AI ne vend pas vos données et n’utilise aucune publicité ciblée.',
          ],
        },
        {
          titre: 'Messages et captures d’écran',
          texte: [
            'Vous choisissez le texte ou l’image à analyser. La lecture des captures d’écran se fait sur votre appareil. Avant tout envoi, Six remplace localement les noms, numéros, adresses e-mail et autres éléments reconnus par des repères, et vous montre exactement le texte qui sera transmis.',
            'Pour l’analyse et la rédaction, ce texte masqué passe par notre serveur puis par un prestataire d’intelligence artificielle. Le masquage automatique peut manquer un élément : vérifiez le texte affiché avant de continuer.',
            'Notre serveur n’enregistre pas le contenu des messages. Seules des données techniques sans contenu (par exemple le nombre d’appels) sont journalisées pour assurer le fonctionnement et la sécurité du service.',
          ],
        },
        {
          titre: 'Données conservées sur votre appareil',
          texte: [
            'La mémoire de Six (habitudes d’écriture résumées en nombres, notes que vous ajoutez sur vos contacts, rappels de suivi) est conservée dans le stockage de l’application, sur votre appareil. Ce que Six apprend est oublié après 90 jours.',
            'Lorsque la mémoire est activée, vos conversations terminées avec Six (un court extrait masqué et la réponse retenue) et vos échanges avec Seven AI sont également conservés sur votre appareil, jusqu’à ce que vous les effaciez. Ils ne sont jamais envoyés à votre compte.',
            'Vous pouvez consulter, effacer ou désactiver la mémoire à tout moment dans Réglages > Mémoire.',
          ],
        },
        {
          titre: 'Notifications (Android)',
          texte: [
            'Si vous autorisez l’accès aux notifications et choisissez des applications, Six reçoit les aperçus de notification de ces applications et conserve au plus les 25 plus récents dans le stockage privé de votre appareil.',
            'Aucun aperçu n’est envoyé à un prestataire d’intelligence artificielle tant que vous ne lancez pas vous-même une analyse. Vous pouvez effacer ces aperçus dans les Réglages ou retirer l’autorisation dans les réglages d’Android.',
          ],
        },
        {
          titre: 'Compte et copie de la mémoire',
          texte: [
            'La création d’un compte est facultative. Si vous en créez un, Six traite votre adresse e-mail pour l’authentification ainsi que votre prénom.',
            'Votre mémoire n’est copiée sur votre compte que si vous l’autorisez expressément (Réglages > Compte). Vous pouvez retirer cette autorisation à tout moment : la copie conservée sur le compte est alors effacée.',
            'Ces données sont hébergées par Supabase, dans une région située à Paris (Union européenne), avec des règles d’accès qui réservent chaque compte à son titulaire.',
          ],
        },
        {
          titre: 'Prestataires',
          texte: [
            'Le service s’appuie sur des prestataires d’hébergement, de base de données et d’intelligence artificielle, qui traitent uniquement les données nécessaires à leur prestation et appliquent leurs propres politiques de conservation.',
          ],
        },
        {
          titre: 'Vos droits',
          texte: [
            'Vous pouvez à tout moment interrompre une analyse, désactiver la mémoire, effacer vos notes, vos conversations conservées et les aperçus de notification.',
            'Pour accéder aux données de votre compte, les faire rectifier ou supprimer votre compte, écrivez à sevenai.dc@gmail.com en indiquant l’adresse e-mail associée au compte.',
          ],
        },
        {
          titre: 'Sécurité et modifications',
          texte: [
            'Les échanges entre l’application et nos services sont chiffrés (HTTPS). Aucun dispositif ne garantit toutefois une sécurité absolue.',
            'Cette politique pourra être mise à jour. En cas de changement important, vous en serez informé dans l’application.',
          ],
        },
      ]}
    />
  );
}
