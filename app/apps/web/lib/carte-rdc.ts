/**
 * Six connaît la RDC grâce à OpenStreetMap : il retrouve un lieu (ville, commune, quartier, avenue, hôpital…) et
 * les lieux utiles autour (pharmacies, hôpitaux, banques…), puis l'app montre une carte sous sa réponse.
 * - Recherche : Nominatim (nominatim.openstreetmap.org), limité à la RDC (code pays « cd »).
 * - Lieux proches : Overpass API, dans un rayon autour du lieu trouvé.
 * Règles d'usage de ces services publics : un identifiant d'app, une demande par seconde au plus à Nominatim,
 * des résultats gardés en cache, et la mention « © OpenStreetMap » (affichée avec la carte).
 */

export type LieuCarte = { nom: string; lat: number; lon: number; detail?: string };

const UA = 'Six/1.0 (+https://sixbysevenai.com)';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
/** Serveur principal d'Overpass, puis des copies publiques si le premier est saturé (fréquent). */
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const CACHE_MS = 24 * 3_600_000;
const RESULTATS_MAX = 5;
const PROCHES_MAX = 8;

/** Catégories de lieux proches, en français, et leurs étiquettes OpenStreetMap. */
export const CATEGORIES_PROCHES: Record<string, string[]> = {
  pharmacie: ['amenity=pharmacy'],
  hopital: ['amenity=hospital', 'amenity=clinic'],
  banque: ['amenity=bank'],
  distributeur: ['amenity=atm'],
  ecole: ['amenity=school'],
  universite: ['amenity=university', 'amenity=college'],
  restaurant: ['amenity=restaurant', 'amenity=fast_food'],
  hotel: ['tourism=hotel', 'tourism=guest_house'],
  station_essence: ['amenity=fuel'],
  eglise: ['amenity=place_of_worship'],
  marche: ['amenity=marketplace'],
  police: ['amenity=police'],
  supermarche: ['shop=supermarket'],
};

/* ---------- Cache et cadence ---------- */

const cache = new Map<string, { t: number; v: unknown }>();
let dernierAppelNominatim = 0;

function enCache<T>(cle: string): T | undefined {
  const e = cache.get(cle);
  if (!e) return undefined;
  if (Date.now() - e.t > CACHE_MS) {
    cache.delete(cle);
    return undefined;
  }
  return e.v as T;
}

function garder(cle: string, v: unknown): void {
  if (cache.size > 2000) cache.delete(cache.keys().next().value as string);
  cache.set(cle, { t: Date.now(), v });
}

/** Une demande par seconde au plus vers Nominatim (règle du service). */
async function attendreTour(): Promise<void> {
  const attente = dernierAppelNominatim + 1100 - Date.now();
  dernierAppelNominatim = Math.max(Date.now(), dernierAppelNominatim + 1100);
  if (attente > 0) await new Promise((r) => setTimeout(r, attente));
}

/** Pour les tests. */
export function viderCacheCarte(): void {
  cache.clear();
  dernierAppelNominatim = 0;
}

/* ---------- Calculs ---------- */

/** Distance à vol d'oiseau, en km (formule de haversine). */
export function distanceKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const arrondi = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

/** Cadre de carte qui contient tous les lieux, avec une marge (au moins ~1 km autour d'un lieu seul). */
export function cadreCarte(lieux: LieuCarte[]): [number, number, number, number] | null {
  if (!lieux.length) return null;
  const lats = lieux.map((l) => l.lat);
  const lons = lieux.map((l) => l.lon);
  let [sud, nord, ouest, est] = [
    Math.min(...lats),
    Math.max(...lats),
    Math.min(...lons),
    Math.max(...lons),
  ];
  const margeLat = Math.max((nord - sud) * 0.15, 0.008);
  const margeLon = Math.max((est - ouest) * 0.15, 0.008);
  sud -= margeLat;
  nord += margeLat;
  ouest -= margeLon;
  est += margeLon;
  return [ouest, sud, est, nord];
}

