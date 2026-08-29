//! LombokECC — Reed-Solomon RS(255,239) atas GF(256).
//!
//! Port dari `@codinglombok/lombok-ecc` 0.1.0 (commit 313f827).
//! Paritas byte-per-byte diuji terhadap `vectors/lombok-ecc-vectors-v1.json`.
//!
//! Algoritma: Peterson-Gorenstein-Zierler + eliminasi Gauss GF(256) + direct
//! error-value solver. Nama `berlekamp_massey`/`forney_algorithm` dipertahankan
//! dari acuan supaya diff antar implementasi mudah dibaca — isinya PGZ, BUKAN BMA.
//!
//! # Kontrak API
//! - [`ReedSolomon::encode`] mem-pad message pendek dengan nol di KIRI (right-aligned)
//! - codeword sistematik: byte 0..15 paritas, byte 16..254 message
//! - [`ReedSolomon::decode`] SELALU mengembalikan `k` byte dan TIDAK membawa
//!   panjang message asli. Pemanggil harus menyimpannya sendiri.

#![forbid(unsafe_code)]

use std::fmt;

/// Polinomial primitif x^8 + x^4 + x^3 + x^2 + 1.
pub const PRIMITIVE_POLY: u32 = 0x11d;

/// Kegagalan koreksi. Untuk error di atas `t`, INI hasil yang benar —
/// jangan diubah jadi sukses.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EccError {
    MessageTooLong { len: usize, k: usize },
    LengthMismatch { len: usize, n: usize },
    TooManyErrors { found: usize, t: usize },
    UnableToLocate,
    UnableToSolve,
    CorrectedInvalid,
    DivisionByZero,
    CannotInvertZero,
    BadParams,
}

impl fmt::Display for EccError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            EccError::MessageTooLong { len, k } => write!(f, "message too long: {len} > {k}"),
            EccError::LengthMismatch { len, n } => {
                write!(f, "received codeword length mismatch: {len} != {n}")
            }
            EccError::TooManyErrors { found, t } => {
                write!(f, "too many errors detected: {found} > {t}")
            }
            EccError::UnableToLocate => write!(f, "unable to locate errors"),
            EccError::UnableToSolve => write!(f, "unable to solve for error values"),
            EccError::CorrectedInvalid => {
                write!(f, "corrected codeword is not valid - too many errors or decoding failure")
            }
            EccError::DivisionByZero => write!(f, "division by zero"),
            EccError::CannotInvertZero => write!(f, "cannot invert zero"),
            EccError::BadParams => write!(f, "n - k must be even (for t = (n - k) / 2)"),
        }
    }
}

impl std::error::Error for EccError {}

/// Tabel aritmetika GF(256).
///
/// `exp` panjangnya 512, bukan 255: 255 entri pertama α^0..α^254, sisanya
/// duplikat untuk menghindari modulo di jalur panas. Struktur ini bagian dari
/// vector, jadi port yang memakai 255 akan ketahuan.
pub struct Gf256 {
    pub exp: [u8; 512],
    pub log: [u16; 256],
}

impl Default for Gf256 {
    fn default() -> Self {
        Self::new()
    }
}

impl Gf256 {
    pub fn new() -> Self {
        let mut exp = [0u8; 512];
        let mut log = [0u16; 256];

        let mut poly: u32 = 1;
        for i in 0..255usize {
            exp[i] = poly as u8;
            log[poly as usize] = i as u16;
            poly *= 2;
            if poly > 0xff {
                poly ^= PRIMITIVE_POLY;
            }
        }
        for i in 0..255usize {
            exp[255 + i] = exp[i];
        }
        log[0] = 0; // log(0) tidak terdefinisi

        Self { exp, log }
    }

    #[inline]
    pub fn add(&self, a: u8, b: u8) -> u8 {
        a ^ b
    }

    #[inline]
    pub fn mul(&self, a: u8, b: u8) -> u8 {
        if a == 0 || b == 0 {
            return 0;
        }
        self.exp[(self.log[a as usize] as usize + self.log[b as usize] as usize) % 255]
    }

    pub fn div(&self, a: u8, b: u8) -> Result<u8, EccError> {
        if b == 0 {
            return Err(EccError::DivisionByZero);
        }
        if a == 0 {
            return Ok(0);
        }
        let d = self.log[a as usize] as i32 - self.log[b as usize] as i32 + 255;
        Ok(self.exp[(d % 255) as usize])
    }

    pub fn inv(&self, a: u8) -> Result<u8, EccError> {
        if a == 0 {
            return Err(EccError::CannotInvertZero);
        }
        Ok(self.exp[(255 - self.log[a as usize] as usize) % 255])
    }

    #[inline]
    pub fn pow(&self, a: u8, n: usize) -> u8 {
        if a == 0 {
            return 0;
        }
        self.exp[(self.log[a as usize] as usize * n) % 255]
    }
}

/// Encoder/decoder Reed-Solomon RS(n, k).
pub struct ReedSolomon {
    pub gf: Gf256,
    pub n: usize,
    pub k: usize,
    pub t: usize,
    pub g: Vec<u8>,
}

