#!/usr/bin/env python3
"""Turunkan format datar line-oriented dari vector JSON.

Alasan: Rust tanpa cargo/serde dan C++ tanpa library JSON tidak bisa membaca
JSON tanpa menyeret dependensi. Format ini DITURUNKAN dari JSON yang sama,
bukan ditulis tangan — jadi tidak ada sumber kebenaran kedua yang bisa
melenceng diam-diam.
"""
import json, sys

V = json.load(open(sys.argv[1]))
out = []
out.append(f"# diturunkan dari {V['$schema']} / {V['generatedBy']}")
for key in ("n", "k", "t"):
    out.append(f"PARAM {key} {V['params'][key]}")
out.append(f"PARAM poly {V['params']['primitivePoly']}")
out.append(f"TABLE exp {V['gfTables']['exp']}")
out.append(f"TABLE log {V['gfTables']['log']}")
for t in V["gfOps"]:
    out.append(f"GFOP {t['op']} {t['a']} {t['b']} {t['r']}")
out.append(f"GEN {V['generator']['degree']} {V['generator']['bytes']}")
for t in V["encodeVectors"]:
    out.append(f"ENC {t['messageLen']} {t['message'] or '-'} {t['codeword']}")
for t in V["decodeVectors"]:
    out.append(f"DEC {t['nErr']} {1 if t['syndromesNonZero'] else 0} {t['received']} {t['decoded']}")
for t in V["overcapacityVectors"]:
    out.append(f"OVER {t['nErr']} {1 if t['referenceThrew'] else 0} {t['received']}")
for t in V["isValidVectors"]:
    out.append(f"VALID {1 if t['expect'] else 0} {t['codeword']}")
open(sys.argv[2], "w").write("\n".join(out) + "\n")
print(f"{len(out)} baris ditulis ke {sys.argv[2]}")