/** Adresse de la carte intégrable d'OpenStreetMap (cadre + repère sur le premier lieu). */
export function urlCarteIntegree(lieux: LieuCarte[]): string | null {
  const cadre = cadreCarte(lieux);
  if (!cadre) return null;
  const u = new URL('https://www.openstreetmap.org/export/embed.html');
  u.searchParams.set('bbox', cadre.map((n) => n.toFixed(5)).join(','));
  u.searchParams.set('layer', 'mapnik');
  u.searchParams.set('marker', `${lieux[0].lat.toFixed(5)},${lieux[0].lon.toFixed(5)}`);
  return u.toString();
}

/** Lien pour ouvrir un lieu sur openstreetmap.org. */
export function urlLieu(l: LieuCarte): string {
  return `https://www.openstreetmap.org/?mlat=${l.lat.toFixed(5)}&mlon=${l.lon.toFixed(5)}#map=17/${l.lat.toFixed(5)}/${l.lon.toFixed(5)}`;
}

/* ---------- Services OpenStreetMap ---------- */

type ResultatNominatim = {
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
  type?: string;
};

/** Cherche un lieu en RDC. */
export async function chercherLieuRdc(requete: string): Promise<LieuCarte[]> {
  const q = requete.trim().slice(0, 200);
  if (!q) return [];
  const cle = `n:${q.toLowerCase()}`;
  const deja = enCache<LieuCarte[]>(cle);
  if (deja) return deja;
  await attendreTour();
  const u = new URL(NOMINATIM);
  u.searchParams.set('q', q);
  u.searchParams.set('countrycodes', 'cd');
  u.searchParams.set('format', 'jsonv2');
  u.searchParams.set('limit', String(RESULTATS_MAX));
  u.searchParams.set('accept-language', 'fr');
  const res = await fetch(u, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const brut = (await res.json()) as ResultatNominatim[];
  const lieux = (Array.isArray(brut) ? brut : []).flatMap((r) => {
    const lat = Number(r.lat);
    const lon = Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const complet = String(r.display_name ?? '');
    return [{ nom: String(r.name || complet.split(',')[0] || q), lat, lon, detail: complet }];
  });
  garder(cle, lieux);
  return lieux;
}

type ElementOverpass = {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

/** Lieux d'une catégorie autour d'un point, par Nominatim (rapide) : un mot-clé OpenStreetMap par étiquette. */
async function prochesParNominatim(
  etiquettes: string[],
  centre: { lat: number; lon: number },
  rayon: number,
): Promise<LieuCarte[]> {
  const dLat = rayon / 111_000;
  const dLon = rayon / (111_000 * Math.max(Math.cos((centre.lat * Math.PI) / 180), 0.2));
  const lieux: LieuCarte[] = [];
  for (const e of etiquettes) {
    await attendreTour();
    const u = new URL(NOMINATIM);
    u.searchParams.set('q', e.split('=')[1].replace('_', ' '));
    u.searchParams.set('countrycodes', 'cd');
    u.searchParams.set('format', 'jsonv2');
    u.searchParams.set('limit', '20');
    u.searchParams.set('accept-language', 'fr');
    u.searchParams.set('bounded', '1');
    u.searchParams.set(
      'viewbox',
      [centre.lon - dLon, centre.lat + dLat, centre.lon + dLon, centre.lat - dLat]
        .map((n) => n.toFixed(5))
        .join(','),
    );
    const res = await fetch(u, {
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const brut = (await res.json()) as ResultatNominatim[];
    for (const r of Array.isArray(brut) ? brut : []) {
      const lat = Number(r.lat);
      const lon = Number(r.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const complet = String(r.display_name ?? '');
      const morceaux = complet.split(', ');
      lieux.push({
        nom: r.name ? String(r.name) : 'Sans nom',
        lat,
        lon,
        detail: morceaux.slice(r.name ? 1 : 0, r.name ? 3 : 2).join(', ') || undefined,
      });
    }
  }
  return lieux.filter((l) => distanceKm(centre, l) * 1000 <= rayon * 1.05);
}

/** Lieux d'une catégorie autour d'un point (rayon en mètres), du plus proche au plus loin. */
export async function lieuxProches(
  categorie: string,
  centre: { lat: number; lon: number },
  rayon = 2000,
): Promise<LieuCarte[]> {
  const etiquettes = CATEGORIES_PROCHES[categorie];
  if (!etiquettes) return [];
  const r = Math.min(Math.max(Math.round(rayon), 200), 10_000);
  const cle = `o:${categorie}:${centre.lat.toFixed(3)}:${centre.lon.toFixed(3)}:${r}`;
  const deja = enCache<LieuCarte[]>(cle);
  if (deja) return deja;
  // Nominatim d'abord (rapide et stable) ; Overpass (plus complet mais souvent saturé) seulement s'il ne trouve rien.
  const rapides = await prochesParNominatim(etiquettes, centre, r).catch(() => []);
  if (rapides.length) {
    const tries = lieuxUniques(rapides)
      .sort((a, b) => distanceKm(centre, a) - distanceKm(centre, b))
      .slice(0, PROCHES_MAX);
    garder(cle, tries);
    return tries;
  }
  const filtres = etiquettes
    .map((e) => {
      const [k, v] = e.split('=');
      return `nwr["${k}"="${v}"](around:${r},${centre.lat},${centre.lon});`;
    })
    .join('');
  const requete = `[out:json][timeout:10];(${filtres});out center 40;`;
  let brut: { elements?: ElementOverpass[] } | null = null;
  for (const serveur of OVERPASS) {
    const res = await fetch(serveur, {
      method: 'POST',
      headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(requete)}`,
      signal: AbortSignal.timeout(12_000),
    }).catch(() => null);
    if (!res?.ok) continue;
    brut = (await res.json().catch(() => null)) as { elements?: ElementOverpass[] } | null;
    if (brut) break;
  }
  if (!brut) throw new Error('Overpass indisponible');
  const lieux = (brut.elements ?? [])
    .flatMap((e) => {
      const lat = e.lat ?? e.center?.lat;
      const lon = e.lon ?? e.center?.lon;
      if (lat === undefined || lon === undefined) return [];
      const t = e.tags ?? {};
      const adresse = [t['addr:housenumber'], t['addr:street'], t['addr:suburb'] ?? t['addr:city']]
        .filter(Boolean)
        .join(' ');
      return [
        {
          nom: t.name || t['name:fr'] || `${categorie.replace('_', ' ')} sans nom`,
          lat,
          lon,
          detail: adresse || undefined,
        },
      ];
    })
    .sort((a, b) => distanceKm(centre, a) - distanceKm(centre, b))
    .slice(0, PROCHES_MAX);
  garder(cle, lieux);
  return lieux;
}

/* ---------- Outils pour Six ---------- */

type OutilCarte = {
  nom: string;
  description: string;
  parametres: {
    type: 'object';
    properties: Record<string, { type: 'string'; description: string; enum?: string[] }>;
    required: string[];
  };
};

export const OUTILS_CARTE: OutilCarte[] = [
  {
    nom: 'chercher_lieu_rdc',
    description:
      "Cherche un lieu en République démocratique du Congo dans OpenStreetMap : ville, commune, quartier, avenue, marché, hôpital, université, rond-point… Renvoie le nom complet, la position et la distance entre les résultats. Utilise-le pour toute question sur l'emplacement d'un lieu en RDC ou la distance entre deux lieux (un appel par lieu).",
    parametres: {
      type: 'object',
      properties: {
        requete: {
          type: 'string',
          description:
            'Le lieu avec sa ville, ex. « Hôpital du Cinquantenaire, Kinshasa » ou « Lemba, Kinshasa »',
        },
      },
      required: ['requete'],
    },
  },
  {
    nom: 'lieux_proches_rdc',
    description:
      "Trouve dans OpenStreetMap les lieux d'un type autour d'un endroit en RDC (pharmacies, hôpitaux, banques, distributeurs, écoles, hôtels…), du plus proche au plus loin, avec la distance à vol d'oiseau.",
    parametres: {
      type: 'object',
      properties: {
        categorie: {
          type: 'string',
          enum: Object.keys(CATEGORIES_PROCHES),
          description: 'Type de lieu cherché',
        },
        pres_de: {
          type: 'string',
          description:
            'Endroit autour duquel chercher, avec la ville, ex. « Rond-point Victoire, Kinshasa »',
        },
      },
      required: ['categorie', 'pres_de'],
    },
  },
];

export const NOMS_OUTILS_CARTE = new Set(OUTILS_CARTE.map((o) => o.nom));

export const CONSIGNE_CARTE =
  "\nCarte de la RDC : pour une question sur un lieu en RDC (où se trouve un endroit, distance entre deux lieux, pharmacie ou hôpital proche…), utilise d'abord chercher_lieu_rdc ou lieux_proches_rdc, puis réponds avec ces données d'OpenStreetMap. Une carte des lieux trouvés s'affiche sous ta réponse : n'écris ni coordonnées ni liens, dis seulement que la carte est en dessous si c'est utile. Les distances sont à vol d'oiseau : par la route, c'est plus long, dis-le. Si OpenStreetMap ne trouve rien, dis-le simplement, sans inventer d'adresse.";

/** Exécute un outil de carte : texte pour Six, et lieux à montrer sur la carte. */
export async function executerOutilCarte(
  nom: string,
  args: Record<string, unknown>,
): Promise<{ resultat: string; lieux: LieuCarte[] }> {
  try {
    if (nom === 'chercher_lieu_rdc') {
      const requete = typeof args.requete === 'string' ? args.requete : '';
      const lieux = await chercherLieuRdc(requete);
      if (!lieux.length)
        return { resultat: `OpenStreetMap ne trouve pas « ${requete} » en RDC.`, lieux: [] };
      const premier = lieux[0];
      const lignes = lieux.map(
        (l, i) =>
          `${i + 1}. ${l.detail ?? l.nom}${i ? ` (à ${arrondi(distanceKm(premier, l))} du premier)` : ''}`,
      );
      return { resultat: `Résultats OpenStreetMap :\n${lignes.join('\n')}`, lieux: [premier] };
    }
    if (nom === 'lieux_proches_rdc') {
      const categorie = typeof args.categorie === 'string' ? args.categorie : '';
      const presDe = typeof args.pres_de === 'string' ? args.pres_de : '';
      if (!CATEGORIES_PROCHES[categorie])
        return { resultat: `Catégorie inconnue : ${categorie}.`, lieux: [] };
      const [centre] = await chercherLieuRdc(presDe);
      if (!centre)
        return { resultat: `OpenStreetMap ne trouve pas « ${presDe} » en RDC.`, lieux: [] };
      const proches = await lieuxProches(categorie, centre);
      if (!proches.length)
        return {
          resultat: `Aucun lieu de ce type n'est enregistré dans OpenStreetMap à moins de 2 km de ${centre.detail ?? centre.nom}. Il peut en exister qui ne sont pas encore sur la carte.`,
          lieux: [centre],
        };
      const lignes = proches.map(
        (l, i) =>
          `${i + 1}. ${l.nom}${l.detail ? `, ${l.detail}` : ''} : ${arrondi(distanceKm(centre, l))}`,
      );
      return {
        resultat: `Autour de ${centre.detail ?? centre.nom} (OpenStreetMap, distances à vol d'oiseau) :\n${lignes.join('\n')}`,
        lieux: [centre, ...proches],
      };
    }
    return { resultat: `Outil inconnu : ${nom}.`, lieux: [] };
  } catch {
    return {
      resultat: 'OpenStreetMap ne répond pas pour le moment. Réponds sans la carte et dis-le.',
      lieux: [],
    };
  }
}

/** La question porte sur un lieu, un trajet ou une distance : Six utilisera la carte. */
export function questionDeLieu(texte: string): boolean {
  return /(?<![\wÀ-ÿ])(o[uù] (se trouve|se situe|est|sont|trouver|acheter)|adresse|itin[ée]raire|comment (aller|me rendre|se rendre|y aller|arriver)|distance|loin d|pr[èe]s d[eu]?|proche|[àa] c[ôo]t[ée] d|autour d|quartier|commune|avenue|boulevard|rond-point|localis\w*|carte|situ[ée]e?s?|kilom[èe]tres?|pharmacies?|h[ôo]pita(l|ux)|cliniques?)(?![\wÀ-ÿ])/i.test(
    texte,
  );
}

/** Lieux à montrer : sans doublons (même position), 10 au plus. */
export function lieuxUniques(lieux: LieuCarte[]): LieuCarte[] {
  const vus = new Set<string>();
  return lieux
    .filter((l) => {
      const cle = `${l.lat.toFixed(4)},${l.lon.toFixed(4)}`;
      if (vus.has(cle)) return false;
      vus.add(cle);
      return true;
    })
    .slice(0, 10);
}
