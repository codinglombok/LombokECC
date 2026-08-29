<?php

declare(strict_types=1);

namespace CodingLombok\LombokEcc;

/**
 * Reed-Solomon RS(n, k), t = (n - k) / 2.
 * Generator: g(x) = (x - α^1)(x - α^2)...(x - α^2t)
 *
 * Port dari reed-solomon.ts (@codinglombok/lombok-ecc 0.1.0, commit 313f827).
 * Algoritma: Peterson-Gorenstein-Zierler + eliminasi Gauss GF(256) +
 * direct error-value solver. BUKAN Berlekamp-Massey/Forney — nama method
 * berlekampMassey/forneyAlgorithm dipertahankan dari acuan supaya diff antar
 * implementasi tetap mudah dibaca, tapi isinya PGZ. Jangan tertukar.
 *
 * KONTRAK API (sama dengan acuan, wajib dipahami sebelum dipakai):
 *   - encode() mem-pad message pendek dengan nol di KIRI (right-aligned)
 *   - codeword sistematik: byte 0..(n-k-1) paritas, byte (n-k)..(n-1) message
 *   - decode() SELALU mengembalikan k byte dan TIDAK membawa panjang message
 *     asli. Pemanggil harus menyimpan panjangnya sendiri.
 *
 * Semua byte direpresentasikan sebagai array<int> dengan nilai 0..255.
 */
final class ReedSolomon
{
    public GF256 $gf;
    public int $n;
    public int $k;
    public int $t;

    /** @var array<int,int> koefisien polinomial generator */
    public array $g;

    public function __construct(int $n = 255, int $k = 239)
    {
        if (($n - $k) % 2 !== 0) {
            throw new \InvalidArgumentException('n - k must be even (for t = (n - k) / 2)');
        }
        $this->gf = new GF256();
        $this->n = $n;
        $this->k = $k;
        $this->t = intdiv($n - $k, 2);
        $this->g = $this->computeGeneratorPolynomial();
    }

    /** @return array<int,int> */
    private function computeGeneratorPolynomial(): array
    {
        $deg = $this->n - $this->k;
        $poly = [1];

        for ($i = 1; $i <= $deg; $i++) {
            $alphaI = $this->gf->exp[$i];
            $newPoly = array_fill(0, count($poly) + 1, 0);

            foreach ($poly as $j => $coef) {
                $newPoly[$j] = $this->gf->add($newPoly[$j], $this->gf->mul($coef, $alphaI));
                $newPoly[$j + 1] = $this->gf->add($newPoly[$j + 1], $coef);
            }
            $poly = $newPoly;
        }

        return $poly;
    }

    /**
     * @param array<int,int> $message
     * @return array<int,int> codeword sepanjang n
     */
    public function encode(array $message): array
    {
        $len = count($message);
        if ($len > $this->k) {
            throw new \LengthException("Message too long: {$len} > {$this->k}");
        }

        // Pad ke k byte, right-aligned
        $msg = array_fill(0, $this->k, 0);
        for ($i = 0; $i < $len; $i++) {
            $msg[$this->k - $len + $i] = $message[$i] & 0xff;
        }

        $nMinusK = $this->n - $this->k;
        $msgShifted = array_fill(0, $this->n, 0);
        for ($i = 0; $i < $this->k; $i++) {
            $msgShifted[$nMinusK + $i] = $msg[$i];
        }

        $remainder = $this->polyMod($msgShifted, $this->g);

        if (count($remainder) !== $nMinusK) {
            throw new \RuntimeException(
                'Remainder length mismatch: ' . count($remainder) . " !== {$nMinusK}"
            );
        }

        $codeword = array_fill(0, $this->n, 0);
        for ($i = 0; $i < $nMinusK; $i++) {
            $codeword[$i] = $remainder[$i];
        }
        for ($i = 0; $i < $this->k; $i++) {
            $codeword[$nMinusK + $i] = $msg[$i];
        }

        return $codeword;
    }

    /**
     * @param array<int,int> $dividend
     * @param array<int,int> $divisor
     * @return array<int,int>
     */
    private function polyMod(array $dividend, array $divisor): array
    {
        $remainder = $dividend;
        $divisorLen = count($divisor);

        for ($i = count($remainder) - $divisorLen; $i >= 0; $i--) {
            if ($remainder[$i + $divisorLen - 1] === 0) {
                continue;
            }
            $coeff = $remainder[$i + $divisorLen - 1];
            for ($j = 0; $j < $divisorLen; $j++) {
                $remainder[$i + $j] = $this->gf->add(
                    $remainder[$i + $j],
                    $this->gf->mul($divisor[$j], $coeff)
                );
            }
        }

        return array_slice($remainder, 0, $divisorLen - 1);
    }

