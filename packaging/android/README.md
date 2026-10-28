# Android

Electron does not run on Android, so Android needs its own wrapper around the same web code
(`index.html` + `src/`). Plan: **Capacitor** (an Android WebView app that bundles the files, no network needed).

Not scaffolded yet. It needs the Android SDK, and the editor UI needs a touch/phone layout first
(pointer events already work for touch; the side panels do not fit a phone screen).

What carries over unchanged: the editor, curved text, crop, IndexedDB-backed Sources, PNG/JPG/SVG export.
What needs Android-specific work: opening and saving files through Android's picker, and the heavy tools
(video via FFmpeg, background remover and watermark removal via local models), which must be ported to native plugins.
