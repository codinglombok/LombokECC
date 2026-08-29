"""
LombokECC — Reed-Solomon RS(255,239) atas GF(256).

Port dari @codinglombok/lombok-ecc 0.1.0 (commit 313f827).
Paritas byte-per-byte diuji terhadap vectors/lombok-ecc-vectors-v1.json.

Algoritma: Peterson-Gorenstein-Zierler + eliminasi Gauss GF(256) + direct
error-value solver. Nama _berlekamp_massey / _forney_algorithm dipertahankan
dari acuan supaya diff antar implementasi mudah dibaca — isinya PGZ, BUKAN BMA.

KONTRAK API:
  - encode() mem-pad message pendek dengan nol di KIRI (right-aligned)
  - codeword sistematik: byte 0..15 paritas, byte 16..254 message
  - decode() SELALU mengembalikan k byte dan TIDAK membawa panjang message asli
"""

from __future__ import annotations

PRIMITIVE_POLY = 0x11D


class DecodeError(Exception):
    """Gagal mengoreksi. Ini yang benar untuk error di atas t — jangan ditelan."""


class GF256:
    """Aritmetika GF(256), polinomial primitif 0x11d.

    exp panjangnya 512, bukan 255: 255 entri pertama α^0..α^254, sisanya
    duplikat untuk menghindari modulo di jalur panas. Struktur ini bagian dari
    vector, jadi port yang memakai 255 akan ketahuan.
    """

    __slots__ = ("exp", "log")

    def __init__(self) -> None:
        self.exp = bytearray(512)
        self.log = [0] * 256

        poly = 1
        for i in range(255):
            self.exp[i] = poly
            self.log[poly] = i
            poly *= 2
            if poly > 0xFF:
                poly ^= PRIMITIVE_POLY
        for i in range(255):
            self.exp[255 + i] = self.exp[i]
        self.log[0] = 0  # log(0) tidak terdefinisi

    def add(self, a: int, b: int) -> int:
        return a ^ b

    def mul(self, a: int, b: int) -> int:
        if a == 0 or b == 0:
            return 0
        return self.exp[(self.log[a] + self.log[b]) % 255]

    def div(self, a: int, b: int) -> int:
        if b == 0:
            raise ZeroDivisionError("Division by zero")
        if a == 0:
            return 0
        return self.exp[(self.log[a] - self.log[b] + 255) % 255]

    def inv(self, a: int) -> int:
        if a == 0:
            raise ValueError("Cannot invert zero")
        return self.exp[(255 - self.log[a]) % 255]

    def pow(self, a: int, n: int) -> int:
        if a == 0:
            return 0
        return self.exp[(self.log[a] * n) % 255]


