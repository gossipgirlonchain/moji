#!/usr/bin/env python3
"""Print advance widths (em) for the card fonts, to refresh src/lib/card/metrics.ts after a font change.
Reads the WOFF files directly (no fontTools needed):  python3 scripts/font-metrics.py
"""
import json, struct, zlib

def load(p):
    b = open(p, "rb").read()
    _sig, _flavor, _length, num_tables = struct.unpack(">4sIIH", b[:14])
    tables, off = {}, 44
    for _ in range(num_tables):
        tag, toff, clen, olen, _cs = struct.unpack(">4sIIII", b[off:off + 20]); off += 20
        raw = b[toff:toff + clen]
        tables[tag.decode("latin1")] = zlib.decompress(raw) if clen < olen else raw
    return tables

def metrics(p):
    t = load(p)
    upem = struct.unpack(">H", t["head"][18:20])[0]
    asc, desc = struct.unpack(">hh", t["hhea"][4:8])
    num_h = struct.unpack(">H", t["hhea"][34:36])[0]
    adv = [struct.unpack(">H", t["hmtx"][i * 4:i * 4 + 2])[0] for i in range(num_h)]
    cmap = t["cmap"]; n = struct.unpack(">H", cmap[2:4])[0]; sub = None
    for i in range(n):
        pid, eid, o = struct.unpack(">HHI", cmap[4 + i * 8:12 + i * 8])
        if struct.unpack(">H", cmap[o:o + 2])[0] == 4 and (pid, eid) in [(3, 1), (0, 3), (0, 4)]: sub = o
    o = sub; seg_x2 = struct.unpack(">H", cmap[o + 6:o + 8])[0]; seg = seg_x2 // 2
    ends = struct.unpack(">%dH" % seg, cmap[o + 14:o + 14 + seg_x2])
    starts = struct.unpack(">%dH" % seg, cmap[o + 16 + seg_x2:o + 16 + 2 * seg_x2])
    deltas = struct.unpack(">%dh" % seg, cmap[o + 16 + 2 * seg_x2:o + 16 + 3 * seg_x2])
    ro_base = o + 16 + 3 * seg_x2
    ros = struct.unpack(">%dH" % seg, cmap[ro_base:ro_base + seg_x2])
    def gid(c):
        for i in range(seg):
            if starts[i] <= c <= ends[i]:
                if ros[i] == 0: return (c + deltas[i]) & 0xFFFF
                a = ro_base + i * 2 + ros[i] + (c - starts[i]) * 2
                g = struct.unpack(">H", cmap[a:a + 2])[0]
                return (g + deltas[i]) & 0xFFFF if g else 0
        return 0
    out = {chr(c): round(adv[min(gid(c), num_h - 1)] / upem, 3) for c in range(32, 127)}
    for ch in "·…’“”€":
        g = gid(ord(ch))
        if g: out[ch] = round(adv[min(g, num_h - 1)] / upem, 3)
    return {"ascent": round(asc / upem, 3), "descent": round(desc / upem, 3), "adv": out}

print(json.dumps({"fredoka600": metrics("src/assets/fonts/Fredoka-600.woff"), "nunito800": metrics("src/assets/fonts/Nunito-800.woff")}, indent=1))
