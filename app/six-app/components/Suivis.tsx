"use client";

import { useEffect, useState } from "react";
import { lireMemoire, retirerSuivi, type Suivi } from "@/lib/memoire";
import { Icon } from "./Icon";

// Lien d'application pour rouvrir la bonne conversation (même liste que l'écran d'export).
const LIENS: Record<string, [string, string]> = {
  whatsapp: ["WhatsApp", "whatsapp://"], sms: ["SMS", "sms:"], email: ["E-mail", "mailto:"], messenger: ["Messenger", "fb-messenger://"],
  facebook: ["Facebook", "fb://"], instagram: ["Instagram", "instagram://"], telegram: ["Telegram", "tg://"], linkedin: ["LinkedIn", "linkedin://"],
  tiktok: ["TikTok", "tiktok://"], x: ["X", "twitter://"],
};

function quand(t: number): string {
  const d = new Date(t);
  const auj = new Date();
  const demain = new Date(auj.getFullYear(), auj.getMonth(), auj.getDate() + 1);
  const h = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (t <= Date.now()) return "maintenant";
  if (d.toDateString() === auj.toDateString()) return `aujourd'hui à ${h}`;
  if (d.toDateString() === demain.toDateString()) return `demain à ${h}`;
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

/** Le secrétaire de Six sur l'accueil : les suivis notés après une réponse, le plus proche d'abord. */
export function Suivis() {
  const [suivis, setSuivis] = useState<Suivi[]>([]);

  useEffect(() => {
    const lire = () => setSuivis([...lireMemoire().suivis].sort((a, b) => a.quand - b.quand));
    lire();
    window.addEventListener("six-memoire", lire);
    const minute = window.setInterval(lire, 60_000);
    return () => {
      window.removeEventListener("six-memoire", lire);
      window.clearInterval(minute);
    };
  }, []);

  if (!suivis.length) return null;
  return (
    <section className="stack" aria-labelledby="suivis-titre">
      <h2 className="lbl" id="suivis-titre">
        À suivre
      </h2>
      {suivis.slice(0, 3).map((s) => {
        const lien = s.canal ? LIENS[s.canal] : undefined;
        const du = s.quand <= Date.now();
        return (
          <div className={`card suivi${du ? " du" : ""}`} key={s.id}>
            <div className="grow">
              <b>{s.qui}</b>
              {s.quoi && <p className="muted small">{s.quoi}</p>}
              <p className="small suivi-quand">
                <Icon name="bell" size={14} /> {quand(s.quand)}
              </p>
            </div>
            <div className="suivi-acts">
              {lien && (
                <a className="act" href={lien[1]}>
                  {lien[0]}
                </a>
              )}
              <button className="btn ghost small" onClick={() => retirerSuivi(s.id)} aria-label={`Marquer fait : ${s.qui}`}>
                <Icon name="check" size={16} /> Fait
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
