import { ReedSolomon } from "./reed-solomon.js";

/**
 * Reed-Solomon ENCODING VALIDATION TEST
 * Verify that encoded codewords satisfy the property: c(α^i) = 0 for all generator roots α^i
 */

class EncodeValidationTest {
  rs: ReedSolomon;

  constructor() {
    this.rs = new ReedSolomon(255, 239);
    console.log("========== REED-SOLOMON ENCODING VALIDATION TEST ==========");
    console.log(`RS(${this.rs.n}, ${this.rs.k}): t=${this.rs.t} error correction`);
    console.log("===========================================================\n");
  }

  private randomBytes(length: number, seed: number = 42): Uint8Array {
    const arr = new Uint8Array(length);
    let rng = seed;
    for (let i = 0; i < length; i++) {
      rng = (rng * 1103515245 + 12345) >>> 0;
      arr[i] = (rng / 65536) % 256;
    }
    return arr;
  }

  testEncodeMultiple() {
    console.log("TEST: Multiple message encodings");
    console.log("--------------------------------");

    const testCases = [
      { msg: new Uint8Array([1]), name: "Single byte [1]" },
      { msg: new Uint8Array([0xFF]), name: "Single byte [255]" },
      { msg: this.randomBytes(10, 1), name: "Random 10 bytes" },
      { msg: this.randomBytes(50, 2), name: "Random 50 bytes" },
      { msg: this.randomBytes(100, 3), name: "Random 100 bytes" },
      { msg: this.randomBytes(239, 4), name: "Maximum length 239 bytes" },
    ];

    let passCount = 0;
    for (const tc of testCases) {
      process.stdout.write(`  ${tc.name}... `);
      const codeword = this.rs.encode(tc.msg);
      const isValid = this.rs.isValid(codeword);

      if (isValid) {
        console.log("✅ PASS");
        passCount++;
      } else {
        console.log("❌ FAIL");
        const syndromes = (this.rs as any).computeSyndromes(codeword);
        console.log(`      Syndromes: [${Array.from(syndromes.slice(0, 4)).join(", ")}...]`);
      }
    }

    console.log(`\nResult: ${passCount}/${testCases.length} tests passed`);
    return passCount === testCases.length;
  }

  testEncodeZeros() {
    console.log("\nTEST: Zero message");
    console.log("------------------");

    const zeroMsg = new Uint8Array(10);
    process.stdout.write(`  Encoding zero message... `);

    const codeword = this.rs.encode(zeroMsg);
    const isValid = this.rs.isValid(codeword);

    if (isValid) {
      console.log("✅ PASS");
      console.log(`  Codeword is all zeros: ${codeword.every((b) => b === 0)}`);
    } else {
      console.log("❌ FAIL");
      const syndromes = (this.rs as any).computeSyndromes(codeword);
      console.log(`  Syndromes (should be zero): [${Array.from(syndromes).join(", ")}]`);
    }
    return isValid;
  }

  testEncodeAllOnes() {
    console.log("\nTEST: All-ones message");
    console.log("----------------------");

    const onesMsg = new Uint8Array(10);
    onesMsg.fill(0xFF);
    process.stdout.write(`  Encoding all-ones message... `);

    const codeword = this.rs.encode(onesMsg);
    const isValid = this.rs.isValid(codeword);

    if (isValid) {
      console.log("✅ PASS");
      console.log(`  First 10 parity bytes: [${Array.from(codeword.slice(0, 10)).join(", ")}]`);
    } else {
      console.log("❌ FAIL");
    }
    return isValid;
  }

  testMessageExtraction() {
    console.log("\nTEST: Message extraction from codeword");
    console.log("---------------------------------------");

    const msg = this.randomBytes(20, 5);
    const codeword = this.rs.encode(msg);

    // In systemic form [parity || msg], message is at positions (n-k)..n-1
    const extracted = codeword.slice(this.rs.n - this.rs.k);

    // Pad original message for comparison
    const paddedMsg = new Uint8Array(this.rs.k);
    paddedMsg.set(msg, this.rs.k - msg.length);

    const match = extracted.every((v, i) => v === paddedMsg[i]);
    if (match) {
      console.log(`  ✅ Message correctly embedded in systemic codeword`);
    } else {
      console.log(`  ❌ Message extraction mismatch`);
    }
    return match;
  }

  run() {
    const results: boolean[] = [];

    results.push(this.testEncodeMultiple());
    results.push(this.testEncodeZeros());
    results.push(this.testEncodeAllOnes());
    results.push(this.testMessageExtraction());

    console.log("\n===========================================================");
    if (results.every((r) => r)) {
      console.log("✅ ALL ENCODING VALIDATION TESTS PASSED");
      console.log("===========================================================");
      return true;
    } else {
      console.log("❌ SOME TESTS FAILED");
      console.log("===========================================================");
      return false;
    }
  }
}

const test = new EncodeValidationTest();
const success = test.run();
process.exit(success ? 0 : 1);
