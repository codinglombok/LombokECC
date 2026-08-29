// Package lombokecc mengimplementasikan Reed-Solomon RS(255,239) atas GF(256).
//
// Port dari @codinglombok/lombok-ecc 0.1.0 (commit 313f827).
// Paritas byte-per-byte diuji terhadap vectors/lombok-ecc-vectors-v1.json.
//
// Algoritma: Peterson-Gorenstein-Zierler + eliminasi Gauss GF(256) + direct
// error-value solver. Nama berlekampMassey/forneyAlgorithm dipertahankan dari
// acuan supaya diff antar implementasi mudah dibaca — isinya PGZ, BUKAN BMA.
//
// KONTRAK API:
//   - Encode mem-pad message pendek dengan nol di KIRI (right-aligned)
//   - codeword sistematik: byte 0..15 paritas, byte 16..254 message
//   - Decode SELALU mengembalikan k byte dan TIDAK membawa panjang message asli
package lombokecc

import (
	"errors"
	"fmt"
)

// PrimitivePoly adalah x^8 + x^4 + x^3 + x^2 + 1.
const PrimitivePoly = 0x11d

// ErrDecode menandai kegagalan koreksi. Untuk error di atas t, INI hasil yang
// benar — jangan ditelan jadi sukses.
var ErrDecode = errors.New("lombokecc: decode failed")

// GF256 memegang tabel aritmetika GF(256).
//
// Exp panjangnya 512, bukan 255: 255 entri pertama α^0..α^254, sisanya duplikat
// untuk menghindari modulo di jalur panas. Struktur ini bagian dari vector.
type GF256 struct {
	Exp [512]byte
	Log [256]uint16
}

// NewGF256 membangun tabel exp/log.
func NewGF256() *GF256 {
	g := &GF256{}
	poly := 1
	for i := 0; i < 255; i++ {
		g.Exp[i] = byte(poly)
		g.Log[poly] = uint16(i)
		poly *= 2
		if poly > 0xff {
			poly ^= PrimitivePoly
		}
	}
	for i := 0; i < 255; i++ {
		g.Exp[255+i] = g.Exp[i]
	}
	g.Log[0] = 0 // log(0) tidak terdefinisi
	return g
}

func (g *GF256) Add(a, b byte) byte { return a ^ b }

func (g *GF256) Mul(a, b byte) byte {
	if a == 0 || b == 0 {
		return 0
	}
	return g.Exp[(int(g.Log[a])+int(g.Log[b]))%255]
}

func (g *GF256) Div(a, b byte) (byte, error) {
	if b == 0 {
		return 0, errors.New("lombokecc: division by zero")
	}
	if a == 0 {
		return 0, nil
	}
	return g.Exp[(int(g.Log[a])-int(g.Log[b])+255)%255], nil
}

func (g *GF256) Inv(a byte) (byte, error) {
	if a == 0 {
		return 0, errors.New("lombokecc: cannot invert zero")
	}
	return g.Exp[(255-int(g.Log[a]))%255], nil
}

func (g *GF256) Pow(a byte, n int) byte {
	if a == 0 {
		return 0
	}
	return g.Exp[(int(g.Log[a])*n)%255]
}

// ReedSolomon adalah encoder/decoder RS(n,k).
type ReedSolomon struct {
	GF *GF256
	N  int
	K  int
	T  int
	G  []byte // koefisien polinomial generator
}

// New membangun RS(n,k). Untuk default gunakan New(255, 239).
func New(n, k int) (*ReedSolomon, error) {
	if (n-k)%2 != 0 {
		return nil, errors.New("lombokecc: n - k must be even (for t = (n - k) / 2)")
	}
	rs := &ReedSolomon{GF: NewGF256(), N: n, K: k, T: (n - k) / 2}
	rs.G = rs.computeGeneratorPolynomial()
	return rs, nil
}

func (rs *ReedSolomon) computeGeneratorPolynomial() []byte {
	deg := rs.N - rs.K
	poly := []byte{1}
	for i := 1; i <= deg; i++ {
		alphaI := rs.GF.Exp[i]
		newPoly := make([]byte, len(poly)+1)
		for j, coef := range poly {
			newPoly[j] ^= rs.GF.Mul(coef, alphaI)
			newPoly[j+1] ^= coef
		}
		poly = newPoly
	}
	return poly
}

