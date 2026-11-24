import { nettoyerTextePdf } from '@/lib/pdf-seven';
import {
  reglagesPartie,
  resoudre,
  type Alignement,
  type Gabarit,
  type MiseEnForme,
  type Resolue,
  type StyleBloc,
} from './mise-en-forme';
import { SIGNATURE } from '@/lib/marque';

/**
 * Génération des rapports de Six en Word (.docx) et en PDF, sans dépendance de plus, selon la fiche de mise en forme
 * du rapport (lib/agent/mise-en-forme.ts) :
 * - Word : archive ZIP de fichiers XML écrite directement. Style « personnel » : les styles Word appris sur les
 *   rapports de la personne ; « professionnel » : styles sobres de Six. Titres en styles Titre 1/2/3, table des
 *   matières automatique (Word la met à jour à l'ouverture), page de garde, numéros de page.
 * - PDF : jsPDF (déjà utilisé par l'app), même réglages, table des matières avec numéros de page.
 */

export type Bloc =
  | { type: 'titre'; niveau: 1 | 2 | 3; texte: string }
  | { type: 'paragraphe'; texte: string }
  | { type: 'puce'; texte: string }
  | { type: 'tableau'; lignes: string[][] }
  | { type: 'legende'; texte: string };

/** Légende de tableau ou de figure (« Tableau 2 : … », « Figure 1 – … »), mise en forme à part. */
const LEGENDE = /^\*{0,2}_?(tableau|figure|fig\.)\s*\d+(\.\d+)?\s*[:.–—-]/i;

/** Cellules d'une ligne de tableau Markdown (« | a | b | »). */
function cellules(ligne: string): string[] {
  return ligne
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/**
 * Découpe le Markdown en blocs : titres (#, ##, ###), puces (-, *, •, 1.), tableaux (| a | b |), légendes
 * (« Tableau 1 : … »), paragraphes (lignes jointes).
 */
export function lireMarkdown(md: string): Bloc[] {
  const blocs: Bloc[] = [];
  let paragraphe: string[] = [];
  let tableau: string[][] = [];
  const fermer = () => {
    if (paragraphe.length) blocs.push({ type: 'paragraphe', texte: paragraphe.join(' ') });
    paragraphe = [];
    if (tableau.length) {
      const n = Math.max(...tableau.map((l) => l.length));
      blocs.push({
        type: 'tableau',
        lignes: tableau.map((l) => [...l, ...Array<string>(n - l.length).fill('')]),
      });
    }
    tableau = [];
  };
  for (const brute of md.replace(/\r\n/g, '\n').split('\n')) {
    const ligne = brute.trim();
    const titre = /^(#{1,6})\s+(.+)$/.exec(ligne);
    const puce = /^([-*•]|\d+[.)])\s+(.+)$/.exec(ligne);
    if (/^\|.*\|$/.test(ligne) && ligne.length > 2) {
      if (paragraphe.length) {
        blocs.push({ type: 'paragraphe', texte: paragraphe.join(' ') });
        paragraphe = [];
      }
      // Ligne de séparation « |---|:--:| » : ignorée.
      if (!/^\|[\s:|-]+\|$/.test(ligne)) tableau.push(cellules(ligne));
      continue;
    }
    if (tableau.length) fermer();
    if (!ligne || /^[-=_*]{3,}$/.test(ligne)) fermer();
    else if (LEGENDE.test(ligne) && ligne.length <= 220) {
      fermer();
      blocs.push({ type: 'legende', texte: ligne.replace(/^[*_]+|[*_]+$/g, '').trim() });
    } else if (titre) {
      fermer();
      blocs.push({
        type: 'titre',
        niveau: Math.min(3, titre[1].length) as 1 | 2 | 3,
        texte: titre[2].replace(/#+\s*$/, '').trim(),
      });
    } else if (puce) {
      fermer();
      blocs.push({ type: 'puce', texte: /^\d/.test(puce[1]) ? `${puce[1]} ${puce[2]}` : puce[2] });
    } else paragraphe.push(ligne);
  }
  fermer();
  return blocs;
}

/** Morceaux de texte avec ou sans gras (**…**), le reste du Markdown en ligne retiré. */
export function morceaux(texte: string): { texte: string; gras: boolean }[] {
  const propre = texte
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1 ($2)')
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, '$1$2');
  return propre
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((m) =>
      m.startsWith('**') && m.endsWith('**')
        ? { texte: m.slice(2, -2), gras: true }
        : { texte: m, gras: false },
    );
}

/**
 * Structure du rapport : le premier titre « # » est le titre du document ; les autres titres sont renumérotés à
 * partir de 1 (souvent « ## » = partie, « ### » = sous-partie).
 */
export type Structure = { titre: string; blocs: Bloc[] };

/** Parties qui ne se numérotent pas (normes de présentation et meilleurs rapports de la personne). */
const SANS_NUMERO =
  /^(introduction|conclusions?|references?|bibliographie|webographie|sources?|annexes?|resume|abstract|remerciements?|dedicace|epigraphe|avant propos|sommaire|table des matieres|liste des|sigles|abreviations|glossaire|declaration)\b/;

/** Retire la numérotation écrite à la main (« 2.1 », « II. », « Chapitre 3 : », « Partie 1 : »). */
export function sansNumero(titre: string): string {
  return titre
    .replace(
      /^\s*(?:(?:chapitre|partie|section)\s+[\dIVXLC]+\s*[:.\-–]?\s*|[IVXLC]{1,5}[.)]\s+|[IVXLC]{1,5}\.\d+(?:\.\d+)*\.?\s+|\d+(?:\.\d+)+\.?\s+|\d+[.)]\s+)/i,
      '',
    )
    .trim();
}