    /**
     * @param array<int,int> $received
     * @return array<int,int> sindrom S_1..S_2t di indeks 0..2t-1
     */
    public function computeSyndromes(array $received): array
    {
        $count = $this->n - $this->k;
        $syndromes = array_fill(0, $count, 0);

        for ($i = 0; $i < $count; $i++) {
            $syndrome = 0;
            $alphaI = $this->gf->exp[($i + 1) % 255];
            $len = count($received);
            for ($j = 0; $j < $len; $j++) {
                $syndrome = $this->gf->add(
                    $syndrome,
                    $this->gf->mul($received[$j], $this->gf->pow($alphaI, $j))
                );
            }
            $syndromes[$i] = $syndrome;
        }

        return $syndromes;
    }

    /** @param array<int,int> $codeword */
    public function isValid(array $codeword): bool
    {
        foreach ($this->computeSyndromes($codeword) as $s) {
            if ($s !== 0) {
                return false;
            }
        }
        return true;
    }

    /**
     * Peterson-Gorenstein-Zierler: cari polinomial locator error minimal.
     *
     * @param array<int,int> $syndromes
     * @return array<int,int> sigma, sigma[0] = 1
     */
    private function berlekampMassey(array $syndromes): array
    {
        $n = count($syndromes);
        $t = $this->t;

        for ($degree = 1; $degree <= $t; $degree++) {
            if ($degree * 2 > $n) {
                break;
            }

            $equations = min($degree, $n - $degree);
            if ($equations < $degree) {
                continue;
            }

            $A = [];
            $B = [];
            for ($row = 0; $row < $equations; $row++) {
                $eqIndex = $row + $degree;
                $A[$row] = [];
                for ($col = 0; $col < $degree; $col++) {
                    $syndIndex = $eqIndex - $col - 1;
                    $A[$row][$col] = ($syndIndex >= 0 && $syndIndex < $n) ? $syndromes[$syndIndex] : 0;
                }
                $B[$row] = $syndromes[$eqIndex];
            }

            $solution = $this->gaussianElimination($A, $B);

            if ($solution !== null) {
                $valid = true;
                for ($j = $degree; $j < $n; $j++) {
                    $sum = $syndromes[$j];
                    for ($i = 0; $i < $degree; $i++) {
                        if ($j - $i - 1 >= 0) {
                            $sum = $this->gf->add($sum, $this->gf->mul($solution[$i], $syndromes[$j - $i - 1]));
                        }
                    }
                    if ($sum !== 0) {
                        $valid = false;
                        break;
                    }
                }

                if ($valid) {
                    $sigma = array_fill(0, $degree + 1, 0);
                    $sigma[0] = 1;
                    for ($i = 0; $i < $degree; $i++) {
                        $sigma[$i + 1] = $solution[$i];
                    }
                    return $sigma;
                }
            }
        }

        return [1];
    }

    /**
     * Eliminasi Gauss di GF(256).
     *
     * Dua koreksi penting yang ditanggung dari commit b661b62 acuan — jangan
     * disederhanakan saat porting:
     *   (a) pivotCol dilacak per baris, karena kolom bisa di-skip. Tanpa itu,
     *       nilai solusi dipetakan ke variabel yang salah.
     *   (b) return null untuk sistem rank-deficient DAN inkonsisten.
     *
     * @param array<int,array<int,int>> $A
     * @param array<int,int> $b
     * @return array<int,int>|null
     */
    private function gaussianElimination(array $A, array $b): ?array
    {
        $m = count($A);
        if ($m === 0) {
            return null;
        }
        $n = count($A[0]);
        if ($n === 0) {
            return null;
        }

        $aug = [];
        for ($i = 0; $i < $m; $i++) {
            $aug[$i] = array_merge($A[$i], [$b[$i]]);
        }

        $pivotCol = array_fill(0, $m, -1);

        $row = 0;
        for ($col = 0; $col < $n && $row < $m; $col++) {
            $pivot = -1;
            for ($i = $row; $i < $m; $i++) {
                if ($aug[$i][$col] !== 0) {
                    $pivot = $i;
                    break;
                }
            }
            if ($pivot === -1) {
                continue;
            }

            $pivotCol[$row] = $col;

            $tmp = $aug[$row];
            $aug[$row] = $aug[$pivot];
            $aug[$pivot] = $tmp;

            $pivotVal = $aug[$row][$col];
            $invPivot = $this->gf->inv($pivotVal);
            for ($j = $col; $j <= $n; $j++) {
                $aug[$row][$j] = $this->gf->mul($aug[$row][$j], $invPivot);
            }

            for ($i = 0; $i < $m; $i++) {
                if ($i !== $row && $aug[$i][$col] !== 0) {
                    $factor = $aug[$i][$col];
                    for ($j = $col; $j <= $n; $j++) {
                        $aug[$i][$j] = $this->gf->add($aug[$i][$j], $this->gf->mul($factor, $aug[$row][$j]));
                    }
                }
            }

            $row++;
        }

        $rank = $row;
        if ($rank < $n) {
            return null;
        }

        for ($i = $rank; $i < $m; $i++) {
            if ($aug[$i][$n] !== 0) {
                return null;
            }
        }

        $solution = array_fill(0, $n, 0);
        for ($i = 0; $i < $rank; $i++) {
            $col = $pivotCol[$i];
            if ($col >= 0) {
                $solution[$col] = $aug[$i][$n];
            }
        }

        return $solution;
    }

