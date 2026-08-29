<?php

declare(strict_types=1);

/**
 * Memeriksa port PHP terhadap test vector yang dihasilkan implementasi TS acuan.
 *
 * Exit 0 hanya kalau SEMUA check lulus. Exit 1 kalau ada satu pun yang gagal.
 * Jangan percaya banner; cek exit code.
 */

require __DIR__ . '/../src/GF256.php';
require __DIR__ . '/../src/ReedSolomon.php';

use CodingLombok\LombokEcc\GF256;
use CodingLombok\LombokEcc\ReedSolomon;

$vectorPath = $argv[1] ?? (__DIR__ . '/../../../vectors/lombok-ecc-vectors-v1.json');
if (!is_file($vectorPath)) {
    fwrite(STDERR, "Vector tidak ditemukan: {$vectorPath}\n");
    exit(2);
}
$V = json_decode((string) file_get_contents($vectorPath), true, 512, JSON_THROW_ON_ERROR);

$checks = 0;
$failed = 0;

function ok(bool $cond, string $label, string $detail = ''): void
{
    global $checks, $failed;
    $checks++;
    if ($cond) {
        echo "  PASS  {$label}\n";
    } else {
        $failed++;
        echo "  FAIL  {$label}" . ($detail !== '' ? "  — {$detail}" : '') . "\n";
    }
}

/** @param array<int,int> $bytes */
function toHex(array $bytes): string
{
    return bin2hex(pack('C*', ...$bytes));
}

/** @return array<int,int> */
function fromHex(string $hex): array
{
    if ($hex === '') {
        return [];
    }
    return array_values(unpack('C*', (string) hex2bin($hex)) ?: []);
}

echo "Port PHP " . PHP_VERSION . " vs " . $V['generatedBy'] . "\n";

// ── 1. Parameter ────────────────────────────────────────────────────────────
echo "\n[1] Parameter\n";
$rs = new ReedSolomon($V['params']['n'], $V['params']['k']);
ok($rs->n === $V['params']['n'], 'n cocok');
ok($rs->k === $V['params']['k'], 'k cocok');
ok($rs->t === $V['params']['t'], 't cocok');
ok(GF256::PRIMITIVE_POLY === $V['params']['primitivePoly'], 'polinomial primitif cocok');

// ── 2. Tabel GF(256) ────────────────────────────────────────────────────────
echo "\n[2] Tabel GF(256)\n";
$gf = new GF256();
ok(toHex($gf->exp) === $V['gfTables']['exp'], 'tabel exp identik (512 entri)');
// log adalah Uint16 little-endian di acuan
$logLe = [];
foreach ($gf->log as $v) {
    $logLe[] = $v & 0xff;
    $logLe[] = ($v >> 8) & 0xff;
}
ok(toHex($logLe) === $V['gfTables']['log'], 'tabel log identik (256 x uint16 LE)');

// ── 3. Operasi GF titik demi titik ──────────────────────────────────────────
echo "\n[3] Operasi GF(256)\n";
$gfBad = 0;
foreach ($V['gfOps'] as $t) {
    $r = match ($t['op']) {
        'mul' => $gf->mul($t['a'], $t['b']),
        'div' => $gf->div($t['a'], $t['b']),
        'inv' => $gf->inv($t['a']),
        'pow' => $gf->pow($t['a'], $t['b']),
        default => -1,
    };
    if ($r !== $t['r']) {
        $gfBad++;
        echo "        {$t['op']}({$t['a']},{$t['b']}) = {$r}, harusnya {$t['r']}\n";
    }
}
ok($gfBad === 0, count($V['gfOps']) . ' operasi GF cocok', "{$gfBad} menyimpang");

// ── 4. Polinomial generator ─────────────────────────────────────────────────
echo "\n[4] Polinomial generator\n";
ok(toHex($rs->g) === $V['generator']['bytes'], 'koefisien generator identik');
ok(count($rs->g) - 1 === $V['generator']['degree'], 'derajat generator cocok');

