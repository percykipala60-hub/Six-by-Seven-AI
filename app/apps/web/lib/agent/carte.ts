import { appelAgent } from '@/lib/ai';
import {
  CONSIGNE_CARTE,
  OUTILS_CARTE,
  executerOutilCarte,
  lieuxUniques,
  type LieuCarte,
} from '@/lib/carte-rdc';
import type { ImageJointe } from '@/lib/ai';
import type { ChatMessage } from '@/lib/types';
import { sansMarkdown } from './boucle';
import type { MessageAgent } from './types';

/**
 * Chat avec la carte de la RDC : pour une question de lieu, Six peut chercher dans OpenStreetMap (3 tours au plus),
 * puis répond. Les lieux trouvés reviennent avec la réponse pour que l'app affiche la carte.
 */

const TOURS_MAX = 3;
const OUTILS_PAR_TOUR = 3;
const JETONS = 1500;

export async function repondreAvecCarte(opts: {
  system: string;
  question: string;
  historique: ChatMessage[];
  images?: ImageJointe[];
  premium: boolean;
}): Promise<{ reponse: string; lieux: LieuCarte[] }> {
  const system = opts.system + CONSIGNE_CARTE;
  const messages: MessageAgent[] = [
    ...opts.historique.map((m) => ({ role: m.role, content: m.content }) as MessageAgent),
    {
      role: 'user',
      content: opts.question,
      ...(opts.images?.length ? { images: opts.images } : {}),
    },
  ];
  const lieux: LieuCarte[] = [];
  for (let tour = 0; tour <= TOURS_MAX; tour++) {
    // Dernier tour : plus d'outil, Six répond avec ce qu'il a trouvé.
    const outils = tour < TOURS_MAX ? OUTILS_CARTE : [];
    const r = await appelAgent(system, messages, outils, JETONS, opts.premium);
    if (!r.appels.length || !outils.length)
      return { reponse: sansMarkdown(r.texte), lieux: lieuxUniques(lieux) };
    const appels = r.appels.slice(0, OUTILS_PAR_TOUR);
    messages.push({ role: 'assistant', content: r.texte, appels });
    for (const a of appels) {
      const { resultat, lieux: trouves } = await executerOutilCarte(a.nom, a.args);
      lieux.push(...trouves);
      messages.push({ role: 'tool', id: a.id, nom: a.nom, content: resultat });
    }
  }
  return { reponse: '', lieux: lieuxUniques(lieux) };
}
