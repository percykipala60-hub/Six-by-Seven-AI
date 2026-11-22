'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { anonymize, restore } from '@/lib/anonymize';
import { heuristicScam, SCAM_THRESHOLD } from '@/lib/scam';
import { loadStyle } from '@/lib/style';
import { entetesCompte } from '@/lib/premium-client';
import { MAX_CHARS, type RepliesResult, type Ton } from '@/lib/types';
import { looksLikeWhatsApp, parseWhatsApp, speakerLabels, toConversation } from '@/lib/whatsapp';
import { Icon } from './Icon';
import { Logo } from './Logo';

/**
 * Panneau rapide de Six, ouvert par la bulle ou par le clavier Six, par-dessus la messagerie.
 * Il lit le message copié (fourni par l'app Android), le masque sur le téléphone, puis propose trois réponses.
 * Toucher une réponse la renvoie à l'app : le clavier l'écrit dans le champ de la messagerie, la bulle la copie.
 * Ouvert dans un navigateur (sans l'app), la réponse est simplement copiée.
 */
interface PontNatif {
  lirePressePapiers(): string;
  choisir(reponse: string): void;
  fermer(): void;
  source(): string;
}

function pont(): PontNatif | null {
  const w = window as unknown as { SixNatif?: PontNatif };
  return w.SixNatif ?? null;
}

const TONS_RAPIDES: { id: Ton; label: string }[] = [
  { id: 'amical', label: 'Amical' },
  { id: 'professionnel', label: 'Pro' },
  { id: 'chaleureux', label: 'Chaleureux' },
  { id: 'ferme', label: 'Ferme' },
  { id: 'court', label: 'Court' },
];

export function Rapide() {
  const [texte, setTexte] = useState('');
  const [ton, setTon] = useState<Ton>('amical');
  const [reponses, setReponses] = useState<string[]>([]);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const [arnaque, setArnaque] = useState(false);
  const [clavier, setClavier] = useState(false);
  const mapping = useRef<Record<string, string>>({});

  const demander = useCallback(async (brut: string, choixTon: Ton) => {
    let t = brut.trim();
    if (!t) return;
    if (looksLikeWhatsApp(t)) {
      const chat = parseWhatsApp(t);
      if (chat.messages.length) t = toConversation(chat.messages, MAX_CHARS - 300).text;
    }
    t = t.slice(-(MAX_CHARS - 300));
    // Masqué ici, sur le téléphone : seuls les repères (« [PERSONNE 1] ») partent vers le serveur.
    const masque = anonymize(t, speakerLabels(t));
    mapping.current = masque.mapping;
    setArnaque(heuristicScam(t).score >= SCAM_THRESHOLD);
    setOccupe(true);
    setErreur('');
    try {
      const res = await fetch('/api/replies', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(await entetesCompte()) },
        body: JSON.stringify({
          conversation: masque.text,
          objectif: 'Répondre de façon adaptée',
          ton: choixTon,
          longueur: 'moyenne',
          style: loadStyle(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<RepliesResult> & {
        error?: string;
      };
      if (!res.ok || !data.reponses) throw new Error(data.error ?? 'Six n’a pas pu répondre.');
      setReponses(data.reponses);
    } catch (e) {
      setErreur(
        e instanceof TypeError
          ? 'Pas de réseau. Réessaie dans un instant.'
          : e instanceof Error
            ? e.message
            : 'Six n’a pas pu répondre.',
      );
    } finally {
      setOccupe(false);
    }
  }, []);

  // À l'ouverture : l'app Android fournit le message copié, et Six répond tout de suite.
  useEffect(() => {
    const p = pont();
    setClavier(p?.source() === 'clavier');
    const copie = p?.lirePressePapiers()?.trim() ?? '';
    if (copie) {
      setTexte(copie);
      void demander(copie, 'amical');
    }
  }, [demander]);

  async function choisir(r: string) {
    const finale = restore(r, mapping.current);
    const p = pont();
    if (p) {
      p.choisir(finale);
      return;
    }
    try {
      await navigator.clipboard.writeText(finale);
      setErreur('Réponse copiée.');
    } catch {
      setErreur('La copie a échoué : sélectionne le texte et copie-le.');
    }
  }

  return (
    <main className="rapide">
      <header className="rapide-tete">
        <Logo small label="" />
        <span className="rapide-titre">Six</span>
        <button
          type="button"
          className="rapide-fermer"
          aria-label="Fermer"
          onClick={() => pont()?.fermer()}
        >
          <Icon name="x" size={20} />
        </button>
      </header>

      {!texte ? (
        <form
          className="rapide-coller"
          onSubmit={(e) => {
            e.preventDefault();
            const v = new FormData(e.currentTarget).get('message');
            if (typeof v === 'string' && v.trim()) {
              setTexte(v);
              void demander(v, ton);
            }
          }}
        >
          <p className="rapide-aide">
            Copie le message dans ta messagerie, puis rouvre Six. Ou colle-le ici :
          </p>
          <textarea name="message" rows={3} placeholder="Colle le message…" />
          <button type="submit" className="act">
            Proposer des réponses
          </button>
        </form>
      ) : (
        <>
          <p className="rapide-message">
            « {texte.length > 160 ? `${texte.slice(0, 160)}…` : texte} »
          </p>
          {arnaque && (
            <p className="rapide-alerte">
              Ce message ressemble à une arnaque. Ne donne jamais de code, de mot de passe ni
              d’argent.
            </p>
          )}
          <div className="rapide-tons" role="group" aria-label="Ton">
            {TONS_RAPIDES.map((t) => (
              <button
                key={t.id}
                type="button"
                className="chip"
                aria-pressed={ton === t.id}
                disabled={occupe}
                onClick={() => {
                  setTon(t.id);
                  void demander(texte, t.id);
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          {occupe && <p className="rapide-aide">Six écrit trois réponses…</p>}
          {!occupe && reponses.length > 0 && (
            <div className="rapide-liste">
              {reponses.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  className="rapide-reponse"
                  onClick={() => void choisir(r)}
                >
                  <span>{restore(r, mapping.current)}</span>
                  <span className="rapide-action">{clavier ? 'Écrire' : 'Copier'}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {erreur && <p className="rapide-aide">{erreur}</p>}
      <p className="rapide-pied">
        <Icon name="lock" size={12} /> Masqué sur ton téléphone avant l’envoi
      </p>
    </main>
  );
}
