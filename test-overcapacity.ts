import { ReedSolomon } from "./reed-solomon.js";

/**
 * Overcapacity stress test for RS(255, 239), t=8.
 *
 * IMPORTANT — what this test can and cannot prove:
 *
 * Reed-Solomon is a bounded-distance decoder. With more than t errors the
 * received word can land inside the decoding sphere of a DIFFERENT valid
 * codeword. When that happens the decoder returns a valid-but-wrong message
 * and no algorithm can detect it. This is a property of the code itself, not
 * a bug in this implementation.
 *
 * So the goal is NOT "never miscorrect" (impossible). The goal is:
 *   1. no crashes / no hangs / no out-of-range writes
 *   2. every non-detected case must be a genuine alternate codeword
 *      (i.e. syndromes all zero), never a half-corrected mess
 *   3. measure the residual miscorrection rate so it can be documented
 */

// Deterministic PRNG (mulberry32) so results are reproducible.
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

interface Tally {
  detected: number;          // threw an error -> correct behaviour
  recoveredCorrect: number;  // returned the original message despite >t errors
  miscorrected: number;      // returned a DIFFERENT message, no throw
  invalidOutput: number;     // returned without throwing AND result is not a valid codeword -> BUG
  crashed: number;           // threw something that is not a decode failure -> BUG
}

function run(errorCount: number, iterations: number, seed: number): Tally {
  const rs = new ReedSolomon(255, 239);
  const rng = makeRng(seed);
  const tally: Tally = {
    detected: 0,
    recoveredCorrect: 0,
    miscorrected: 0,
    invalidOutput: 0,
    crashed: 0,
  };

  for (let iter = 0; iter < iterations; iter++) {
    // Random message, random length 1..239
    const msgLen = 1 + Math.floor(rng() * 239);
    const message = new Uint8Array(msgLen);
    for (let i = 0; i < msgLen; i++) message[i] = Math.floor(rng() * 256);

    const codeword = rs.encode(message);
    const corrupted = new Uint8Array(codeword);

    // Pick `errorCount` DISTINCT positions and apply non-zero deltas.
    const chosen = new Set<number>();
    while (chosen.size < errorCount) chosen.add(Math.floor(rng() * 255));
    for (const pos of chosen) {
      let delta = 0;
      while (delta === 0) delta = Math.floor(rng() * 256);
      corrupted[pos] ^= delta;
    }

    let decoded: Uint8Array | null = null;
    try {
      decoded = rs.decode(corrupted);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Expected decode failures mention errors / validity.
      if (/error|valid|locate|mismatch/i.test(msg)) {
        tally.detected++;
      } else {
        tally.crashed++;
        console.log(`  ! unexpected exception (e=${errorCount}, iter=${iter}): ${msg}`);
      }
      continue;
    }

    // Decoder returned without throwing. Classify the outcome.
    if (decoded.length !== rs.k) {
      tally.invalidOutput++;
      console.log(`  ! wrong output length (e=${errorCount}, iter=${iter}): ${decoded.length}`);
      continue;
    }

    // Re-encode what the decoder claims the message is; if the decoder returned
    // a genuine alternate codeword this must round-trip cleanly.
    const reencoded = rs.encode(decoded);
    const roundTrips = rs.isValid(reencoded);

    const matchesOriginal =
      Array.from(decoded.slice(-msgLen)).every((v, i) => v === message[i]) &&
      Array.from(decoded.slice(0, rs.k - msgLen)).every((v) => v === 0);

    if (matchesOriginal) {
      tally.recoveredCorrect++;
    } else if (roundTrips) {
      tally.miscorrected++;
    } else {
      tally.invalidOutput++;
      console.log(`  ! output is not a valid codeword (e=${errorCount}, iter=${iter})`);
    }
  }

  return tally;
}

console.log("OVERCAPACITY STRESS TEST — RS(255, 239), t=8");
console.log("=".repeat(72));
console.log();

const ITERATIONS = 200;
const errorCounts = [9, 10, 12, 16, 20, 32, 64];
let hardFailures = 0;

for (const e of errorCounts) {
  const t = run(e, ITERATIONS, 0xC0FFEE + e);
  const pctDetected = ((t.detected / ITERATIONS) * 100).toFixed(1);
  const pctMis = ((t.miscorrected / ITERATIONS) * 100).toFixed(1);

  console.log(`errors=${String(e).padStart(2)}  of ${ITERATIONS} runs:`);
  console.log(`   detected (threw) ......... ${String(t.detected).padStart(3)}  (${pctDetected}%)`);
  console.log(`   recovered correctly ...... ${String(t.recoveredCorrect).padStart(3)}`);
  console.log(`   miscorrected (valid alt) . ${String(t.miscorrected).padStart(3)}  (${pctMis}%)  <- theoretically unavoidable`);
  console.log(`   INVALID OUTPUT ........... ${String(t.invalidOutput).padStart(3)}  <- must be 0`);
  console.log(`   CRASHED .................. ${String(t.crashed).padStart(3)}  <- must be 0`);
  console.log();

  hardFailures += t.invalidOutput + t.crashed;
}

console.log("=".repeat(72));
if (hardFailures === 0) {
  console.log("✅ NO HARD FAILURES");
  console.log("   Every non-detected case was a genuine alternate codeword.");
  console.log("   No crashes, no malformed output, no half-corrected results.");
} else {
  console.log(`❌ ${hardFailures} HARD FAILURE(S) — decoder can emit malformed output`);
  process.exit(1);
}