// Encode menghasilkan codeword sepanjang N. Message lebih pendek dari K di-pad
// dengan nol di KIRI.
func (rs *ReedSolomon) Encode(message []byte) ([]byte, error) {
	if len(message) > rs.K {
		return nil, fmt.Errorf("lombokecc: message too long: %d > %d", len(message), rs.K)
	}

	msg := make([]byte, rs.K)
	copy(msg[rs.K-len(message):], message)

	nMinusK := rs.N - rs.K
	msgShifted := make([]byte, rs.N)
	copy(msgShifted[nMinusK:], msg)

	remainder := rs.polyMod(msgShifted, rs.G)
	if len(remainder) != nMinusK {
		return nil, fmt.Errorf("lombokecc: remainder length mismatch: %d != %d", len(remainder), nMinusK)
	}

	codeword := make([]byte, rs.N)
	copy(codeword[0:nMinusK], remainder)
	copy(codeword[nMinusK:], msg)
	return codeword, nil
}

func (rs *ReedSolomon) polyMod(dividend, divisor []byte) []byte {
	remainder := make([]byte, len(dividend))
	copy(remainder, dividend)
	dl := len(divisor)

	for i := len(remainder) - dl; i >= 0; i-- {
		if remainder[i+dl-1] == 0 {
			continue
		}
		coeff := remainder[i+dl-1]
		for j := 0; j < dl; j++ {
			remainder[i+j] ^= rs.GF.Mul(divisor[j], coeff)
		}
	}
	return remainder[0 : dl-1]
}

// ComputeSyndromes mengembalikan S_1..S_2t di indeks 0..2t-1.
func (rs *ReedSolomon) ComputeSyndromes(received []byte) []byte {
	count := rs.N - rs.K
	syndromes := make([]byte, count)
	for i := 0; i < count; i++ {
		var syndrome byte
		alphaI := rs.GF.Exp[(i+1)%255]
		for j, b := range received {
			syndrome ^= rs.GF.Mul(b, rs.GF.Pow(alphaI, j))
		}
		syndromes[i] = syndrome
	}
	return syndromes
}

// IsValid melaporkan apakah semua sindrom nol.
func (rs *ReedSolomon) IsValid(codeword []byte) bool {
	for _, s := range rs.ComputeSyndromes(codeword) {
		if s != 0 {
			return false
		}
	}
	return true
}

// berlekampMassey menjalankan Peterson-Gorenstein-Zierler. Nama dipertahankan
// dari acuan.
func (rs *ReedSolomon) berlekampMassey(syndromes []byte) []byte {
	n := len(syndromes)
	for degree := 1; degree <= rs.T; degree++ {
		if degree*2 > n {
			break
		}
		equations := degree
		if n-degree < equations {
			equations = n - degree
		}
		if equations < degree {
			continue
		}

		A := make([][]byte, equations)
		B := make([]byte, equations)
		for row := 0; row < equations; row++ {
			eqIndex := row + degree
			A[row] = make([]byte, degree)
			for col := 0; col < degree; col++ {
				si := eqIndex - col - 1
				if si >= 0 && si < n {
					A[row][col] = syndromes[si]
				}
			}
			B[row] = syndromes[eqIndex]
		}

		solution := rs.gaussianElimination(A, B)
		if solution == nil {
			continue
		}

		valid := true
		for j := degree; j < n; j++ {
			sum := syndromes[j]
			for i := 0; i < degree; i++ {
				if j-i-1 >= 0 {
					sum ^= rs.GF.Mul(solution[i], syndromes[j-i-1])
				}
			}
			if sum != 0 {
				valid = false
				break
			}
		}

		if valid {
			sigma := make([]byte, degree+1)
			sigma[0] = 1
			copy(sigma[1:], solution[:degree])
			return sigma
		}
	}
	return []byte{1}
}

// gaussianElimination menyelesaikan A*x = b di GF(256), atau nil kalau tidak
// ada solusi unik.
//
// Dua koreksi dari commit b661b62 acuan yang WAJIB ikut saat porting:
//   (a) pivotCol dilacak per baris — kolom bisa di-skip, tanpa ini nilai
//       dipetakan ke variabel yang salah
//   (b) nil untuk sistem rank-deficient DAN inkonsisten
func (rs *ReedSolomon) gaussianElimination(A [][]byte, b []byte) []byte {
	m := len(A)
	if m == 0 {
		return nil
	}
	n := len(A[0])
	if n == 0 {
		return nil
	}

	aug := make([][]byte, m)
	for i := 0; i < m; i++ {
		aug[i] = make([]byte, n+1)
		copy(aug[i], A[i])
		aug[i][n] = b[i]
	}

	pivotCol := make([]int, m)
	for i := range pivotCol {
		pivotCol[i] = -1
	}

	row := 0
	for col := 0; col < n && row < m; col++ {
		pivot := -1
		for i := row; i < m; i++ {
			if aug[i][col] != 0 {
				pivot = i
				break
			}
		}
		if pivot == -1 {
			continue
		}

		pivotCol[row] = col
		aug[row], aug[pivot] = aug[pivot], aug[row]

		invPivot, err := rs.GF.Inv(aug[row][col])
		if err != nil {
			return nil
		}
		for j := col; j <= n; j++ {
			aug[row][j] = rs.GF.Mul(aug[row][j], invPivot)
		}

		for i := 0; i < m; i++ {
			if i != row && aug[i][col] != 0 {
				factor := aug[i][col]
				for j := col; j <= n; j++ {
					aug[i][j] ^= rs.GF.Mul(factor, aug[row][j])
				}
			}
		}
		row++
	}

	rank := row
	if rank < n {
		return nil
	}
	for i := rank; i < m; i++ {
		if aug[i][n] != 0 {
			return nil
		}
	}

	solution := make([]byte, n)
	for i := 0; i < rank; i++ {
		if c := pivotCol[i]; c >= 0 {
			solution[c] = aug[i][n]
		}
	}
	return solution
}

