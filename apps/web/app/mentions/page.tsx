import { LegalPage } from '@/components/LegalPage';

export const metadata = { title: 'Mentions légales — Six' };

export default function Page() {
  return (
    <LegalPage
      titre="Mentions légales"
      miseAJour="21 novembre 2026"
      sections={[
        {
          titre: 'Éditeur',
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
