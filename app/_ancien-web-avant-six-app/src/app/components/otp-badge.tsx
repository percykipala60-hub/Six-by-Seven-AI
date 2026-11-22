'use client';

import { useState } from 'react';
import { Icon } from './icons';

type Props = {
  code: string;
  texteMasqué: string;
  onCopie: () => void;
};

export function OTPCode({ code, texteMasqué, onCopie }: Props) {
  void texteMasqué;
  const [label, setLabel] = useState('Code à copier');
  const net = code.trim();
  const sans = net.startsWith('six-') ? net.slice(4) : net;

  async function copier() {
    try {
      await navigator.clipboard.writeText(net);
      setLabel('Code copié · 8 caractères');
      setTimeout(() => setLabel('Code à copier'), 2200);
    } catch {
      // Le texte reste affiché : le destinataire peut le retranscrire.
      setLabel('Glisse-toi pour copier');
      setTimeout(() => setLabel('Code à copier'), 2200);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-[20px] border border-accent/30 bg-surface/60 px-4 py-4 text-center sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col items-center gap-1">
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted">
          Partage ce code à ton ami
        </p>
        <div className="flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1.5 ring-1 ring-accent/40">
          <span className="text-[15px] font-mono font-semibold tracking-widest text-accent">
            {sans.slice(0, 4)}
          </span>
          <span aria-hidden="true" className="text-muted">-</span>
          <span className="text-[15px] font-mono font-semibold tracking-widest text-accent">
            {sans.slice(4)}
          </span>
        </div>
        <button
          type="button"
          onClick={copier}
          className="min-h-8 text-[13px] text-accent-soft underline underline-offset-4"
        >
          {label}
        </button>
      </div>

      <div className="flex items-center gap-2 text-[13px] text-muted">
        <Icon name="cadenas" size={18} />
        <span>ma conversation masquée, hors ligne</span>
      </div>

      {label === 'Code copié · 8 caractères' ? null : (
        <button
          type="button"
          onClick={onCopie}
          className="min-h-9 self-start rounded-xl bg-accent px-4 text-[14px] font-semibold text-on-accent transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          Coller la conversation
        </button>
      )}
    </div>
  );
}
