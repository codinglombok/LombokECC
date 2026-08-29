// LombokECC — Reed-Solomon RS(255,239) atas GF(256). Header-only, C++17.
//
// Port dari @codinglombok/lombok-ecc 0.1.0 (commit 313f827).
// Paritas byte-per-byte diuji terhadap vectors/lombok-ecc-vectors-v1.json.
//
// Algoritma: Peterson-Gorenstein-Zierler + eliminasi Gauss GF(256) + direct
// error-value solver. Nama berlekampMassey/forneyAlgorithm dipertahankan dari
// acuan supaya diff antar implementasi mudah dibaca — isinya PGZ, BUKAN BMA.
//
// KONTRAK API:
//   - encode() mem-pad message pendek dengan nol di KIRI (right-aligned)
//   - codeword sistematik: byte 0..15 paritas, byte 16..254 message
//   - decode() SELALU mengembalikan k byte dan TIDAK membawa panjang message
//     asli. Pemanggil harus menyimpannya sendiri.
//
// Kegagalan koreksi dilaporkan lewat exception DecodeError. Untuk error di atas
// t, exception itulah hasil yang benar — jangan ditelan.

#ifndef LOMBOK_ECC_HPP
#define LOMBOK_ECC_HPP

#include <array>
#include <cstddef>
#include <cstdint>
#include <stdexcept>
#include <string>
#include <vector>

namespace lombokecc {

inline constexpr std::uint32_t kPrimitivePoly = 0x11d;

class DecodeError : public std::runtime_error {
 public:
  explicit DecodeError(const std::string& what) : std::runtime_error(what) {}
};

// Aritmetika GF(256).
//
// exp panjangnya 512, bukan 255: 255 entri pertama a^0..a^254, sisanya duplikat
// untuk menghindari modulo di jalur panas. Struktur ini bagian dari vector.
class GF256 {
 public:
  std::array<std::uint8_t, 512> exp{};
  std::array<std::uint16_t, 256> log{};

  GF256() {
    std::uint32_t poly = 1;
    for (std::size_t i = 0; i < 255; ++i) {
      exp[i] = static_cast<std::uint8_t>(poly);
      log[poly] = static_cast<std::uint16_t>(i);
      poly *= 2;
      if (poly > 0xff) poly ^= kPrimitivePoly;
    }
    for (std::size_t i = 0; i < 255; ++i) exp[255 + i] = exp[i];
    log[0] = 0;  // log(0) tidak terdefinisi
  }

  static std::uint8_t add(std::uint8_t a, std::uint8_t b) { return a ^ b; }

  std::uint8_t mul(std::uint8_t a, std::uint8_t b) const {
    if (a == 0 || b == 0) return 0;
    return exp[(static_cast<std::size_t>(log[a]) + log[b]) % 255];
  }

  std::uint8_t div(std::uint8_t a, std::uint8_t b) const {
    if (b == 0) throw std::domain_error("division by zero");
    if (a == 0) return 0;
    int d = static_cast<int>(log[a]) - static_cast<int>(log[b]) + 255;
    return exp[static_cast<std::size_t>(d % 255)];
  }

  std::uint8_t inv(std::uint8_t a) const {
    if (a == 0) throw std::domain_error("cannot invert zero");
    return exp[(255 - static_cast<std::size_t>(log[a])) % 255];
  }

  std::uint8_t pow(std::uint8_t a, std::size_t n) const {
    if (a == 0) return 0;
    return exp[(static_cast<std::size_t>(log[a]) * n) % 255];
  }
};

class ReedSolomon {
 public:
  GF256 gf;
  std::size_t n, k, t;
  std::vector<std::uint8_t> g;

  explicit ReedSolomon(std::size_t n_ = 255, std::size_t k_ = 239) : n(n_), k(k_) {
    if ((n - k) % 2 != 0) {
      throw std::invalid_argument("n - k must be even (for t = (n - k) / 2)");
    }
    t = (n - k) / 2;
    g = computeGeneratorPolynomial();
  }

  std::vector<std::uint8_t> encode(const std::vector<std::uint8_t>& message) const {
    if (message.size() > k) {
      throw std::length_error("message too long: " + std::to_string(message.size()) +
                              " > " + std::to_string(k));
    }

    // Pad ke k byte, RIGHT-aligned
    std::vector<std::uint8_t> msg(k, 0);
    for (std::size_t i = 0; i < message.size(); ++i) {
      msg[k - message.size() + i] = message[i];
    }

    const std::size_t nMinusK = n - k;
    std::vector<std::uint8_t> msgShifted(n, 0);
    for (std::size_t i = 0; i < k; ++i) msgShifted[nMinusK + i] = msg[i];

    std::vector<std::uint8_t> remainder = polyMod(msgShifted, g);
    if (remainder.size() != nMinusK) {
      throw std::runtime_error("remainder length mismatch");
    }

    std::vector<std::uint8_t> codeword(n, 0);
    for (std::size_t i = 0; i < nMinusK; ++i) codeword[i] = remainder[i];
    for (std::size_t i = 0; i < k; ++i) codeword[nMinusK + i] = msg[i];
    return codeword;
  }

