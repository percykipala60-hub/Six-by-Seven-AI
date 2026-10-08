import { Globe } from "lucide-react";
import { footer } from "../../content/site";
import { currentLanguage, setLanguage } from "../../i18n/autoTranslate";
import styles from "./Footer.module.css";

// Choix de la langue du site, dans le pied de page. La traduction est faite automatiquement par
// Google Traduction ; le sélecteur lui-même n'est jamais traduit (classe « notranslate »).
export function LanguagePicker() {
  const current = currentLanguage();
  return (
    <label className={`${styles.language} notranslate`} translate="no">
      <Globe size={15} aria-hidden="true" />
      <select value={current} onChange={(e) => setLanguage(e.target.value)} aria-label={footer.languageLabel}>
        {footer.languages.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
