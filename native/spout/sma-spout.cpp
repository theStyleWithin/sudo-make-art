// sma-spout: a tiny Windows helper that publishes pictures as a Spout sender. Sudo Make Art starts it and pipes it raw RGBA frames
// on standard input (one after another, width x height x 4 bytes each); programs that read Spout (OBS with the Spout plugin,
// Resolume, VSeeFace-style tools and so on) then see "the picture" as a live video source. Original code for this project, built
// against the Spout2 SDK (BSD 2-Clause, Lynn Jarvis and contributors), which is fetched by scripts/build-spout.js.
// Usage: sma-spout <sender name> <width> <height>
#include "SpoutDX.h"
#include <cstdio>
#include <cstdlib>
#include <vector>
#include <io.h>
#include <fcntl.h>

int main(int argc, char** argv) {
  if (argc < 4) { fprintf(stderr, "usage: sma-spout <name> <width> <height>\n"); return 1; }
  const char* name = argv[1]; unsigned w = (unsigned)atoi(argv[2]), h = (unsigned)atoi(argv[3]);
  if (w < 16 || h < 16 || w > 8192 || h > 8192) { fprintf(stderr, "bad size\n"); return 1; }
  _setmode(_fileno(stdin), _O_BINARY);
  spoutDX sender;
  if (!sender.OpenDirectX11()) { fprintf(stderr, "Could not start DirectX 11.\n"); return 2; }
  sender.SetSenderName(name);
  std::vector<unsigned char> buf((size_t)w * h * 4);
  while (fread(buf.data(), 1, buf.size(), stdin) == buf.size()) {
    for (size_t i = 0; i < buf.size(); i += 4) { unsigned char t = buf[i]; buf[i] = buf[i + 2]; buf[i + 2] = t; } // RGBA -> BGRA (Spout's default texture format)
    if (!sender.SendImage(buf.data(), w, h)) { fprintf(stderr, "Could not send a frame.\n"); }
  }
  sender.ReleaseSender(); sender.CloseDirectX11();
  return 0;
}
