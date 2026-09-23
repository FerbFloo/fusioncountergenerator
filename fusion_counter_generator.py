#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Odometer-Ziffern-Counter fuer DaVinci Resolve / Fusion
=======================================================
Erzeugt eine .setting-Datei, die man per Drag & Drop in den Fusion-Node-Editor
zieht. Jede Ziffernstelle ist ein eigenes "Rad" (Odometer-Prinzip):

  * Die Einerstelle laeuft kontinuierlich mit dem (geeasten) Zahlenwert mit.
  * Jede hoehere Stelle bewegt sich exakt in dem Wertintervall, in dem ihr
    Uebertrag stattfindet (19 -> 20: Zehner dreht synchron mit dem Einer;
    99 -> 100: alle drei drehen gleichzeitig).
  * Fuehrende Nullen sind unsichtbar -> eine neue Stelle "steigt" im Moment
    des Uebertrags von oben ins Bild.

Die komplette Animation steckt in Fusion-Expressions (keine Keyframes),
ist also im Node-Editor nachtraeglich lesbar und editierbar.

Beispiele:
    python3 fusion_counter_generator.py --start 21 --end 25 --duration 5 \
        --easing out --fps 25 -o counter_21_25.setting

    python3 fusion_counter_generator.py --start 10 --end 100 --duration 10 \
        --easing inout --fps 25 -o counter_10_100.setting
