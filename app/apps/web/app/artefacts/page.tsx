'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppBar } from '@/components/AppBar';
import { ecouterChats, lireChats } from '@/lib/seven-chats';
import { versionsDe } from '@/lib/artefacts';
export default function Page() {
  const [chats, setChats] = useState<ReturnType<typeof lireChats>>([]);
  useEffect(() => {
    const lire = () => setChats(lireChats());
    lire();
    return ecouterChats(lire);
  }, []);
  const fichiers = chats.flatMap((c) =>
    Array.from(
      versionsDe(c.messages.filter((m) => m.role === 'assistant').map((m) => m.content)).keys(),
      (nom) => ({
        nom,
        id: c.id,
        titre: c.titre,
        base: c.mode === 'sixtouch' ? '/cosinus' : '/chat',
      }),
    ),
  );
  return (
    <div className="app">
      <main className="screen">
        <AppBar page="artefacts" titre="Artéfacts" />
        <section className="catalogue-six">
          <h1>Artéfacts</h1>
          {fichiers.length ? (
            <div className="catalogue-grille">
              {fichiers.map((f) => (
                <Link href={f.base + '?c=' + encodeURIComponent(f.id)} key={f.id + ':' + f.nom}>
                  <span>
                    <strong>{f.nom}</strong>
                    <small>{f.titre}</small>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p>Aucun artéfact dans vos discussions.</p>
          )}
        </section>
      </main>
    </div>
  );
}
