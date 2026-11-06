#!/usr/bin/env python3
"""Builds the font fingerprint index that the font matcher uses, entirely offline at run time.

For every font file it records a small 1-bit picture of each letter, digit and common punctuation mark (at 32 px) plus the
letter's width. The app can then redraw any typed text from these pictures and compare it with a screenshot, without any
font file being present on the user's computer.

Usage (run it in a different folder than the downloaded fonts, with -I so nothing in the current folder is imported):
    python3 -I scripts/build-fontindex.py <folder of NAME-WEIGHT.woff files> <fontsource catalog.json> <output folder>
Output: <output>/fontindex.json (list of fonts) and <output>/fontindex.bin.gz (the pictures).
Font files come from the open-licensed Fontsource catalogue (https://fontsource.org). Only their outlines are measured.
"""
import gzip, json, os, struct, sys
from PIL import Image, ImageDraw, ImageFont

EM = 32                      # pixel size the letters are drawn at
CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?'-:;&"
CANVAS, BASE, PAD = 96, 64, 24   # drawing area, baseline row, left margin

def glyph(font, ch):
    adv = font.getlength(ch)
    rec = struct.pack('<H', max(0, min(65535, round(adv * 16))))   # advance in 1/16 px
    img = Image.new('L', (CANVAS, CANVAS), 0)
    if ch != ' ': ImageDraw.Draw(img).text((PAD, BASE), ch, font=font, anchor='ls', fill=255)
    box = img.getbbox()
    if not box: return rec + struct.pack('<bbBB', 0, 0, 0, 0)
    x0, y0, x1, y1 = box; w, h = x1 - x0, y1 - y0
    if w > 255 or h > 255: return rec + struct.pack('<bbBB', 0, 0, 0, 0)
    px = img.crop(box).point(lambda v: 255 if v > 127 else 0).tobytes()
    bits = bytearray((w * h + 7) // 8)
    for i, v in enumerate(px):
        if v: bits[i >> 3] |= 1 << (i & 7)
    return rec + struct.pack('<bbBB', x0 - PAD, y0 - BASE, w, h) + bytes(bits)   # offsets from the pen position / baseline

def main(src, catalog_path, out):
    catalog = {f['id']: f for f in json.load(open(catalog_path))}
    os.makedirs(out, exist_ok=True)
    fonts, blob = [], bytearray()
    names = sorted(n for n in os.listdir(src) if n.endswith('.woff'))
    for n, name in enumerate(names):
        fid, w = name[:-5].rsplit('-', 1); meta = catalog.get(fid)
        if not meta: continue
        try:
            font = ImageFont.truetype(os.path.join(src, name), EM)
            data = b''.join(glyph(font, c) for c in CHARS)
        except Exception as e:
            print('skip', name, e); continue
        if len(data) < 200: continue
        fonts.append({'id': fid, 'family': meta['family'], 'category': meta.get('category', ''), 'license': meta.get('license', ''), 'weight': int(w), 'offset': len(blob), 'length': len(data)})
        blob += data
        if n % 300 == 0: print(f'{n}/{len(names)}', flush=True)
    json.dump({'em': EM, 'chars': CHARS, 'fonts': fonts}, open(os.path.join(out, 'fontindex.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
    with gzip.open(os.path.join(out, 'fontindex.bin.gz'), 'wb', compresslevel=9) as f: f.write(blob)
    print(f'{len(fonts)} fonts, {len(blob)/1e6:.1f} MB raw, gz {os.path.getsize(os.path.join(out, "fontindex.bin.gz"))/1e6:.1f} MB')

if __name__ == '__main__':
    if len(sys.argv) != 4: sys.exit(__doc__)
    main(*sys.argv[1:])
