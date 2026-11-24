import { ecrireEnPlace, lireEspace, listerEspace } from '@/lib/espace-travail';
import { versPdf, versWord } from './documents';
import {
  chargerGabarit,
  ecrireFiche,
  fusionner,
  garderVersion,
  lireFiche,
  type MiseEnForme,
} from './mise-en-forme';

/**
 * Édition des rapports de Six : modifier un point précis (une partie, un passage, un titre, la mise en forme) sans
 * toucher au reste, garder la version précédente, puis régénérer le Word et le PDF.
 */

/** Génère le Word et/ou le PDF d'un rapport à côté de son texte (même nom), en remplaçant les anciennes versions. */
export async function regenerer(
  espace: string,
  cheminMd: string,
  contenu: string,
  mise: MiseEnForme,
  formats: readonly ('docx' | 'pdf')[] = ['docx'],
): Promise<string[]> {
  const gabarit = await chargerGabarit();
  const nomFichier = cheminMd.split('/').pop() ?? cheminMd;
  const base = cheminMd.replace(/\.[^./]+$/, '');
  const crees: string[] = [];
  for (const f of formats) {
    const octets =
      f === 'docx'
        ? versWord(contenu, { mise, gabarit, nomFichier })
        : await versPdf(contenu, { mise, gabarit, nomFichier });
    crees.push(await ecrireEnPlace(espace, `${base}.${f}`, octets));
  }
  return crees;
}

const cle = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^\s*[\divxlc]+\s*[.)\-–:]\s*/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

type Titre = { ligne: number; niveau: number; texte: string };

function titres(lignes: string[]): Titre[] {
  return lignes.flatMap((l, i) => {
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(l.trim());
    return m ? [{ ligne: i, niveau: m[1].length, texte: m[2] }] : [];
  });
}

/** Trouve la partie visée : intitulé identique, puis contenu dans l'intitulé (« conclusion » ↔ « Conclusion générale »). */
export function trouverPartie(lignes: string[], partie: string): Titre | undefined {
  const c = cle(partie);
  if (!c) return undefined;
  const t = titres(lignes);
  return (
    t.find((x) => cle(x.texte) === c) ??
    t.find((x) => cle(x.texte).includes(c) || c.includes(cle(x.texte)))
  );
}

/** Fin d'une partie : avant le titre suivant de même niveau ou plus haut. */
function finPartie(lignes: string[], t: Titre): number {
  const suivant = titres(lignes).find((x) => x.ligne > t.ligne && x.niveau <= t.niveau);
  return suivant ? suivant.ligne : lignes.length;
}

/** Résout le rapport visé : « rapport.docx » → « resultats/rapport.md », nom seul → recherche dans l'espace. */
async function resoudreChemin(espace: string, brut: string): Promise<string | null> {
  const nom = brut
    .trim()
    .replace(/\\/g, '/')
    .replace(/\.(docx|pdf)$/i, '.md');
  const candidats = [
    nom,
    nom.endsWith('.md') ? nom : `${nom}.md`,
    `resultats/${nom.split('/').pop()}`,
  ];
  for (const c of candidats) if (await lireEspace(espace, c)) return c;
  const cible = cle(nom.split('/').pop() ?? nom).replace(/ md$/, '');
  const fichiers = (await listerEspace(espace)).filter((f) => /\.md$/i.test(f.chemin));
  return (
    fichiers.find((f) => cle(f.chemin.split('/').pop() ?? '').replace(/ md$/, '') === cible)
      ?.chemin ??
    fichiers.find((f) => cle(f.chemin).includes(cible))?.chemin ??
    null
  );
}

const texte = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');

