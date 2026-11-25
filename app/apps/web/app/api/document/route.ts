import { fail, guard, readJson } from '@/lib/http';
import { versWord } from '@/lib/agent/documents';

// Le Chat et Cosinus génèrent un document Word à partir d'une réponse (titres, listes, paragraphes), sans agent :
// rien n'est enregistré sur le serveur, le fichier part directement au téléchargement.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CONTENU_MAX = 60_000;

/** Nom de fichier sûr, sans extension. */
function nomSur(nom: unknown): string {
  const t = (typeof nom === 'string' ? nom : '')
    .normalize('NFC')
    .replace(/[/:*?"<>|]+/g, '-')
    .replace(/[^\P{Cc}]+/gu, '')
    .trim()
    .slice(0, 60);
  return t || 'Reponse de Six';
}

export async function POST(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  const b = await readJson(req, CONTENU_MAX * 4);
  if (!b || typeof b.contenu !== 'string' || !b.contenu.trim() || b.contenu.length > CONTENU_MAX)
    return fail(400, 'Rien à mettre dans le document, ou texte trop long.');
  const nom = nomSur(b.nom);
  try {
    const octets = versWord(b.contenu, { nomFichier: `${nom}.md` });
    return new Response(new Uint8Array(octets), {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${nom}.docx`)}`,
        'cache-control': 'no-store',
      },
    });
  } catch {
    return fail(500, 'Création du document Word impossible.');
  }
}
