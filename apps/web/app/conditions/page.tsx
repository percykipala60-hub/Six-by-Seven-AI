import { LegalPage } from '@/components/LegalPage';

export const metadata = { title: 'Conditions et mentions légales — Six' };

export default function Page() {
  return (
    <LegalPage
      titre="Conditions et mentions légales"
      miseAJour="21 novembre 2026"
      intro="Les présentes conditions régissent l’utilisation de Six, service édité par Seven.AI. En utilisant Six ou en créant un compte, vous les acceptez. Les mentions légales figurent à la suite."
      sections={[
        {
          titre: 'Objet du service',
          texte: [
            'Six analyse le texte que vous lui soumettez et propose des explications, des réponses et des contenus ludiques. Six n’envoie jamais de message à votre place : vous décidez de ce que vous copiez, modifiez et envoyez.',
            'Les réponses sont produites automatiquement. Elles peuvent être incomplètes ou inexactes et ne remplacent pas votre jugement. Vérifiez les faits et le destinataire avant d’agir.',
          ],
        },
        {
          titre: 'Engagements de l’utilisateur',
          texte: [
            'Vous êtes responsable des textes et images que vous soumettez et devez disposer du droit de les utiliser.',
            'Il est interdit d’utiliser Six pour harceler, menacer, tromper, usurper l’identité d’une personne ou porter atteinte aux droits d’autrui.',
            'Il est interdit de chercher à contourner les limites d’utilisation, à perturber le service ou à accéder aux comptes et systèmes d’autrui.',
          ],
        },
        {
          titre: 'Limites du service',
          texte: [
            'La détection d’arnaques et l’estimation de la tension sont fournies à titre indicatif. L’absence d’alerte ne garantit pas qu’un lien, un paiement ou un message soit sûr. En cas de doute, contactez l’organisme concerné par un canal officiel.',
            'Le service peut être interrompu, modifié ou soumis à des limites d’utilisation. Seven.AI ne garantit ni une disponibilité permanente ni un résultat particulier.',
          ],
        },
        {
          titre: 'Données personnelles',
          texte: [
            'Le traitement de vos données est décrit dans la Politique de confidentialité, qui fait partie des présentes conditions.',
          ],
        },
        {
          titre: 'Droit applicable et contact',
          texte: [
            'Les présentes conditions sont régies par le droit de la République démocratique du Congo, sous réserve des dispositions impératives dont vous bénéficiez.',
            'Pour toute question : sevenai.dc@gmail.com.',
          ],
        },
        {
          titre: 'Mentions légales : éditeur',
          texte: [
            'Six est édité par Seven.AI, Kinshasa, République démocratique du Congo.',
            'Responsable de la publication : Seven.AI.',
            'Contact : sevenai.dc@gmail.com.',
          ],
        },
        {
          titre: 'Hébergement',
          texte: [
            'L’application web est hébergée par Netlify, Inc. (États-Unis). Les comptes sont hébergés par Supabase, dans une région située à Paris (Union européenne).',
          ],
        },
        {
          titre: 'Intelligence artificielle',
          texte: [
            'L’analyse et la rédaction font appel à des prestataires d’intelligence artificielle, actuellement Anthropic et, en secours, OpenAI (États-Unis). Seul le texte masqué leur est transmis.',
            'Les captures d’écran sont lues sur l’appareil de l’utilisateur et ne sont jamais envoyées.',
          ],
        },
        {
          titre: 'Propriété intellectuelle',
          texte: [
            'Le nom Six, le logo et l’identité visuelle appartiennent à Seven.AI.',
            'Les noms et icônes des messageries citées dans l’application appartiennent à leurs propriétaires respectifs. Ils servent uniquement à ouvrir l’application correspondante ; Six n’est affilié à aucune d’entre elles. Tracés des icônes : Simple Icons (licence CC0).',
          ],
        },
      ]}
    />
  );
}
