import { ReedSolomon } from "./reed-solomon.js";

/**
 * Within-capacity randomized test for RS(255, 239), t=8.
 *
 * This is the counterpart to test-overcapacity.ts and the more important of
 * the two. The guards added in Session 11 (error-count check + isValid check
 * after correction) reject undecodable input — this test proves they do NOT
 * also reject input that IS decodable.
 *
 * For 1..8 errors the decoder must recover the original message EVERY time.
 * A single failure here is a release blocker.
 */

function makeRng(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rs = new ReedSolomon(255, 239);
const ITERATIONS = 200;

console.log("WITHIN-CAPACITY RANDOMIZED TEST — RS(255, 239), t=8");
console.log("=".repeat(72));
console.log();

let totalRuns = 0;
let totalFailures = 0;

for (let errorCount = 0; errorCount <= 8; errorCount++) {
  const rng = makeRng(0xBEEF + errorCount * 7919);
  let recovered = 0;
  let threw = 0;
  let wrong = 0;
  const examples: string[] = [];

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const msgLen = 1 + Math.floor(rng() * 239);
    const message = new Uint8Array(msgLen);
    for (let i = 0; i < msgLen; i++) message[i] = Math.floor(rng() * 256);

    const codeword = rs.encode(message);
    const corrupted = new Uint8Array(codeword);

    const chosen = new Set<number>();
    while (chosen.size < errorCount) chosen.add(Math.floor(rng() * 255));
    for (const pos of chosen) {
      let delta = 0;
      while (delta === 0) delta = Math.floor(rng() * 256);
      corrupted[pos] ^= delta;
    }

    try {
      const decoded = rs.decode(corrupted);
      const ok = Array.from(decoded.slice(-msgLen)).every((v, i) => v === message[i]);
      if (ok) {
        recovered++;
      } else {
        wrong++;
        if (examples.length < 3) {
          examples.push(`iter=${iter} msgLen=${msgLen} positions=[${[...chosen].sort((a, b) => a - b)}]`);
        }
      }
    } catch (e) {
      threw++;
      if (examples.length < 3) {
        const m = e instanceof Error ? e.message : String(e);
        examples.push(`iter=${iter} msgLen=${msgLen} positions=[${[...chosen].sort((a, b) => a - b)}] threw: ${m}`);
      }
    }
  }

  const failures = threw + wrong;
  totalRuns += ITERATIONS;
  totalFailures += failures;

  const status = failures === 0 ? "✅" : "❌";
  console.log(
    `${status} errors=${errorCount}  recovered ${String(recovered).padStart(3)}/${ITERATIONS}` +
      `   threw ${String(threw).padStart(3)}   wrong ${String(wrong).padStart(3)}`
  );
  for (const ex of examples) console.log(`      ${ex}`);
}

console.log();
console.log("=".repeat(72));
if (totalFailures === 0) {
  console.log(`✅ ALL ${totalRuns} RUNS RECOVERED CORRECTLY (0..8 errors)`);
  console.log("   The Session 11 guards do not reject decodable input.");
} else {
  console.log(`❌ ${totalFailures} FAILURE(S) out of ${totalRuns} — RELEASE BLOCKER`);
  process.exit(1);
}