"""

import argparse
import math

# ---------------------------------------------------------------- Helpers ---


def num(x):
    """Zahl kurz und ohne Exponentialschreibweise formatieren."""
    x = float(x)
    if x == int(x):
        return str(int(x))
    return ("%.6f" % x).rstrip("0").rstrip(".")


def t_expr(start_frame, dur_frames):
    """Normalisierte Zeit 0..1 als Fusion-Expression."""
    return "max(0,min(1,(time-%s)/%s))" % (num(start_frame), num(dur_frames))


def ease_expr(easing, start_frame, dur_frames):
    """Easing-Kurve als Fusion-Expression (kubisch)."""
    T = t_expr(start_frame, dur_frames)
    e = easing.lower().replace("-", "").replace("_", "")
    if e in ("linear", "none"):
        return T
    if e == "in":                      # langsamer Start, schnelles Ende
        return "(%s*%s*%s)" % (T, T, T)
    if e == "out":                     # schneller Start, langsames Ende
        return "(1-(1-%s)*(1-%s)*(1-%s))" % (T, T, T)
    if e == "inout":                   # langsam - schnell - langsam
        return "iif(%s<0.5,4*%s*%s*%s,1-4*(1-%s)*(1-%s)*(1-%s))" % (T, T, T, T, T, T, T)
    raise ValueError("Unbekanntes Easing: %s (erlaubt: in, out, inout, linear)" % easing)


def value_expr(start, end, easing, start_frame, dur_frames):
    """Aktueller Zahlenwert v(t) als Fusion-Expression."""
    return "(%s+%s*%s)" % (num(start), num(end - start), ease_expr(easing, start_frame, dur_frames))


def wheel_expr(V, i):
    """
    Position des Rades i (0 = Einer) in Zellen.

    Rad i bewegt sich nur waehrend der letzten Werteinheit vor dem Uebertrag:
        p_i = floor(v/M) + clamp(v - floor(v/M)*M - M + 1, 0, 1)     mit M = 10^i
    Fuer i = 0 ergibt das exakt p_0 = v (kontinuierliches Laufen).
    """
    if i == 0:
        return V
    M = 10 ** i
    F = "floor(%s/%s)" % (V, M)
    return "(%s+max(0,min(1,%s-%s*%s-%s+1)))" % (F, V, F, M, M)


# ------------------------------------------------------------ .setting IO ---

def _inp(name, value=None, expr=None, src=None, src_out="Output"):
    if src is not None:
        return '\t\t\t\t%s = Input { SourceOp = "%s", Source = "%s", },' % (name, src, src_out)
    parts = []
    if value is not None:
        parts.append("Value = %s" % value)
    if expr is not None:
        parts.append('Expression = "%s"' % expr)
    return "\t\t\t\t%s = Input { %s, }," % (name, ", ".join(parts))


def _tool(name, tool_id, inputs, pos):
    out = ["\t\t%s = %s {" % (name, tool_id),
           "\t\t\tCtrlWZoom = false,",
           "\t\t\tNameSet = true,",
           "\t\t\tInputs = {"]
    out.extend(inputs)
    out.append("\t\t\t},")
    out.append("\t\t\tViewInfo = OperatorInfo { Pos = { %s, %s } }," % (num(pos[0]), num(pos[1])))
    out.append("\t\t},")
    return out


# ------------------------------------------------------------- Generator ---

def generate(start, end, duration, easing,
             fps=25.0, start_frame=0,
             size=0.25, font="Open Sans", style="Bold",
             color=(1.0, 1.0, 1.0),
             cell_factor=1.25, width_factor=0.80,
             soft_edge=0.0, aspect=16.0 / 9.0):

    start = float(start)
    end = float(end)
    if duration <= 0:
        raise ValueError("Dauer muss > 0 sein.")
    if start < 0 or end < 0:
        raise ValueError("Nur positive Zahlen werden unterstuetzt.")
    if start == end:
        raise ValueError("Startzahl und Endzahl sind identisch.")

    dur_frames = float(duration) * float(fps)
    V = value_expr(start, end, easing, start_frame, dur_frames)

    lo, hi = min(start, end), max(start, end)
    ndig = max(len(str(int(math.floor(hi)))), len(str(int(math.floor(lo)))), 1)

    spacing = width_factor * size / aspect   # horizontaler Ziffernabstand (Breiten-Anteil)
    cell_h = cell_factor * size              # Zellenhoehe (Hoehen-Anteil)

    # ---- Zellen (= einzelne Ziffern-Nodes) bestimmen -----------------------
    cells = []
    for i in range(ndig):
        M = 10 ** i
        P = wheel_expr(V, i)
        n_lo = int(math.floor(lo / M))
        n_hi = int(math.floor(hi / M))
        x = 0.5 + ((ndig - 1) / 2.0 - i) * spacing
        count = n_hi - n_lo + 1

        if count <= 10:
            # Jede Zelle bekommt einen eigenen Node mit fester Zellennummer.
            for n in range(n_lo, n_hi + 1):
                if i > 0 and n == 0:
                    continue          # fuehrende Null -> existiert nicht
                y = "0.5-(%s-%s)*%s" % (P, num(n), num(cell_h))
                cells.append(dict(i=i, d=n % 10, key=str(n),
                                  expr="Point(%s,%s)" % (num(x), y),
                                  blend=None))
        else:
            # Rad laeuft mehrfach um -> 10 Nodes, jeder springt ausserhalb
            # des Sichtfensters auf sein naechstgelegenes Vorkommen.
            for d in range(10):
                Q = "(%s-%s)" % (P, d)
                y = "0.5-(%s-10*floor(%s/10+0.5))*%s" % (Q, Q, num(cell_h))
                blend = None
                if i > 0 and n_lo <= 0 <= n_hi and d == 0:
                    blend = "iif((%s+10*floor(%s/10+0.5))<0.5,0,1)" % (d, Q)
                cells.append(dict(i=i, d=d, key="w%d" % d,
                                  expr="Point(%s,%s)" % (num(x), y),
                                  blend=blend))

    # ---- Nodes schreiben ---------------------------------------------------
    L = []
    L.append("{")
    L.append("\tTools = ordered() {")

    # transparenter Hintergrund
    L += _tool("CT_BG", "Background", [
        _inp("UseFrameFormatSettings", "1"),
        _inp("TopLeftRed", "0"),
        _inp("TopLeftGreen", "0"),
        _inp("TopLeftBlue", "0"),
        _inp("TopLeftAlpha", "0"),
    ], (-110, -120))

    prev = "CT_BG"
    for k, c in enumerate(cells):
        txt = "CT_Txt_%d_%s" % (c["i"], c["key"])
        xfm = "CT_Pos_%d_%s" % (c["i"], c["key"])
        mrg = "CT_Mrg_%02d" % k
        y = k * 42

        L += _tool(txt, "TextPlus", [
            _inp("UseFrameFormatSettings", "1"),
            _inp("Font", '"%s"' % font),
            _inp("Style", '"%s"' % style),
            _inp("StyledText", '"%d"' % c["d"]),
            _inp("Size", num(size)),
            _inp("Red1", num(color[0])),
            _inp("Green1", num(color[1])),
            _inp("Blue1", num(color[2])),
        ], (0, y))

        L += _tool(xfm, "Transform", [
            _inp("Input", src=txt),
            _inp("Center", "{ %s, 0.5 }" % num(0.5), expr=c["expr"]),
        ], (140, y))

        merge_inputs = [
            _inp("Background", src=prev),
            _inp("Foreground", src=xfm),
            _inp("PerformDepthMerge", "0"),
        ]
        if c["blend"]:
            merge_inputs.insert(0, _inp("Blend", "1", expr=c["blend"]))
        L += _tool(mrg, "Merge", merge_inputs, (280, y))
        prev = mrg

    # Sichtfenster (eine Zellenhoehe)
    L += _tool("CT_Mask", "RectangleMask", [
        _inp("Width", "1"),
        _inp("Height", num(cell_h)),
        _inp("Center", "{ 0.5, 0.5 }"),
        _inp("SoftEdge", num(soft_edge)),
    ], (280, -190))

    L += _tool("CT_Window", "Merge", [
        _inp("Background", src="CT_BG"),
        _inp("Foreground", src=prev),
        _inp("EffectMask", src="CT_Mask", src_out="Mask"),
        _inp("PerformDepthMerge", "0"),
    ], (420, -120))

    # globaler Transform zum Verschieben / Skalieren des ganzen Counters
    L += _tool("CT_Out", "Transform", [
        _inp("Input", src="CT_Window"),
        _inp("Center", "{ 0.5, 0.5 }"),
        _inp("Size", "1"),
    ], (560, -120))

    L.append("\t},")
    L.append('\tActiveTool = "CT_Out"')
    L.append("}")
    return "\n".join(L) + "\n"


# ------------------------------------------------------------------- CLI ---

def main():
    p = argparse.ArgumentParser(description="Odometer-Counter fuer DaVinci Resolve / Fusion")
    p.add_argument("--start", type=float, required=True, help="Startzahl")
    p.add_argument("--end", type=float, required=True, help="Endzahl")
    p.add_argument("--duration", type=float, required=True, help="Dauer in Sekunden")
    p.add_argument("--easing", default="inout", choices=["in", "out", "inout", "linear"])
    p.add_argument("--fps", type=float, default=25.0, help="Framerate der Timeline (Default 25)")
    p.add_argument("--start-frame", type=float, default=0, help="Startframe der Animation")
    p.add_argument("--size", type=float, default=0.25, help="Textgroesse (Text+ Size)")
    p.add_argument("--font", default="Open Sans")
    p.add_argument("--style", default="Bold")
    p.add_argument("--color", default="1,1,1", help="R,G,B 0..1")
    p.add_argument("--cell-factor", type=float, default=1.25,
                   help="Zellenhoehe = Faktor * Textgroesse (Fensterhoehe)")
    p.add_argument("--width-factor", type=float, default=0.80,
                   help="Ziffernabstand = Faktor * Textgroesse (auf Bildhoehe bezogen)")
    p.add_argument("--soft-edge", type=float, default=0.0, help="Weiche Kante des Fensters")
    p.add_argument("--aspect", type=float, default=16.0 / 9.0, help="Bildseitenverhaeltnis")
    p.add_argument("-o", "--output", default="counter.setting")
    a = p.parse_args()

    col = tuple(float(v) for v in a.color.split(","))
    txt = generate(a.start, a.end, a.duration, a.easing, fps=a.fps,
                   start_frame=a.start_frame, size=a.size, font=a.font,
                   style=a.style, color=col, cell_factor=a.cell_factor,
                   width_factor=a.width_factor, soft_edge=a.soft_edge,
                   aspect=a.aspect)
    with open(a.output, "w", encoding="utf-8") as f:
        f.write(txt)
    frames = a.duration * a.fps
    print("Geschrieben: %s  (%g Frames bei %g fps)" % (a.output, frames, a.fps))


if __name__ == "__main__":
    main()
