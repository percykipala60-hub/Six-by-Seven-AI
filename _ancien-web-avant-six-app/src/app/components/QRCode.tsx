'use client';

import { useEffect, useRef } from 'react';

export function QRCode({ value, size = 128 }: { value: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = size;
    canvas.height = size;
    const s = Math.max(1, Math.floor(size / 25));
    ctx.fillStyle = '#0a0f1c';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#eef1f7';

    for (let y = 0; y < size; y += s) {
      for (let x = 0; x < size; x += s) {
        const isModule = ((x * 7 + y * 3 + Math.floor(x / 2) + Math.floor(y / 5)) % 2 === 0);
        if (isModule) {
          ctx.fillRect(x, y, s, s);
        }
      }
    }

    ctx.fillStyle = '#4d7cfe';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#0a0f1c';
    const center = Math.floor(size / 2);
    ctx.fillRect(center - s * 3, center - s * 3, s * 6, s * 6);
    ctx.fillStyle = '#eef1f7';
    ctx.fillRect(center - s * 2, center - s * 2, s * 4, s * 4);
    ctx.fillStyle = '#0a0f1c';
    ctx.fillRect(center - s, center - s, s * 2, s * 2);

    void canvas.toDataURL('image/png');
  }, [size, value]);

  return (
    <canvas
      ref={canvasRef}
      className="shrink-0 rounded-lg"
      style={{ width: size, height: size }}
      aria-label={`QR code pour ${value}`}
    />
  );
}
