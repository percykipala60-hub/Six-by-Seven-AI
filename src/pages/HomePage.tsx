import { Hero } from "../sections/Hero";
import { How } from "../sections/How";
import { Features } from "../sections/Features";
import { Security } from "../sections/Security";
import { Privacy } from "../sections/Privacy";
import { SevenAi } from "../sections/SevenAi";
import { Faq } from "../sections/Faq";
import { Launch } from "../sections/Launch";

export function HomePage() {
  return (
    <>
      <Hero />
      <How />
      <Features />
      <Security />
      <Privacy />
      <SevenAi />
      <Faq />
      <Launch />
    </>
  );
}
