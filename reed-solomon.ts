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

    // Compute S_i = received(α^i) for i = 1 to 2t
    // Stored as syndromes[i-1] = S_i, so syndromes[0] = S_1, syndromes[1] = S_2, etc.
    for (let i = 0; i < syndromes.length; i++) {
      let syndrome = 0;
      const alpha_i = this.gf.exp[(i + 1) % 255]; // α^(i+1)

      for (let j = 0; j < received.length; j++) {
        syndrome = this.gf.add(
          syndrome,
          this.gf.mul(received[j], this.gf.pow(alpha_i, j))
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

  // Peterson-Gorenstein-Zierler Algorithm - More direct than BMA
  // Solves for error locator polynomial using Gaussian elimination in GF(256)
  private berlekampMassey(syndromes: Uint8Array): Uint8Array {
    const n = syndromes.length; // 2t syndromes
    const t = this.t;
    
    // Try each degree from 1 to t to find minimal error locator
    for (let degree = 1; degree <= t; degree++) {
      if (degree * 2 > n) break; // Need at least 2*degree syndromes
      
      // Build system: σ_i for i=1..degree  
      // Equation: S_j + Σ σ_i * S_{j-i} = 0 for j = degree..2t-1
      const equations = Math.min(degree, n - degree);
      if (equations < degree) continue;
      
      // Create matrix A where A[row][col] = S_{row+degree-col-1}
      const A: number[][] = [];
      const B: number[] = [];
      
      for (let row = 0; row < equations; row++) {
        const eqIndex = row + degree; // Equation index j
        A[row] = [];
        for (let col = 0; col < degree; col++) {
          const syndIndex = eqIndex - col - 1; // S_{j-col-1}
          if (syndIndex >= 0 && syndIndex < n) {
            A[row][col] = syndromes[syndIndex];
          } else {
            A[row][col] = 0;
          }
        }
        B[row] = syndromes[eqIndex];
      }
      
      // Solve using Gaussian elimination
      const solution = this.gaussianElimination(A, B);
      
      if (solution !== null) {
        // Verify solution works for ALL syndromes
        let valid = true;
        for (let j = degree; j < n; j++) {
          let sum = syndromes[j];
          for (let i = 0; i < degree; i++) {
            if (j - i - 1 >= 0) {
              sum = this.gf.add(sum, this.gf.mul(solution[i], syndromes[j - i - 1]));
            }
          }
          if (sum !== 0) {
            valid = false;
            break;
          }
        }
        
        if (valid) {
          // Build sigma polynomial: σ(x) = 1 + σ_1·x + σ_2·x² + ...
          const sigma = new Uint8Array(degree + 1);
          sigma[0] = 1;
          for (let i = 0; i < degree; i++) {
            sigma[i + 1] = solution[i];
          }
          console.log("DEBUG PGZ - Found solution at degree=" + degree);
          return sigma;
        }
      }
    }
    
    // No solution found - return minimal (no errors)
    console.log("DEBUG PGZ - No solution found");
    const sigma = new Uint8Array(1);
    sigma[0] = 1;
    return sigma;
  }
  
  // Gaussian elimination solver for GF(256)
  private gaussianElimination(A: number[][], b: number[]): number[] | null {
    const m = A.length;
    if (m === 0) return null;
    const n = A[0].length;
    if (n === 0) return null;
    
    // Augmented matrix
    const aug: number[][] = [];
    for (let i = 0; i < m; i++) {
      aug[i] = [...A[i], b[i]];
    }
    
    // Forward elimination
    let row = 0;
    for (let col = 0; col < n && row < m; col++) {
      // Find pivot
      let pivot = -1;
      for (let i = row; i < m; i++) {
        if (aug[i][col] !== 0) {
          pivot = i;
          break;
        }
      }
      
      if (pivot === -1) continue;
      
      // Swap rows
      [aug[row], aug[pivot]] = [aug[pivot], aug[row]];
      
      // Normalize pivot row
      const pivotVal = aug[row][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] = this.gf.mul(aug[row][j], this.gf.inv(pivotVal));
      }
      
      // Eliminate column
      for (let i = 0; i < m; i++) {
        if (i !== row && aug[i][col] !== 0) {
          const factor = aug[i][col];
          for (let j = col; j <= n; j++) {
            aug[i][j] = this.gf.add(aug[i][j], this.gf.mul(factor, aug[row][j]));
          }
        }
      }
      
      row++;
    }
    
    // Extract solution
    const solution = new Array(n).fill(0);
    for (let i = 0; i < Math.min(n, m); i++) {
      solution[i] = aug[i][n];
    }
    
    return solution;
  }

  // Chien Search untuk finding error positions
  private chienSearch(sigma: Uint8Array): Uint8Array {
    const errors: number[] = [];

    // Evaluate σ(α^(-pos)) for each position pos = 0 to 254
    // Error locator has roots at α^(-pos) when error occurs at position pos
    for (let pos = 0; pos < this.n; pos++) {
      // α^(-pos) = α^(255-pos) since α^255 = 1
      const alpha_neg_pos = this.gf.exp[(255 - pos) % 255];

      let val = sigma[0];
      for (let j = 1; j < sigma.length; j++) {
        val = this.gf.add(val, this.gf.mul(sigma[j], this.gf.pow(alpha_neg_pos, j)));
      }

      if (val === 0) {
        errors.push(pos);
      }
    }

    console.log("DEBUG Chien - Found positions:", errors.slice(0, 10).map(p => p.toString()).join(","));
    return new Uint8Array(errors);
  }

  // Direct error value computation using system of linear equations
  // For errors at positions p_j with values e_j:
  // S_i = Σ e_j * α^(p_j * i) for each syndrome S_i
  // This creates a system of linear equations we can solve
  private forneyAlgorithm(
    syndromes: Uint8Array,
    sigma: Uint8Array,
    errorPositions: Uint8Array
  ): Uint8Array {
    const k = errorPositions.length;
    if (k === 0) {
      return new Uint8Array(0);
    }

    // Build system of equations: A * e = S
    // where A[i][j] = α^(p_j * (i+1))  [using 1-indexed syndromes]
    // and b[i] = S_{i+1}
    const A: number[][] = [];
    const b: number[] = [];

    // Use first k syndromes (should be sufficient)
    for (let i = 0; i < Math.min(k, syndromes.length); i++) {
      A[i] = [];
      for (let j = 0; j < k; j++) {
        const pos = errorPositions[j];
        // Power: position * syndrome_index, where syndrome is 1-indexed
        const power = (pos * (i + 1)) % 255;
        A[i][j] = this.gf.exp[power];
      }
      b[i] = syndromes[i];
    }

    // Solve using Gaussian elimination in GF(256)
    const errorValues = this.gaussianElimination(A, b);

    if (errorValues === null) {
      throw new Error("Unable to solve for error values");
    }

    const result = new Uint8Array(errorValues.slice(0, k));
    console.log("DEBUG DirectError - Computed values:", Array.from(result).map(v => v.toString()).join(","));
    return result;
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
    console.log("DEBUG Decode - Before corrections, corrected[200]:", corrected[200]);
    for (let i = 0; i < errorPositions.length; i++) {
      corrected[errorPositions[i]] = this.gf.add(corrected[errorPositions[i]], errorValues[i]);
    }
    console.log("DEBUG Decode - After corrections, corrected[200]:", corrected[200]);
    console.log("DEBUG Decode - Message starts at index:", this.n - this.k);
    
    // Extract message from systemic codeword: [parity || msg]
    const message = corrected.slice(this.n - this.k);
    console.log("DEBUG Decode - Extracted message (first 5):", Array.from(message).slice(0, 5).map(v => v.toString()).join(","));
    return message;
  }
}

export { ReedSolomon };
