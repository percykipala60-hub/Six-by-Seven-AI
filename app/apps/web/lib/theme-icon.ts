import { Capacitor, registerPlugin } from '@capacitor/core';
import { nomIconeNative } from './theme-ids';

/**
 * Fait suivre le thème à ce que l'app peut changer hors de la page : la couleur de la barre du téléphone
 * (meta theme-color) et l'icône de l'onglet, redessinée aux couleurs du thème.
 * Le navigateur change son favicon; les applications natives changent aussi l'icône système.
 */
const SIZE = 64;
let nativeIconError = false;

export function hasNativeThemeIconError(): boolean {
  return nativeIconError;
}

interface NativeThemePlugin {
  setLauncherIcon(options: { accent: string }): Promise<void>;
}

const NativeTheme = registerPlugin<NativeThemePlugin>('SixTheme');

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function tint(img: HTMLImageElement, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible');
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, SIZE, SIZE);
  return c;
}

export async function applyThemeIcon(): Promise<void> {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  const accent = document.documentElement.dataset.accent || 'bleu';
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((m) => m.setAttribute('content', v('--bg')));
  try {
    const [glyphe, trait] = await Promise.all([load('/six-glyphe.png'), load('/six-trait.png')]);
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponible');
    // Fond uni, ou dégradé (ambiance Aurore) : on reprend ses couleurs, du coin bas gauche au coin haut droit (45°).
    const stops = v('--icon-grad').match(/#[0-9a-f]{6}/gi);
    if (stops && stops.length > 1) {
      const g = ctx.createLinearGradient(0, SIZE, SIZE, 0);
      stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = v('--icon-bg');
    }
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(0, 0, SIZE, SIZE, SIZE * 0.22);
    else ctx.rect(0, 0, SIZE, SIZE);
    ctx.fill();
    ctx.drawImage(tint(glyphe, v('--icon-ink')), 0, 0);
    ctx.drawImage(tint(trait, v('--icon-accent')), 0, 0);
    const url = c.toDataURL('image/png');
    document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]').forEach((l) => (l.href = url));
  } catch (error) {
    console.error("[theme-icon] l'icône du navigateur n'a pas pu être recolorée", error);
  }

  if (Capacitor.getPlatform() !== 'web') {
    try {
      await NativeTheme.setLauncherIcon({ accent: nomIconeNative(accent) });
      nativeIconError = false;
    } catch (error) {
      nativeIconError = true;
      console.error("[theme-icon] l'icône native n'a pas pu être changée", error);
      window.dispatchEvent(new Event('six-theme-icon-error'));
    }
  }
}
