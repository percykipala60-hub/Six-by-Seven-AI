import { LegalPage } from '@/components/LegalPage';

export const metadata = { title: "Conditions d'utilisation — Six" };

export default function Page() {
  return (
    <LegalPage
      titre="Conditions d'utilisation"
      intro="Dernière mise à jour : 20 octobre 2026. Six est un service de Seven.AI (projet PBL5, Groupe 7, ULC-Icam, Kinshasa). En créant un compte ou en utilisant Six, tu acceptes ces conditions."
      sections={[
        {
          titre: 'Ce que fait Six',
          texte: [
            "Six analyse le texte que tu choisis et peut proposer des explications, des réponses ou des jeux. Six n'envoie pas de message à ta place : tu décides quoi copier, modifier et envoyer.",
            'Les réponses sont générées automatiquement, peuvent être incomplètes ou erronées et ne remplacent pas ton jugement. Vérifie les faits et le destinataire avant d’agir.',
          ],
        },
        {
          titre: "Ce que tu t'engages à faire",
          texte: [
            'Tu es responsable des textes et images que tu soumets et tu dois avoir le droit de les utiliser.',
            "N'utilise pas Six pour harceler, menacer, tromper, usurper l'identité d'une personne ou enfreindre les droits d'autrui.",
            'Ne tente pas de contourner les quotas, de perturber le service ou d’accéder aux comptes et systèmes d’autrui.',
          ],
        },
        {
          titre: 'Limites du service',
          texte: [
            "Le détecteur d'arnaques et l'estimation de tension sont indicatifs. Une absence d'alerte ne signifie pas qu'un lien, un paiement ou un message est sûr. En cas de doute, vérifie auprès de l'organisme concerné par un canal officiel.",
            'Le service peut connaître des interruptions, évoluer ou appliquer des limites d’usage. Nous ne garantissons pas une disponibilité permanente ni un résultat particulier.',
          ],
        },
        {
          titre: 'Données',
          texte: [
            'Les traitements, fournisseurs, durées et moyens de suppression sont décrits dans la page Confidentialité. Les fournisseurs externes appliquent leurs propres conditions et règles de conservation.',
          ],
        },
        {
          titre: 'Contact et droit applicable',
          texte: [
            'Contact : sevenai.dc@gmail.com.',
            'Pour toute question : sevenai.dc@gmail.com. Ces conditions sont régies par le droit applicable en République démocratique du Congo, sous réserve des droits obligatoires dont tu bénéficies.',
          ],
        },
      ]}
    />
  );
}
