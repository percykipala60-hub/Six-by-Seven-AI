import type { ScamLevel } from '@six/shared';

const TITLE: Record<Exclude<ScamLevel, 'aucun'>, string> = {
  eleve: 'Risque élevé',
  moyen: 'Risque moyen',
  faible: 'Risque faible',
};

/**
 * Alerte arnaque : un niveau et des raisons lisibles. Jamais de pourcentage, et jamais de
 * message vert « tout va bien » : l'absence de signe n'est pas une garantie.
 */
export function ScamCard({ niveau, raisons }: { niveau: ScamLevel; raisons: string[] }) {
  if (niveau === 'aucun') {
    return (
      <p className="text-[13px] text-muted">
        Je n’ai pas repéré de signe d’arnaque. Ça ne garantit rien : reste attentif aux demandes
        d’argent ou de code.
      </p>
    );
  }
  if (niveau === 'faible') {
    return (
      <div className="rounded-2xl border border-line px-4 py-3 text-[13px] text-muted">
        <p className="font-semibold text-text">{TITLE.faible}</p>
        <ul className="mt-1 list-disc pl-5">
          {raisons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <section
      role="alert"
      aria-label={TITLE[niveau]}
      className="rounded-[20px] border-2 border-alert bg-alert/10 px-4 py-3.5"
    >
      <p className="flex items-center gap-2 font-display text-base font-semibold text-alert">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3l9.5 17H2.5L12 3z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M12 10v4.5M12 17.5v.01"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
        {TITLE[niveau]}
      </p>
      <p className="mt-1 text-[15px] font-semibold text-text">
        Ne donne ni code, ni argent, ni information personnelle.
      </p>
      <ul className="mt-2 flex flex-col gap-1.5 text-[14px] text-alert-soft">
        {raisons.map((r) => (
          <li key={r} className="flex gap-2">
            <span aria-hidden="true">•</span>
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