const cleSansNumero = (t: string) =>
  sansNumero(t)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .trim();

/**
 * Numérotation décimale des titres (1., 1.1, 1.1.1), comme dans les meilleurs rapports de la personne et les guides
 * de présentation : l'introduction, la conclusion, les références et les annexes ne sont pas numérotées, ni leurs
 * sous-parties. Une numérotation écrite à la main (souvent incohérente) est remplacée.
 */
export function numeroter(blocs: Bloc[]): Bloc[] {
  const c = [0, 0, 0];
  let dansNumerote = false;
  return blocs.map((b) => {
    if (b.type !== 'titre') return b;
    const texte = sansNumero(b.texte) || b.texte;
    if (b.niveau === 1) {
      dansNumerote = !SANS_NUMERO.test(cleSansNumero(b.texte));
      if (!dansNumerote) return { ...b, texte };
      c[0]++;
      c[1] = 0;
      c[2] = 0;
      return { ...b, texte: `${c[0]}. ${texte}` };
    }
    if (!dansNumerote) return { ...b, texte };
    if (b.niveau === 2) {
      c[1]++;
      c[2] = 0;
      return { ...b, texte: `${c[0]}.${c[1]} ${texte}` };
    }
    c[2]++;
    return { ...b, texte: `${c[0]}.${c[1]}.${c[2]} ${texte}` };
  });
}

export function structurer(md: string, nomFichier: string, numerotation = false): Structure {
  let blocs = lireMarkdown(md);
  let titre = '';
  if (blocs[0]?.type === 'titre' && blocs[0].niveau === 1) {
    titre = blocs[0].texte;
    blocs = blocs.slice(1);
  }
  const niveaux = blocs
    .filter((b) => b.type === 'titre')
    .map((b) => (b as { niveau: number }).niveau);
  const decalage = niveaux.length ? Math.min(...niveaux) - 1 : 0;
  blocs = blocs.map((b) =>
    b.type === 'titre'
      ? { ...b, niveau: Math.max(1, Math.min(3, b.niveau - decalage)) as 1 | 2 | 3 }
      : b,
  );
  if (numerotation) blocs = numeroter(blocs);
  return { titre: titre || nomFichier.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), blocs };
}

/** Titre d'un rapport : son premier titre « # », sinon le nom du fichier. */
export function titreRapport(md: string, nomFichier: string): string {
  return structurer(md, nomFichier).titre;
}

// ---------- Word (.docx) ----------

const xml = (t: string) =>
  t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu, '');

const JC: Record<Alignement, string> = {
  gauche: 'left',
  centre: 'center',
  droite: 'right',
  justifie: 'both',
};

