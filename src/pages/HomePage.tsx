import { Experience } from "../experience/Experience";
import { Launch } from "../sections/Launch";
import { Privacy } from "../sections/Privacy";
import { SevenAi } from "../sections/SevenAi";
import { Faq } from "../sections/Faq";
import { usePageMeta } from "../hooks/usePageMeta";

// Accueil : la visite animée de Six (le guide d'utilisation, téléphone puis ordinateur),
// puis seulement ce que le guide ne montre pas : télécharger, la confidentialité, Seven.AI et les questions.
export function HomePage() {
  // Titre et description : ceux d'index.html.
  usePageMeta({});
  return (
    <>
      <Experience />
      <Launch />
      <Privacy />
      <SevenAi />
      <Faq />
    </>
  );
}