func (rs *ReedSolomon) chienSearch(sigma []byte) []int {
	var errs []int
	for pos := 0; pos < rs.N; pos++ {
		alphaNegPos := rs.GF.Exp[(255-pos)%255]
		val := sigma[0]
		for j := 1; j < len(sigma); j++ {
			val ^= rs.GF.Mul(sigma[j], rs.GF.Pow(alphaNegPos, j))
		}
		if val == 0 {
			errs = append(errs, pos)
		}
	}
	return errs
}

// forneyAlgorithm menjalankan direct error-value solver. Nama dipertahankan
// dari acuan; formula Forney sendiri tidak dipakai.
func (rs *ReedSolomon) forneyAlgorithm(syndromes []byte, errorPositions []int) ([]byte, error) {
	k := len(errorPositions)
	if k == 0 {
		return nil, nil
	}

	limit := k
	if len(syndromes) < limit {
		limit = len(syndromes)
	}

	A := make([][]byte, limit)
	b := make([]byte, limit)
	for i := 0; i < limit; i++ {
		A[i] = make([]byte, k)
		for j := 0; j < k; j++ {
			A[i][j] = rs.GF.Exp[(errorPositions[j]*(i+1))%255]
		}
		b[i] = syndromes[i]
	}

	errorValues := rs.gaussianElimination(A, b)
	if errorValues == nil {
		return nil, fmt.Errorf("%w: unable to solve for error values", ErrDecode)
	}
	return errorValues[0:k], nil
}

// Decode mengoreksi hingga T byte error dan mengembalikan K byte message.
// Panjang message asli TIDAK dibawa — pemanggil harus menyimpannya sendiri.
func (rs *ReedSolomon) Decode(received []byte) ([]byte, error) {
	if len(received) != rs.N {
		return nil, fmt.Errorf("lombokecc: received codeword length mismatch: %d != %d", len(received), rs.N)
	}

	syndromes := rs.ComputeSyndromes(received)
	allZero := true
	for _, s := range syndromes {
		if s != 0 {
			allZero = false
			break
		}
	}
	if allZero {
		out := make([]byte, rs.K)
		copy(out, received[rs.N-rs.K:])
		return out, nil
	}

	sigma := rs.berlekampMassey(syndromes)
	if len(sigma)-1 > rs.T {
		return nil, fmt.Errorf("%w: too many errors detected", ErrDecode)
	}

	errorPositions := rs.chienSearch(sigma)
	if len(errorPositions) == 0 {
		return nil, fmt.Errorf("%w: unable to locate errors", ErrDecode)
	}

	// Guard defense-in-depth: mutasi yang mematikannya SURVIVE di acuan.
	// Yang load-bearing adalah IsValid(corrected) di bawah.
	if len(errorPositions) > rs.T {
		return nil, fmt.Errorf("%w: too many errors detected: %d > %d", ErrDecode, len(errorPositions), rs.T)
	}

	errorValues, err := rs.forneyAlgorithm(syndromes, errorPositions)
	if err != nil {
		return nil, err
	}

	corrected := make([]byte, rs.N)
	copy(corrected, received)
	for i, pos := range errorPositions {
		corrected[pos] ^= errorValues[i]
	}

	// INI yang load-bearing. Tanpa ini, 60-71% miskoreksi senyap (terukur di
	// acuan Sesi 13). Jangan hapus.
	if !rs.IsValid(corrected) {
		return nil, fmt.Errorf("%w: corrected codeword is not valid", ErrDecode)
	}

	out := make([]byte, rs.K)
	copy(out, corrected[rs.N-rs.K:])
	return out, nil
}
