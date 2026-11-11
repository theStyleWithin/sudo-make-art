# sudo-make-art

An always-offline, local-only tool for designs, videos and photos. No accounts, no cloud, no subscription, no bundled stock assets: you bring your own files and they never leave your PC.

This is a native app (desktop and Android). It does not run in a web browser.

> **⚠️ Windows testers wanted.** The Windows installer and portable exe are built automatically but have **never been run by the maintainer**, who only uses Linux (and tests Android on their own time). They are untested and unsigned, so Windows may show a SmartScreen warning. If you use Windows and try them, please [open an issue](https://github.com/theStyleWithin/sudo-make-art/issues) with what worked and what broke. Fixes are welcome as pull requests.

```
npm install
npm start            # run the desktop app
npm run dist:linux   # build an AppImage into dist/
npm run dist:win     # Windows installer + portable exe (build on Windows; CI does this)
```

Downloads (AppImage, Windows installer and portable exe, Android APK) are on the [Releases page](https://github.com/theStyleWithin/sudo-make-art/releases). To publish a new one: GitHub → Actions → build → Run workflow, tick *publish* (bump `version` in `package.json` first).
Flathub/AUR drafts for other people to submit are in `packaging/`.

## What works now
- **Home screen** with search and Recents (thumbnails). Projects autosave as plain files in `~/sudo-make-art/projects` on desktop
- **Convert** (desktop app): batch-convert images between **JPEG XL, AVIF, WebP, JPEG and PNG**. Add files or whole folders (drag and drop works), pick quality and effort, lossless, **lossless JPEG transcoding** (JPEG → JPEG XL, fully reversible), **downscale** by percent, fit-inside size, shortest side, longest side or megapixels (never enlarges), choose where the files go (folder structure is kept), what to do if a file exists, keep the original date, and optionally move originals to the trash. Several files convert at once, with progress and time left. Metadata is not copied
- **Fonts**: every font installed on your computer is in the font picker (searchable, each shown in its own typeface), and you can **add your own font files** (.ttf, .otf, .woff, .woff2) by dropping them in or using *Add a font file* in the picker. Added fonts are kept in your Sources library, work in designs and video text, and are embedded into PNG, JPG, PDF and SVG exports so they look the same everywhere
- **Match a font from a picture** (desktop app): in the font picker, choose *Match a font from a picture*, drop in a screenshot or PNG of some text, type the words it shows, and the app lists the closest fonts, best first. You can decline or rename any of them. The picture never leaves your computer and nothing is downloaded while matching: it is compared with a built-in index of about 3,000 open-licensed fonts (letter shapes only, made with `scripts/build-fontindex.py` from the Fontsource catalogue) and the fonts you have. In a test with 15 pictures of known fonts, the right one came first 11 times and in the top 3 for 14. It cannot name paid or custom fonts, and similar fonts can be mixed up. For an open-licensed match you can click *Get the real file*: the app shows the exact address, size, licence and the catalogue's published hash first, offers a **VirusTotal** check, downloads only when you click (only from the open catalogue), then verifies the file type, size and SHA-256 and passes it through the browser's own font safety filter before adding it. It never installs fonts into your system
- **Photo filters** (presets and sliders: brightness, contrast, saturation, hue, blur, grayscale, sepia) and **drop shadows**, applied to images and kept in exports
- **Multi-page designs** and **PDF export** (all pages, correct physical size for the print presets)
- **Create a design**: social media, presentation and print size presets, plus custom sizes
- **Text**: font, size, bold/italic/align, outline, and **curved text** (arch and smile)
- **Shapes**: rectangle, ellipse, line, star; move, resize, rotate, layer order, duplicate
- **Images**: **crop** with live sliders, drag-and-drop and paste
- **Edit image**: auto-remove a plain background, magic remove by colour, erase/restore brushes, and remove watermarks/blemishes by painting over them (all local, no AI model)
- **Convert videos** (desktop): drop videos or whole folders in. Every video inside is found, converted (MP4 H.264/H.265, MKV, WebM VP9/AV1, repackage without re-encoding, or audio-only MP3) and written to an output folder you pick, with the **same folder layout** as the source: the dropped folder comes along, empty sub-folders too, and subtitles, posters and other files can be copied across. Videos already in the target format are copied instead of re-encoded, the original is only trashed (if you ask) when the result looks complete, and Cancel really stops.
- **App switcher**: click the name at the top-left to switch between Sudo Make Art, Video and the flavours being built (TCG, Manga, Write, Tiles, Pixels, Games, Visual Novel).
- **Sudo Make Pixels** (pick it from the name at the top-left; works on desktop and Android): a pixel-art and sprite editor. Pencil, eraser, fill, line, rectangle, ellipse, colour picker, move and pan; brush sizes, left–right and up–down mirror drawing, a pixel grid; palettes (including a 4-colour handheld green) with a main and a second colour; layers (hide, opacity, reorder, duplicate, merge); animation frames with onion skin and playback; undo and redo; autosave. Exports PNG, sprite sheet and animated GIF, scaled with sharp pixels. Sprites are saved in a plain, documented JSON format (`sudo-make-pixels`, version 1) so other modes can use them later. Keys: B pencil, E eraser, G fill, L line, R rectangle, O ellipse, I pick, M move, H or Space pan, X swap colours, [ and ] brush size, Ctrl+Z undo.
- **Sudo Make Tiles** (works on desktop and Android): a tileset and tilemap editor made with Game Boy games in mind. Tile editor with pencil, eraser, fill and colour picker, flip, rotate and edge-wrapping slide (for seamless tiles) and a live 3×3 seamless preview; an indexed palette, so changing a colour recolours every tile that uses it; a Game Boy mode (4 shades, 8×8 tiles, a 20×18 screen map) or a colour mode; a map painter (paint, erase, fill, pick); an **auto-tile generator** that makes a 16-piece edge set from one tile and then picks edges and corners for you as you paint; and **Import from Pixels**, which cuts a Sudo Make Pixels sprite into tiles (repeats are merged to save tile space) and lays them out on the map. Exports a tileset sheet PNG, a map PNG, and Game Boy source (`.c`: 2-bits-per-pixel tile data and the map, ready for GBDK-style `set_bkg_data` / `set_bkg_tiles`). Saved in a plain `sudo-make-tiles` JSON format.
- **Sudo Make Music** (works on desktop and Android): a tracker for hand-making retro handheld-style music. Four channels like a classic handheld console: two **pulse** channels (12.5 / 25 / 50 / 75% tones), a **wave** channel with a hand-drawn 32-step waveform (presets included), and a **noise** channel (smooth 15-bit or metallic 7-bit). Pitches are snapped the way the real chip's registers snap them, volume and fades come in 16 steps, and each channel can be panned left, right or both. Type notes like a tracker (Z S X D C V… and Q 2 W 3 E… for the octave above, or use the on-screen keyboard), with instrument, volume and effect columns: arpeggio, slide up/down, vibrato, volume slide, note cut, speed change and duty switch. A song order with reusable patterns, a loop point, mute/solo, undo/redo, an example song, autosave, and WAV export. The sound engine is a separate file, so other genres can be added later. Songs are saved in a plain `sudo-make-music` JSON format.
- **Sudo Make Games** (desktop and Android): a small game maker with a Game Boy look: 160×144 screen, four shades, 8×8 tiles. Pick **platformer** or **top-down**, paint levels, place a player, enemies that patrol, coins, a goal flag and characters who talk, set lives and the title and win messages. Tiles come from **Sudo Make Tiles**, characters from **Sudo Make Pixels** and music from **Sudo Make Music**; they are copied into the game so it stays whole. Press Play to try it. Export as a **playable web page** (one `.html` file), a **Linux program** (one self-unpacking file) or a **Windows program** (a zip), all of which can play with no internet (the Linux and Windows packages use Electron's official runtime, downloaded once after you say yes and checked against the SHA-256 Electron publishes), or as a real **Game Boy cartridge (`.gb`)**: a 32 KB ROM with its own program, music and sound effects, for a Game Boy or an emulator. Limits for the cartridge: levels up to 32×32 tiles, 24 things per level, 256 picture tiles in all, 16 levels, 32 KB in total; the export tells you if a game is too big. On the cartridge, sprites have three colours plus see-through (the two lightest shades are merged), text is drawn in a chunky 8×8 font, small levels sit in the top-left corner, and the music player supports notes, instruments, arpeggio, slides, vibrato, note cut, duty and speed changes (not volume slides or per-channel volume sliders). Games are saved in a plain `sudo-make-games` JSON format. The Game Boy side was tested in a strict emulator that is part of this repository (`tools/gbemu.js`, with tests in `tools/tests`); it has not been tried on real hardware.
- **Sudo Make Manga** (desktop and Android): a page editor for manga and comics. Page sizes (manga B5, A4, US comic, a tall webtoon strip, square); eight ready-made **panel layouts**, including a slanted manga one; a **Split** tool that cuts a panel with a line you drag (slanted lines make slanted panels, with a gutter between); pictures for panels (pick a file or drop one on a panel, then size and move it inside); **speech bubbles** (oval, rounded, thought cloud, spiky shout) with draggable tails, **caption boxes**, **sound effects** with outlines and tilt, **screentones** (dots, fading dots, lines, cross-hatch, kept inside their panel), **speed lines** (focus and parallel), a pen with a stroke eraser, ordering, undo and redo, and autosave. Export a page as PNG (normal or double size) or **all pages as one PDF**. Saved in a plain `sudo-make-manga` JSON format, and other modes can draw a page or a single panel from a saved manga file.
  - **3D characters**: make an anime-style male or female character (body shape, face, eyes, hair, outfit, colours, accessories), or **import a VRM model**; drag it from the character list onto a panel, then pose it (ready-made poses plus a joint-by-joint editor), turn it round, change the camera and draw it as ink and tones, grey or colour. Characters are always still. Imported VRM models keep their author and licence details, shown in the editor: check the licence before you publish pages that use one. Your models and pictures stay on your device. Pictures (JPG, PNG) can be dropped straight into panels. Limits: VRM face expressions and hair physics are ignored; the built-in maker makes simple stylised figures, so a VRoid Studio model gives the best looking result.
- **Sources**: a persistent local library (images, video, audio) that is still there next time you open the app
- Undo/redo, zoom, autosave, save/open project files, export PNG/JPG/SVG

## Video editor (Video tab)
- Timeline with video/image, audio and text lanes; drag clips, drag edges to trim, **split** at the playhead
- **Detach audio** onto its own track, trim/split/move it separately, or **replace the visuals** and keep the audio
- Text over video (drag it in the preview), volume per clip, fill-frame or fit-inside framing, undo/redo
- **Speed** (0.25x to 4x) and **fade in/out** per clip, for picture and sound
- **Watermark removal** on video: drag a box over a logo and it is filled from the surrounding pixels on every frame. *Track movement* makes the box follow a logo that moves around (small marks over simple backgrounds work best). Filters work on video clips too
- **Overlay images** on video (your own logo or watermark): move, resize, rotate, fade, swap the image
- **Transitions** between clips: cross-fade, dip to black, wipes, slides and zoom. Picture and sound both cross over
- Export to **WebM** everywhere (records the preview in real time), and **MP4 (H.264/AAC), fast** in the desktop app: every frame is rendered on its own and encoded by the bundled FFmpeg, which is quicker than real time on a typical PC (about 1.1x on a 4-core machine with no GPU). If your FFmpeg build has NVIDIA's encoder (set `SMA_FFMPEG` to its path), export uses the GPU automatically; the bundled build does not include it

## Local AI image generation (desktop only)
Open the **AI** tool: generate an image from a prompt, or edit the selected image (img2img with a strength slider), then add the result to your design. Everything runs on your computer; nothing is sent anywhere.

The app does not include an engine or models. You bring your own:
1. **Engine**: a `stable-diffusion.cpp`-compatible command-line build (CUDA for NVIDIA, Vulkan for AMD/Intel, and/or a CPU build). Download it from that project's releases and point to it under *Engines and advanced*.
2. **Models**: put `.safetensors`, `.ckpt` or `.gguf` files in the models folder (the **Models folder** button opens it). SD 1.5 and SDXL style single-file models are the supported path; other model families can be tried through *Extra engine arguments*.
   - **Get a model** (desktop only): searches Hugging Face for GGUF image and video models, looks at your graphics card, video memory and RAM, and marks each file *Comfortable*, *Slow* or *Too heavy* for your PC, with a ★ on the one that puts the least strain on it (an RTX 2060 and an RTX 5090 get different picks). Nothing downloads until you click. Before you do, you get a VirusTotal link (by hash, nothing uploaded). The download only accepts Hugging Face's own servers (every redirect hop is checked), keeps the file under a temporary name until its size and SHA-256 match what Hugging Face publishes and it parses as a well-formed GGUF, and scans it with ClamAV too if installed. Old `.ckpt`/`.pt`/`.bin` formats (which can run code) are never offered. The hardware check runs locally and nothing is sent anywhere.

**Memory fallback.** The app reads your free VRAM and RAM and picks a mode for every run: fits in VRAM, runs on the GPU. Not enough VRAM (for example SDXL on an RTX 2060 with 6 GB), keeps the compute on the GPU and parks the weights in system RAM. Little or no VRAM, or no GPU, runs on the CPU using system RAM. The AI panel shows which mode it chose and why. Slower modes still finish; they just take longer.

The app adds no content filter of its own: what you can generate depends on the model you load, and you are responsible for what you make with it.

**AI fill**: in *Edit image*, paint an area, describe what belongs there, and the engine replaces just that area.

**Video generation (experimental)**: *Generate a short video* uses the engine's video mode and converts the result to MP4. Video models need extra files (VAE, text encoder); pass them under *Extra engine arguments*. Expect many minutes for a few seconds on a mid-range GPU.

## Android
A Capacitor wrapper lives in `android/` (same web code, no internet permission, no cloud backup). The phone layout is responsive.
Build the debug APK with the `android` CI job, or locally with the Android SDK: `npm run android:sync` then `cd android && ./gradlew assembleDebug`.

## Planned
- Sources linking to files in place (desktop)
- A background-removal and upscaling model that runs locally
- AI background cutout for busy backgrounds (local model); the current cutout is colour-based
- Better watermark inpainting for large marks

All code is original, and no third-party templates, images or fonts are bundled.

## Problems, questions and safety
**Please send every complaint, bug report and request to [Issues](https://github.com/theStyleWithin/sudo-make-art/issues).** That is the one place the maintainer reads, and issues are forwarded to the maintainer's AI assistant to be worked on. Say what you did, what you expected, what happened, your system (Linux, Android or Windows) and the version from the Releases page.

**Download at your own risk.** The software is free and comes with no warranty (see the license). Whatever you download, from here or anywhere else, **scan it with [VirusTotal](https://www.virustotal.com/)** before you run it, and only download from this repository's [Releases page](https://github.com/theStyleWithin/sudo-make-art/releases). Stay safe.

## License
[0BSD](LICENSE): do anything you like with this code, no permission and no credit needed. It comes with no warranty and no support.
Please don't present your version as made or endorsed by the original author.

## Third-party
- **libjxl** (JPEG XL tools `cjxl`, `djxl`, `cjpegli`): BSD-3-Clause, bundled in the release builds from the official libjxl v0.11.1 release (checked against pinned SHA-256 hashes by `scripts/fetch-libjxl.js`). Their licence files ship in the app's `resources/bin` folder. On a source checkout, run `npm run fetch:libjxl`, install libjxl from your distribution, or point the Convert tab at your own `cjxl`.
- **Font index** (`data/fontindex.*`): small black-and-white letter pictures and widths measured from open-licensed fonts in the [Fontsource](https://fontsource.org) catalogue (mostly SIL OFL 1.1, some Apache-2.0). It contains no font software.
- **FFmpeg**: see below.
- The Convert tab was inspired by [XL Converter](https://codepoems.eu/xl-converter) (GPL-3.0) in what it does. It shares no code with it; this project's converter was written independently.


The desktop app bundles FFmpeg (through the `ffmpeg-static` package) and runs it as a separate program for video export, image conversion and format reading. FFmpeg is GPL-3.0 licensed. The full list of bundled third-party software, licences and where to get the source is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and it ships inside the app.
