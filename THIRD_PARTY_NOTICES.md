# Third-party notices

Sudo Make Art's own code is under the [0BSD licence](LICENSE). The desktop app also contains or uses the software below. Each keeps its own licence. This file ships inside the app (in the `resources` folder, next to a `licenses` folder).

This is a good-faith list. It is not legal advice.

## FFmpeg (GPL-3.0-or-later)

- **What it does here:** the desktop app runs FFmpeg as a **separate command-line program** (it is started as its own process, not linked into the app) for video export, image conversion, reading unusual image formats and watermark/AI video helpers.
- **Where it comes from:** the static FFmpeg build that the [`ffmpeg-static`](https://github.com/eugeneware/ffmpeg-static) package downloads. The Linux build tested for this release is FFmpeg 7.0.2 from John Van Sickle ([johnvansickle.com/ffmpeg](https://johnvansickle.com/ffmpeg/)), configured with `--enable-gpl --enable-version3`, which includes x264, x265, libaom, libwebp, libvpx and others. FFmpeg itself is © the FFmpeg developers.
- **Licence:** GNU General Public License version 3. The full text is in `licenses/FFmpeg-GPL-3.0.txt` (in the app) and in this repository at [licenses/FFmpeg-GPL-3.0.txt](licenses/FFmpeg-GPL-3.0.txt).
- **Source code:** Sudo Make Art has **not modified** FFmpeg. Its source is available from <https://ffmpeg.org/download.html>, and the source and build scripts for the exact static build are linked from <https://johnvansickle.com/ffmpeg/> (Linux) and from the `ffmpeg-static` project above. If you received this program and cannot get the matching FFmpeg source from those places, open an issue at <https://github.com/theStyleWithin/sudo-make-art/issues> and the maintainer will provide it.
- **Your own FFmpeg:** you can use your system's FFmpeg instead by setting the environment variable `SMA_FFMPEG` to its path. Distribution packages (Arch, Flatpak) are meant to do this rather than bundle one.

## libjxl: JPEG XL tools (BSD-3-Clause)

- `cjxl`, `djxl`, `cjpegli` and `djpegli` from the official libjxl v0.11.1 release, <https://github.com/libjxl/libjxl>. They are run as separate programs by the Convert tab.
- Included in the release builds from the official release files, checked against pinned SHA-256 hashes by `scripts/fetch-libjxl.js`.
- Their licence files (libjxl, Brotli, Highway, libjpeg, libpng, giflib, libwebp, sjpeg, skcms, zlib and others) are in the app's `resources/bin` folder as `LICENSE.*`.

## Electron and Chromium (MIT and many others)

- The desktop app is built on [Electron](https://www.electronjs.org/) (MIT). Electron includes Chromium and its dependencies, whose licences are listed in `LICENSES.chromium.html` and `LICENSE.electron.txt`, shipped with the app.

## Capacitor (MIT)

- The Android app uses [Capacitor](https://capacitorjs.com/) (`@capacitor/core`, `@capacitor/android`, `@capacitor/filesystem`, `@capacitor/share`), all MIT.

## Font index (derived data from open-licensed fonts)

- `data/fontindex.json` and `data/fontindex.bin.gz` hold small black-and-white pictures of letters, digits and punctuation, plus letter widths, measured from fonts in the open [Fontsource](https://fontsource.org/) catalogue. It contains **no font software**.
- The fonts it was measured from are open-licensed (almost all SIL Open Font License 1.1, a few Apache-2.0 or similar). The name, licence and weight of each font are listed in `data/fontindex.json`. The index was built with `scripts/build-fontindex.py` (build tools such as Pillow are not part of the app).
- If you choose "Get the real file" for a font, that file keeps its own licence, which the app shows before you download it.

## tesseract.js, tesseract.js-core and English language data (Apache-2.0)
- **What it does here:** reads text out of a picture for Text Grab, on your computer, in a separate background process. The English data is bundled, so nothing is downloaded.
- **Where it comes from:** the npm packages `tesseract.js`, `tesseract.js-core` and `@tesseract.js-data/eng`. They are licensed under the Apache License 2.0 and each package's licence file is kept inside the app's `node_modules` folders. Not modified.

## MediaPipe tasks-vision (Apache-2.0)
- **What it does here:** face tracking for Sudo Make VTuber, on your computer. The npm package `@mediapipe/tasks-vision` (code and WebAssembly runtime) is bundled, not modified, and carries its Apache License 2.0 file.
- **Model file:** the Face Landmarker model (`face_landmarker.task`, Apache-2.0, from Google's MediaPipe model storage) is **not** bundled. It is only downloaded when the user presses the download button, and is checked against a fixed size and SHA-256.

## Spout2 (BSD 2-Clause)
- **What it does here:** `sma-spout.exe`, a small Windows helper written for this project, is built with the Spout2 SDK (Lynn Jarvis and contributors, <https://github.com/leadedge/Spout2>) to publish a Spout sender. The licence file ships next to the helper (`Spout2-LICENSE.txt`).

## Not included (for clarity)

- **XL Converter** (GPL-3.0, <https://codepoems.eu/xl-converter>) inspired the idea of the Convert tab. **No code or assets from it are used.**
- No templates, stock images, icons or fonts from any other design tool or service are bundled.
- **Live2D Cubism Core** (proprietary) is not included. It is downloaded only after the user accepts Live2D's licence agreement and presses the download button, from Live2D's own address.
- **NDI** software is not included. NDI output uses an FFmpeg built with NDI support that the user provides.