export async function modifierDocument(
  espace: string,
  args: Record<string, unknown>,
): Promise<{ resultat: string; fichiers?: string[] }> {
  const chemin = await resoudreChemin(espace, texte(args.chemin));
  if (!chemin)
    return {
      resultat: `Rapport introuvable : « ${String(args.chemin)} ». Utilise lister_espace pour voir les noms exacts.`,
    };
  const avant = (await lireEspace(espace, chemin))?.toString('utf8') ?? '';
  let lignes = avant.replace(/\r\n/g, '\n').split('\n');
  const faits: string[] = [];
  const problemes: string[] = [];

  const partie = texte(args.partie);
  const nouveauTexte = texte(args.nouveau_texte);
  const nouveauTitre = texte(args.nouveau_titre_partie);
  if (partie && (nouveauTexte || nouveauTitre)) {
    const t = trouverPartie(lignes, partie);
    if (!t)
      problemes.push(
        `partie « ${partie} » introuvable (parties : ${titres(lignes)
          .map((x) => x.texte)
          .join(', ')})`,
      );
    else {
      if (nouveauTexte) {
        // On garde les sous-parties s'il y en a : seul le texte propre à la partie est remplacé.
        const sousPartie = titres(lignes).find(
          (x) => x.ligne > t.ligne && x.niveau > t.niveau && x.ligne < finPartie(lignes, t),
        );
        const fin =
          sousPartie && !/^#/m.test(nouveauTexte) ? sousPartie.ligne : finPartie(lignes, t);
        lignes = [
          ...lignes.slice(0, t.ligne + 1),
          '',
          ...nouveauTexte.split('\n'),
          '',
          ...lignes.slice(fin),
        ];
        faits.push(`partie « ${t.texte} » réécrite`);
      }
      if (nouveauTitre) {
        lignes[t.ligne] = `${'#'.repeat(t.niveau)} ${nouveauTitre}`;
        faits.push(`partie « ${t.texte} » renommée en « ${nouveauTitre} »`);
      }
    }
  }

  const remplacer = typeof args.remplacer === 'string' ? args.remplacer : '';
  if (remplacer) {
    const actuel = lignes.join('\n');
    const n = actuel.split(remplacer).length - 1;
    if (!n) problemes.push(`passage « ${remplacer.slice(0, 60)} » introuvable tel quel`);
    else {
      lignes = actuel
        .split(remplacer)
        .join(typeof args.par === 'string' ? args.par : '')
        .split('\n');
      faits.push(`${n} passage(s) remplacé(s)`);
    }
  }

  const ajoutTitre = texte(args.nouvelle_partie_titre);
  if (ajoutTitre) {
    const t = titres(lignes);
    const niveau = t.find((x) => x.niveau > 1)?.niveau ?? 2;
    const apres = texte(args.apres_partie);
    const repere = apres ? trouverPartie(lignes, apres) : undefined;
    const biblio = t.find((x) => /bibliograph|r[ée]f[ée]rences|sources|webograph/i.test(x.texte));
    const position = repere ? finPartie(lignes, repere) : biblio ? biblio.ligne : lignes.length;
    if (apres && !repere)
      problemes.push(`partie « ${apres} » introuvable : ajout placé avant la bibliographie`);
    lignes = [
      ...lignes.slice(0, position),
      `${'#'.repeat(niveau)} ${ajoutTitre}`,
      '',
      ...texte(args.nouvelle_partie_texte).split('\n'),
      '',
      ...lignes.slice(position),
    ];
    faits.push(`partie « ${ajoutTitre} » ajoutée`);
  }

  let mise = await lireFiche(espace, chemin);
  if (args.mise_en_forme && typeof args.mise_en_forme === 'object') {
    mise = fusionner(mise, args.mise_en_forme);
    await ecrireFiche(espace, chemin, mise);
    faits.push(`mise en forme modifiée (${Object.keys(args.mise_en_forme).join(', ')})`);
  }

  if (!faits.length)
    return {
      resultat: `Rien n'a été modifié${problemes.length ? ` : ${problemes.join(' ; ')}` : ' : précise la partie, le passage ou la mise en forme à changer'}.`,
    };

  const apres = lignes.join('\n').replace(/\n{3,}/g, '\n\n');
  if (apres !== avant) {
    await garderVersion(espace, chemin, avant);
    await ecrireEnPlace(espace, chemin, apres);
  }
  // Le Word est toujours mis à jour ; le PDF seulement s'il avait été produit.
  const base = chemin.replace(/\.[^./]+$/, '');
  const avecPdf = (await listerEspace(espace)).some((f) => f.chemin === `${base}.pdf`);
  const fichiers = [
    chemin,
    ...(await regenerer(espace, chemin, apres, mise, avecPdf ? ['docx', 'pdf'] : ['docx'])),
  ];
  return {
    resultat: `Modifié : ${faits.join(' ; ')}.${problemes.length ? ` Non fait : ${problemes.join(' ; ')}.` : ''} Fichiers à jour : ${fichiers.join(', ')} (version précédente gardée).`,
    fichiers,
  };
}
