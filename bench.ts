import { ReedSolomon } from "./reed-solomon.js";

/**
 * Benchmark for RS(255, 239).
 *
 * Measures block throughput. Numbers are for THIS machine — treat them as an
 * order-of-magnitude indication, not a specification. Re-run on target
 * hardware before quoting anything.
 */

const rs = new ReedSolomon(255, 239);
const K = 239;

function bench(label: string, blocks: number, fn: (i: number) => void): number {
  // Warm up so we are not measuring JIT compilation.
  for (let i = 0; i < Math.min(blocks, 200); i++) fn(i);

  const start = process.hrtime.bigint();
  for (let i = 0; i < blocks; i++) fn(i);
  const end = process.hrtime.bigint();

  const seconds = Number(end - start) / 1e9;
  const mib = (blocks * K) / (1024 * 1024);
  const throughput = mib / seconds;
  const perBlockUs = (seconds * 1e6) / blocks;

  console.log(
    `${label.padEnd(34)} ${throughput.toFixed(2).padStart(8)} MiB/s` +
      `   ${perBlockUs.toFixed(1).padStart(8)} µs/block` +
      `   (${blocks} blocks, ${seconds.toFixed(2)}s)`
  );
  return throughput;
}

// Fixed pseudo-random payloads, prepared up front so payload generation is
// not counted in the timings.
const SAMPLES = 64;
const messages: Uint8Array[] = [];
let seed = 12345;
function nextByte() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return (seed >>> 16) & 0xff;
}
for (let s = 0; s < SAMPLES; s++) {
  const m = new Uint8Array(K);
  for (let i = 0; i < K; i++) m[i] = nextByte();
  messages.push(m);
}

const codewords = messages.map((m) => rs.encode(m));

// Pre-corrupt copies at various error counts.
function corrupt(cw: Uint8Array, errors: number, salt: number): Uint8Array {
  const out = new Uint8Array(cw);
  const chosen = new Set<number>();
  let s = salt * 2654435761;
  while (chosen.size < errors) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    chosen.add((s >>> 8) % 255);
  }
  for (const p of chosen) out[p] ^= 0xa5;
  return out;
}

const clean = codewords;
const err1 = codewords.map((cw, i) => corrupt(cw, 1, i + 1));
const err4 = codewords.map((cw, i) => corrupt(cw, 4, i + 2));
const err8 = codewords.map((cw, i) => corrupt(cw, 8, i + 3));

console.log("BENCHMARK — RS(255, 239), t=8");
console.log(`node ${process.version}  platform ${process.platform} ${process.arch}`);
console.log("=".repeat(88));
console.log();

bench("encode", 20000, (i) => {
  rs.encode(messages[i % SAMPLES]);
});

bench("decode (clean, no errors)", 20000, (i) => {
  rs.decode(clean[i % SAMPLES]);
});

bench("decode (1 error)", 2000, (i) => {
  rs.decode(err1[i % SAMPLES]);
});

bench("decode (4 errors)", 1000, (i) => {
  rs.decode(err4[i % SAMPLES]);
});

bench("decode (8 errors, worst case)", 500, (i) => {
  rs.decode(err8[i % SAMPLES]);
});

console.log();
console.log("=".repeat(88));
console.log("Note: decode cost grows steeply with error count — Peterson-GZ is O(t^3)");
console.log("      per block plus Chien search over all 255 positions.");