    /**
     * @param array<int,int> $sigma
     * @return array<int,int> posisi error
     */
    private function chienSearch(array $sigma): array
    {
        $errors = [];
        $sigmaLen = count($sigma);

        for ($pos = 0; $pos < $this->n; $pos++) {
            $alphaNegPos = $this->gf->exp[(255 - $pos) % 255];

            $val = $sigma[0];
            for ($j = 1; $j < $sigmaLen; $j++) {
                $val = $this->gf->add($val, $this->gf->mul($sigma[$j], $this->gf->pow($alphaNegPos, $j)));
            }

            if ($val === 0) {
                $errors[] = $pos;
            }
        }

        return $errors;
    }

    /**
     * Direct error-value solver (menggantikan formula Forney di acuan).
     *
     * @param array<int,int> $syndromes
     * @param array<int,int> $sigma
     * @param array<int,int> $errorPositions
     * @return array<int,int>
     */
    private function forneyAlgorithm(array $syndromes, array $sigma, array $errorPositions): array
    {
        $k = count($errorPositions);
        if ($k === 0) {
            return [];
        }

        $A = [];
        $b = [];
        $limit = min($k, count($syndromes));

        for ($i = 0; $i < $limit; $i++) {
            $A[$i] = [];
            for ($j = 0; $j < $k; $j++) {
                $pos = $errorPositions[$j];
                $power = ($pos * ($i + 1)) % 255;
                $A[$i][$j] = $this->gf->exp[$power];
            }
            $b[$i] = $syndromes[$i];
        }

        $errorValues = $this->gaussianElimination($A, $b);

        if ($errorValues === null) {
            throw new \RuntimeException('Unable to solve for error values');
        }

        return array_slice($errorValues, 0, $k);
    }

    /**
     * @param array<int,int> $received codeword sepanjang n
     * @return array<int,int> message sepanjang k (SELALU k byte)
     * @throws \RuntimeException bila tidak bisa dikoreksi
     */
    public function decode(array $received): array
    {
        $len = count($received);
        if ($len !== $this->n) {
            throw new \LengthException("Received codeword length mismatch: {$len} !== {$this->n}");
        }

        $syndromes = $this->computeSyndromes($received);

        $allZero = true;
        foreach ($syndromes as $s) {
            if ($s !== 0) {
                $allZero = false;
                break;
            }
        }
        if ($allZero) {
            return array_slice($received, $this->n - $this->k);
        }

        $sigma = $this->berlekampMassey($syndromes);

        if (count($sigma) - 1 > $this->t) {
            throw new \RuntimeException('Too many errors detected');
        }

        $errorPositions = $this->chienSearch($sigma);

        if (count($errorPositions) === 0) {
            throw new \RuntimeException('Unable to locate errors');
        }

        // Guard defense-in-depth. Di acuan, mutasi yang mematikan guard ini
        // SURVIVE — yang load-bearing adalah isValid($corrected) di bawah.
        // Dipertahankan supaya pesan error tetap jelas, bukan karena krusial.
        if (count($errorPositions) > $this->t) {
            throw new \RuntimeException(
                'Too many errors detected: ' . count($errorPositions) . " > {$this->t}"
            );
        }

        $errorValues = $this->forneyAlgorithm($syndromes, $sigma, $errorPositions);

        $corrected = $received;
        foreach ($errorPositions as $i => $pos) {
            $corrected[$pos] = $this->gf->add($corrected[$pos], $errorValues[$i]);
        }

        // INI yang load-bearing. Tanpa ini, 60-71% miskoreksi senyap (terukur
        // di acuan Sesi 13). Jangan hapus.
        if (!$this->isValid($corrected)) {
            throw new \RuntimeException('Corrected codeword is not valid - too many errors or decoding failure');
        }

        return array_slice($corrected, $this->n - $this->k);
    }

    // ── Helper byte-string, idiomatik PHP ───────────────────────────────────

    /** @return array<int,int> */
    public static function bytesFromString(string $s): array
    {
        return array_values(unpack('C*', $s) ?: []);
    }

    /** @param array<int,int> $bytes */
    public static function stringFromBytes(array $bytes): string
    {
        return pack('C*', ...$bytes);
    }
}