  std::vector<std::uint8_t> computeSyndromes(const std::vector<std::uint8_t>& received) const {
    const std::size_t count = n - k;
    std::vector<std::uint8_t> syndromes(count, 0);
    for (std::size_t i = 0; i < count; ++i) {
      std::uint8_t syndrome = 0;
      const std::uint8_t alphaI = gf.exp[(i + 1) % 255];
      for (std::size_t j = 0; j < received.size(); ++j) {
        syndrome ^= gf.mul(received[j], gf.pow(alphaI, j));
      }
      syndromes[i] = syndrome;
    }
    return syndromes;
  }

  bool isValid(const std::vector<std::uint8_t>& codeword) const {
    for (std::uint8_t s : computeSyndromes(codeword)) {
      if (s != 0) return false;
    }
    return true;
  }

  std::vector<std::uint8_t> decode(const std::vector<std::uint8_t>& received) const {
    if (received.size() != n) {
      throw std::length_error("received codeword length mismatch");
    }

    std::vector<std::uint8_t> syndromes = computeSyndromes(received);
    bool allZero = true;
    for (std::uint8_t s : syndromes) {
      if (s != 0) { allZero = false; break; }
    }
    if (allZero) {
      return std::vector<std::uint8_t>(received.begin() + static_cast<long>(n - k), received.end());
    }

    std::vector<std::uint8_t> sigma = berlekampMassey(syndromes);
    if (sigma.size() - 1 > t) throw DecodeError("too many errors detected");

    std::vector<std::size_t> errorPositions = chienSearch(sigma);
    if (errorPositions.empty()) throw DecodeError("unable to locate errors");

    // Guard defense-in-depth: mutasi yang mematikannya SURVIVE di acuan.
    // Yang load-bearing adalah isValid(corrected) di bawah.
    if (errorPositions.size() > t) {
      throw DecodeError("too many errors detected: " + std::to_string(errorPositions.size()) +
                        " > " + std::to_string(t));
    }

    std::vector<std::uint8_t> errorValues = forneyAlgorithm(syndromes, errorPositions);

    std::vector<std::uint8_t> corrected = received;
    for (std::size_t i = 0; i < errorPositions.size(); ++i) {
      corrected[errorPositions[i]] ^= errorValues[i];
    }

    // INI yang load-bearing. Tanpa ini, 60-71% miskoreksi senyap (terukur di
    // acuan Sesi 13). Jangan hapus.
    if (!isValid(corrected)) {
      throw DecodeError("corrected codeword is not valid - too many errors or decoding failure");
    }

    return std::vector<std::uint8_t>(corrected.begin() + static_cast<long>(n - k), corrected.end());
  }

 private:
  std::vector<std::uint8_t> computeGeneratorPolynomial() const {
    const std::size_t deg = n - k;
    std::vector<std::uint8_t> poly{1};
    for (std::size_t i = 1; i <= deg; ++i) {
      const std::uint8_t alphaI = gf.exp[i];
      std::vector<std::uint8_t> newPoly(poly.size() + 1, 0);
      for (std::size_t j = 0; j < poly.size(); ++j) {
        newPoly[j] ^= gf.mul(poly[j], alphaI);
        newPoly[j + 1] ^= poly[j];
      }
      poly = newPoly;
    }
    return poly;
  }

  std::vector<std::uint8_t> polyMod(const std::vector<std::uint8_t>& dividend,
                                    const std::vector<std::uint8_t>& divisor) const {
    std::vector<std::uint8_t> remainder = dividend;
    const std::size_t dl = divisor.size();
    for (long i = static_cast<long>(remainder.size() - dl); i >= 0; --i) {
      const std::size_t idx = static_cast<std::size_t>(i);
      if (remainder[idx + dl - 1] == 0) continue;
      const std::uint8_t coeff = remainder[idx + dl - 1];
      for (std::size_t j = 0; j < dl; ++j) {
        remainder[idx + j] ^= gf.mul(divisor[j], coeff);
      }
    }
    return std::vector<std::uint8_t>(remainder.begin(), remainder.begin() + static_cast<long>(dl - 1));
  }

  // Peterson-Gorenstein-Zierler. Nama dipertahankan dari acuan.
  std::vector<std::uint8_t> berlekampMassey(const std::vector<std::uint8_t>& syndromes) const {
    const std::size_t sn = syndromes.size();
    for (std::size_t degree = 1; degree <= t; ++degree) {
      if (degree * 2 > sn) break;
      const std::size_t equations = (degree < sn - degree) ? degree : sn - degree;
      if (equations < degree) continue;

      std::vector<std::vector<std::uint8_t>> A(equations, std::vector<std::uint8_t>(degree, 0));
      std::vector<std::uint8_t> B(equations, 0);
      for (std::size_t row = 0; row < equations; ++row) {
        const std::size_t eqIndex = row + degree;
        for (std::size_t col = 0; col < degree; ++col) {
          const long si = static_cast<long>(eqIndex) - static_cast<long>(col) - 1;
          A[row][col] = (si >= 0 && static_cast<std::size_t>(si) < sn)
                            ? syndromes[static_cast<std::size_t>(si)]
                            : 0;
        }
        B[row] = syndromes[eqIndex];
      }

      std::vector<std::uint8_t> solution;
      if (!gaussianElimination(A, B, solution)) continue;

      bool valid = true;
      for (std::size_t j = degree; j < sn; ++j) {
        std::uint8_t sum = syndromes[j];
        for (std::size_t i = 0; i < degree; ++i) {
          if (static_cast<long>(j) - static_cast<long>(i) - 1 >= 0) {
            sum ^= gf.mul(solution[i], syndromes[j - i - 1]);
          }
        }
        if (sum != 0) { valid = false; break; }
      }

      if (valid) {
        std::vector<std::uint8_t> sigma(degree + 1, 0);
        sigma[0] = 1;
        for (std::size_t i = 0; i < degree; ++i) sigma[i + 1] = solution[i];
        return sigma;
      }
    }
    return std::vector<std::uint8_t>{1};
  }

