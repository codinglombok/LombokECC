import { GF256 } from "./gf256.js";

/**
 * Reed-Solomon Encoder/Decoder
 * 
 * Standard RS(n, k) with t = (n - k) / 2 error-correcting capability
 * n = codeword length (usually 255 for GF(256))
 * k = message length
 * t = number of byte errors that can be corrected
 * 
 * Generator polynomial: g(x) = (x - α^1)(x - α^2)...(x - α^(2t))
 * Roots at α^1, α^2, ..., α^(2t)
 */

class ReedSolomon {
  gf: GF256;
  n: number;      // Codeword length
  k: number;      // Message length
  t: number;      // Error correction capability
  g: Uint8Array;  // Generator polynomial coefficients

  constructor(n: number = 255, k: number = 239) {
    if ((n - k) % 2 !== 0) {
      throw new Error("n - k must be even (for t = (n - k) / 2)");
    }
    this.gf = new GF256();
    this.n = n;
    this.k = k;
    this.t = (n - k) / 2;

    // Generate generator polynomial with roots at α^1, α^2, ..., α^(2t)
    this.g = this.computeGeneratorPolynomial();
  }

  private computeGeneratorPolynomial(): Uint8Array {
    const deg = this.n - this.k; // 2t (number of parity bytes)
    // Start with polynomial 1 (degree 0)
    let poly = new Uint8Array(1);
    poly[0] = 1;

    // Multiply by (x - α^i) for i = 1 to 2t
    // Each multiplication increases degree by 1
    for (let i = 1; i <= deg; i++) {
      const alpha_i = this.gf.exp[i]; // α^i
      // (x - α^i) has length 2: [α^i, 1] meaning 1*x + α^i
      // Result has length poly.length + 1
      const newPoly = new Uint8Array(poly.length + 1);

      for (let j = 0; j < poly.length; j++) {
        // Coefficient for x^j: poly[j] * (-α^i) + poly[j]
        // Which is: poly[j] * α^i (for x^j term) + poly[j] (for x^(j+1) term)
        newPoly[j] = this.gf.add(newPoly[j], this.gf.mul(poly[j], alpha_i));
        newPoly[j + 1] = this.gf.add(newPoly[j + 1], poly[j]);
      }
      poly = newPoly;
    }

    return poly;
  }

  encode(message: Uint8Array): Uint8Array {
    if (message.length > this.k) {
      throw new Error(`Message too long: ${message.length} > ${this.k}`);
    }

    // Pad message to k bytes (right-aligned)
    const msg = new Uint8Array(this.k);
    msg.set(message, this.k - message.length);

    // Systemic RS: compute parity from msg(x) * x^(n-k) mod g(x)
    // In array representation, msg(x) * x^(n-k) = [0, ..., 0, msg_0, ..., msg_{k-1}]
    const nMinusK = this.n - this.k;
    const msgShifted = new Uint8Array(this.n);
    msgShifted.set(msg, nMinusK);  // Place message at high-order positions: [0, 0, ..., 0, msg]

    // Compute remainder: (msg * x^(n-k)) mod g(x)
    const remainder = this.polyMod(msgShifted, this.g);

    if (remainder.length !== nMinusK) {
      throw new Error(
        `Remainder length mismatch: ${remainder.length} !== ${nMinusK}`
      );
    }

    // Systemic codeword = remainder || msg (parity at low-order positions)
    // Polynomial: parity(x) + msg(x) * x^(n-k)
    const codeword = new Uint8Array(this.n);
    codeword.set(remainder, 0);    // Positions 0..nMinusK-1: parity
    codeword.set(msg, nMinusK);     // Positions nMinusK..n-1: message

    return codeword;
  }

  private polyMod(dividend: Uint8Array, divisor: Uint8Array): Uint8Array {
    // Polynomial division: dividend = divisor * quotient + remainder
    // We process from highest degree (rightmost) to lowest (leftmost)
    let remainder = new Uint8Array(dividend);
    const divisorLen = divisor.length;

    // Process from high-degree coefficient downwards
    // Position (remainder.length - divisorLen) is where highest degree of divisor starts
    for (let i = remainder.length - divisorLen; i >= 0; i--) {
      if (remainder[i + divisorLen - 1] === 0) continue;

      // Eliminate remainder[i + divisorLen - 1] using divisor[divisorLen - 1]
      const coeff = remainder[i + divisorLen - 1];
      for (let j = 0; j < divisorLen; j++) {
        remainder[i + j] = this.gf.add(
          remainder[i + j],
          this.gf.mul(divisor[j], coeff)
        );
      }
    }

    // Return only the remainder part (low-order, degree < divisor degree)
    return remainder.slice(0, divisorLen - 1);
  }

  computeSyndromes(received: Uint8Array): Uint8Array {
    const syndromes = new Uint8Array(this.n - this.k);

    // Syndrome[i] = received(α^(i+1))
    for (let i = 0; i < syndromes.length; i++) {
      let syndrome = 0;
      const alpha_i_plus_1 = this.gf.exp[i + 1]; // α^(i+1)

      for (let j = 0; j < received.length; j++) {
        syndrome = this.gf.add(
          syndrome,
          this.gf.mul(received[j], this.gf.pow(alpha_i_plus_1, j))
        );
      }
      syndromes[i] = syndrome;
    }

    return syndromes;
  }

