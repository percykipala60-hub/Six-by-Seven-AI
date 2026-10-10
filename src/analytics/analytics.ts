import { analytics } from "../content/site";
import { hasConsent, onConsentChange } from "../consent/consent";

// Mesure d'audience avec Google Analytics 4, seulement avec l'accord du visiteur (catégorie « Mesure
// d'audience » du bandeau cookies) :
// - rien n'est chargé ni déposé tant que l'accord n'est pas donné ;
// - si l'accord est retiré, la mesure s'arrête aussitôt et les cookies de Google Analytics sont effacés ;
// - cookies gardés 13 mois au plus (recommandation de la CNIL), pas de signaux publicitaires.
// Les changements de page (le site ne recharge pas la page) sont comptés par Google Analytics lui-même
// (« mesure améliorée », active par défaut sur le flux de données).
// L'identifiant de mesure n'est pas un secret : il est fait pour être dans la page.

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}

const ID = analytics.gaMeasurementId;
const THIRTEEN_MONTHS = 60 * 60 * 24 * 395;
let loaded = false;

function load() {
  window[`ga-disable-${ID}`] = false;
  if (loaded) {
    window.gtag?.("consent", "update", { analytics_storage: "granted" });
    return;
  }
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // gtag.js attend l'objet « arguments » lui-même.
    window.dataLayer!.push(arguments);
  };
  window.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  window.gtag("js", new Date());
  window.gtag("config", ID, {
    cookie_expires: THIRTEEN_MONTHS,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ID)}`;
  document.head.appendChild(script);
}

function stop() {
  window[`ga-disable-${ID}`] = true;
  window.gtag?.("consent", "update", { analytics_storage: "denied" });
  // Effacer les cookies déjà déposés (_ga, _ga_XXXX), sur le domaine exact et le domaine parent.
  const host = window.location.hostname;
  const parent = host.split(".").slice(-2).join(".");
  for (const name of document.cookie.split(";").map((c) => c.split("=")[0].trim())) {
    if (!name.startsWith("_ga")) continue;
    for (const d of ["", `; domain=${host}`, `; domain=.${host}`, `; domain=.${parent}`]) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d}`;
    }
  }
}

export function startAnalytics() {
  // Pas d'identifiant renseigné, ou site en développement : aucune mesure.
  if (!ID || import.meta.env.DEV) return;
  // Sans accord, on efface aussi d'éventuels cookies d'une visite précédente (accord retiré ou expiré).
  const apply = () => (hasConsent("audience") ? load() : stop());
  apply();
  onConsentChange(apply);
}