function rPr(s: StyleBloc, gras = false): string {
  const p: string[] = [];
  if (s.police)
    p.push(
      `<w:rFonts w:ascii="${xml(s.police)}" w:hAnsi="${xml(s.police)}" w:cs="${xml(s.police)}"/>`,
    );
  if (s.gras || gras) p.push('<w:b/>');
  if (s.italique) p.push('<w:i/>');
  if (s.majuscules) p.push('<w:caps/>');
  if (s.couleur) p.push(`<w:color w:val="${s.couleur}"/>`);
  if (s.taille)
    p.push(
      `<w:sz w:val="${Math.round(s.taille * 2)}"/><w:szCs w:val="${Math.round(s.taille * 2)}"/>`,
    );
  return p.length ? `<w:rPr>${p.join('')}</w:rPr>` : '';
}

function runs(texte: string, s: StyleBloc): string {
  return morceaux(texte)
    .map((m) => `<w:r>${rPr(s, m.gras)}<w:t xml:space="preserve">${xml(m.texte)}</w:t></w:r>`)
    .join('');
}

function paragraphe(
  contenu: string,
  o: {
    style?: string;
    jc?: Alignement;
    interligne?: number;
    avant?: number;
    apres?: number;
    sautAvant?: boolean;
  } = {},
): string {
  const p: string[] = [];
  if (o.style) p.push(`<w:pStyle w:val="${o.style}"/>`);
  if (o.sautAvant) p.push('<w:pageBreakBefore/>');
  if (o.interligne || o.avant !== undefined || o.apres !== undefined)
    p.push(
      `<w:spacing${o.avant !== undefined ? ` w:before="${o.avant}"` : ''}${o.apres !== undefined ? ` w:after="${o.apres}"` : ''}${o.interligne ? ` w:line="${Math.round(o.interligne * 240)}" w:lineRule="auto"` : ''}/>`,
    );
  if (o.jc) p.push(`<w:jc w:val="${JC[o.jc]}"/>`);
  return `<w:p>${p.length ? `<w:pPr>${p.join('')}</w:pPr>` : ''}${contenu}</w:p>`;
}

const SAUT_DE_PAGE = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

