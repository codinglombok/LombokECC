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

    // Corrupt exactly t=8 bytes at random positions (ensure non-zero errors)
    const errorPositions: number[] = [];
    const errorValues: number[] = [];
    let rng = 100;

    while (errorPositions.length < this.rs.t) {
      rng = (rng * 1103515245 + 12345) >>> 0;
      const pos = rng % this.rs.n;

      if (!errorPositions.includes(pos)) {
        errorPositions.push(pos);
        rng = (rng * 1103515245 + 12345) >>> 0;
        let errorVal = (rng % 255) + 1;  // Ensure non-zero error (1..255)
        errorValues.push(errorVal);
        corrupted[pos] ^= errorVal;
      }
    }

    console.log(`Corrupted ${errorPositions.length} bytes at positions: ${errorPositions.join(", ")}`);
    console.log(`Error values: ${errorValues.join(", ")}`);
    console.log(`Codeword is now valid: ${this.rs.isValid(corrupted)}`);

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

    // Corrupt 3 bytes
    const errorCount = 3;
    const errorPositions: number[] = [];
    let rng = 200;

    for (let i = 0; i < errorCount; i++) {
      rng = (rng * 1103515245 + 12345) >>> 0;
      const pos = (rng % this.rs.n);
      errorPositions.push(pos);
      rng = (rng * 1103515245 + 12345) >>> 0;
      corrupted[pos] ^= (rng % 256);
    }

    console.log(`Corrupted ${errorPositions.length} bytes`);
    console.log(`Codeword is now valid: ${this.rs.isValid(corrupted)}`);

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

    // Corrupt t+1 = 9 bytes
    let rng = 300;
    for (let i = 0; i < this.rs.t + 1; i++) {
      rng = (rng * 1103515245 + 12345) >>> 0;
      const pos = (rng % this.rs.n);
      rng = (rng * 1103515245 + 12345) >>> 0;
      corrupted[pos] ^= (rng % 256);
    }

    console.log(`Corrupted ${this.rs.t + 1} bytes (exceeds capacity)`);

    try {
      const decoded = this.rs.decode(corrupted);
      console.log(`ERROR: Should have thrown, but decoded: ${Array.from(decoded).join(",")}`);
    } catch (error: any) {
      console.log(`Correctly threw error: ${error.message}`);
    }
    console.log();
  }

  // Test 5: Valid codeword verification
  testValidCodeword(): void {
    console.log("TEST 5: Valid Codeword Verification");
    console.log("-----------------------------------");

    const message = this.randomBytes(50, 5);
    const codeword = this.rs.encode(message);

    console.log(`Unmodified codeword is valid: ${this.rs.isValid(codeword)}`);

    // Flip one bit in the codeword
    codeword[100] ^= 0x01;
    console.log(`After 1-bit flip, codeword is valid: ${this.rs.isValid(codeword)}`);

    // Corrupt one entire byte
    codeword[100] ^= 0xff;
    console.log(`After full-byte corruption, codeword is valid: ${this.rs.isValid(codeword)}`);
    console.log();
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
