<?php

declare(strict_types=1);

namespace CodingLombok\LombokEcc;

/**
 * Aritmetika GF(256).
 * Polinomial primitif: x^8 + x^4 + x^3 + x^2 + 1 = 0x11d
 *
 * Port dari gf256.ts (@codinglombok/lombok-ecc 0.1.0, commit 313f827).
 * Paritas byte-per-byte diuji terhadap vectors/lombok-ecc-vectors-v1.json.
 *
 * CATATAN PORT: tabel exp panjangnya 512, bukan 255. 255 entri pertama adalah
 * α^0..α^254, sisanya duplikat untuk menghindari modulo di jalur panas. Port
 * yang membuatnya 255 akan tetap benar secara matematis tapi GAGAL vector
 * gfTables — dan itu memang disengaja, supaya perbedaan struktur ketahuan.
 */
final class GF256
{
    public const PRIMITIVE_POLY = 0x11d;

    /** @var array<int,int> exp[i] = α^i, 512 entri */
    public array $exp;

    /** @var array<int,int> log[x] = i bila x = α^i, 256 entri */
    public array $log;

    public function __construct()
    {
        $this->exp = array_fill(0, 512, 0);
        $this->log = array_fill(0, 256, 0);

        $poly = 1;
        for ($i = 0; $i < 255; $i++) {
            $this->exp[$i] = $poly;
            $this->log[$poly] = $i;

            $poly *= 2;
            if ($poly > 0xff) {
                $poly ^= self::PRIMITIVE_POLY;
            }
        }
        for ($i = 0; $i < 255; $i++) {
            $this->exp[255 + $i] = $this->exp[$i];
        }
        $this->log[0] = 0; // log(0) tidak terdefinisi; 0 untuk keamanan
    }

    public function add(int $a, int $b): int
    {
        return $a ^ $b;
    }

    public function mul(int $a, int $b): int
    {
        if ($a === 0 || $b === 0) {
            return 0;
        }
        return $this->exp[($this->log[$a] + $this->log[$b]) % 255];
    }

    public function div(int $a, int $b): int
    {
        if ($b === 0) {
            throw new \DivisionByZeroError('Division by zero');
        }
        if ($a === 0) {
            return 0;
        }
        return $this->exp[($this->log[$a] - $this->log[$b] + 255) % 255];
    }

    public function inv(int $a): int
    {
        if ($a === 0) {
            throw new \DomainException('Cannot invert zero');
        }
        return $this->exp[(255 - $this->log[$a]) % 255];
    }

    public function pow(int $a, int $n): int
    {
        if ($a === 0) {
            return 0;
        }
        return $this->exp[($this->log[$a] * $n) % 255];
    }
}
