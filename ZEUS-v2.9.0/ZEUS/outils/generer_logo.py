"""Génère le logo ZEUS (Z titane et or, noyau cubique cyan) : logo.svg, icon.svg, et la marque compacte.

    python outils/generer_logo.py zeuscore/ui

Les icônes PNG (icon-192.png, icon-256.png pour le raccourci Windows, icon-512.png) sont des rendus de icon.svg :
à refaire avec un navigateur si le dessin change.
"""
import math
import sys

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
CX, CY = 500, 455


def mirror(p):
    return (2 * CX - p[0], 2 * CY - p[1])


# Silhouette du Z (symétrique par rapport au centre) : barre haute biseautée à gauche, diagonale, barre basse
# biseautée à droite.
a1, a2, a3, tr, tr2 = (316, 176), (214, 300), (552, 300), (786, 176), (786, 226)
Z = [a1, tr, tr2, mirror(a3), mirror(a2), mirror(a1), mirror(tr), mirror(tr2), a3, a2]


def area(poly):
    return sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1]
               for i in range(len(poly))) / 2


def inset(poly, d):
    """Polygone décalé vers l'intérieur de d (intersection des côtés décalés)."""
    s = 1 if area(poly) > 0 else -1  # y vers le bas : aire > 0 = sens horaire à l'écran
    n = len(poly)
    lines = []
    for i in range(n):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % n]
        dx, dy = x2 - x1, y2 - y1
        L = math.hypot(dx, dy)
        nx, ny = -dy / L * s, dx / L * s  # normale intérieure
        lines.append(((x1 + nx * d, y1 + ny * d), (dx, dy)))
    out = []
    for i in range(n):
        (p, r), (q, s2) = lines[i - 1], lines[i]
        den = r[0] * s2[1] - r[1] * s2[0]
        if abs(den) < 1e-9:
            out.append(q)
            continue
        t = ((q[0] - p[0]) * s2[1] - (q[1] - p[1]) * s2[0]) / den
        out.append((p[0] + r[0] * t, p[1] + r[1] * t))
    return out


def path(poly):
    return "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in poly) + " Z"


def hexagon(r, cx=CX, cy=CY):
    return [(cx + r * math.cos(math.radians(-90 + 60 * k)), cy + r * math.sin(math.radians(-90 + 60 * k)))
            for k in range(6)]


OUTER, INNER, CORE = hexagon(194), hexagon(114), hexagon(54)


def ln(p, q, cls, extra=""):
    return f'<line x1="{p[0]:.1f}" y1="{p[1]:.1f}" x2="{q[0]:.1f}" y2="{q[1]:.1f}" class="{cls}"{extra}/>'


def cube_edges(h, c=(CX, CY)):
    edges = [(h[i], h[(i + 1) % 6]) for i in range(6)]
    # cube vu d'en haut : arêtes du centre vers le haut-gauche, le haut-droit et le bas
    edges += [(c, h[1]), (c, h[5]), (c, h[3])]
    return edges


def network(detail=True):
    out = []
    # liens entre le grand et le petit cube (effet « tesseract »)
    for i in range(6):
        out.append(ln(OUTER[i], INNER[i], "n2"))
    for p, q in cube_edges(OUTER):
        out.append(ln(p, q, "n1"))
    for p, q in cube_edges(INNER):
        out.append(ln(p, q, "n0"))
    frame = []
    if detail:
        for p, q in cube_edges(CORE):
            out.append(ln(p, q, "n0"))
        for i in range(6):
            out.append(ln(INNER[i], CORE[i], "n3"))
        # liens vers le cadre du Z (haut, bas, et les deux angles intérieurs)
        g = inset(Z, 25)
        frame = [(CX, g[0][1]), mirror((CX, g[0][1])), g[8], mirror(g[8])]
        out.append(ln(OUTER[0], frame[0], "n1"))
        out.append(ln(OUTER[3], frame[1], "n1"))
        out.append(ln(OUTER[5], frame[2], "n2"))
        out.append(ln(OUTER[2], frame[3], "n2"))
    nodes = OUTER + INNER + [(CX, CY)] + frame
    return out, nodes


def traces():
    """Circuits cyan qui suivent le contour intérieur du Z (dans la rainure)."""
    g = inset(Z, 25)
    # g[0]=haut-gauche, g[1]=haut-droit, g[2], g[3]=jonction diagonale/barre basse, ... g[8]=jonction haute, g[9]=bas-gauche
    up = [g[9], g[0], (g[1][0] - 70, g[1][1]), g[1], g[2], ((g[2][0] + g[3][0]) / 2, (g[2][1] + g[3][1]) / 2)]
    down = [mirror(p) for p in up]
    return up, down, [up[2], up[5], down[2], down[5], g[9], mirror(g[9])]