/** Tableau Word : bordures fines, première ligne en gras sur fond gris clair et répétée en haut de chaque page. */
function tableauXml(lignes: string[][], r: Resolue): string {
  const bord = (c: string) => `<w:${c} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`;
  const bords = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(bord).join('');
  const st = { ...r.texte, taille: Math.max(9, r.texte.taille - 1) };
  const rangs = lignes
    .map((l, i) => {
      const entete = i === 0;
      const cases = l
        .map(
          (c) =>
            `<w:tc><w:tcPr>${entete ? '<w:shd w:val="clear" w:color="auto" w:fill="E7E9EE"/>' : ''}</w:tcPr>${paragraphe(
              runs(c, { ...st, gras: entete || st.gras }),
              { jc: entete ? 'centre' : 'gauche', avant: 40, apres: 40 },
            )}</w:tc>`,
        )
        .join('');
      return `<w:tr>${entete ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cases}</w:tr>`;
    })
    .join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:jc w:val="center"/><w:tblBorders>${bords}</w:tblBorders><w:tblLayout w:type="autofit"/></w:tblPr><w:tblGrid>${lignes[0]
    .map(() => '<w:gridCol/>')
    .join('')}</w:tblGrid>${rangs}</w:tbl>`;
}

function documentXml(
  s: Structure,
  r: Resolue,
  ids: Required<Gabarit['ids']>,
  margesTwips: number,
): string {
  const corps: string[] = [];
  const g = r.page_de_garde;
  if (g.afficher) {
    if (g.etablissement)
      corps.push(
        paragraphe(runs(g.etablissement, { ...r.texte, taille: r.texte.taille + 3, gras: true }), {
          jc: 'centre',
          apres: 2400,
        }),
      );
    else corps.push(paragraphe('', { apres: 2400 }));
    corps.push(
      paragraphe(runs(s.titre, r.titre_document), { jc: r.titre_document.alignement, apres: 360 }),
    );
    if (g.sous_titre)
      corps.push(
        paragraphe(runs(g.sous_titre, { ...r.texte, taille: r.texte.taille + 3, italique: true }), {
          jc: 'centre',
          apres: 2400,
        }),
      );
    const lignes = [
      g.auteur && `Rédigé par : ${g.auteur}`,
      g.encadrant && `Sous la direction de : ${g.encadrant}`,
      g.date,
    ].filter(Boolean) as string[];
    for (const l of lignes)
      corps.push(
        paragraphe(runs(l, { ...r.texte, taille: r.texte.taille + 1 }), {
          jc: 'centre',
          apres: 120,
        }),
      );
    corps.push(SAUT_DE_PAGE);
  } else {
    corps.push(
      paragraphe(runs(s.titre, r.titre_document), {
        style: ids.titre,
        jc: r.titre_document.alignement,
        apres: 360,
      }),
    );
  }
  if (r.sommaire.afficher && s.blocs.some((b) => b.type === 'titre')) {
    corps.push(
      paragraphe(runs(r.sommaire.titre, { ...r.titres['1'], alignement: r.sommaire.alignement }), {
        jc: r.sommaire.alignement,
        apres: 240,
      }),
    );
    // Champ « table des matières » : Word le remplit avec les numéros de page à l'ouverture (updateFields).
    const entrees = s.blocs.filter((b) => b.type === 'titre') as {
      niveau: 1 | 2 | 3;
      texte: string;
    }[];
    entrees.forEach((e, i) => {
      const debut =
        i === 0
          ? '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>'
          : '';
      const fin = i === entrees.length - 1 ? '<w:r><w:fldChar w:fldCharType="end"/></w:r>' : '';
      corps.push(
        paragraphe(
          `${debut}<w:r><w:t xml:space="preserve">${xml(
            morceaux(e.texte)
              .map((m) => m.texte)
              .join(''),
          )}</w:t></w:r>${fin}`,
          { style: `TM${e.niveau}`, jc: r.sommaire.alignement },
        ),
      );
    });
    corps.push(SAUT_DE_PAGE);
  }
  for (const b of s.blocs) {
    if (b.type === 'titre') {
      const st = {
        ...r.titres[String(b.niveau) as '1' | '2' | '3'],
        ...reglagesPartie(r, b.texte),
      };
      corps.push(
        paragraphe(runs(b.texte, st), {
          style: ids[`titre${b.niveau}` as 'titre1'],
          jc: st.alignement,
        }),
      );
    } else if (b.type === 'legende') {
      // Légende centrée en italique : au-dessus d'un tableau, sous une figure (normes de présentation).
      corps.push(
        paragraphe(runs(b.texte, { ...r.texte, taille: r.texte.taille - 1, italique: true }), {
          jc: 'centre',
          avant: 120,
          apres: 120,
        }),
      );
    } else if (b.type === 'tableau') {
      corps.push(tableauXml(b.lignes, r));
      corps.push(paragraphe('', { apres: 120 }));
    } else if (b.type === 'puce') {
      const contenu =
        (/^\d/.test(b.texte)
          ? ''
          : `<w:r>${rPr(r.texte)}<w:t xml:space="preserve">•\u00a0</w:t></w:r>`) +
        runs(b.texte, r.texte);
      corps.push(
        paragraphe(contenu, {
          style: ids.puce,
          jc: r.texte.alignement === 'justifie' ? 'gauche' : r.texte.alignement,
          interligne: r.texte.interligne,
        }),
      );
    } else
      corps.push(
        paragraphe(runs(b.texte, r.texte), {
          jc: r.texte.alignement,
          interligne: r.texte.interligne,
        }),
      );
  }
  const marge = Math.round(r.marges_cm * 567) || margesTwips;
  const pied = r.numeros_de_page ? '<w:footerReference w:type="default" r:id="rIdPied"/>' : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${corps.join('')}<w:sectPr>${pied}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${marge}" w:right="${marge}" w:bottom="${marge}" w:left="${marge}" w:header="708" w:footer="708" w:gutter="0"/>${r.page_de_garde.afficher ? '<w:titlePg/>' : ''}</w:sectPr></w:body></w:document>`;
}

