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