def defs(uid, detail):
    return f'''<defs>
  <linearGradient id="{uid}ti" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#f6f8fa"/><stop offset=".22" stop-color="#b9c0c9"/><stop offset=".45" stop-color="#6b727d"/>
    <stop offset=".6" stop-color="#d4d9df"/><stop offset=".82" stop-color="#4a505b"/><stop offset="1" stop-color="#22262e"/>
  </linearGradient>
  <linearGradient id="{uid}ti2" x1="1" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#9aa2ad"/><stop offset=".5" stop-color="#3c424c"/><stop offset="1" stop-color="#b8bfc8"/>
  </linearGradient>
  <linearGradient id="{uid}au" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff2b0"/><stop offset=".25" stop-color="#e2bb54"/><stop offset=".5" stop-color="#9c7726"/>
    <stop offset=".68" stop-color="#ecd07c"/><stop offset="1" stop-color="#5e430e"/>
  </linearGradient>
  <linearGradient id="{uid}gr" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#05070b"/><stop offset="1" stop-color="#121722"/>
  </linearGradient>
  <radialGradient id="{uid}core" cx=".5" cy=".5" r=".5">
    <stop offset="0" stop-color="#7ff6ff" stop-opacity=".55"/><stop offset=".45" stop-color="#00c8e6" stop-opacity=".22"/>
    <stop offset="1" stop-color="#00c8e6" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="{uid}veil" cx=".5" cy=".5" r=".5">
    <stop offset="0" stop-color="#03060b" stop-opacity=".78"/><stop offset=".72" stop-color="#03060b" stop-opacity=".55"/>
    <stop offset="1" stop-color="#03060b" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="{uid}bg" cx=".5" cy=".42" r=".75">
    <stop offset="0" stop-color="#1a2130"/><stop offset=".6" stop-color="#0b0f17"/><stop offset="1" stop-color="#05070b"/>
  </radialGradient>
  <linearGradient id="{uid}txt" gradientUnits="userSpaceOnUse" x1="0" y1="905" x2="0" y2="985">
    <stop offset="0" stop-color="#f4fbff"/><stop offset=".55" stop-color="#9fb6c7"/><stop offset="1" stop-color="#d9ecf5"/>
  </linearGradient>
  <filter id="{uid}glow" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation="{7 if detail else 9}" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="{uid}shadow" x="-15%" y="-15%" width="130%" height="140%">
    <feDropShadow dx="0" dy="18" stdDeviation="16" flood-color="#000" flood-opacity=".75"/>
  </filter>
</defs>'''


def style(uid, detail, animate):
    sw = 1 if detail else 1.6  # traits plus épais pour la petite icône
    css = f'''.{uid} .n0{{stroke:#9ff8ff;stroke-width:{5.5 * sw}}} .{uid} .n1{{stroke:#2ee6ff;stroke-width:{4.2 * sw}}}
.{uid} .n2{{stroke:#2ee6ff;stroke-width:{3 * sw};opacity:.85}} .{uid} .n3{{stroke:#2ee6ff;stroke-width:2.2;opacity:.55}}
.{uid} .tr{{fill:none;stroke:#2ee6ff;stroke-width:{4.5 * sw};stroke-linejoin:round;stroke-linecap:round}}
.{uid} .nd{{fill:#eaffff}} .{uid} .let{{fill:none;stroke:url(#{uid}txt);stroke-width:11;stroke-linecap:square;stroke-linejoin:miter}}'''
    if animate:
        css += f'''
@keyframes {uid}p{{0%,100%{{opacity:.75}}50%{{opacity:1}}}}
@keyframes {uid}s{{0%{{stroke-dashoffset:260}}100%{{stroke-dashoffset:0}}}}
.{uid} .nd{{animation:{uid}p 2.6s ease-in-out infinite}} .{uid} .nd:nth-child(2n){{animation-delay:-1.3s}}
.{uid} .scan{{stroke-dasharray:60 200;animation:{uid}s 3.2s linear infinite}}
@media (prefers-reduced-motion: reduce){{.{uid} .nd,.{uid} .scan{{animation:none}}}}'''
    return f"<style>{css}</style>"


LETTERS = {
    "Z": (72, "M0 0H72L0 80H72"),
    "E": (64, "M64 0H0V80H64M0 40H52"),
    "U": (72, "M0 0V64Q0 80 16 80H56Q72 80 72 64V0"),
    "S": (72, "M72 0H14Q0 0 0 14V26Q0 40 14 40H58Q72 40 72 54V66Q72 80 58 80H0"),
    "A": (76, "M0 80L38 0L76 80M16 50H60"),
    "I": (0, "M0 0V80"),
}