/** Styles de la table des matières (TM1 à TM3), avec l'alignement demandé et des points de conduite. */
function stylesSommaire(r: Resolue, largeurTexte: number): string {
  return [1, 2, 3]
    .map(
      (n) =>
        `<w:style w:type="paragraph" w:styleId="TM${n}"><w:name w:val="toc ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/><w:unhideWhenUsed/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${largeurTexte}"/></w:tabs><w:spacing w:after="100"/>${n > 1 ? `<w:ind w:left="${(n - 1) * 240}"/>` : ''}<w:jc w:val="${JC[r.sommaire.alignement]}"/></w:pPr>${n === 1 ? '<w:rPr><w:b/></w:rPr>' : ''}</w:style>`,
    )
    .join('');
}

const STYLES_PRO = (r: Resolue) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${xml(r.texte.police)}" w:hAnsi="${xml(r.texte.police)}" w:cs="${xml(r.texte.police)}"/><w:sz w:val="${Math.round(r.texte.taille * 2)}"/><w:szCs w:val="${Math.round(r.texte.taille * 2)}"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Titre"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="300"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Titre1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Titre2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Titre3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="2"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Paragraphedeliste"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80"/><w:ind w:left="567" w:hanging="283"/></w:pPr></w:style>
${stylesSommaire(r, 11906 - 2 * Math.round(r.marges_cm * 567))}
</w:styles>`;

/** Styles de la personne, avec ses styles de table des matières remplacés (alignement demandé). */
function stylesPersonnels(g: Gabarit, r: Resolue): string {
  const sans = g.stylesXml.replace(
    /<w:style\b(?:(?!<\/w:style>)[\s\S])*?<w:name w:val="toc [123]"\/>[\s\S]*?<\/w:style>/g,
    '',
  );
  return sans.replace(
    '</w:styles>',
    `${stylesSommaire(r, 11906 - 2 * Math.round(r.marges_cm * 567))}</w:styles>`,
  );
}

const PIED = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;

const REGLAGES_WORD = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:updateFields w:val="true"/><w:defaultTabStop w:val="708"/><w:characterSpacingControl w:val="doNotCompress"/></w:settings>`;

