import Link from 'next/link';
import { AppBar } from './AppBar';
import { Icon } from './Icon';

export interface LegalSection {
  titre: string;
  texte: string[];
}

/** Page légale (Conditions, Mentions) : titre, introduction et sections. */
export function LegalPage({
  titre,
  intro,
  sections,
}: {
  titre: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <div className="app">
      <AppBar page="confidentialite" titre={titre} />
      <main className="screen">
        <Link href="/confidentialite" className="link">
          <Icon name="back" size={16} /> Confidentialité
        </Link>
        <h1>{titre}</h1>
        <p className="muted">{intro}</p>
        <div className="stack">
          {sections.map((s) => (
            <section className="card" key={s.titre}>
              <h2 style={{ fontSize: '1.05rem', marginBottom: 6 }}>{s.titre}</h2>
              {s.texte.map((t) => (
                <p className="muted small" style={{ marginTop: 6 }} key={t}>
                  {t}
                </p>
              ))}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
