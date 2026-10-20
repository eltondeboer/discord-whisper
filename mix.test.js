import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mix } from './mix.js';

const frame = (...samples) => {
  const b = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => b.writeInt16LE(s, i * 2));
  return b;
};

test('sums and clamps', () => {
  const out = mix([frame(100, 30000, -30000), frame(-50, 10000, -10000)]);
  assert.deepEqual([0, 2, 4].map((i) => out.readInt16LE(i)), [50, 32767, -32768]);
});
