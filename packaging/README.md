# Packaging handoff

These files let someone else submit Sudo Make Art to Flathub or the AUR. The project owner does not maintain
those packages; whoever submits one becomes its maintainer.

| File | For |
|---|---|
| `flatpak/io.github.thestylewithin.SudoMakeArt.yml` | Flathub manifest (draft) |
| `aur/PKGBUILD` | AUR source package (draft) |
| `sudo-make-art.desktop`, `*.metainfo.xml` | shared by both |
| `android/README.md` | Android plan (Capacitor) |

## Before submitting (owner)
1. Release: in GitHub → Actions → build → Run workflow, tick *publish*. CI builds the AppImage, Windows installers and Android APK and publishes the release. v0.1.0 is already published.

## Before submitting (packager)
- Both drafts are UNTESTED: build and run them first (`flatpak-builder`, `makepkg -si`, `namcap`).
- Flathub: add a screenshot URL to the metainfo, validate with `appstreamcli validate` and `flatpak-builder-lint`.
- AUR: replace the maintainer line; the v0.1.0 checksum is filled in.
- The app needs no network. Keep it that way: the Flatpak requests no network and no broad filesystem access.
