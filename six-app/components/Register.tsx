"use client";

import { useEffect, useState } from "react";

/** Enregistre le service worker (production seulement) et affiche un bandeau quand le réseau coupe. */
export function Register() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* l'app marche sans, simplement pas hors-ligne */
      });
    }
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="demo" role="status" style={{ margin: "8px 16px 0" }}>
      Pas de réseau. Tu peux continuer à préparer ton texte, l&apos;analyse reprendra au retour du réseau.
    </div>
  );
}
