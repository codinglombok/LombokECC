import { GF256 } from "./gf256.js";
import { ReedSolomon } from "./reed-solomon.js";

/**
 * GF(256) and polynomial verification.
 *
 * Every observation here goes through check(), and the process exits 1 if any
 * of them fail. Before Sesi 13 this file was print-only: it computed
 * `allRootsOk` and never used it, and had no process.exit at all, so a broken
 * generator polynomial would print "SHOULD BE 0" and still exit 0.
 */

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`  ✅ ${label}`);
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
    failures.push(label);
  }
}

console.log("===== GF(256) AND POLYNOMIAL TEST =====\n");

const gf = new GF256();

// Test 1: Basic GF operations
console.log("TEST 1: GF(256) Basic Operations");
console.log("--------------------------------");
console.log(`exp[0] = ${gf.exp[0]} (should be 1)`);
console.log(`exp[1] = ${gf.exp[1]} (should be 2, primitive root)`);
console.log(`exp[254] = ${gf.exp[254]}`);
console.log(`log[1] = ${gf.log[1]} (should be 0)`);
console.log(`log[2] = ${gf.log[2]} (should be 1)`);

check("exp[0] === 1", gf.exp[0] === 1, `got ${gf.exp[0]}`);
check("exp[1] === 2 (primitive element)", gf.exp[1] === 2, `got ${gf.exp[1]}`);
check("log[1] === 0", gf.log[1] === 0, `got ${gf.log[1]}`);
check("log[2] === 1", gf.log[2] === 1, `got ${gf.log[2]}`);

const a = 3, b = 5;
const expectedMul = gf.exp[(gf.log[a] + gf.log[b]) % 255];
console.log(`\nmul(${a}, ${b}) = ${gf.mul(a, b)}`);
console.log(`Expected: exp[(log[${a}] + log[${b}]) % 255] = exp[${(gf.log[a] + gf.log[b]) % 255}] = ${expectedMul}`);
check(`mul(${a}, ${b}) matches exp/log identity`, gf.mul(a, b) === expectedMul);

// Exhaustive field properties — cheap (255 or 255^2 ops) and catch real bugs
console.log(`\nExhaustive field properties:`);

let logExpRoundTrip = true;
for (let i = 0; i < 255; i++) {
  if (gf.log[gf.exp[i]] !== i) { logExpRoundTrip = false; break; }
}
check("log[exp[i]] === i for all i in 0..254", logExpRoundTrip);

let expPeriod = gf.exp[0] === gf.exp[255 % 255];
for (let i = 1; i < 255; i++) {
  if (gf.exp[i] === 1) { expPeriod = false; break; }   // α must have order exactly 255
}
check("α has multiplicative order exactly 255", expPeriod);

let invOk = true;
for (let x = 1; x < 256; x++) {
  if (gf.mul(x, gf.inv(x)) !== 1) { invOk = false; break; }
}
check("mul(x, inv(x)) === 1 for all x in 1..255", invOk);

let divOk = true;
outer:
for (let x = 0; x < 256; x++) {
  for (let y = 1; y < 256; y++) {
    if (gf.div(gf.mul(x, y), y) !== x) { divOk = false; break outer; }
  }
}
check("div(mul(x, y), y) === x for all x, y!=0 (65k pairs)", divOk);

let mulZero = true;
for (let x = 0; x < 256; x++) {
  if (gf.mul(x, 0) !== 0 || gf.mul(0, x) !== 0) { mulZero = false; break; }
}
check("mul(x, 0) === 0 (absorbing element)", mulZero);

let commutative = true;
outer2:
for (let x = 0; x < 256; x++) {
  for (let y = 0; y < 256; y++) {
    if (gf.mul(x, y) !== gf.mul(y, x)) { commutative = false; break outer2; }
  }
}
check("mul is commutative", commutative);

// Test 2: Generator polynomial generation
console.log("\n\nTEST 2: Generator Polynomial");
console.log("----------------------------");
const rs = new ReedSolomon(255, 239);
console.log(`RS(255, 239): t = ${rs.t}, n - k = ${rs.n - rs.k}`);
console.log(`Generator polynomial length: ${(rs as any).g.length}`);
console.log(`Expected length: ${rs.n - rs.k + 1}`);

