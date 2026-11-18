// FFmpeg options that leave personal metadata out of an output file: global tags (location, title, dates, device),
// per-stream tags, chapters, and the encoder/version stamps. Rotation of phone videos is stored as a display matrix
// in the stream, not as a tag, so it is kept.
const OUT = ['-map_metadata', '-1', '-map_metadata:s:v', '-1', '-map_metadata:s:a', '-1', '-map_chapters', '-1', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact'];
// replace any metadata / chapter options already in an argument list, then add ours before the output name
function apply(args, on) {
  if (!on) return args;
  const a = args.slice(), out = a.pop(), clean = [];
  for (let i = 0; i < a.length; i++) { if (a[i] === '-map_metadata' || a[i] === '-map_chapters') { i++; continue; } clean.push(a[i]); }
  return [...clean, ...OUT, out];
}
module.exports = { OUT, apply };
