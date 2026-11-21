'use client';

import { useState } from 'react';
import type { Recap } from '@/lib/conversation';
import { Card } from './ui';

function minutes(value: number | undefined): string {
  if (value === undefined) return '—';
  if (value < 60) return `${value} min`;
  return `${Math.round(value / 60)} h`;
}

const LEVELS = ['Calme', 'Pressant', 'Tendu'];

/**
 * Récap de la conversation : uniquement des chiffres calculés sur le téléphone.
 * L'image partagée ne contient aucun mot de la discussion, aucun nom.
 */
export function RecapCard({ recap, name }: { recap: Recap; name: string }) {
  const [status, setStatus] = useState('');
  const points = recap.tension;
  const path = points
    .map((level, i) => {
      const x = points.length > 1 ? (i / (points.length - 1)) * 280 + 10 : 150;
      const y = 70 - level * 28;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y}`;
    })
    .join(' ');

  async function share() {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--color-accent').trim() || '#4d7cfe';
    ctx.fillStyle = '#0a0f1c';
    ctx.fillRect(0, 0, 1080, 1080);
    ctx.fillStyle = '#eef1f7';
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.fillText('Récap de la', 90, 170);
    ctx.fillStyle = accent;
    ctx.fillText('conversation', 90, 250);
    const stats: [string, string][] = [
      [minutes(recap.reponseMoi), 'mon temps de réponse moyen'],
      [recap.partMoi !== undefined ? `${recap.partMoi} %` : '—', 'des messages viennent de moi'],
      [
        String(recap.messages),
        `messages${recap.jours ? ` en ${recap.jours} jour${recap.jours > 1 ? 's' : ''}` : ''}`,
      ],
    ];
    stats.forEach(([value, label], i) => {
      ctx.fillStyle = '#131b2e';
      ctx.fillRect(90, 330 + i * 170, 900, 140);
      ctx.fillStyle = '#eef1f7';
      ctx.font = 'bold 64px system-ui, sans-serif';
      ctx.fillText(value, 130, 420 + i * 170);
      ctx.fillStyle = '#97a3ba';
      ctx.font = '36px system-ui, sans-serif';
      ctx.fillText(label, 430, 412 + i * 170);
    });
    ctx.fillStyle = '#97a3ba';
    ctx.font = '32px system-ui, sans-serif';
    ctx.fillText('Calculé sur mon téléphone par Six · 7 AI', 90, 1010);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;
    const file = new File([blob], 'recap-six.png', { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Récap Six' });
        setStatus('Image partagée.');
        return;
      }
    } catch {
      // partage annulé : on propose le téléchargement
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'recap-six.png';
    link.click();
    URL.revokeObjectURL(url);
    setStatus('Image enregistrée.');
  }

  return (
    <Card label="Récap de la conversation">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="font-display text-[26px] font-bold">{minutes(recap.reponseMoi)}</p>
          <p className="text-[12px] text-muted">ton temps de réponse moyen</p>
        </div>
        <div>
          <p className="font-display text-[26px] font-bold">
            {recap.partMoi !== undefined ? `${recap.partMoi} %` : '—'}
          </p>
          <p className="text-[12px] text-muted">des messages sont de toi</p>
        </div>
      </div>
      {points.length > 1 ? (
        <div className="mt-3">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
            Évolution du ton de {name}
          </p>
          <svg
            viewBox="0 0 300 80"
            className="mt-1 w-full"
            role="img"
            aria-label={`Ton de ${name} : ${points.map((p) => LEVELS[p]).join(', ')}`}
          >
            {[0, 1, 2].map((level) => (
              <line
                key={level}
                x1="10"
                x2="290"
                y1={70 - level * 28}
                y2={70 - level * 28}
                stroke="var(--color-line)"
                strokeWidth="1"
              />
            ))}
            <path
              d={path}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="flex justify-between text-[11px] text-muted">
            <span>début</span>
            <span>maintenant</span>
          </div>
        </div>
      ) : null}
      <p className="mt-2 text-[12px] text-muted">
        Calculé sur ton téléphone. L’image partagée ne contient que ces chiffres : aucun mot, aucun
        nom.
      </p>
      <button
        type="button"
        onClick={() => void share()}
        className="mt-3 min-h-11 w-full rounded-2xl bg-accent px-4 text-[15px] font-semibold text-on-accent"
      >
        Partager l’image du récap
      </button>
      {status ? (
        <p role="status" className="mt-2 text-[13px] text-muted">
          {status}
        </p>
      ) : null}
    </Card>
  );
}