impl ReedSolomon {
    /// Default proyek ini: `ReedSolomon::new(255, 239)`.
    pub fn new(n: usize, k: usize) -> Result<Self, EccError> {
        if (n - k) % 2 != 0 {
            return Err(EccError::BadParams);
        }
        let gf = Gf256::new();
        let t = (n - k) / 2;
        let mut rs = Self { gf, n, k, t, g: Vec::new() };
        rs.g = rs.compute_generator_polynomial();
        Ok(rs)
    }

    fn compute_generator_polynomial(&self) -> Vec<u8> {
        let deg = self.n - self.k;
        let mut poly = vec![1u8];
        for i in 1..=deg {
            let alpha_i = self.gf.exp[i];
            let mut new_poly = vec![0u8; poly.len() + 1];
            for (j, &coef) in poly.iter().enumerate() {
                new_poly[j] ^= self.gf.mul(coef, alpha_i);
                new_poly[j + 1] ^= coef;
            }
            poly = new_poly;
        }
        poly
    }

    /// Menghasilkan codeword sepanjang `n`. Message lebih pendek dari `k`
    /// di-pad dengan nol di KIRI.
    pub fn encode(&self, message: &[u8]) -> Result<Vec<u8>, EccError> {
        if message.len() > self.k {
            return Err(EccError::MessageTooLong { len: message.len(), k: self.k });
        }

        let mut msg = vec![0u8; self.k];
        msg[self.k - message.len()..].copy_from_slice(message);

        let n_minus_k = self.n - self.k;
        let mut msg_shifted = vec![0u8; self.n];
        msg_shifted[n_minus_k..].copy_from_slice(&msg);

        let remainder = self.poly_mod(&msg_shifted, &self.g);
        debug_assert_eq!(remainder.len(), n_minus_k);

        let mut codeword = vec![0u8; self.n];
        codeword[..n_minus_k].copy_from_slice(&remainder);
        codeword[n_minus_k..].copy_from_slice(&msg);
        Ok(codeword)
    }

    fn poly_mod(&self, dividend: &[u8], divisor: &[u8]) -> Vec<u8> {
        let mut remainder = dividend.to_vec();
        let dl = divisor.len();

        let mut i = remainder.len() as isize - dl as isize;
        while i >= 0 {
            let idx = i as usize;
            if remainder[idx + dl - 1] != 0 {
                let coeff = remainder[idx + dl - 1];
                for j in 0..dl {
                    remainder[idx + j] ^= self.gf.mul(divisor[j], coeff);
                }
            }
            i -= 1;
        }
        remainder[..dl - 1].to_vec()
    }

    /// Mengembalikan S_1..S_2t di indeks 0..2t-1.
    pub fn compute_syndromes(&self, received: &[u8]) -> Vec<u8> {
        let count = self.n - self.k;
        let mut syndromes = vec![0u8; count];
        for i in 0..count {
            let mut syndrome = 0u8;
            let alpha_i = self.gf.exp[(i + 1) % 255];
            for (j, &b) in received.iter().enumerate() {
                syndrome ^= self.gf.mul(b, self.gf.pow(alpha_i, j));
            }
            syndromes[i] = syndrome;
        }
        syndromes
    }

    pub fn is_valid(&self, codeword: &[u8]) -> bool {
        self.compute_syndromes(codeword).iter().all(|&s| s == 0)
    }

    /// Peterson-Gorenstein-Zierler. Nama dipertahankan dari acuan.
    fn berlekamp_massey(&self, syndromes: &[u8]) -> Vec<u8> {
        let n = syndromes.len();
        for degree in 1..=self.t {
            if degree * 2 > n {
                break;
            }
            let equations = degree.min(n - degree);
            if equations < degree {
                continue;
            }

            let mut a = vec![vec![0u8; degree]; equations];
            let mut b = vec![0u8; equations];
            for row in 0..equations {
                let eq_index = row + degree;
                for col in 0..degree {
                    let si = eq_index as isize - col as isize - 1;
                    if si >= 0 && (si as usize) < n {
                        a[row][col] = syndromes[si as usize];
                    }
                }
                b[row] = syndromes[eq_index];
            }

            let Some(solution) = self.gaussian_elimination(&a, &b) else {
                continue;
            };

            let mut valid = true;
            for j in degree..n {
                let mut sum = syndromes[j];
                for i in 0..degree {
                    if j as isize - i as isize - 1 >= 0 {
                        sum ^= self.gf.mul(solution[i], syndromes[j - i - 1]);
                    }
                }
                if sum != 0 {
                    valid = false;
                    break;
                }
            }

            if valid {
                let mut sigma = vec![0u8; degree + 1];
                sigma[0] = 1;
                sigma[1..].copy_from_slice(&solution[..degree]);
                return sigma;
            }
        }
        vec![1]
    }

