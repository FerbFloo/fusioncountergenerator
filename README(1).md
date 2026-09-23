# Odometer-Zähler für DaVinci Resolve (Fusion)

## Dateien

| Datei | Inhalt |
|---|---|
| `Counter_21-25_5s_Out.setting` | Beispiel 1: 21 → 25, 5 s, Easing „Out", 25 fps |
| `Counter_10-100_10s_InOut.setting` | Beispiel 2: 10 → 100, 10 s, Easing „InOut", 25 fps |
| `fusion_counter_generator.py` | Generator für beliebige Werte |

## Einbauen

1. Timeline-Clip auswählen → **Fusion-Seite** öffnen (oder einen *Fusion Composition*-Clip aus der Effects Library auf die Timeline ziehen).
2. Die `.setting`-Datei aus dem Dateimanager **direkt in den Node-Editor ziehen**.
3. Den Ausgang des Nodes **`CT_Out`** mit **`MediaOut1`** verbinden.
   Soll der Zähler über bestehendem Bild liegen: neuen `Merge` anlegen, `MediaIn1` → Background, `CT_Out` → Foreground, Merge → `MediaOut1`.
4. Der Clip muss mindestens so lang sein wie die Animation (Beispiel 1 = 125 Frames, Beispiel 2 = 250 Frames bei 25 fps).

Die Animation startet bei **Frame 0** der Komposition. Soll sie später beginnen: in den `CT_Pos_*`-Nodes im Expression-Feld `time-0` durch `time-30` o. ä. ersetzen — oder gleich mit `--start-frame` generieren.

## Wichtige Nodes

| Node | Funktion |
|---|---|
| `CT_Out` | Globaler Transform – ganzen Zähler **verschieben / skalieren** |
| `CT_Mask` | Das Sichtfenster. `Height` = Fensterhöhe, `Center Y` = vertikale Ausrichtung, `Soft Edge` für weiche Kanten |
| `CT_Txt_*` | Die einzelnen Ziffern (Schriftart, Größe, Farbe). Änderungen an **Size** bitte über den Generator, sonst passt die Zellhöhe nicht mehr |
| `CT_Pos_*` | Trägt die Animation als Expression auf `Center` |

### Feinjustage
* **Ziffern werden abgeschnitten / Nachbarziffern sichtbar** → `CT_Mask` → `Height` anpassen (Standard = 1.25 × Textgröße).
* **Ziffern sitzen nicht mittig im Fenster** → `CT_Mask` → `Center` Y leicht verschieben.
* **Ziffernabstand** → Generator mit `--width-factor` (Standard 0.80) neu laufen lassen.

## Eigene Werte erzeugen

```bash
python3 fusion_counter_generator.py --start 0 --end 1250 --duration 8 \
    --easing out --fps 25 -o mein_counter.setting
```

Optionen: `--easing in|out|inout|linear`, `--fps`, `--start-frame`,
`--size` (Textgröße, Standard 0.25), `--font`, `--style`, `--color "1,0.8,0.2"`,
`--cell-factor`, `--width-factor`, `--soft-edge`, `--aspect`.

Auch rückwärts zählen funktioniert (`--start 100 --end 0`).

## Wie es funktioniert

`v(t)` = Startzahl → Endzahl mit kubischem Easing.
Für jede Stelle *i* (0 = Einer, M = 10^i):

```
p_i = floor(v/M) + clamp(v − floor(v/M)·M − M + 1, 0, 1)
```

Für die Einerstelle ergibt das `p_0 = v`, also ein kontinuierliches Laufen.
Jede höhere Stelle steht still und dreht sich **genau in der letzten Werteinheit vor ihrem Übertrag** — also exakt synchron mit der darunterliegenden Stelle (19→20, 99→100). Jede Ziffer ist ein eigener `Text+`-Node, der um `(p_i − Zellennummer) × Zellhöhe` nach unten versetzt wird. Führende Nullen existieren gar nicht erst, deshalb „steigt" eine neue Stelle im Moment des Übertrags von oben ins Fenster.
