import { texteDeHtml, urlAutorisee } from '@/lib/agent/outils';

/**
 * Navigateur de Cosinus : beaucoup de sites interdisent d'être affichés dans une autre app (en-têtes
 * X-Frame-Options ou Content-Security-Policy frame-ancestors). On ne contourne pas cette protection (afficher leur
 * page avec leurs scripts dans l'app serait dangereux) : le serveur regarde si le site accepte l'affichage intégré et,
 * sinon, en tire une version lecture (titre, intertitres, paragraphes, listes, liens), sans aucun script.
 * Mêmes protections que l'outil lire_page : adresses publiques seulement, redirections revérifiées, taille bornée.
 */

export type BlocLecture = { type: 'h1' | 'h2' | 'h3' | 'p' | 'li'; texte: string };
export type PageLecture = {
  url: string;
  integrable: boolean;
  titre: string;
  blocs: BlocLecture[];
  liens: { texte: string; url: string }[];
};

const UA = 'Mozilla/5.0 (compatible; Six-Cosinus/1.0; lecteur)';
const OCTETS_MAX = 3 * 1024 * 1024;

/** Le site accepte-t-il d'être affiché dans une autre app ? */
export function accepteIntegration(entetes: Headers): boolean {
  const xfo = (entetes.get('x-frame-options') ?? '').toLowerCase();
  if (xfo.includes('deny') || xfo.includes('sameorigin')) return false;
  const csp = (entetes.get('content-security-policy') ?? '').toLowerCase();
  const fa = /frame-ancestors([^;]*)/.exec(csp)?.[1]?.trim();
  if (fa !== undefined && !/(^|\s)\*(\s|$)/.test(fa)) return false;
  return true;
}

const entites = (t: string) => texteDeHtml(t).replace(/\s+/g, ' ').trim();

/** Version lecture d'une page HTML : la partie principale (article, main, sinon le corps). */
export function extraireLecture(html: string, base: URL): Omit<PageLecture, 'url' | 'integrable'> {
  const titre = entites(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '') || base.hostname;
  const sansBruit = html.replace(
    /<(script|style|noscript|svg|nav|footer|header|form|aside|iframe)[\s\S]*?<\/\1>/gi,
    ' ',
  );
  const principal =
    /<article[\s\S]*?<\/article>/i.exec(sansBruit)?.[0] ??
    /<main[\s\S]*?<\/main>/i.exec(sansBruit)?.[0] ??
    /<body[\s\S]*?<\/body>/i.exec(sansBruit)?.[0] ??
    sansBruit;
  const blocs: BlocLecture[] = [];
  for (const m of principal.matchAll(/<(h1|h2|h3|h4|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const texte = entites(m[2]);
    if (texte.length < 2 || (m[1].toLowerCase() === 'p' && texte.length < 25)) continue;
    const t = m[1].toLowerCase();
    blocs.push({
      type: (t === 'h4' ? 'h3' : t) as BlocLecture['type'],
      texte: texte.slice(0, 2000),
    });
    if (blocs.length >= 400) break;
  }
  const vus = new Set<string>();
  const liens: PageLecture['liens'] = [];
  for (const m of principal.matchAll(
    /<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    let u: URL;
    try {
      u = new URL(m[1], base);
    } catch {
      continue;
    }
    const texte = entites(m[2]);
    if (!/^https?:$/.test(u.protocol) || texte.length < 3 || vus.has(u.href)) continue;
    vus.add(u.href);
    liens.push({ texte: texte.slice(0, 120), url: u.href });
    if (liens.length >= 60) break;
  }
  return { titre, blocs, liens };
}

export async function lirePourNavigateur(brut: unknown): Promise<PageLecture | { erreur: string }> {
  let cible = await urlAutorisee(brut);
  if (!cible)
    return { erreur: 'Adresse refusée : seules les pages web publiques peuvent être ouvertes.' };
  for (let saut = 0; saut < 5; saut++) {
    const res = await fetch(cible, {
      redirect: 'manual',
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'accept-language': 'fr,en;q=0.8',
      },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!res) return { erreur: 'Site injoignable pour le moment.' };
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const suivante = await urlAutorisee(new URL(res.headers.get('location') ?? '', cible).href);
      if (!suivante) return { erreur: 'Redirection refusée (adresse non publique).' };
      cible = suivante;
      continue;
    }
    const integrable = accepteIntegration(res.headers);
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !/html|xml|text\/plain/.test(type))
      return { url: cible.href, integrable, titre: cible.hostname, blocs: [], liens: [] };
    const lecteur = res.body?.getReader();
    const morceaux: Uint8Array[] = [];
    let total = 0;
    while (lecteur && total < OCTETS_MAX) {
      const { done, value } = await lecteur.read();
      if (done) break;
      morceaux.push(value);
      total += value.byteLength;
    }
    await lecteur?.cancel().catch(() => {});
    const html = Buffer.concat(morceaux).toString('utf8');
    return { url: cible.href, integrable, ...extraireLecture(html, cible) };
  }
  return { erreur: 'Trop de redirections.' };
}