def wordmark(uid, y=905):
    text, gap, space = "ZEUS AI", 30, 46
    widths = [space if ch == " " else LETTERS[ch][0] for ch in text]
    total = sum(widths) + gap * (len(text) - 1)
    x = CX - total / 2
    parts = []
    for ch, w in zip(text, widths):
        if ch != " ":
            parts.append(f'<path d="{LETTERS[ch][1]}" transform="translate({x:.1f} {y})" class="let"/>')
        x += w + gap
    return (f'<g filter="url(#{uid}glow)" opacity=".35"><g style="stroke:#2ee6ff">'
            + "".join(p.replace('class="let"', 'class="let" style="stroke:#2ee6ff"') for p in parts) + "</g></g>"
            + "<g>" + "".join(parts) + "</g>")


def mark(uid, detail=True, animate=False):
    rim, groove, plate = Z, inset(Z, 15), inset(Z, 24)
    hi = inset(Z, 3)
    net, nodes = network(detail)
    up, down, tnodes = traces()
    tr = (f'<polyline points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in up)}" class="tr"/>'
          f'<polyline points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in down)}" class="tr"/>') if detail else ""
    scan = ""
    if animate:
        scan = (f'<polyline points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in up)}" class="tr scan" style="stroke:#eaffff"/>'
                f'<polyline points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in down)}" class="tr scan" style="stroke:#eaffff"/>')
    r_out, r_in = (8, 6.5) if detail else (13, 11)
    dots = "".join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r_out if i < 6 or i == 12 else r_in}" class="nd"/>'
                   for i, (x, y) in enumerate(nodes))
    tdots = "".join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="6" class="nd"/>' for x, y in tnodes) if detail else ""
    return f'''<g filter="url(#{uid}shadow)">
  <path d="{path(rim)}" fill="url(#{uid}ti)"/>
  <path d="{path(hi)}" fill="none" stroke="#ffffff" stroke-opacity=".45" stroke-width="2.5"/>
  <path d="{path(inset(Z, 21))}" fill="url(#{uid}gr)"/>
  <path d="{path(inset(Z, 29))}" fill="url(#{uid}au)"/>
  <path d="{path(inset(Z, 31))}" fill="none" stroke="#fff6c8" stroke-opacity=".5" stroke-width="2"/>
  <path d="{path(inset(Z, 45))}" fill="url(#{uid}gr)"/>
  <path d="{path(inset(Z, 52))}" fill="url(#{uid}ti2)" opacity=".9"/>
</g>
<circle cx="{CX}" cy="{CY}" r="235" fill="url(#{uid}veil)"/>
<circle cx="{CX}" cy="{CY}" r="185" fill="url(#{uid}core)"/>
<g filter="url(#{uid}glow)" stroke-linecap="round">{tr}{"".join(net)}{scan}</g>
<g>{dots}{tdots}</g>'''


def svg(viewbox, body, uid, detail, animate, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" role="img" aria-label="{title}" class="{uid}">'
            f"<title>{title}</title>{defs(uid, detail)}{style(uid, detail, animate)}{body}</svg>\n")


# 1. Logo complet (accueil, connexion) : fond obsidienne arrondi, marque et « ZEUS AI », animation légère.
logo_body = (f'<rect x="0" y="0" width="1000" height="1060" rx="120" fill="url(#zlbg)"/>'
             + mark("zl", detail=True, animate=True) + wordmark("zl", 905))
open(f"{OUT}/logo.svg", "w").write(svg("0 0 1000 1060", logo_body, "zl", True, True, "ZEUS AI"))

# 2. Icône (onglet, raccourci, appli installée) : tuile arrondie, marque seule, traits épaissis, sans animation.
icon_body = (f'<rect width="1000" height="1000" rx="210" fill="url(#zibg)"/>'
             f'<g transform="translate(500 500) scale(1.18) translate(-500 -455)">{mark("zi", detail=False)}</g>')
open(f"{OUT}/icon.svg", "w").write(svg("0 0 1000 1000", icon_body, "zi", False, False, "ZEUS"))

# 3. Marque compacte (en-tête des messages, 14 px) : le Z seul, couleur héritée, point cyan au centre.
mini = (f'<svg viewBox="200 170 600 570" aria-hidden="true"><path d="{path(Z)}"/>'
        f'<circle cx="{CX}" cy="{CY}" r="70" fill="#00E5FF"/></svg>')
open(f"{OUT}/mark-inline.txt", "w").write(mini)  # à recopier dans app.js (const BOLT)
print("ok", len(open(f"{OUT}/logo.svg").read()), len(open(f"{OUT}/icon.svg").read()))
