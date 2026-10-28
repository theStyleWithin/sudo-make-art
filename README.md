# sudo-make-art

An always-offline, local-only design tool inspired by Canva. No accounts, no cloud, no subscription, no bundled stock assets: you bring your own files and they never leave your PC.

This is a native app (desktop and Android). It does not run in a web browser.

```
npm install
npm start            # run the desktop app
npm run dist:linux   # build an AppImage into dist/
npm run dist:win     # Windows installer + portable exe (build on Windows; CI does this)
```

Pushing a tag like `v0.1.0` makes GitHub Actions build the AppImage and Windows files into a draft release.
Flathub/AUR drafts for other people to submit are in `packaging/`.

## What works now
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
- Export to **WebM** everywhere, and **MP4 (H.264/AAC)** in the desktop app via the bundled FFmpeg
- Export records in real time, so a 2-minute video takes about 2 minutes to export

## Android
A Capacitor wrapper lives in `android/` (same web code, no internet permission, no cloud backup). The phone layout is responsive.
Build the debug APK with the `android` CI job, or locally with the Android SDK: `npm run android:sync` then `cd android && ./gradlew assembleDebug`.

## Planned
- Sources linking to files in place (desktop)
- Video: transitions, fades, speed, watermark removal on video, frame-accurate faster-than-real-time export
- AI background cutout for busy backgrounds (local model); the current cutout is colour-based
- Better watermark inpainting for large marks
- Multi-page designs, home screen with recents and folders, PDF export

All code is original. No Canva code or assets are used.

## Third-party
The desktop app bundles a static FFmpeg build through the `ffmpeg-static` package (used only to convert WebM to MP4). That build is GPL-licensed; see https://github.com/eugeneware/ffmpeg-static for details if you redistribute the app.