  isValid(codeword: Uint8Array): boolean {
    const syndromes = this.computeSyndromes(codeword);
    return syndromes.every((s) => s === 0);
  }

  // Berlekamp-Massey Algorithm untuk finding error locator polynomial
  private berlekampMassey(syndromes: Uint8Array): Uint8Array {
    const n = syndromes.length;
    let sigma = new Uint8Array(n + 1);
    sigma[0] = 1;

    let L = 0; // Current locator polynomial degree
    let m = 1;
    let B = new Uint8Array(n + 1);
    B[0] = 1;
    let b = 1;

    for (let N = 0; N < n; N++) {
      // Compute discrepancy
      let disc = syndromes[N];
      for (let i = 1; i <= L; i++) {
        disc = this.gf.add(disc, this.gf.mul(sigma[i], syndromes[N - i]));
      }

      if (disc === 0) {
        m += 1;
      } else {
        const t = new Uint8Array(sigma.length);
        t.set(sigma);

        // Update sigma using the old b value (1 / last discrepancy that changed L)
        // factor = disc / b, where b stores 1 / (previous disc)
        const factor = this.gf.mul(disc, b);
        for (let i = 0; i <= L; i++) {
          sigma[i + m] = this.gf.add(
            sigma[i + m],
            this.gf.mul(B[i], factor)
          );
        }

        if (2 * L <= N) {
          L = N + 1 - L;
          b = this.gf.inv(disc); // Save 1/disc for next L update
          B = t;
          m = 1;
        } else {
          m += 1;
        }
      }
    }

    return sigma.slice(0, L + 1);
  }

  // Chien Search untuk finding error positions
  private chienSearch(sigma: Uint8Array): Uint8Array {
    const errors: number[] = [];

    for (let i = 1; i < this.n + 1; i++) {
      const alpha_i = this.gf.exp[i % 255]; // α^i

      let val = sigma[0];
      for (let j = 1; j < sigma.length; j++) {
        val = this.gf.add(val, this.gf.mul(sigma[j], this.gf.pow(alpha_i, j)));
      }

      if (val === 0) {
        const pos = (this.n - i + this.n) % this.n;
        errors.push(pos);
      }
    }

    return new Uint8Array(errors);
  }

  // Forney Algorithm untuk computing error values
  private forneyAlgorithm(
    syndromes: Uint8Array,
    sigma: Uint8Array,
    errorPositions: Uint8Array
  ): Uint8Array {
    if (errorPositions.length === 0) {
      return new Uint8Array(0);
    }

    const errorValues = new Uint8Array(errorPositions.length);

    // Compute formal derivative of sigma in GF(256)
    // In GF(2^8): σ'(x) = σ₁ + σ₃·x + σ₅·x² + ... (only odd indices remain)
    let sigmaDeriv = new Uint8Array(sigma.length);
    let derivIdx = 0;
    for (let i = 1; i < sigma.length; i += 2) {
      sigmaDeriv[derivIdx++] = sigma[i];
    }

    for (let i = 0; i < errorPositions.length; i++) {
      const pos = errorPositions[i];
      const alpha_pos = this.gf.exp[pos % 255]; // α^pos

      let numerator = 0;
      for (let j = 0; j < syndromes.length; j++) {
        numerator = this.gf.add(
          numerator,
          this.gf.mul(syndromes[j], this.gf.pow(alpha_pos, j + 1))
        );
      }

      let denominator = 0;
      for (let j = 0; j < sigmaDeriv.length; j++) {
        denominator = this.gf.add(
          denominator,
          this.gf.mul(sigmaDeriv[j], this.gf.pow(alpha_pos, j))
        );
      }

      if (denominator === 0) {
        throw new Error("Unable to compute error value: singular denominator");
      }

      errorValues[i] = this.gf.div(numerator, denominator);
    }

    return errorValues;
  }

  decode(received: Uint8Array): Uint8Array {
    if (received.length !== this.n) {
      throw new Error(`Received codeword length mismatch: ${received.length} !== ${this.n}`);
    }

    const syndromes = this.computeSyndromes(received);

    // Check if codeword is already valid
    if (syndromes.every((s) => s === 0)) {
      // Extract message from systemic codeword: [parity || msg]
      return received.slice(this.n - this.k);
    }

    // Berlekamp-Massey Algorithm
    const sigma = this.berlekampMassey(syndromes);

    if (sigma.length - 1 > this.t) {
      throw new Error("Too many errors detected");
    }

    // Chien Search
    const errorPositions = this.chienSearch(sigma);

    if (errorPositions.length === 0) {
      throw new Error("Unable to locate errors");
    }

    // Forney Algorithm
    const errorValues = this.forneyAlgorithm(syndromes, sigma, errorPositions);

    // Apply corrections
    const corrected = new Uint8Array(received);
    for (let i = 0; i < errorPositions.length; i++) {
      corrected[errorPositions[i]] = this.gf.add(corrected[errorPositions[i]], errorValues[i]);
    }

    // Extract message from systemic codeword: [parity || msg]
    return corrected.slice(this.n - this.k);
  }
}

export { ReedSolomon };
