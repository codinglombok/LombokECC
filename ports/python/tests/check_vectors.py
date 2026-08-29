#!/usr/bin/env python3
"""Memeriksa port Python terhadap test vector dari implementasi TS acuan.

Exit 0 hanya kalau SEMUA check lulus. Cek exit code, jangan percaya banner.
"""

from __future__ import annotations

import json
import os
import random
import struct
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lombok_ecc import GF256, PRIMITIVE_POLY, DecodeError, ReedSolomon  # noqa: E402

checks = 0
failed = 0


def ok(cond: bool, label: str, detail: str = "") -> None:
    global checks, failed
    checks += 1
    if cond:
        print(f"  PASS  {label}")
    else:
        failed += 1
        print(f"  FAIL  {label}" + (f"  — {detail}" if detail else ""))


path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(__file__), "..", "..", "vectors", "lombok-ecc-vectors-v1.json"
)
with open(path) as f:
    V = json.load(f)

print(f"Port Python {sys.version.split()[0]} vs {V['generatedBy']}")

# [1] Parameter
print("\n[1] Parameter")
rs = ReedSolomon(V["params"]["n"], V["params"]["k"])
ok(rs.n == V["params"]["n"], "n cocok")
ok(rs.k == V["params"]["k"], "k cocok")
ok(rs.t == V["params"]["t"], "t cocok")
ok(PRIMITIVE_POLY == V["params"]["primitivePoly"], "polinomial primitif cocok")

# [2] Tabel GF
print("\n[2] Tabel GF(256)")
gf = GF256()
ok(bytes(gf.exp).hex() == V["gfTables"]["exp"], "tabel exp identik (512 entri)")
log_le = b"".join(struct.pack("<H", v) for v in gf.log)
ok(log_le.hex() == V["gfTables"]["log"], "tabel log identik (256 x uint16 LE)")

# [3] Operasi GF
print("\n[3] Operasi GF(256)")
bad = 0
for t in V["gfOps"]:
    op, a, b, expect = t["op"], t["a"], t["b"], t["r"]
    r = {"mul": lambda: gf.mul(a, b), "div": lambda: gf.div(a, b),
         "inv": lambda: gf.inv(a), "pow": lambda: gf.pow(a, b)}[op]()
    if r != expect:
        bad += 1
        print(f"        {op}({a},{b}) = {r}, harusnya {expect}")
ok(bad == 0, f"{len(V['gfOps'])} operasi GF cocok", f"{bad} menyimpang")

# [4] Generator
print("\n[4] Polinomial generator")
ok(bytes(rs.g).hex() == V["generator"]["bytes"], "koefisien generator identik")
ok(len(rs.g) - 1 == V["generator"]["degree"], "derajat generator cocok")

# [5] Encode
print("\n[5] Encode")
for i, t in enumerate(V["encodeVectors"]):
    cw = rs.encode(bytes.fromhex(t["message"]))
    ok(bytes(cw).hex() == t["codeword"], f"encode vektor {i} (len {t['messageLen']}) identik")

# [6] Decode
print("\n[6] Decode dengan error pada posisi tertentu")
for i, t in enumerate(V["decodeVectors"]):
    received = bytes.fromhex(t["received"])
    ok(rs.is_valid(received) == (not t["syndromesNonZero"]), f"vektor {i}: status isValid cocok")
    try:
        decoded = rs.decode(received)
        ok(bytes(decoded).hex() == t["decoded"], f"vektor {i}: {t['nErr']} error → message identik")
    except Exception as e:  # noqa: BLE001
        ok(False, f"vektor {i}: decode {t['nErr']} error", f"melempar: {e}")

# [7] Di atas kapasitas
print("\n[7] Di atas kapasitas — wajib gagal, bukan sukses diam-diam")
for i, t in enumerate(V["overcapacityVectors"]):
    received = bytes.fromhex(t["received"])
    threw = False
    try:
        rs.decode(received)
    except Exception:  # noqa: BLE001
        threw = True
    if t["referenceThrew"]:
        ok(threw, f"vektor {i}: {t['nErr']} error → gagal seperti acuan")
    else:
        ok(True, f"vektor {i}: acuan tidak melempar, port {'melempar' if threw else 'juga tidak'}")

# [8] isValid
print("\n[8] isValid")
for i, t in enumerate(V["isValidVectors"]):
    ok(rs.is_valid(bytes.fromhex(t["codeword"])) == t["expect"], f"isValid vektor {i}: {t['note']}")

# [9] Roundtrip mandiri
print("\n[9] Roundtrip mandiri (bukan dari vector)")
rng = random.Random(20260812)
rt_fail = 0
for _ in range(100):
    length = rng.randint(1, 239)
    msg = bytes(rng.randint(0, 255) for _ in range(length))
    cw = rs.encode(msg)
    n_err = rng.randint(0, 8)
    positions = rng.sample(range(255), n_err)
    for p in positions:
        cw[p] = (cw[p] + 1 + rng.randint(0, 254)) % 256  # delta 1..255, tidak pernah 0
    try:
        decoded = rs.decode(cw)
        if bytes(decoded[rs.k - length:]) != msg:
            rt_fail += 1
    except Exception:  # noqa: BLE001
        rt_fail += 1
ok(rt_fail == 0, "100 roundtrip acak (0-8 error) pulih", f"{rt_fail} gagal")

print("\n" + "-" * 70)
print(f"  {checks} check, {failed} gagal")
print("-" * 70)
if failed:
    print("  HASIL: GAGAL")
    sys.exit(1)
print("  HASIL: LULUS")
sys.exit(0)
