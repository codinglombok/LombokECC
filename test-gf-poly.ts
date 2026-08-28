import { GF256 } from "./gf256.js";
import { ReedSolomon } from "./reed-solomon.js";

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

const a = 3, b = 5;
console.log(`\nmul(${a}, ${b}) = ${gf.mul(a, b)}`);
console.log(`Expected: exp[(log[${a}] + log[${b}]) % 255] = exp[${(gf.log[a] + gf.log[b]) % 255}] = ${gf.exp[(gf.log[a] + gf.log[b]) % 255]}`);

// Test 2: Generator polynomial generation
console.log("\n\nTEST 2: Generator Polynomial");
console.log("----------------------------");
const rs = new ReedSolomon(255, 239);
console.log(`RS(255, 239): t = ${rs.t}, n - k = ${rs.n - rs.k}`);
console.log(`Generator polynomial length: ${(rs as any).g.length}`);
console.log(`Expected length: ${(rs as any).n - (rs as any).k + 1} = ${rs.n - rs.k + 1}`);

const g = (rs as any).g;
console.log(`\nGenerator polynomial coefficients (first 10):`);
for (let i = 0; i < Math.min(10, g.length); i++) {
  console.log(`  g[${i}] = ${g[i]}`);
}

// Verify roots: g(α^i) should = 0 untuk i = 1..2t
console.log(`\nVerifying roots of generator polynomial:`);
let allRootsOk = true;
for (let i = 1; i <= 2 * rs.t; i++) {
  const alpha_i = gf.exp[i];
  let val = 0;
  for (let j = 0; j < g.length; j++) {
    val = gf.add(val, gf.mul(g[j], gf.pow(alpha_i, j)));
  }
  if (val !== 0) {
    console.log(`  α^${i}: g(α^${i}) = ${val} ❌ SHOULD BE 0`);
    allRootsOk = false;
  }
}
if (allRootsOk) {
  console.log(`  ✅ All roots verified (g(α^i) = 0 for i = 1..${2 * rs.t})`);
}

// Test 3: Simple encoding
console.log("\n\nTEST 3: Simple Encoding");
console.log("------------------------");
const simpleMsg = new Uint8Array([1, 2, 3]);
console.log(`Message: [${Array.from(simpleMsg).join(", ")}]`);

const codeword = rs.encode(simpleMsg);
console.log(`Codeword length: ${codeword.length}`);
console.log(`Codeword (first 5): [${Array.from(codeword.slice(0, 5)).join(", ")}]`);
console.log(`Codeword (last 20): [${Array.from(codeword.slice(-20)).join(", ")}]`);

// Check if valid
const isValid = rs.isValid(codeword);
console.log(`\nCodeword is valid: ${isValid}`);

// Check syndromes
const syndromes = (rs as any).computeSyndromes(codeword);
console.log(`Syndromes: [${Array.from(syndromes).join(", ")}]`);
console.log(`All syndromes zero: ${syndromes.every((s: number) => s === 0)}`);

// Test 4: Verify codeword structure
console.log("\n\nTEST 4: Codeword Structure");
console.log("---------------------------");
const paddedMsg = new Uint8Array(rs.k);
paddedMsg.set(simpleMsg, rs.k - simpleMsg.length);
console.log(`Padded message length: ${paddedMsg.length}`);
console.log(`Padded message (first 5): [${Array.from(paddedMsg.slice(0, 5)).join(", ")}]`);
console.log(`Padded message (last 5): [${Array.from(paddedMsg.slice(-5)).join(", ")}]`);

// Systemic codeword: [parity (n-k) || message (k)] — message portion starts at n-k, not 0
console.log(`\nCodeword message part: ${codeword.slice(rs.n - rs.k).every((v, i) => v === paddedMsg[i]) ? "✅ matches" : "❌ MISMATCH"}`);
