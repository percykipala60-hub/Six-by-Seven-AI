import { Experience } from "../experience/Experience";
import { Launch } from "../sections/Launch";
import { Features } from "../sections/Features";
import { Security } from "../sections/Security";
import { Privacy } from "../sections/Privacy";
import { Manifesto } from "../sections/Manifesto";
import { SevenAi } from "../sections/SevenAi";
import { Faq } from "../sections/Faq";

// Accueil : la visite animée de Six au défilement (téléphone puis ordinateur),
// puis les sections habituelles, Télécharger d'abord.
export function HomePage() {
  return (
    <>
      <Experience />
      <Launch />
      <Features />
      <Security />
      <Privacy />
      <Manifesto />
      <SevenAi />
      <Faq />
    </>
  );
}