function coreXml(titre: string): string {
  const maintenant = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(titre)}</dc:title><dc:creator>Six by Seven.AI</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${maintenant}</dcterms:created></cp:coreProperties>`;
}

// ZIP sans compression (méthode « stored ») : suffisant pour un .docx, lisible par Word et LibreOffice.
const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(octets: Uint8Array): number {
  let c = 0xffffffff;
  for (const o of octets) c = TABLE_CRC[(c ^ o) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipSansCompression(fichiers: { nom: string; contenu: string }[]): Buffer {
  const enc = new TextEncoder();
  const locaux: Buffer[] = [];
  const centraux: Buffer[] = [];
  let decalage = 0;
  for (const f of fichiers) {
    const nom = enc.encode(f.nom);
    const donnees = enc.encode(f.contenu);
    const crc = crc32(donnees);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(donnees.length, 18);
    local.writeUInt32LE(donnees.length, 22);
    local.writeUInt16LE(nom.length, 26);
    locaux.push(local, Buffer.from(nom), Buffer.from(donnees));
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(donnees.length, 20);
    central.writeUInt32LE(donnees.length, 24);
    central.writeUInt16LE(nom.length, 28);
    central.writeUInt32LE(decalage, 42);
    centraux.push(central, Buffer.from(nom));
    decalage += 30 + nom.length + donnees.length;
  }
  const tailleCentrale = centraux.reduce((n, b) => n + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(fichiers.length, 8);
  fin.writeUInt16LE(fichiers.length, 10);
  fin.writeUInt32LE(tailleCentrale, 12);
  fin.writeUInt32LE(decalage, 16);
  return Buffer.concat([...locaux, ...centraux, fin]);
}

export type OptionsRendu = { mise?: MiseEnForme; gabarit?: Gabarit | null; nomFichier?: string };

export function versWord(md: string, o: OptionsRendu = {}): Buffer {
  const r = resoudre(o.mise ?? {}, o.gabarit ?? null);
  const s = structurer(md, o.nomFichier ?? 'rapport', r.numerotation);
  const perso = r.style === 'personnel' && o.gabarit;
  const ids = {
    titre1: (perso && o.gabarit?.ids.titre1) || 'Titre1',
    titre2: (perso && o.gabarit?.ids.titre2) || 'Titre2',
    titre3: (perso && o.gabarit?.ids.titre3) || 'Titre3',
    titre: (perso && o.gabarit?.ids.titre) || 'Titre',
    puce: (perso && o.gabarit?.ids.puce) || 'Paragraphedeliste',
  };
  const avecTheme = Boolean(perso && o.gabarit?.themeXml);
  const avecPolices = Boolean(perso && o.gabarit?.policesXml);
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>${avecTheme ? '<Override PartName="/word/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' : ''}${avecPolices ? '<Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>' : ''}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const relsDoc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdReglages" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rIdPied" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>${avecTheme ? '<Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>' : ''}${avecPolices ? '<Relationship Id="rIdPolices" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>' : ''}</Relationships>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const fichiers = [
    { nom: '[Content_Types].xml', contenu: types },
    { nom: '_rels/.rels', contenu: rels },
    { nom: 'word/_rels/document.xml.rels', contenu: relsDoc },
    { nom: 'word/document.xml', contenu: documentXml(s, r, ids, o.gabarit?.margesTwips ?? 1417) },
    {
      nom: 'word/styles.xml',
      contenu: perso && o.gabarit ? stylesPersonnels(o.gabarit, r) : STYLES_PRO(r),
    },
    { nom: 'word/settings.xml', contenu: REGLAGES_WORD },
    { nom: 'word/footer1.xml', contenu: PIED },
    { nom: 'docProps/core.xml', contenu: coreXml(s.titre) },
  ];
  if (avecTheme && o.gabarit?.themeXml)
    fichiers.push({ nom: 'word/theme/theme1.xml', contenu: o.gabarit.themeXml });
  if (avecPolices && o.gabarit?.policesXml)
    fichiers.push({ nom: 'word/fontTable.xml', contenu: o.gabarit.policesXml });
  return zipSansCompression(fichiers);
}

// ---------- PDF ----------

type Rgb = { r: number; g: number; b: number };
const rgb = (hex: string): Rgb => ({
  r: parseInt(hex.slice(0, 2), 16),
  g: parseInt(hex.slice(2, 4), 16),
  b: parseInt(hex.slice(4, 6), 16),
});
/** jsPDF n'a que trois familles intégrées : on choisit la plus proche de la police demandée. */
export function familleDe(police: string): 'times' | 'helvetica' | 'courier' {
  const p = police.toLowerCase();
  if (/times|cambria|georgia|garamond|book|serif|palatino/.test(p) && !/sans/.test(p))
    return 'times';
  if (/courier|mono|consolas/.test(p)) return 'courier';
  return 'helvetica';
}

export async function versPdf(md: string, o: OptionsRendu = {}): Promise<Buffer> {
  const { jsPDF } = await import('jspdf');
  const r = resoudre(o.mise ?? {}, o.gabarit ?? null);
  const s = structurer(md, o.nomFichier ?? 'rapport', r.numerotation);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title: s.titre, creator: SIGNATURE });
  const L = 210;
  const H = 297;
  const marge = r.marges_cm * 10;
  const largeur = L - 2 * marge;
  const mm = (pt: number) => pt * 0.3528;
  let y = marge;
  const nouvellePage = () => {
    doc.addPage();
    y = marge;
  };
  const place = (h: number) => {
    if (y + h > H - marge) nouvellePage();
  };
  const appliquer = (
    st: StyleBloc & { police?: string; taille?: number; couleur?: string },
    gras = false,
  ) => {
    doc.setFont(
      familleDe(st.police ?? r.texte.police),
      st.gras || gras ? (st.italique ? 'bolditalic' : 'bold') : st.italique ? 'italic' : 'normal',
    );
    doc.setFontSize(st.taille ?? r.texte.taille);
    const c = rgb(st.couleur ?? r.texte.couleur);
    doc.setTextColor(c.r, c.g, c.b);
  };
  /** Écrit un bloc de texte aligné ; justifié = toutes les lignes sauf la dernière. */
  const ecrire = (
    texte: string,
    st: StyleBloc,
    aligne: Alignement,
    interligne: number,
    retrait = 0,
  ) => {
    const contenu = nettoyerTextePdf(st.majuscules ? texte.toUpperCase() : texte);
    const lignes = doc.splitTextToSize(contenu, largeur - retrait) as string[];
    const pas = mm(st.taille ?? r.texte.taille) * 1.25 * interligne;
    lignes.forEach((ligne, i) => {
      place(pas);
      const x =
        aligne === 'centre'
          ? marge + largeur / 2
          : aligne === 'droite'
            ? marge + largeur
            : marge + retrait;
      const options =
        aligne === 'justifie' && i < lignes.length - 1
          ? { align: 'justify' as const, maxWidth: largeur - retrait }
          : {
              align: (aligne === 'centre' ? 'center' : aligne === 'droite' ? 'right' : 'left') as
                'center' | 'right' | 'left',
            };
      doc.text(ligne, x, y + pas * 0.8, options);
      y += pas;
    });
  };

  let pageSommaire = 0;
  const g = r.page_de_garde;
  if (g.afficher) {
    y = H * 0.18;
    if (g.etablissement) {
      appliquer({ ...r.texte, taille: r.texte.taille + 3, gras: true });
      ecrire(g.etablissement, { ...r.texte, taille: r.texte.taille + 3 }, 'centre', 1.2);
    }
    y = H * 0.38;
    appliquer(r.titre_document);
    ecrire(s.titre, r.titre_document, r.titre_document.alignement, 1.15);
    if (g.sous_titre) {
      y += 6;
      appliquer({ ...r.texte, taille: r.texte.taille + 3, italique: true });
      ecrire(g.sous_titre, { ...r.texte, taille: r.texte.taille + 3 }, 'centre', 1.2);
    }
    y = H * 0.72;
    appliquer({ ...r.texte, taille: r.texte.taille + 1 });
    for (const l of [
      g.auteur && `Rédigé par : ${g.auteur}`,
      g.encadrant && `Sous la direction de : ${g.encadrant}`,
      g.date,
    ].filter(Boolean) as string[])
      ecrire(l, { ...r.texte, taille: r.texte.taille + 1 }, 'centre', 1.4);
    nouvellePage();
  } else {
    appliquer(r.titre_document);
    ecrire(s.titre, r.titre_document, r.titre_document.alignement, 1.15);
    y += 6;
  }
  const titres = s.blocs.filter((b) => b.type === 'titre') as {
    niveau: 1 | 2 | 3;
    texte: string;
  }[];
  if (r.sommaire.afficher && titres.length) {
    // Page réservée au sommaire, remplie à la fin (on connaît alors la page de chaque titre).
    if (y > marge + 1) nouvellePage();
    pageSommaire = doc.getNumberOfPages();
    nouvellePage();
  }
  const pages: number[] = [];
  for (const b of s.blocs) {
    if (b.type === 'titre') {
      const st = {
        ...r.titres[String(b.niveau) as '1' | '2' | '3'],
        ...reglagesPartie(r, b.texte),
      };
      y += b.niveau === 1 ? 6 : 3;
      place(mm(st.taille ?? 14) * 3 + 12);
      pages.push(doc.getNumberOfPages());
      appliquer(st);
      ecrire(
        morceaux(b.texte)
          .map((m) => m.texte)
          .join(''),
        st,
        st.alignement ?? 'gauche',
        1.1,
      );
      y += 2;
    } else if (b.type === 'legende') {
      const st = { ...r.texte, taille: r.texte.taille - 1, italique: true };
      y += 1;
      appliquer(st);
      ecrire(
        morceaux(b.texte)
          .map((m) => m.texte)
          .join(''),
        st,
        'centre',
        1.1,
      );
      y += 2;
    } else if (b.type === 'tableau') {
      // Grille simple : colonnes proportionnelles à la longueur de leur contenu, texte coupé dans chaque case.
      const taille = Math.max(8, r.texte.taille - 1.5);
      const pas = mm(taille) * 1.25;
      const n = b.lignes[0].length;
      const poids = Array.from({ length: n }, (_, j) =>
        Math.min(40, Math.max(6, ...b.lignes.map((l) => (l[j] ?? '').length))),
      );
      const somme = poids.reduce((a, x) => a + x, 0);
      const larg = poids.map((p) => (largeur * p) / somme);
      const propre = (t: string) =>
        nettoyerTextePdf(
          morceaux(t)
            .map((m) => m.texte)
            .join(''),
        );
      b.lignes.forEach((l, i) => {
        const entete = i === 0;
        doc.setFont(familleDe(r.texte.police), entete ? 'bold' : 'normal');
        doc.setFontSize(taille);
        const contenus = l.map(
          (c, j) => doc.splitTextToSize(propre(c), Math.max(4, larg[j] - 3)) as string[],
        );
        const h = Math.max(...contenus.map((c) => c.length)) * pas + 2.5;
        place(h);
        let x = marge;
        contenus.forEach((c, j) => {
          if (entete) {
            doc.setFillColor(231, 233, 238);
            doc.rect(x, y, larg[j], h, 'F');
          }
          doc.setDrawColor(128, 128, 128);
          doc.setLineWidth(0.2);
          doc.rect(x, y, larg[j], h);
          doc.setTextColor(20, 24, 34);
          c.forEach((ligne, k) => doc.text(ligne, x + 1.5, y + 1.2 + pas * (k + 0.8)));
          x += larg[j];
        });
        y += h;
      });
      y += 4;
    } else {
      appliquer(r.texte);
      const texte = morceaux(b.texte)
        .map((m) => m.texte)
        .join('');
      if (b.type === 'puce' && !/^\d/.test(b.texte)) {
        place(mm(r.texte.taille) * 1.3);
        doc.text('-', marge + 1.5, y + mm(r.texte.taille) * 1.05);
      }
      ecrire(
        texte,
        r.texte,
        b.type === 'puce' ? 'gauche' : r.texte.alignement,
        r.texte.interligne,
        b.type === 'puce' ? 6 : 0,
      );
      y += b.type === 'puce' ? 1 : 3;
    }
  }
  if (pageSommaire) {
    doc.setPage(pageSommaire);
    y = marge;
    appliquer({ ...r.titres['1'] });
    ecrire(r.sommaire.titre, r.titres['1'], r.sommaire.alignement, 1.1);
    y += 4;
    titres.forEach((t, i) => {
      if (y > H - marge - 8) return; // sommaire limité à une page
      const st = { ...r.texte, gras: t.niveau === 1 };
      appliquer(st);
      const retrait = (t.niveau - 1) * 5;
      const libelle = nettoyerTextePdf(
        morceaux(t.texte)
          .map((m) => m.texte)
          .join(''),
      ).slice(0, 90);
      const num = String(pages[i] - (g.afficher ? 1 : 0));
      const pas = mm(r.texte.taille) * 1.6;
      const xNum = marge + largeur;
      if (r.sommaire.alignement === 'centre')
        doc.text(`${libelle}   ${num}`, marge + largeur / 2, y + pas * 0.8, { align: 'center' });
      else if (r.sommaire.alignement === 'droite')
        doc.text(`${libelle}   ${num}`, xNum, y + pas * 0.8, { align: 'right' });
      else {
        const x = marge + retrait;
        doc.text(libelle, x, y + pas * 0.8);
        const fin = x + doc.getTextWidth(libelle) + 2;
        const debutNum = xNum - doc.getTextWidth(num) - 2;
        if (debutNum > fin)
          doc.text(
            '.'.repeat(Math.max(0, Math.floor((debutNum - fin) / doc.getTextWidth('.')))),
            fin,
            y + pas * 0.8,
          );
        doc.text(num, xNum, y + pas * 0.8, { align: 'right' });
      }
      y += pas;
    });
  }
  if (r.numeros_de_page) {
    const total = doc.getNumberOfPages();
    for (let p = g.afficher ? 2 : 1; p <= total; p++) {
      doc.setPage(p);
      doc.setFont(familleDe(r.texte.police), 'normal');
      doc.setFontSize(9);
      doc.setTextColor(96, 103, 116);
      doc.text(String(p - (g.afficher ? 1 : 0)), L / 2, H - marge / 2, { align: 'center' });
    }
  }
  return Buffer.from(doc.output('arraybuffer'));
}