const g = (rs as any).g;
check(`generator length === n - k + 1 (${rs.n - rs.k + 1})`, g.length === rs.n - rs.k + 1, `got ${g.length}`);
check("t === (n - k) / 2", rs.t === (rs.n - rs.k) / 2, `t=${rs.t}`);

console.log(`\nGenerator polynomial coefficients (first 10):`);
for (let i = 0; i < Math.min(10, g.length); i++) {
  console.log(`  g[${i}] = ${g[i]}`);
}

// Verify roots: g(α^i) must be 0 for i = 1..2t
console.log(`\nVerifying roots of generator polynomial:`);
let allRootsOk = true;
const badRoots: number[] = [];
for (let i = 1; i <= 2 * rs.t; i++) {
  const alpha_i = gf.exp[i];
  let val = 0;
  for (let j = 0; j < g.length; j++) {
    val = gf.add(val, gf.mul(g[j], gf.pow(alpha_i, j)));
  }
  if (val !== 0) {
    console.log(`  α^${i}: g(α^${i}) = ${val} — SHOULD BE 0`);
    allRootsOk = false;
    badRoots.push(i);
  }
}
check(`g(α^i) === 0 for i = 1..${2 * rs.t}`, allRootsOk, `failed at i=${badRoots.join(",")}`);

// Negative control: α^0 = 1 must NOT be a root, otherwise "all roots pass"
// could be satisfied by a degenerate all-zero polynomial.
let gAtOne = 0;
for (let j = 0; j < g.length; j++) gAtOne = gf.add(gAtOne, g[j]);
check("g(α^0) !== 0 (guards against degenerate all-zero g)", gAtOne !== 0, `g(1)=${gAtOne}`);

// Test 3: Simple encoding
console.log("\n\nTEST 3: Simple Encoding");
console.log("------------------------");
const simpleMsg = new Uint8Array([1, 2, 3]);
console.log(`Message: [${Array.from(simpleMsg).join(", ")}]`);

const codeword = rs.encode(simpleMsg);
console.log(`Codeword length: ${codeword.length}`);
console.log(`Codeword (first 5): [${Array.from(codeword.slice(0, 5)).join(", ")}]`);
console.log(`Codeword (last 20): [${Array.from(codeword.slice(-20)).join(", ")}]`);

check(`codeword length === n (${rs.n})`, codeword.length === rs.n, `got ${codeword.length}`);

const isValid = rs.isValid(codeword);
console.log(`\nCodeword is valid: ${isValid}`);
check("encoded codeword passes isValid()", isValid);

const syndromes = (rs as any).computeSyndromes(codeword);
console.log(`Syndromes: [${Array.from(syndromes).join(", ")}]`);
const allZero = syndromes.every((s: number) => s === 0);
console.log(`All syndromes zero: ${allZero}`);
check("all 2t syndromes are zero for a clean codeword", allZero);
check(`syndrome vector length === 2t (${2 * rs.t})`, syndromes.length === 2 * rs.t, `got ${syndromes.length}`);

// Test 4: Verify codeword structure
console.log("\n\nTEST 4: Codeword Structure");
console.log("---------------------------");
const paddedMsg = new Uint8Array(rs.k);
paddedMsg.set(simpleMsg, rs.k - simpleMsg.length);
console.log(`Padded message length: ${paddedMsg.length}`);
console.log(`Padded message (first 5): [${Array.from(paddedMsg.slice(0, 5)).join(", ")}]`);
console.log(`Padded message (last 5): [${Array.from(paddedMsg.slice(-5)).join(", ")}]`);

// Systemic codeword: [parity (n-k) || message (k)] — message portion starts at n-k, not 0
console.log();
const messagePart = codeword.slice(rs.n - rs.k);
check(
  "codeword message portion matches right-aligned padded message",
  messagePart.every((v, i) => v === paddedMsg[i]),
);
check(`message portion length === k (${rs.k})`, messagePart.length === rs.k, `got ${messagePart.length}`);

// Summary + exit code
console.log("\n=======================================");
if (failures.length === 0) {
  console.log("✅ ALL GF / POLYNOMIAL CHECKS PASSED");
  console.log("=======================================");
  process.exit(0);
} else {
  console.log(`❌ ${failures.length} CHECK(S) FAILED`);
  for (const f of failures) console.log(`   - ${f}`);
  console.log("=======================================");
  process.exit(1);
}