// ── 5. Encode ───────────────────────────────────────────────────────────────
echo "\n[5] Encode\n";
foreach ($V['encodeVectors'] as $i => $t) {
    $cw = $rs->encode(fromHex($t['message']));
    ok(toHex($cw) === $t['codeword'], "encode vektor {$i} (len {$t['messageLen']}) identik");
}

// ── 6. Decode ───────────────────────────────────────────────────────────────
echo "\n[6] Decode dengan error pada posisi tertentu\n";
foreach ($V['decodeVectors'] as $i => $t) {
    $received = fromHex($t['received']);
    ok($rs->isValid($received) === !$t['syndromesNonZero'], "vektor {$i}: status isValid cocok");
    try {
        $decoded = $rs->decode($received);
        ok(toHex($decoded) === $t['decoded'], "vektor {$i}: {$t['nErr']} error → message identik");
    } catch (\Throwable $e) {
        ok(false, "vektor {$i}: decode {$t['nErr']} error", 'melempar: ' . $e->getMessage());
    }
}

// ── 7. Di atas kapasitas ────────────────────────────────────────────────────
echo "\n[7] Di atas kapasitas — wajib gagal, bukan sukses diam-diam\n";
foreach ($V['overcapacityVectors'] as $i => $t) {
    $received = fromHex($t['received']);
    $threw = false;
    try {
        $rs->decode($received);
    } catch (\Throwable $e) {
        $threw = true;
    }
    if ($t['referenceThrew']) {
        ok($threw, "vektor {$i}: {$t['nErr']} error → gagal seperti acuan");
    } else {
        // Acuan tidak melempar (bounded-distance bisa mendarat di codeword lain).
        // Yang penting port TIDAK lebih permisif dari acuan; keduanya dicatat.
        ok(true, "vektor {$i}: acuan tidak melempar, port " . ($threw ? 'melempar' : 'juga tidak'));
    }
}

// ── 8. isValid ──────────────────────────────────────────────────────────────
echo "\n[8] isValid\n";
foreach ($V['isValidVectors'] as $i => $t) {
    ok($rs->isValid(fromHex($t['codeword'])) === $t['expect'], "isValid vektor {$i}: {$t['note']}");
}

// ── 9. Roundtrip mandiri ────────────────────────────────────────────────────
echo "\n[9] Roundtrip mandiri (bukan dari vector)\n";
mt_srand(20260812);
$rtFail = 0;
for ($trial = 0; $trial < 100; $trial++) {
    $len = 1 + mt_rand(0, 238);
    $msg = [];
    for ($i = 0; $i < $len; $i++) {
        $msg[] = mt_rand(0, 255);
    }
    $cw = $rs->encode($msg);

    $nErr = mt_rand(0, 8);
    $pos = [];
    while (count($pos) < $nErr) {
        $pos[mt_rand(0, 254)] = true;
    }
    foreach (array_keys($pos) as $p) {
        $cw[$p] = ($cw[$p] + 1 + mt_rand(0, 254)) % 256; // delta 1..255, tidak pernah 0
    }

    try {
        $decoded = $rs->decode($cw);
        $tail = array_slice($decoded, $rs->k - $len);
        if ($tail !== $msg) {
            $rtFail++;
        }
    } catch (\Throwable $e) {
        $rtFail++;
    }
}
ok($rtFail === 0, "100 roundtrip acak (0-8 error) pulih", "{$rtFail} gagal");

// ── Ringkasan ───────────────────────────────────────────────────────────────
echo "\n" . str_repeat('-', 70) . "\n";
echo "  {$checks} check, {$failed} gagal\n";
echo str_repeat('-', 70) . "\n";
if ($failed > 0) {
    echo "  HASIL: GAGAL\n";
    exit(1);
}
echo "  HASIL: LULUS\n";
exit(0);