    /// Eliminasi Gauss di GF(256), `None` kalau tidak ada solusi unik.
    ///
    /// Dua koreksi dari commit b661b62 acuan yang WAJIB ikut saat porting:
    /// (a) `pivot_col` dilacak per baris — kolom bisa di-skip, tanpa ini nilai
    /// dipetakan ke variabel yang salah; (b) `None` untuk sistem rank-deficient
    /// DAN inkonsisten.
    fn gaussian_elimination(&self, a: &[Vec<u8>], b: &[u8]) -> Option<Vec<u8>> {
        let m = a.len();
        if m == 0 {
            return None;
        }
        let n = a[0].len();
        if n == 0 {
            return None;
        }

        let mut aug: Vec<Vec<u8>> = (0..m)
            .map(|i| {
                let mut row = a[i].clone();
                row.push(b[i]);
                row
            })
            .collect();

        let mut pivot_col = vec![usize::MAX; m];

        let mut row = 0usize;
        for col in 0..n {
            if row >= m {
                break;
            }
            let mut pivot = None;
            for i in row..m {
                if aug[i][col] != 0 {
                    pivot = Some(i);
                    break;
                }
            }
            let Some(pivot) = pivot else { continue };

            pivot_col[row] = col;
            aug.swap(row, pivot);

            let inv_pivot = self.gf.inv(aug[row][col]).ok()?;
            for j in col..=n {
                aug[row][j] = self.gf.mul(aug[row][j], inv_pivot);
            }

            for i in 0..m {
                if i != row && aug[i][col] != 0 {
                    let factor = aug[i][col];
                    for j in col..=n {
                        let v = self.gf.mul(factor, aug[row][j]);
                        aug[i][j] ^= v;
                    }
                }
            }
            row += 1;
        }

        let rank = row;
        if rank < n {
            return None;
        }
        for i in rank..m {
            if aug[i][n] != 0 {
                return None;
            }
        }

        let mut solution = vec![0u8; n];
        for i in 0..rank {
            let c = pivot_col[i];
            if c != usize::MAX {
                solution[c] = aug[i][n];
            }
        }
        Some(solution)
    }

    fn chien_search(&self, sigma: &[u8]) -> Vec<usize> {
        let mut errors = Vec::new();
        for pos in 0..self.n {
            let alpha_neg_pos = self.gf.exp[(255 - pos) % 255];
            let mut val = sigma[0];
            for j in 1..sigma.len() {
                val ^= self.gf.mul(sigma[j], self.gf.pow(alpha_neg_pos, j));
            }
            if val == 0 {
                errors.push(pos);
            }
        }
        errors
    }

    /// Direct error-value solver. Menggantikan formula Forney di acuan.
    fn forney_algorithm(&self, syndromes: &[u8], error_positions: &[usize]) -> Result<Vec<u8>, EccError> {
        let k = error_positions.len();
        if k == 0 {
            return Ok(Vec::new());
        }

        let limit = k.min(syndromes.len());
        let mut a = vec![vec![0u8; k]; limit];
        let mut b = vec![0u8; limit];
        for i in 0..limit {
            for j in 0..k {
                a[i][j] = self.gf.exp[(error_positions[j] * (i + 1)) % 255];
            }
            b[i] = syndromes[i];
        }

        let values = self.gaussian_elimination(&a, &b).ok_or(EccError::UnableToSolve)?;
        Ok(values[..k].to_vec())
    }

    /// Mengoreksi hingga `t` byte error dan mengembalikan `k` byte message.
    /// Panjang message asli TIDAK dibawa.
    pub fn decode(&self, received: &[u8]) -> Result<Vec<u8>, EccError> {
        if received.len() != self.n {
            return Err(EccError::LengthMismatch { len: received.len(), n: self.n });
        }

        let syndromes = self.compute_syndromes(received);
        if syndromes.iter().all(|&s| s == 0) {
            return Ok(received[self.n - self.k..].to_vec());
        }

        let sigma = self.berlekamp_massey(&syndromes);
        if sigma.len() - 1 > self.t {
            return Err(EccError::TooManyErrors { found: sigma.len() - 1, t: self.t });
        }

        let error_positions = self.chien_search(&sigma);
        if error_positions.is_empty() {
            return Err(EccError::UnableToLocate);
        }

        // Guard defense-in-depth: mutasi yang mematikannya SURVIVE di acuan.
        // Yang load-bearing adalah is_valid(corrected) di bawah.
        if error_positions.len() > self.t {
            return Err(EccError::TooManyErrors { found: error_positions.len(), t: self.t });
        }

        let error_values = self.forney_algorithm(&syndromes, &error_positions)?;

        let mut corrected = received.to_vec();
        for (i, &pos) in error_positions.iter().enumerate() {
            corrected[pos] ^= error_values[i];
        }

        // INI yang load-bearing. Tanpa ini, 60-71% miskoreksi senyap
        // (terukur di acuan Sesi 13). Jangan hapus.
        if !self.is_valid(&corrected) {
            return Err(EccError::CorrectedInvalid);
        }

        Ok(corrected[self.n - self.k..].to_vec())
    }
}
