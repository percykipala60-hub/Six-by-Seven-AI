import { LegalPage } from '@/components/LegalPage';

export const metadata = { title: "Conditions d'utilisation — Six" };

export default function Page() {
  return (
    <LegalPage
      titre="Conditions d’utilisation"
      miseAJour="21 novembre 2026"
      intro="Les présentes conditions régissent l’utilisation de Six, service édité par Seven.AI. En utilisant Six ou en créant un compte, vous les acceptez."
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
      ]}
    />
  );
}
