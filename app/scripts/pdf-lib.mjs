/**
 * pdf-lib.mjs — petit moteur PDF sans aucune dépendance.
 * Usage : makePdf(outPath, titreEnTete, buildFn) où buildFn reçoit
 * { newPage, heading, text, bullet, table, spacer }.
 * Technique : primitives PDF 1.4 écrites à la main (pages A4, polices standard
 * WinAnsi, retours à la ligne mesurés par largeur de caractères approximée).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/* ------------------------------------------------------------------ */
/* Polices standard : largeur approximative des glyphes WinAnsi       */
/* (unité /1000 de la taille de police ; suffisant pour couper les    */
/* lignes proprement sans mesurer chaque glyphe).                     */
/* ------------------------------------------------------------------ */
const W = {
  default: 500,
  space: 278,
  punct: 278,
  digit: 556,
  upper: 700,
  lower: 520,
};
function charWidth(ch) {
  if (ch === ' ') return W.space;
  if (/[.,;:!?'"()[\]{}\-–—|·•]/.test(ch)) return W.punct;
  if (/[0-9]/.test(ch)) return W.digit;
  if (/[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇ]/.test(ch)) return W.upper;
  if (/[a-zàâäéèêëîïôöùûüÿç]/.test(ch)) return W.lower;
  return W.default;
}
function textWidth(t, size) {
  let u = 0;
  for (const ch of t) u += charWidth(ch);
  return (u * size) / 1000;
}
function wrap(text, size, maxWidth) {
  const lines = [];
  for (const raw of String(text).split('\n')) {
    if (raw === '') {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of raw.split(' ')) {
      const cand = line ? line + ' ' + word : word;
      if (textWidth(cand, size) <= maxWidth) line = cand;
      else {
        if (line) lines.push(line);
        // Mot plus large que la colonne : coupe brut.
        if (textWidth(word, size) > maxWidth) {
          let piece = '';
          for (const ch of word) {
            if (textWidth(piece + ch, size) > maxWidth) {
              lines.push(piece);
              piece = ch;
            } else piece += ch;
          }
          line = piece;
        } else line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}
/* PDF + WinAnsi : les caractères non ASCII doivent partir en octets Latin-1,
   donc on les encode en séquences octales \ooo (pur ASCII, donc sûr en UTF-8). */
const WINANSI = new Map([
  [0x20ac, 128],
  [0x201a, 130],
  [0x0192, 131],
  [0x201e, 132],
  [0x2026, 133],
  [0x2020, 134],
  [0x2021, 135],
  [0x02c6, 136],
  [0x2030, 137],
  [0x0160, 138],
  [0x2039, 139],
  [0x0152, 140],
  [0x017d, 142],
  [0x2018, 145],
  [0x2019, 146],
  [0x201c, 147],
  [0x201d, 148],
  [0x2022, 149],
  [0x2013, 150],
  [0x2014, 151],
  [0x02dc, 152],
  [0x2122, 153],
  [0x0161, 154],
  [0x203a, 155],
  [0x0153, 156],
  [0x017e, 158],
  [0x0178, 159],
]);
function esc(t) {
  let out = '';
  for (const ch of String(t)) {
    let c = ch.codePointAt(0);
    if (WINANSI.has(c)) c = WINANSI.get(c);
    else if (c > 255) c = 63; // ? pour tout caractère non représentable
    if (ch === '\\') out += '\\\\';
    else if (ch === '(') out += '\\(';
    else if (ch === ')') out += '\\)';
    else if (c <= 31) out += ' ';
    else if (c >= 128) out += '\\' + c.toString(8).padStart(3, '0');
    else out += String.fromCodePoint(c);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Modèle de page : blocs de haut en bas, saut de page automatique.   */
/* ------------------------------------------------------------------ */
const PAGE_W = 595.28,
  PAGE_H = 841.89; // A4 portrait
const M = { top: 64, bottom: 64, left: 56, right: 56 };
const COLORS = {
  bleu: [0.302, 0.486, 0.996],
  fond: [0.039, 0.059, 0.11],
  texte: [0.12, 0.14, 0.18],
  gris: [0.42, 0.45, 0.5],
  rouge: [0.75, 0.2, 0.15],
  vert: [0.13, 0.5, 0.3],
};

export function makePdf(outPath, headerTitle, build) {
  const pages = [];
  let ops = [];
  let y = 0;
  let pageNo = 0;

  function newPage() {
    if (ops.length) pages.push({ ops });
    ops = [];
    pageNo += 1;
    y = PAGE_H - M.top;
    // Bandeau d'en-tête (page blanche, pastille bleue)
    ops.push(
      `${COLORS.bleu[0]} ${COLORS.bleu[1]} ${COLORS.bleu[2]} rg ${M.left} ${y - 6} 18 18 re f`,
    );
    ops.push(`BT /F1 9 Tf 0.1 0.12 0.16 rg ${M.left + 26} ${y} Td (${esc('Six — 7 AI')}) Tj ET`);
    ops.push(
      `BT /F3 8 Tf 0.45 0.48 0.53 rg ${PAGE_W - M.right - 118} ${y} Td (${esc(headerTitle)}) Tj ET`,
    );
    ops.push(`0.85 0.87 0.9 RG 0.8 w ${M.left} ${y - 12} m ${PAGE_W - M.right} ${y - 12} l S`);
    y -= 34;
    if (pageNo > 1) {
      ops.push(
        `BT /F2 8 Tf 0.5 0.53 0.58 rg ${PAGE_W / 2 - 40} ${M.bottom - 18} Td (— page ${pageNo} —) Tj ET`,
      );
    }
  }
  function need(h) {
    if (y - h < M.bottom) newPage();
  }
  function text(
    t,
    {
      size = 10,
      font = 'F3',
      color = COLORS.texte,
      x = M.left,
      width = PAGE_W - M.left - M.right,
      after = 0,
      before = 0,
      align = 'left',
    } = {},
  ) {
    need(size + 4);
    y -= before;
    for (const line of wrap(t, size, width)) {
      need(size * 1.45);
      y -= size * 1.3;
      const w = textWidth(line, size);
      const tx = align === 'center' ? x + (width - w) / 2 : x;
      ops.push(
        `BT /${font} ${size} Tf ${color[0]} ${color[1]} ${color[2]} rg ${tx.toFixed(2)} ${y.toFixed(2)} Td (${esc(line)}) Tj ET`,
      );
    }
    y -= after;
  }
  function heading(n, t) {
    need(38);
    y -= 8;
    const size = n === 1 ? 20 : n === 2 ? 14 : 11.5;
    text(t, {
      size,
      font: 'F1',
      color: n === 1 ? [0.06, 0.09, 0.18] : COLORS.bleu,
      after: n === 1 ? 2 : 4,
    });
    if (n === 1)
      ops.push(
        `${COLORS.bleu[0]} ${COLORS.bleu[1]} ${COLORS.bleu[2]} rg ${M.left} ${y - 2} 60 2.5 re f`,
      );
    if (n > 1)
      ops.push(
        `${COLORS.bleu[0]} ${COLORS.bleu[1]} ${COLORS.bleu[2]} rg ${M.left} ${y - 3} 26 2 re f`,
      );
    y -= n === 1 ? 10 : 8;
  }
  function bullet(t, { size = 10, color = COLORS.texte } = {}) {
    const indent = 14;
    need(size + 4);
    ops.push(
      `${COLORS.bleu[0]} ${COLORS.bleu[1]} ${COLORS.bleu[2]} rg ${M.left + 2} ${y - size + 2} 3 3 re f`,
    );
    text(t, { size, color, x: M.left + indent, width: PAGE_W - M.left - M.right - indent });
  }
  function cell(t, x, y0, w, { size = 9, bold = false, color = COLORS.texte, pad = 6 } = {}) {
    let yy = y0 - pad - size;
    for (const line of wrap(t, size, w - pad * 2)) {
      ops.push(
        `BT /${bold ? 'F1' : 'F3'} ${size} Tf ${color[0]} ${color[1]} ${color[2]} rg ${(x + pad).toFixed(2)} ${yy.toFixed(2)} Td (${esc(line)}) Tj ET`,
      );
      yy -= size * 1.3;
    }
    return y0 - yy; // hauteur consommée
  }
  function table(headers, rows, widths, { headingColor = COLORS.fond } = {}) {
    const cw = PAGE_W - M.left - M.right;
    const total = widths.reduce((a, b) => a + b, 0);
    const scale = cw / total;
    const cols = widths.map((w) => w * scale);
    // mesure des hauteurs de ligne
    const rowH = rows.map((r) => {
      let h = 0;
      r.forEach((c, i) => {
        const lines = wrap(String(c), 9, cols[i] - 12).length;
        h = Math.max(h, lines * 9 * 1.3 + 12);
      });
      return h;
    });
    const headerH =
      Math.max(...headers.map((c, i) => wrap(c, 9, cols[i] - 12).length)) * 9 * 1.3 + 14;
    const totalH = headerH + rowH.reduce((a, b) => a + b, 0) + (rows.length + 1) * 0.8;
    // si le tableau ne tient pas sur la page, on recommence sur une nouvelle
    if (y - totalH < M.bottom) newPage();
    const draw = (yTop) => {
      let yy = yTop;
      const row = (h, fill) => {
        ops.push(
          `${fill} rg ${M.left} ${(yy - h).toFixed(2)} ${cw.toFixed(2)} ${h.toFixed(2)} re f`,
        );
        yy -= h;
      };
      // en-tête
      ops.push(
        `${headingColor[0]} ${headingColor[1]} ${headingColor[2]} rg ${M.left} ${(yy - headerH).toFixed(2)} ${cw.toFixed(2)} ${headerH.toFixed(2)} re f`,
      );
      let hx = M.left;
      headers.forEach((c, i) => {
        cell(c, hx, yy, cols[i], { bold: true, color: [1, 1, 1] });
        hx += cols[i];
      });
      yy -= headerH;
      let x = M.left;
      rows.forEach((r, ri) => {
        row(rowH[ri], ri % 2 ? 0.955 : 0.975);
        x = M.left;
        r.forEach((c, ci) => {
          cell(c, x, yy + rowH[ri], cols[ci], { bold: ci === 0 });
          x += cols[ci];
        });
      });
      // grille
      ops.push(
        `0.78 0.8 0.84 RG 0.8 w ${M.left} ${yy.toFixed(2)} m ${M.left + cw} ${yy.toFixed(2)} l S`,
      );
      x = M.left;
      const yt = yTop;
      cols.forEach((cwidth) => {
        ops.push(`${x.toFixed(2)} ${yt.toFixed(2)} m ${x.toFixed(2)} ${yy.toFixed(2)} l S`);
        x += cwidth;
      });
      ops.push(
        `${(M.left + cw).toFixed(2)} ${yt.toFixed(2)} m ${(M.left + cw).toFixed(2)} ${yy.toFixed(2)} l S`,
      );
      return yTop - totalH;
    };
    y = draw(y);
  }
  function spacer(h) {
    y -= h;
  }

  build({ newPage, heading, text, bullet, table, spacer, colors: COLORS });
  pages.push({ ops });

  /* ---------------------------------------------------------------- */
  /* Écriture du PDF                                                  */
  /* ---------------------------------------------------------------- */
  const objects = [];
  const addObj = (s) => {
    objects.push(s);
    return objects.length;
  };

  // Objets 1-3 : polices standard
  const fontRegular = addObj(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>',
  );
  const fontBold = addObj(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>',
  );
  const fontItalic = addObj(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic /Encoding /WinAnsiEncoding >>',
  );
  // Remap : F1=gras, F2=regular (pied de page), F3=regular (texte)
  const fontIds = { F1: fontBold, F2: fontRegular, F3: fontRegular, F4: fontItalic };

  // Numérotation : contenus 4..n+3, pages n+4..2n+3, Pages 2n+4, Catalog 2n+5
  const nbPages = pages.length;
  const pagesId = 4 + 2 * nbPages;
  const catalogId = pagesId + 1;

  const contentIds = pages.map((p) => {
    const stream = p.ops.join('\n');
    return addObj(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  });

  const pageObjIds = pages.map((p, i) =>
    addObj(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595.28 841.89] ` +
        `/Resources << /Font << /F1 ${fontIds.F1} 0 R /F2 ${fontIds.F2} 0 R /F3 ${fontIds.F3} 0 R /F4 ${fontIds.F4} 0 R >> >> ` +
        `/Contents ${contentIds[i]} 0 R >>`,
    ),
  );

  addObj(
    `<< /Type /Pages /Count ${nbPages} /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] >>`,
  );
  addObj(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = '%PDF-1.4\n'; // l'octet de poids fort de chaque offset compte depuis le début du fichier
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, Buffer.from(pdf, 'latin1'));
  console.log(
    `OK : ${outPath} (${nbPages} page(s), ${Math.round(Buffer.byteLength(pdf, 'latin1') / 1024)} Ko)`,
  );
}
