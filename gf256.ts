/**
 * GF(256) Field Arithmetic
 * Primitive polynomial: x^8 + x^4 + x^3 + x^2 + 1 = 0x11D
 * Generator element: α (primitive root)
 * 
 * Exponential representation: α^i untuk i = 0..254 (255 elemen non-zero)
 * Log table untuk invers: log(α^i) = i
 */

const PRIMITIVE_POLY = 0x11d; // x^8 + x^4 + x^3 + x^2 + 1

class GF256 {
  exp: Uint8Array;  // exp[i] = α^i dalam GF(256)
  log: Uint16Array; // log[x] = i jika x = α^i (256 slots, value max 255)

  constructor() {
    this.exp = new Uint8Array(512);
    this.log = new Uint16Array(256);
    this.generateTables();
  }

  private generateTables(): void {
    let poly = 1;
    for (let i = 0; i < 255; i++) {
      this.exp[i] = poly;
      this.log[poly] = i;

      // Multiply by α (multiply by 2 in GF, with reduction)
      poly *= 2;
      if (poly > 0xff) {
        poly ^= PRIMITIVE_POLY;
      }
    }
    // Extend table untuk wrapping (exp[255..511])
    for (let i = 0; i < 255; i++) {
      this.exp[255 + i] = this.exp[i];
    }
    // log[0] is undefined, set to 0 for safety
    this.log[0] = 0;
  }

  add(a: number, b: number): number {
    return a ^ b; // XOR in GF(256)
  }

  mul(a: number, b: number): number {
    if (a === 0 || b === 0) return 0;
    return this.exp[(this.log[a] + this.log[b]) % 255];
  }

  div(a: number, b: number): number {
    if (b === 0) throw new Error("Division by zero");
    if (a === 0) return 0;
    return this.exp[(this.log[a] - this.log[b] + 255) % 255];
  }

  inv(a: number): number {
    if (a === 0) throw new Error("Cannot invert zero");
    return this.exp[(255 - this.log[a]) % 255];
  }

  pow(a: number, n: number): number {
    if (a === 0) return 0;
    return this.exp[(this.log[a] * n) % 255];
  }
}

export { GF256, PRIMITIVE_POLY };
