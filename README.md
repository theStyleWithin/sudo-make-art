# sudo-make-art

An always-offline, local-only design tool inspired by Canva. No accounts, no cloud, no subscription, no bundled stock assets: you bring your own files and they never leave your PC.

Run it in a browser by opening `index.html`, or as a desktop app:

```
npm install
npm start            # run the Electron app
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

## Planned
- Desktop wrapper (so Sources can link to files in place and heavy tools run natively)
- Video editor: trim/split, replace visuals but keep audio, text over video, separate audio track
- AI background cutout for busy backgrounds (local model); the current cutout is colour-based
- Better watermark inpainting for large marks
- Multi-page designs, home screen with recents and folders, PDF export

All code is original. No Canva code or assets are used.
