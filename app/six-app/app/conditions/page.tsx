import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Conditions d'utilisation — Six" };

export default function Page() {
  return (
    <LegalPage
      titre="Conditions d'utilisation"
      intro="Six est un assistant d'aide à la rédaction proposé par Seven.AI. En l'utilisant, tu acceptes ces règles simples."
      sections={[
        {
          titre: "Ce que fait Six",
          texte: [
            "Six lit le texte que tu fournis, le résume et te propose des réponses. Il n'envoie jamais de message à ta place : tu choisis, tu modifies et tu envoies toi-même.",
            "Les réponses sont des suggestions. Relis-les avant de les envoyer : tu restes responsable de ce que tu écris.",
          ],
        },
        {
          titre: "Ce que tu t'engages à faire",
          texte: [
            "Utiliser Six pour des conversations auxquelles tu participes réellement.",
            "Ne pas t'en servir pour harceler, tromper ou manipuler quelqu'un.",
            "Ne pas chercher à perturber le service (envois massifs, contournement des limites).",
          ],
        },
        {
          titre: "Limites du service",
          texte: [
            "Le détecteur d'arnaques est une aide, pas une garantie : l'absence d'alerte ne prouve pas qu'un message est sûr.",
            "Le service peut être interrompu ou limité (quotas par jour). Nous ne garantissons pas une disponibilité permanente.",
          ],
        },
        {
          titre: "Données",
          texte: ["Le traitement de tes données est décrit dans la page Confidentialité. Aucune conversation n'est conservée."],
        },
        {
          titre: "Contact et droit applicable",
          texte: ["Contact : [À compléter : adresse e-mail de Seven.AI].", "Droit applicable et juridiction : [À compléter avec l'équipe et l'enseignant]."],
        },
      ]}
    />
  );
}
