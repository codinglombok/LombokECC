import { ReedSolomon } from "./reed-solomon.js";

/**
 * Test Round-Trip: Encode → Corrupt → Decode
 * 
 * RS(255, 239) with t = 8 error correction capability
 */

class RSTestSuite {
  rs: ReedSolomon;

  constructor() {
    this.rs = new ReedSolomon(255, 239); // n=255, k=239, t=8
    console.log(`\n========== REED-SOLOMON TEST SUITE ==========`);
    console.log(`Parameters: n=${this.rs.n}, k=${this.rs.k}, t=${this.rs.t}`);
    console.log(`Generator polynomial degree: ${this.rs.g.length - 1}`);
    console.log(`==========================================\n`);
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

  /**
   * Corrupt exactly `count` DISTINCT positions with NON-ZERO deltas.
   *
   * Do not inline `buf[pos] ^= rng % 256` at call sites: the low bits of this
   * LCG have a very short period, so `% 256` yields 0 often. Earlier revisions
   * of TEST 3 and TEST 4 did exactly that and silently corrupted 0 and 3 bytes
   * respectively while claiming 3 and 9.
   */
  private corrupt(buf: Uint8Array, count: number, seed: number): { positions: number[]; values: number[] } {
    const positions: number[] = [];
    const values: number[] = [];
    let rng = seed;

    while (positions.length < count) {
      rng = (rng * 1103515245 + 12345) >>> 0;
      const pos = rng % this.rs.n;
      if (positions.includes(pos)) continue;

      rng = (rng * 1103515245 + 12345) >>> 0;
      const val = ((rng >>> 16) % 255) + 1;   // 1..255, never 0

      positions.push(pos);
      values.push(val);
      buf[pos] ^= val;
    }

    return { positions, values };
  }

  private printBytes(label: string, data: Uint8Array, maxLen: number = 32) {
    const display = data.length > maxLen
      ? Array.from(data.slice(0, maxLen)).join(" ") + ` ... (${data.length} total)`
      : Array.from(data).join(" ");
    console.log(`${label}: [${display}]`);
  }

  // Test 1: Encode valid message
  testEncode(): void {
    console.log("TEST 1: Encode Message");
    console.log("----------------------");

    const message = this.randomBytes(20, 1);
    this.printBytes("Original message", message);

    const codeword = this.rs.encode(message);
    console.log(`Encoded codeword length: ${codeword.length}`);
    this.printBytes("Codeword (first 40 bytes)", codeword.slice(0, 40));
    this.printBytes("Codeword (last 20 bytes - parity)", codeword.slice(-20));

    // Verify codeword is valid
    const isValid = this.rs.isValid(codeword);
    console.log(`Codeword is valid: ${isValid}`);
    
    // Debug: print syndromes
    if (!isValid) {
      const syndromes = (this.rs as any).computeSyndromes(codeword);
      this.printBytes("Syndromes", syndromes);
    }
    console.log();

    if (!isValid) {
      throw new Error("Encoded codeword should be valid!");
    }
  }

  // Test 2: Corrupt and decode (t errors)
  testDecodeMaxErrors(): void {
    console.log("TEST 2: Decode with Maximum Errors (t=8)");
    console.log("----------------------------------------");

    const message = this.randomBytes(20, 2);
    this.printBytes("Original message", message);

    const codeword = this.rs.encode(message);
    const corrupted = new Uint8Array(codeword);

    // Corrupt exactly t=8 bytes (helper guarantees distinct positions, non-zero deltas)
    const { positions: errorPositions, values: errorValues } = this.corrupt(corrupted, this.rs.t, 100);

    console.log(`Corrupted ${errorPositions.length} bytes at positions: ${errorPositions.join(", ")}`);
    console.log(`Error values: ${errorValues.join(", ")}`);

    const nowValid = this.rs.isValid(corrupted);
    console.log(`Codeword is now valid: ${nowValid}`);

    if (nowValid) {
      throw new Error("Corruption was a no-op: codeword still valid, test would be vacuous!");
    }

    // Decode
    const decoded = this.rs.decode(corrupted);
    this.printBytes("Decoded message", decoded);

    // Verify
    // In systemic RS, decoder returns full k-byte message portion (239 bytes)
    // Original message is padded to k bytes, so extract only last message.length bytes
    const match = decoded.slice(-message.length).every((v, i) => v === message[i]);
    console.log(`Decoded matches original: ${match}`);
    console.log();

    if (!match) {
      throw new Error("Decoded message does not match original!");
    }
  }

  // Test 3: Decode with fewer errors (sub-capacity)
  testDecodeSubCapacity(): void {
    console.log("TEST 3: Decode with Sub-Capacity Errors (3 errors)");
    console.log("--------------------------------------------------");

    const message = this.randomBytes(30, 3);
    this.printBytes("Original message", message);

    const codeword = this.rs.encode(message);
    const corrupted = new Uint8Array(codeword);

    // Corrupt 3 bytes (helper guarantees 3 distinct positions, non-zero deltas)
    const errorCount = 3;
    const { positions: errorPositions } = this.corrupt(corrupted, errorCount, 200);

    console.log(`Corrupted ${errorPositions.length} bytes at positions: ${errorPositions.join(", ")}`);

    const nowValid = this.rs.isValid(corrupted);
    console.log(`Codeword is now valid: ${nowValid}`);

    // Sanity gate: if this is still valid, no error was actually injected and
    // the decode below would be testing a clean codeword, not a 3-error one.
    if (nowValid) {
      throw new Error("Corruption was a no-op: codeword still valid, test would be vacuous!");
    }

    // Decode
    const decoded = this.rs.decode(corrupted);
    this.printBytes("Decoded message", decoded);

    // Verify
    // In systemic RS, decoder returns full k-byte message portion (239 bytes)
    // Original message is padded to k bytes, so extract only last message.length bytes
    const match = decoded.slice(-message.length).every((v, i) => v === message[i]);
    console.log(`Decoded matches original: ${match}`);
    console.log();

    if (!match) {
      throw new Error("Decoded message does not match original!");
    }
  }

  // Test 4: Error detection at capacity boundary
  testBoundaryError(): void {
    console.log("TEST 4: Boundary Test (t+1 errors, should fail)");
    console.log("----------------------------------------------");

    const message = this.randomBytes(20, 4);
    this.printBytes("Original message", message);

    const codeword = this.rs.encode(message);
    const corrupted = new Uint8Array(codeword);

    // Corrupt t+1 = 9 bytes (helper guarantees 9 distinct positions, non-zero deltas)
    const { positions } = this.corrupt(corrupted, this.rs.t + 1, 300);

    console.log(`Corrupted ${positions.length} bytes (exceeds capacity) at: ${positions.join(", ")}`);

    let threw = false;
    let returned: Uint8Array | null = null;

    try {
      returned = this.rs.decode(corrupted);
    } catch (error: any) {
      threw = true;
      console.log(`Correctly threw error: ${error.message}`);
    }
    console.log();

    if (!threw) {
      // Distinguish the two non-throwing outcomes — they mean different things.
      const matched = returned!.slice(-message.length).every((v, i) => v === message[i]);
      throw new Error(
        matched
          ? "decode() returned the correct message for 9 errors — corruption likely degenerate, check the seed"
          : "SILENT MISCORRECTION: decode() returned wrong data for 9 errors without throwing"
      );
    }
  }

  // Test 5: Valid codeword verification
  testValidCodeword(): void {
    console.log("TEST 5: Valid Codeword Verification");
    console.log("-----------------------------------");

    const message = this.randomBytes(50, 5);
    const codeword = this.rs.encode(message);

    const cleanValid = this.rs.isValid(codeword);
    console.log(`Unmodified codeword is valid: ${cleanValid}`);

    // Flip one bit in the codeword
    codeword[100] ^= 0x01;
    const bitFlipValid = this.rs.isValid(codeword);
    console.log(`After 1-bit flip, codeword is valid: ${bitFlipValid}`);

    // Corrupt one entire byte (0x01 ^ 0xff = 0xfe, so this is still a real error)
    codeword[100] ^= 0xff;
    const byteCorruptValid = this.rs.isValid(codeword);
    console.log(`After full-byte corruption, codeword is valid: ${byteCorruptValid}`);
    console.log();

    if (!cleanValid) throw new Error("Unmodified codeword must be valid!");
    if (bitFlipValid) throw new Error("isValid() failed to detect a 1-bit flip!");
    if (byteCorruptValid) throw new Error("isValid() failed to detect byte corruption!");
  }

  run(): void {
    try {
      this.testEncode();
      this.testDecodeMaxErrors();
      this.testDecodeSubCapacity();
      this.testBoundaryError();
      this.testValidCodeword();

      console.log("========================================");
      console.log("✅ ALL TESTS PASSED");
      console.log("========================================");
    } catch (error: any) {
      console.log("\n========================================");
      console.log("❌ TEST FAILED");
      console.log("========================================");
      console.error("Error:", error.message);
      if (error.stack) console.error("Stack:", error.stack);
      process.exit(1);
    }
  }
}

const suite = new RSTestSuite();
suite.run();
