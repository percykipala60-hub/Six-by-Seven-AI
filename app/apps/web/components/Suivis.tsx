'use client';

import { useEffect, useState } from 'react';
import { lireMemoire, retirerSuivi, type Suivi } from '@/lib/memoire';
import { Icon } from './Icon';

// Lien d'application pour rouvrir la bonne conversation (même liste que l'écran d'export).
const LIENS: Record<string, [string, string]> = {
  whatsapp: ['WhatsApp', 'whatsapp://'],
  sms: ['SMS', 'sms:'],
  email: ['E-mail', 'mailto:'],
  messenger: ['Messenger', 'fb-messenger://'],
  facebook: ['Facebook', 'fb://'],
  instagram: ['Instagram', 'instagram://'],
  telegram: ['Telegram', 'tg://'],
  linkedin: ['LinkedIn', 'linkedin://'],
  tiktok: ['TikTok', 'tiktok://'],
  x: ['X', 'twitter://'],
};

function quand(t: number): string {
  const d = new Date(t);
  const auj = new Date();
  const demain = new Date(auj.getFullYear(), auj.getMonth(), auj.getDate() + 1);
  const h = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (t <= Date.now()) return 'maintenant';
  if (d.toDateString() === auj.toDateString()) return `aujourd'hui à ${h}`;
  if (d.toDateString() === demain.toDateString()) return `demain à ${h}`;
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

/**
 * Le secrétaire de Six dans le menu latéral, comme l'historique des apps d'IA : les suivis notés après une réponse,
 * le plus proche d'abord. Toucher un suivi rouvre l'app de la conversation ; la coche le marque fait.
 */
export function Suivis() {
  const [suivis, setSuivis] = useState<Suivi[]>([]);

  useEffect(() => {
    const lire = () => setSuivis([...lireMemoire().suivis].sort((a, b) => a.quand - b.quand));
    lire();
    window.addEventListener('six-memoire', lire);
    const minute = window.setInterval(lire, 60_000);
    return () => {
      window.removeEventListener('six-memoire', lire);
      window.clearInterval(minute);
    };
  }, []);

  if (!suivis.length) return null;
  return (
    <section className="drawer-section" aria-labelledby="suivis-titre">
      <h2 className="drawer-titre" id="suivis-titre">
        À suivre
      </h2>
      {suivis.slice(0, 5).map((s) => {
        const lien = s.canal ? LIENS[s.canal] : undefined;
        const du = s.quand <= Date.now();
        const texte = (
          <>
            <span>{s.qui}</span>
            <small>
              {lien ? `${lien[0]}, ` : ''}
              {quand(s.quand)}
            </small>
          </>
        );
        return (
          <div className="row" key={s.id} style={{ gap: 2 }}>
            {lien ? (
              <a className={`drawer-item drawer-suivi grow${du ? ' du' : ''}`} href={lien[1]}>
                {texte}
              </a>
            ) : (
              <span className={`drawer-item drawer-suivi grow${du ? ' du' : ''}`}>{texte}</span>
            )}
            <button
              className="appbar-btn"
              onClick={() => retirerSuivi(s.id)}
              aria-label={`Marquer fait : ${s.qui}`}
            >
              <Icon name="check" size={18} />
            </button>
          </div>
        );
      })}
    </section>
  );
}
