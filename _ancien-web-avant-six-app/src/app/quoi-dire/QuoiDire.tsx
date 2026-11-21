'use client';

import { useState } from 'react';
import {
  maskConversation,
  SUJETS_LABELS,
  SUJETS_SECOURS,
  unmask,
  type SujetCategorie,
} from '@six/shared';
import { sujetsSix } from '@/lib/api';
import { useSettings } from '@/lib/settings';
import { Actions, SecondaryButton } from '../components/Fil';
import { Card, Chip, copyText, StepHeader, Title } from '../components/ui';

const CATEGORIES = Object.keys(SUJETS_LABELS) as SujetCategorie[];

/** « Quoi dire ? » : des idées prêtes tout de suite (sans réseau), personnalisées par l'IA. */
export function QuoiDire({ apiUrl }: { apiUrl: string }) {
  const settings = useSettings();
  const [categorie, setCategorie] = useState<SujetCategorie>('briser-la-glace');
  const [contexte, setContexte] = useState('');
  const [sujets, setSujets] = useState(SUJETS_SECOURS['briser-la-glace']);
  const [table, setTable] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(
    'Idées prêtes. Touche « Autres sujets » pour des idées sur mesure.',
  );
  const [copied, setCopied] = useState<number | undefined>();

  function pick(next: SujetCategorie) {
    setCategorie(next);
    setSujets(SUJETS_SECOURS[next]);
    setTable({});
    setCopied(undefined);
    setNote('Idées prêtes. Touche « Autres sujets » pour des idées sur mesure.');
  }

  async function more() {
    setBusy(true);
    setCopied(undefined);
    const masked = contexte.trim() ? maskConversation(contexte) : undefined;
    try {
      const result = await sujetsSix(apiUrl, {
        categorie,
        langue: settings.langue,
        moteur: settings.moteur,
        ...(masked ? { contexte: masked.masked.slice(0, 200) } : {}),
      });
      setTable(masked?.table ?? {});
      setSujets(result.sujets);
      setNote(
        result.secours
          ? 'Six n’a pas pu personnaliser : voici des idées prêtes.'
          : 'Idées sur mesure.',
      );
    } catch {
      setNote('Pas de réseau : voici des idées prêtes, elles marchent aussi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col">
      <StepHeader kicker="Idées" onBack={() => window.history.back()} />
      <Title accent="dire" after=" ?" sub="Choisis une situation, Six propose des sujets.">
        Quoi{' '}
      </Title>
      <div className="flex flex-col gap-3 px-5">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Situation">
          {CATEGORIES.map((c) => (
            <Chip key={c} pressed={categorie === c} onClick={() => pick(c)}>
              {SUJETS_LABELS[c]}
            </Chip>
          ))}
        </div>
        <input
          value={contexte}
          onChange={(e) => setContexte(e.target.value.slice(0, 200))}
          placeholder="Contexte (facultatif) : ex. ancien camarade de classe"
          aria-label="Contexte"
          className="min-h-12 rounded-2xl bg-surface px-4 text-[15px] ring-1 ring-line"
        />
        <p className="text-[13px] text-muted" role="status">
          {busy ? 'Six cherche des idées…' : note}
        </p>
        {sujets.map((s, i) => (
          <Card key={`${s.titre}-${i}`}>
            <p className="text-[13px] font-semibold text-accent-soft">{s.titre}</p>
            <p className="mt-1 text-[15px] leading-relaxed">{unmask(s.message, table)}</p>
            <button
              type="button"
              onClick={() => {
                void copyText(unmask(s.message, table));
                setCopied(i);
              }}
              className="mt-3 min-h-11 w-full rounded-2xl bg-accent px-4 text-[15px] font-semibold text-on-accent"
            >
              {copied === i ? 'Copié ✓' : 'Utiliser'}
            </button>
          </Card>
        ))}
      </div>
      <Actions>
        <SecondaryButton onClick={() => void more()}>↻ Autres sujets</SecondaryButton>
      </Actions>
    </main>
  );
}
