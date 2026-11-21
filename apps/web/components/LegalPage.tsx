'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { EnteteSousPage } from './Liste';

export interface LegalSection {
  titre: string;
  texte: string[];
}

/**
 * Page juridique (Confidentialité, Conditions, Mentions) mise en page comme un document : titre, date de mise à
 * jour, sections numérotées séparées par un trait fin, texte en pleine couleur pour rester bien lisible.
 */
export function LegalPage({
  titre,
  miseAJour,
  intro,
  sections,
}: {
  titre: string;
  miseAJour: string;
  intro?: string;
  sections: LegalSection[];
}) {
  const router = useRouter();
  return (
    <div className="app">
      <main className="screen sub doc">
        <EnteteSousPage
          titre=""
          retour="Retour"
          onRetour={() => (window.history.length > 1 ? router.back() : router.push('/reglages'))}
        />
        <header className="doc-tete">
          <h1>{titre}</h1>
          <p className="doc-date">Dernière mise à jour : {miseAJour}</p>
          {intro && <p className="doc-intro">{intro}</p>}
        </header>
        {sections.map((s, i) => (
          <section className="doc-section" key={s.titre}>
            <h2>
              <span className="doc-num">{i + 1}.</span> {s.titre}
            </h2>
            {s.texte.map((t) => (
              <p key={t}>{t}</p>
            ))}
          </section>
        ))}
        <nav className="doc-liens" aria-label="Autres documents">
          <Link href="/confidentialite">Politique de confidentialité</Link>
          <Link href="/conditions">Conditions d’utilisation</Link>
          <Link href="/mentions">Mentions légales</Link>
        </nav>
      </main>
    </div>
  );
}
