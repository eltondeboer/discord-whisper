// Sums 16-bit PCM frames; clamping keeps loud overlaps from wrapping into noise.
export function mix(frames) {
  if (frames.length === 1) return frames[0];
  const out = Buffer.alloc(frames[0].length);
  for (let i = 0; i < out.length; i += 2) {
    let sum = 0;
    for (const f of frames) sum += f.readInt16LE(i);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, sum)), i);
  }
  return out;
}
