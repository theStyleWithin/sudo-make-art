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

## Not included (for clarity)

- **XL Converter** (GPL-3.0, <https://codepoems.eu/xl-converter>) inspired the idea of the Convert tab. **No code or assets from it are used.**
- No templates, stock images, icons or fonts from any other design tool or service are bundled.
