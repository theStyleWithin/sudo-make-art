# sudo-make-art

An always-offline, local-only design tool inspired by Canva. No accounts, no cloud, no subscription, no bundled stock assets: you bring your own files and they never leave your PC.

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

All code is original. No Canva code or assets are used.

## Problems, questions and safety
**Please send every complaint, bug report and request to [Issues](https://github.com/theStyleWithin/sudo-make-art/issues).** That is the one place the maintainer reads, and issues are forwarded to the maintainer's AI assistant to be worked on. Say what you did, what you expected, what happened, your system (Linux, Android or Windows) and the version from the Releases page.

**Download at your own risk.** The software is free and comes with no warranty (see the license). Whatever you download, from here or anywhere else, **scan it with [VirusTotal](https://www.virustotal.com/)** before you run it, and only download from this repository's [Releases page](https://github.com/theStyleWithin/sudo-make-art/releases). Stay safe.

## License
[0BSD](LICENSE): do anything you like with this code, no permission and no credit needed. It comes with no warranty and no support.
Please don't present your version as made or endorsed by the original author.

## Third-party
The desktop app bundles a static FFmpeg build through the `ffmpeg-static` package (used only to convert WebM to MP4). That build is GPL-licensed; see https://github.com/eugeneware/ffmpeg-static for details if you redistribute the app.
