import type { PieceAffichee } from './types';

/**
 * Pièces jointes du Chat, préparées sur l'appareil avant l'envoi :
 * - image : réduite (1400 px au plus) et compressée en JPEG ;
 * - vidéo : Six ne lit pas une vidéo directement ; on en extrait des images à intervalles réguliers (8 au plus) ;
 * - capture : l'image du navigateur de Six, avec la description et les coordonnées des repères ;
 * - document : le texte lu (texte ou PDF), envoyé avec la question.
 * Chaque pièce a un petit aperçu (carré) gardé avec le message ; les grandes images ne partent qu'avec l'envoi.
 */

export type Piece = PieceAffichee & {
  id: string;
  /** Images envoyées à Six (JPEG en data URL). */
  images: string[];
  /** Texte ajouté pour Six (repères, origine des images d'une vidéo). */
  contexte?: string;
  /** Texte d'un document. */
  texte?: string;
};

export const IMAGES_MAX = 8;
const IMAGES_VIDEO = 8;
const COTE_IMAGE = 1400;
const COTE_VIDEO = 768;
const COTE_APERCU = 200;

export const ICONE_PIECE: Record<Piece['genre'], string> = {
  capture: '📷',
  image: '🖼️',
  video: '🎞️',
  document: '📄',
};

const nouvelId = () => Math.random().toString(36).slice(2, 10);

function redimensionner(
  source: CanvasImageSource,
  largeur: number,
  hauteur: number,
  cote: number,
  qualite: number,
): string {
  const e = Math.min(1, cote / Math.max(largeur, hauteur));
  const toile = document.createElement('canvas');
  toile.width = Math.max(1, Math.round(largeur * e));
  toile.height = Math.max(1, Math.round(hauteur * e));
  const ctx = toile.getContext('2d');
  if (!ctx) throw new Error('Image illisible sur cet appareil.');
  ctx.fillStyle = '#fff'; // fond blanc pour les images transparentes
  ctx.fillRect(0, 0, toile.width, toile.height);
  ctx.drawImage(source, 0, 0, toile.width, toile.height);
  return toile.toDataURL('image/jpeg', qualite);
}

async function chargerImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

/** Petit aperçu carré (gardé avec le message, donc léger). */
export async function miniature(url: string): Promise<string> {
  const img = await chargerImage(url);
  return redimensionner(img, img.naturalWidth, img.naturalHeight, COTE_APERCU, 0.7);
}

export async function lireImage(f: File): Promise<Piece> {
  const url = URL.createObjectURL(f);
  try {
    const img = await chargerImage(url).catch(() => {
      throw new Error("Format d'image non lu par ce navigateur.");
    });
    const image = redimensionner(img, img.naturalWidth, img.naturalHeight, COTE_IMAGE, 0.82);
    return {
      id: nouvelId(),
      genre: 'image',
      nom: f.name,
      images: [image],
      apercu: redimensionner(img, img.naturalWidth, img.naturalHeight, COTE_APERCU, 0.7),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Vidéo → images régulières (une toutes les quelques secondes, 8 au plus), sans le son. */
export async function lireVideo(f: File): Promise<Piece> {
  const url = URL.createObjectURL(f);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = url;
  try {
    await new Promise<void>((ok, ko) => {
      v.onloadeddata = () => ok();
      v.onerror = () => ko(new Error('Format vidéo non lu par ce navigateur.'));
    });
    const duree = v.duration;
    if (!Number.isFinite(duree) || duree <= 0 || !v.videoWidth)
      throw new Error('Vidéo vide ou illisible.');
    const n = Math.min(IMAGES_VIDEO, Math.max(2, Math.ceil(duree / 4)));
    const images: string[] = [];
    const instants: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = (duree * (i + 0.5)) / n;
      await new Promise<void>((ok) => {
        v.onseeked = () => ok();
        v.currentTime = t;
      });
      images.push(redimensionner(v, v.videoWidth, v.videoHeight, COTE_VIDEO, 0.75));
      instants.push(Math.round(t));
    }
    const contexte = `[La vidéo « ${f.name} » (${Math.round(duree)} s) est jointe sous forme de ${n} images extraites à intervalles réguliers, dans l'ordre, aux instants ${instants.map((s) => `${s} s`).join(', ')}. Il n'y a pas le son.]`;
    return {
      id: nouvelId(),
      genre: 'video',
      nom: f.name,
      images,
      contexte,
      apercu: await miniature(images[0]),
    };
  } finally {
    v.removeAttribute('src');
    v.load();
    URL.revokeObjectURL(url);
  }
}

/** Capture du navigateur de Six (ou, si elle a été refusée, seulement la description des repères). */
export async function pieceCapture(
  description: string,
  capture: { url: string } | null,
): Promise<Piece> {
  return {
    id: 'capture',
    genre: 'capture',
    nom: 'Capture du navigateur',
    images: capture ? [capture.url] : [],
    contexte: description,
    apercu: capture ? await miniature(capture.url) : undefined,
  };
}

export function versAffichage(p: Piece): PieceAffichee {
  return { genre: p.genre, nom: p.nom, ...(p.apercu ? { apercu: p.apercu } : {}) };
}
