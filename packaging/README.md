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
1. Tag a release (`git tag v0.1.0 && git push --tags`). CI then builds the AppImage and Windows installers into a draft GitHub release.

## Before submitting (packager)
- Both drafts are UNTESTED: build and run them first (`flatpak-builder`, `makepkg -si`, `namcap`).
- Flathub: pin the git `commit`, add a screenshot URL to the metainfo, validate with `appstreamcli validate` and `flatpak-builder-lint`.
- AUR: run `updpkgsums` after the tag exists.
- The app needs no network. Keep it that way: the Flatpak requests no network and no broad filesystem access.