  // Eliminasi Gauss GF(256). false kalau tidak ada solusi unik.
  //
  // Dua koreksi dari commit b661b62 acuan yang WAJIB ikut saat porting:
  //   (a) pivotCol dilacak per baris — kolom bisa di-skip, tanpa ini nilai
  //       dipetakan ke variabel yang salah
  //   (b) false untuk sistem rank-deficient DAN inkonsisten
  bool gaussianElimination(const std::vector<std::vector<std::uint8_t>>& A,
                           const std::vector<std::uint8_t>& b,
                           std::vector<std::uint8_t>& out) const {
    const std::size_t m = A.size();
    if (m == 0) return false;
    const std::size_t nn = A[0].size();
    if (nn == 0) return false;

    std::vector<std::vector<std::uint8_t>> aug(m);
    for (std::size_t i = 0; i < m; ++i) {
      aug[i] = A[i];
      aug[i].push_back(b[i]);
    }

    constexpr std::size_t kNoPivot = static_cast<std::size_t>(-1);
    std::vector<std::size_t> pivotCol(m, kNoPivot);

    std::size_t row = 0;
    for (std::size_t col = 0; col < nn && row < m; ++col) {
      std::size_t pivot = kNoPivot;
      for (std::size_t i = row; i < m; ++i) {
        if (aug[i][col] != 0) { pivot = i; break; }
      }
      if (pivot == kNoPivot) continue;

      pivotCol[row] = col;
      std::swap(aug[row], aug[pivot]);

      const std::uint8_t invPivot = gf.inv(aug[row][col]);
      for (std::size_t j = col; j <= nn; ++j) {
        aug[row][j] = gf.mul(aug[row][j], invPivot);
      }

      for (std::size_t i = 0; i < m; ++i) {
        if (i != row && aug[i][col] != 0) {
          const std::uint8_t factor = aug[i][col];
          for (std::size_t j = col; j <= nn; ++j) {
            aug[i][j] ^= gf.mul(factor, aug[row][j]);
          }
        }
      }
      ++row;
    }

    const std::size_t rank = row;
    if (rank < nn) return false;
    for (std::size_t i = rank; i < m; ++i) {
      if (aug[i][nn] != 0) return false;
    }

    out.assign(nn, 0);
    for (std::size_t i = 0; i < rank; ++i) {
      if (pivotCol[i] != kNoPivot) out[pivotCol[i]] = aug[i][nn];
    }
    return true;
  }

  std::vector<std::size_t> chienSearch(const std::vector<std::uint8_t>& sigma) const {
    std::vector<std::size_t> errors;
    for (std::size_t pos = 0; pos < n; ++pos) {
      const std::uint8_t alphaNegPos = gf.exp[(255 - pos) % 255];
      std::uint8_t val = sigma[0];
      for (std::size_t j = 1; j < sigma.size(); ++j) {
        val ^= gf.mul(sigma[j], gf.pow(alphaNegPos, j));
      }
      if (val == 0) errors.push_back(pos);
    }
    return errors;
  }

  // Direct error-value solver. Menggantikan formula Forney di acuan.
  std::vector<std::uint8_t> forneyAlgorithm(const std::vector<std::uint8_t>& syndromes,
                                            const std::vector<std::size_t>& errorPositions) const {
    const std::size_t kk = errorPositions.size();
    if (kk == 0) return {};

    const std::size_t limit = (kk < syndromes.size()) ? kk : syndromes.size();
    std::vector<std::vector<std::uint8_t>> A(limit, std::vector<std::uint8_t>(kk, 0));
    std::vector<std::uint8_t> b(limit, 0);
    for (std::size_t i = 0; i < limit; ++i) {
      for (std::size_t j = 0; j < kk; ++j) {
        A[i][j] = gf.exp[(errorPositions[j] * (i + 1)) % 255];
      }
      b[i] = syndromes[i];
    }

    std::vector<std::uint8_t> values;
    if (!gaussianElimination(A, b, values)) {
      throw DecodeError("unable to solve for error values");
    }
    values.resize(kk);
    return values;
  }
};

}  // namespace lombokecc

#endif  // LOMBOK_ECC_HPP
