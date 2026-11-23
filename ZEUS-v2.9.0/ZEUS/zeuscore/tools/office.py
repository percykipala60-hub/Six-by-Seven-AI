"""Création de fichiers Excel (.xlsx) et Word (.docx) sans dépendance (OOXML minimal valide)."""

from __future__ import annotations

import re
import zipfile
from xml.sax.saxutils import escape

from . import ToolContext, ToolResult, p, tool

CT_XLSX = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
{sheets}</Types>"""
RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="{target}"/>
</Relationships>"""
STYLES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFE08A"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>"""


def _col(n: int) -> str:
    s = ""
    n += 1
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def _num(v) -> str | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, str):
        t = v.strip().replace(" ", "").replace(" ", "")
        if re.fullmatch(r"-?\d+([.,]\d+)?", t):
            return t.replace(",", ".")
    return None


def write_xlsx(path, sheets: dict[str, list[list]], header: bool = True) -> None:
    names = list(sheets) or ["Feuille1"]
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        overrides = "".join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-'
                            f'officedocument.spreadsheetml.worksheet+xml"/>\n' for i in range(1, len(names) + 1))
        z.writestr("[Content_Types].xml", CT_XLSX.format(sheets=overrides))
        z.writestr("_rels/.rels", RELS.format(target="xl/workbook.xml"))
        z.writestr("xl/styles.xml", STYLES)
        sheet_xml = "".join(f'<sheet name="{escape(n[:31])}" sheetId="{i}" r:id="rId{i}"/>' for i, n in enumerate(names, 1))
        z.writestr("xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                   'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                   f'<sheets>{sheet_xml}</sheets></workbook>')
        rels = "".join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
                       f'worksheet" Target="worksheets/sheet{i}.xml"/>' for i in range(1, len(names) + 1))
        rels += (f'<Relationship Id="rId{len(names) + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/'
                 f'relationships/styles" Target="styles.xml"/>')
        z.writestr("xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{rels}</Relationships>')
        for i, n in enumerate(names, 1):
            rows = sheets.get(n) or []
            widths: dict[int, int] = {}
            out = []
            for r, row in enumerate(rows, 1):
                cells = []
                for c, v in enumerate(row):
                    ref = f"{_col(c)}{r}"
                    style = ' s="1"' if header and r == 1 else ""
                    if v is None or v == "":
                        continue
                    num = _num(v) if not (header and r == 1) else None
                    if num is not None:
                        cells.append(f'<c r="{ref}"{style}><v>{num}</v></c>')
                    elif isinstance(v, str) and v.startswith("="):
                        cells.append(f'<c r="{ref}"{style}><f>{escape(v[1:])}</f></c>')
                    else:
                        cells.append(f'<c r="{ref}"{style} t="inlineStr"><is><t xml:space="preserve">{escape(str(v))}</t></is></c>')
                    widths[c] = max(widths.get(c, 8), min(60, len(str(v)) + 2))
                out.append(f'<row r="{r}">{"".join(cells)}</row>')
            cols = "".join(f'<col min="{c + 1}" max="{c + 1}" width="{w}" customWidth="1"/>' for c, w in sorted(widths.items()))
            pane = ('<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" '
                    'state="frozen"/></sheetView></sheetViews>') if header and rows else ""
            z.writestr(f"xl/worksheets/sheet{i}.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                       '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                       f'{pane}{"<cols>" + cols + "</cols>" if cols else ""}<sheetData>{"".join(out)}</sheetData></worksheet>')


CT_DOCX = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""


def _runs(text: str, size: int | None = 22, bold_all: bool = False) -> str:
    out = []
    for i, part in enumerate(re.split(r"\*\*(.+?)\*\*", text)):
        if not part:
            continue
        bold = bold_all or i % 2 == 1
        rpr = ("<w:b/>" if bold else "") + (f'<w:sz w:val="{size}"/><w:szCs w:val="{size}"/>' if size else "")
        out.append(f'<w:r>{"<w:rPr>" + rpr + "</w:rPr>" if rpr else ""}<w:t xml:space="preserve">{escape(part)}</w:t></w:r>')
    return "".join(out)


_NUMERIC = re.compile(r"^[\s*]*[-+]?[\d\s.,]+\s*(%|[€$£¥]|[A-Z]{2,4}|FC|CFA)?[\s*]*$")
_BORDERS = "".join(f'<w:{b} w:val="single" w:sz="4" w:space="0" w:color="A6A6A6"/>'
                   for b in ("top", "left", "bottom", "right", "insideH", "insideV"))


def _table(rows: list[list[str]]) -> str:
    """Tableau Word à partir de lignes « | a | b | » (la 1re ligne = en-tête sur fond coloré)."""
    ncol = max(len(r) for r in rows)
    width = 9072 // ncol  # largeur utile d'une page A4 avec marges de 2,5 cm
    out = [f'<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>{_BORDERS}</w:tblBorders>'
           '<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>'
           '<w:tblGrid>' + f'<w:gridCol w:w="{width}"/>' * ncol + '</w:tblGrid>']
    for i, r in enumerate(rows):
        out.append("<w:tr>")
        for j in range(ncol):
            cell = r[j] if j < len(r) else ""
            shade = '<w:shd w:val="clear" w:color="auto" w:fill="DCE6F2"/>' if i == 0 else ""
            jc = '<w:jc w:val="right"/>' if i and j and _NUMERIC.match(cell or "x") else ""
            out.append(f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/>{shade}</w:tcPr>'
                       f'<w:p><w:pPr>{jc}<w:spacing w:before="40" w:after="40"/></w:pPr>{_runs(cell, 20, i == 0)}</w:p></w:tc>')
        out.append("</w:tr>")
    out.append("</w:tbl><w:p/>")
    return "".join(out)


def write_docx(path, content: str, title: str = "") -> None:
    paras = []
    if title:
        paras.append(f'<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr>{_runs(title, 36, True)}</w:p>')
    table: list[list[str]] = []
    for line in content.splitlines() + [""]:
        s = line.rstrip()
        if s.strip().startswith("|"):
            cells = [c.strip() for c in s.strip().strip("|").split("|")]
            if not all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c):  # ligne de séparation |---|
                table.append(cells)
            continue
        if table:
            paras.append(_table(table))
            table = []
        if not s.strip():
            paras.append("<w:p/>")
            continue
        m = re.match(r"^(#{1,3})\s+(.*)", s)
        if m:
            size = {1: 32, 2: 28, 3: 24}[len(m.group(1))]
            paras.append(f'<w:p><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>{_runs(m.group(2), size, True)}</w:p>')
            continue
        m = re.match(r"^\s*[-*•]\s+(.*)", s)
        if m:
            paras.append(f'<w:p><w:pPr><w:ind w:left="567" w:hanging="283"/></w:pPr>{_runs("• " + m.group(1))}</w:p>')
            continue
        align = ""
        if s.startswith(">>"):
            s, align = s[2:].strip(), '<w:jc w:val="right"/>'
        paras.append(f'<w:p><w:pPr>{align}<w:spacing w:after="120"/></w:pPr>{_runs(s)}</w:p>')
    body = "".join(paras) + ('<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" '
                             'w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>')
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CT_DOCX)
        z.writestr("_rels/.rels", RELS.format(target="word/document.xml"))
        z.writestr("word/document.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                   f'<w:body>{body}</w:body></w:document>')


@tool("create_spreadsheet", "Crée un vrai fichier Excel (.xlsx) : une ou plusieurs feuilles, 1re ligne = en-têtes, "
                            "nombres reconnus, formules acceptées (« =SOMME(B2:B9) » en anglais : =SUM(B2:B9)).",
      {"path": p("string", "Chemin du fichier .xlsx"),
       "rows": p("array", "Lignes de la feuille (tableau de tableaux)", items={"type": "array", "items": {}}),
       "sheets": p("object", "Plusieurs feuilles : {\"Nom\": [[…], …]} (au lieu de rows)"),
       "sheet_name": p("string", "Nom de la feuille (Feuille1)")},
      required=["path"], risk="write", toolset="files")
def create_spreadsheet(ctx: ToolContext, path: str, rows: list | None = None, sheets: dict | None = None,
                       sheet_name: str = "Feuille1") -> ToolResult:
    f = ctx.resolve(path if path.lower().endswith(".xlsx") else path + ".xlsx")
    f.parent.mkdir(parents=True, exist_ok=True)
    data = sheets if isinstance(sheets, dict) and sheets else {sheet_name or "Feuille1": rows or []}
    clean = {str(k): [list(r) if isinstance(r, (list, tuple)) else [r] for r in (v or [])] for k, v in data.items()}
    write_xlsx(f, clean)
    n = sum(len(v) for v in clean.values())
    return ToolResult(text=f"Fichier Excel créé : {f} ({len(clean)} feuille(s), {n} ligne(s)). Utilise share_file pour le remettre.")


@tool("create_document", "Crée un vrai document Word (.docx) : lettre, attestation, rapport… Contenu en texte simple : "
                         "# titre, ## sous-titre, - puce, **gras**, ligne commençant par >> = alignée à droite, "
                         "tableau en lignes « | a | b | ».",
      {"path": p("string", "Chemin du fichier .docx"), "content": p("string", "Contenu"),
       "title": p("string", "Titre centré en haut (facultatif)")}, required=["path", "content"], risk="write",
      toolset="files")
def create_document(ctx: ToolContext, path: str, content: str, title: str = "") -> ToolResult:
    f = ctx.resolve(path if path.lower().endswith(".docx") else path + ".docx")
    f.parent.mkdir(parents=True, exist_ok=True)
    write_docx(f, content, title)
    return ToolResult(text=f"Document Word créé : {f}. Utilise share_file pour le remettre.")
