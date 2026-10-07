import { Experience } from "../experience/Experience";
import { Launch } from "../sections/Launch";
import { Privacy } from "../sections/Privacy";
import { SevenAi } from "../sections/SevenAi";
import { Faq } from "../sections/Faq";

// Accueil : la visite animée de Six (le guide d'utilisation, téléphone puis ordinateur),
// puis seulement ce que le guide ne montre pas : télécharger, la confidentialité, Seven.AI et les questions.
export function HomePage() {
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
