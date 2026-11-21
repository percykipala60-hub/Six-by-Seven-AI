import { LegalPage } from '@/components/LegalPage';

export const metadata = { title: 'Mentions légales — Six' };

export default function Page() {
  return (
    <LegalPage
      titre="Mentions légales"
      intro="Informations sur l'éditeur du service."
      sections={[
        {
          titre: 'Éditeur',
          texte: [
            'Seven.AI, startup créée dans le cadre du projet PBL5 (Groupe 7), ULC-Icam, Kinshasa.',
            'Responsable de la publication : Seven.AI.',
            'Contact : sevenai.dc@gmail.com.',
          ],
        },
        {
          titre: "Prestataires d'intelligence artificielle",
          texte: [
            "L'analyse et la rédaction utilisent le service d'Anthropic (Claude) et, en secours, celui d'OpenAI (ChatGPT), tous deux aux États-Unis. Seul le texte masqué (sans noms, numéros, e-mails ni liens) leur est transmis.",
            "Les captures d'écran sont lues sur l'appareil de l'utilisateur et ne sont jamais envoyées.",
          ],
        },
        {
          titre: 'Propriété',
          texte: [
            "Le nom Six, le logo et l'identité visuelle appartiennent à Seven.AI.",
            "WhatsApp, Messenger, Instagram (Meta), Messages et Gmail (Google), Telegram, LinkedIn (Microsoft) et TikTok (ByteDance) sont des marques de leurs propriétaires. Leurs icônes servent seulement à ouvrir l'application correspondante ; Six n'est affilié à aucune d'elles. Tracés des icônes : Simple Icons (licence CC0).",
          ],
        },
      ]}
    />
  );
}
