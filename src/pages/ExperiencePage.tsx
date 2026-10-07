import { Experience } from "../experience/Experience";
import { Launch } from "../sections/Launch";
import { Features } from "../sections/Features";
import { Security } from "../sections/Security";
import { Privacy } from "../sections/Privacy";
import { SevenAi } from "../sections/SevenAi";
import { Faq } from "../sections/Faq";

// Page « Découvrir » : la visite animée, puis les sections habituelles du site (Télécharger d'abord).
// Destinée à remplacer l'accueil une fois validée.
export function ExperiencePage() {
  return (
    <>
      <Experience />
      <Launch />
      <Features />
      <Security />
      <Privacy />
      <SevenAi />
      <Faq />
    </>
  );
}
