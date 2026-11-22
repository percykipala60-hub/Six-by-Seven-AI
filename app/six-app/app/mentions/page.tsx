import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Mentions légales — Six" };

export default function Page() {
  return (
    <LegalPage
      titre="Mentions légales"
      intro="Informations sur l'éditeur et l'hébergement du service."
      sections={[
        {
          titre: "Éditeur",
          texte: [
            "Seven.AI, startup créée dans le cadre du projet PBL5 (Groupe 7), ULC-Icam, Kinshasa.",
            "Responsable de la publication : [À compléter : nom du CEO].",
            "Contact : [À compléter : adresse e-mail].",
          ],
        },
        {
          titre: "Hébergement",
          texte: ["Application et API : [À compléter : hébergeur choisi par l'équipe]."],
        },
        {
          titre: "Prestataires d'intelligence artificielle",
          texte: [
            "La rédaction des réponses utilise le service d'Anthropic (Claude). Seul le texte masqué (sans noms, numéros, e-mails ni liens) lui est transmis.",
            "Les captures d'écran sont lues sur l'appareil de l'utilisateur et ne sont jamais envoyées.",
          ],
        },
        {
          titre: "Propriété",
          texte: [
            "Le nom Six, le logo et l'identité visuelle appartiennent à Seven.AI.",
            "WhatsApp, Messenger, Instagram (Meta), Messages et Gmail (Google), Telegram, LinkedIn (Microsoft) et TikTok (ByteDance) sont des marques de leurs propriétaires. Leurs icônes servent seulement à ouvrir l'application correspondante ; Six n'est affilié à aucune d'elles. Tracés des icônes : Simple Icons (licence CC0).",
          ],
        },
      ]}
    />
  );
}