class ReedSolomon:
    __slots__ = ("gf", "n", "k", "t", "g")

    def __init__(self, n: int = 255, k: int = 239) -> None:
        if (n - k) % 2 != 0:
            raise ValueError("n - k must be even (for t = (n - k) / 2)")
        self.gf = GF256()
        self.n = n
        self.k = k
        self.t = (n - k) // 2
        self.g = self._compute_generator_polynomial()

    def _compute_generator_polynomial(self) -> bytearray:
        deg = self.n - self.k
        poly = bytearray([1])
        for i in range(1, deg + 1):
            alpha_i = self.gf.exp[i]
            new_poly = bytearray(len(poly) + 1)
            for j, coef in enumerate(poly):
                new_poly[j] ^= self.gf.mul(coef, alpha_i)
                new_poly[j + 1] ^= coef
            poly = new_poly
        return poly

    def encode(self, message: bytes | bytearray) -> bytearray:
        if len(message) > self.k:
            raise ValueError(f"Message too long: {len(message)} > {self.k}")

        # Pad ke k byte, RIGHT-aligned
        msg = bytearray(self.k)
        msg[self.k - len(message):] = message

        n_minus_k = self.n - self.k
        msg_shifted = bytearray(self.n)
        msg_shifted[n_minus_k:] = msg

        remainder = self._poly_mod(msg_shifted, self.g)
        if len(remainder) != n_minus_k:
            raise RuntimeError(f"Remainder length mismatch: {len(remainder)} != {n_minus_k}")

        codeword = bytearray(self.n)
        codeword[0:n_minus_k] = remainder
        codeword[n_minus_k:] = msg
        return codeword

    def _poly_mod(self, dividend: bytearray, divisor: bytearray) -> bytearray:
        remainder = bytearray(dividend)
        dl = len(divisor)
        for i in range(len(remainder) - dl, -1, -1):
            if remainder[i + dl - 1] == 0:
                continue
            coeff = remainder[i + dl - 1]
            for j in range(dl):
                remainder[i + j] ^= self.gf.mul(divisor[j], coeff)
        return remainder[0:dl - 1]

    def compute_syndromes(self, received: bytes | bytearray) -> bytearray:
        count = self.n - self.k
        syndromes = bytearray(count)
        for i in range(count):
            syndrome = 0
            alpha_i = self.gf.exp[(i + 1) % 255]
            for j, byte in enumerate(received):
                syndrome ^= self.gf.mul(byte, self.gf.pow(alpha_i, j))
            syndromes[i] = syndrome
        return syndromes

    def is_valid(self, codeword: bytes | bytearray) -> bool:
        return all(s == 0 for s in self.compute_syndromes(codeword))

    def _berlekamp_massey(self, syndromes: bytearray) -> bytearray:
        """Peterson-Gorenstein-Zierler. Nama dipertahankan dari acuan."""
        n = len(syndromes)
        for degree in range(1, self.t + 1):
            if degree * 2 > n:
                break
            equations = min(degree, n - degree)
            if equations < degree:
                continue

            A: list[list[int]] = []
            B: list[int] = []
            for row in range(equations):
                eq_index = row + degree
                A.append([
                    syndromes[eq_index - col - 1] if 0 <= eq_index - col - 1 < n else 0
                    for col in range(degree)
                ])
                B.append(syndromes[eq_index])

            solution = self._gaussian_elimination(A, B)
            if solution is None:
                continue

            valid = True
            for j in range(degree, n):
                total = syndromes[j]
                for i in range(degree):
                    if j - i - 1 >= 0:
                        total ^= self.gf.mul(solution[i], syndromes[j - i - 1])
                if total != 0:
                    valid = False
                    break

            if valid:
                sigma = bytearray(degree + 1)
                sigma[0] = 1
                for i in range(degree):
                    sigma[i + 1] = solution[i]
                return sigma

        return bytearray([1])

    def _gaussian_elimination(self, A: list[list[int]], b: list[int]) -> list[int] | None:
        """Eliminasi Gauss GF(256).

        Dua koreksi dari commit b661b62 acuan yang WAJIB ikut saat porting:
          (a) pivot_col dilacak per baris — kolom bisa di-skip, tanpa ini nilai
              dipetakan ke variabel salah
          (b) return None untuk sistem rank-deficient DAN inkonsisten
        """
        m = len(A)
        if m == 0:
            return None
        n = len(A[0])
        if n == 0:
            return None

        aug = [list(A[i]) + [b[i]] for i in range(m)]
        pivot_col = [-1] * m

        row = 0
        col = 0
        while col < n and row < m:
            pivot = -1
            for i in range(row, m):
                if aug[i][col] != 0:
                    pivot = i
                    break
            if pivot == -1:
                col += 1
                continue

            pivot_col[row] = col
            aug[row], aug[pivot] = aug[pivot], aug[row]

            inv_pivot = self.gf.inv(aug[row][col])
            for j in range(col, n + 1):
                aug[row][j] = self.gf.mul(aug[row][j], inv_pivot)

            for i in range(m):
                if i != row and aug[i][col] != 0:
                    factor = aug[i][col]
                    for j in range(col, n + 1):
                        aug[i][j] ^= self.gf.mul(factor, aug[row][j])

            row += 1
            col += 1

        rank = row
        if rank < n:
            return None
        for i in range(rank, m):
            if aug[i][n] != 0:
                return None

        solution = [0] * n
        for i in range(rank):
            c = pivot_col[i]
            if c >= 0:
                solution[c] = aug[i][n]
        return solution

    def _chien_search(self, sigma: bytearray) -> list[int]:
        errors = []
        for pos in range(self.n):
            alpha_neg_pos = self.gf.exp[(255 - pos) % 255]
            val = sigma[0]
            for j in range(1, len(sigma)):
                val ^= self.gf.mul(sigma[j], self.gf.pow(alpha_neg_pos, j))
            if val == 0:
                errors.append(pos)
        return errors

    def _forney_algorithm(
        self, syndromes: bytearray, sigma: bytearray, error_positions: list[int]
    ) -> list[int]:
        """Direct error-value solver. Menggantikan formula Forney di acuan."""
        k = len(error_positions)
        if k == 0:
            return []

        A: list[list[int]] = []
        b: list[int] = []
        for i in range(min(k, len(syndromes))):
            A.append([self.gf.exp[(error_positions[j] * (i + 1)) % 255] for j in range(k)])
            b.append(syndromes[i])

        error_values = self._gaussian_elimination(A, b)
        if error_values is None:
            raise DecodeError("Unable to solve for error values")
        return error_values[0:k]

    def decode(self, received: bytes | bytearray) -> bytearray:
        if len(received) != self.n:
            raise ValueError(f"Received codeword length mismatch: {len(received)} != {self.n}")

        syndromes = self.compute_syndromes(received)
        if all(s == 0 for s in syndromes):
            return bytearray(received[self.n - self.k:])

        sigma = self._berlekamp_massey(syndromes)
        if len(sigma) - 1 > self.t:
            raise DecodeError("Too many errors detected")

        error_positions = self._chien_search(sigma)
        if len(error_positions) == 0:
            raise DecodeError("Unable to locate errors")

        # Guard defense-in-depth: mutasi yang mematikannya SURVIVE di acuan.
        # Yang load-bearing adalah is_valid(corrected) di bawah.
        if len(error_positions) > self.t:
            raise DecodeError(f"Too many errors detected: {len(error_positions)} > {self.t}")

        error_values = self._forney_algorithm(syndromes, sigma, error_positions)

        corrected = bytearray(received)
        for i, pos in enumerate(error_positions):
            corrected[pos] ^= error_values[i]

        # INI yang load-bearing. Tanpa ini, 60-71% miskoreksi senyap
        # (terukur di acuan Sesi 13). Jangan hapus.
        if not self.is_valid(corrected):
            raise DecodeError("Corrected codeword is not valid - too many errors or decoding failure")

        return corrected[self.n - self.k:]
