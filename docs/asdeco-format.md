# The `.asdeco` decoration pack format

A `.asdeco` file is a small JSON file that carries your own **nameplates**, **profile banners** and **avatar decorations**
into Anti-Social. [Sudo Make Art](https://github.com/theStyleWithin/sudo-make-art) writes it (New design → Profile decorations,
then Export → profile decoration), and you can write one by hand or from any other tool. Import it in Anti-Social under
Settings → Profile decorations → Add my own decorations. A lone `.svg`, `.png`, `.gif`, `.webp`, `.jpg`, `.mp4` or `.webm`
also works: the app picks the kind from its shape.

```json
{
  "format": "anti-social-decorations",
  "v": 1,
  "name": "My pack",
  "author": "You",
  "license": "CC BY 4.0",
  "items": [
    { "kind": "plate",  "name": "Candy bar",  "blurb": "optional", "art": "<svg viewBox=\"0 0 960 176\" …>…</svg>" },
    { "kind": "wreath", "name": "Orbit",      "image": "data:image/gif;base64,…" },
    { "kind": "banner", "name": "Aurora",     "video": "data:video/mp4;base64,…" }
  ]
}
```

## Kinds and shapes

| `kind` | What it is | Shape (it is drawn at) | Design at | Notes |
|---|---|---|---|---|
| `plate` | Nameplate behind your row in the member list | 240 × 44 (5.45 : 1) | 960 × 176 | Your picture and name sit on top of it |
| `banner` | Profile banner (background) | 1200 × 200 (6 : 1) | 2400 × 400 | Cropped to fill ("cover") |
| `wreath` | Avatar decoration | 144 × 144 (square) | 576 × 576 | Keep the circle of radius 50 around (72, 72) clear: the picture shows there |

Design at any size with the same shape. SVG must be within 15% of the shape (3% for a wreath). A PNG, GIF or WebP plate or banner
may be within 35% (it is cropped to fit); a wreath within 5%.

## What an item holds

Each item has `kind`, `name` (40 characters), optional `blurb` (100), and **one** of:

- `art`: SVG text. Drawn sharp at any size; SMIL animation (`animate`, `animateTransform`, `set`) is kept, and a still version is
  made for when "Animate decorations" is off (or give your own as `still`, an SVG with no animation).
- `image`: a `data:image/png|jpeg|webp|gif;base64,…` picture. An animated GIF, APNG or animated WebP moves. For a moving one you can give a
  `still` (a PNG data URL); if you do not, the app makes one from the first frame.
- `video`: a `data:video/mp4|webm;base64,…` clip, 3 MB at most. The app plays up to 6 seconds of it once, at import, and turns it into a
  strip of frames that is played back with plain CSS, so it works everywhere. Video has no see-through parts: for a `wreath` the app cuts the
  avatar circle out of every frame; for a `plate` or `banner` the clip is cropped to the shape.

## Limits

16 MB per file, 40 items per pack, 120 items in your library. Per item: SVG nameplate 150 KB, avatar decoration 300 KB, banner 700 KB;
picture nameplate 400 KB, avatar decoration 600 KB, banner 1.5 MB. Pictures must be between 16 and 4096 pixels.

## What is kept and what is left out (safety)

The art is only ever drawn as a picture, where nothing can run or be fetched, and every file is also rebuilt from an allow-list when it is
imported. Kept: shapes, paths, text, gradients, patterns, masks, clip paths, filters, `use` of things in the same picture, `image` with a
`data:` PNG/JPEG/WebP/GIF, SMIL animation, and a `<style>` that holds only `@font-face` rules with `data:` fonts. Left out: scripts,
`foreignObject`, event handlers, any link to another file or web address, other CSS, DOCTYPE and custom entities. Guides in Sudo Make Art are
never exported.

## Sharing

Packs are plain files, so you can hand them to a friend. Only share art you made or have permission to share, and put the author and licence in the pack.
