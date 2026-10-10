import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { X } from "lucide-react";
import { cookies } from "../../content/site";
import {
  acceptAll,
  closeConsentPanel,
  hasConsent,
  openConsentPanel,
  refuseAll,
  saveConsent,
  useConsent,
  type ConsentCategory,
} from "../../consent/consent";
import styles from "./CookieConsent.module.css";

// Bandeau de consentement (tant qu'aucun choix n'est fait) et panneau « Personnaliser », que le lien
// « Gérer les cookies » du pied de page rouvre à tout moment. Le bandeau ne bloque pas la page : on peut
// lire le site sans répondre, et rien d'optionnel n'est activé en attendant.
export function CookieConsent() {
  const { stored, panelOpen } = useConsent();
  const showBanner = !stored && !panelOpen;
  return (
    <>
      {showBanner && (
        <section className={styles.banner} role="region" aria-labelledby="cookie-title">
          <h2 id="cookie-title">{cookies.title}</h2>
          <p>
            {cookies.text}{" "}
            <Link to={cookies.policyHref}>{cookies.policy}</Link>
          </p>
          <div className={`${styles.actions} ${styles.bannerActions}`}>
            <button type="button" className={styles.ghost} onClick={openConsentPanel}>
              {cookies.customize}
            </button>
            <button type="button" className={styles.solid} onClick={refuseAll}>
              {cookies.refuseAll}
            </button>
            <button type="button" className={styles.solid} onClick={acceptAll}>
              {cookies.acceptAll}
            </button>
          </div>
        </section>
      )}
      {panelOpen && <Panel />}
    </>
  );
}

// Panneau de réglage par catégorie, dans une vraie boîte de dialogue (focus gardé à l'intérieur, Échap ferme).
function Panel() {
  const ref = useRef<HTMLDialogElement>(null);
  const [choices, setChoices] = useState<Record<ConsentCategory, boolean>>(() => ({
    audience: hasConsent("audience"),
    translation: hasConsent("translation"),
  }));
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  return (
    <dialog ref={ref} className={styles.panel} aria-labelledby="cookie-panel-title" onClose={closeConsentPanel}>
      <div className={styles.head}>
        <h2 id="cookie-panel-title">{cookies.panelTitle}</h2>
        <button type="button" className={styles.close} onClick={closeConsentPanel} aria-label={cookies.close}>
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <p className={styles.intro}>
        {cookies.panelIntro} <Link to={cookies.policyHref} onClick={closeConsentPanel}>{cookies.policy}</Link>
      </p>
      <ul className={styles.list}>
        {cookies.categories.map((c) => {
          const locked = c.id === "necessary";
          const id = `cookie-${c.id}`;
          return (
            <li key={c.id}>
              <div className={styles.row}>
                {locked ? <span className={styles.name}>{c.title}</span> : <label htmlFor={id} className={styles.name}>{c.title}</label>}
                {locked ? (
                  <span className={styles.always}>{cookies.alwaysOn}</span>
                ) : (
                  <input
                    id={id}
                    type="checkbox"
                    role="switch"
                    className={styles.switch}
                    checked={choices[c.id]}
                    aria-describedby={`${id}-text`}
                    onChange={(e) => setChoices({ ...choices, [c.id]: e.target.checked })}
                  />
                )}
              </div>
              <p id={`${id}-text`}>{c.text}</p>
            </li>
          );
        })}
      </ul>
      <div className={styles.actions}>
        <button type="button" className={styles.ghost} onClick={refuseAll}>
          {cookies.refuseAll}
        </button>
        <button type="button" className={styles.ghost} onClick={acceptAll}>
          {cookies.acceptAll}
        </button>
        <button type="button" className={styles.solid} onClick={() => saveConsent(choices)}>
          {cookies.save}
        </button>
      </div>
    </dialog>
  );
}
