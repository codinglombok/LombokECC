//! Memeriksa port Rust terhadap test vector dari implementasi TS acuan.
//! Exit 0 hanya kalau SEMUA check lulus.
//!
//! Membaca format datar (`.txt`) yang diturunkan dari JSON acuan, supaya tidak
//! perlu serde — crate ini sengaja bebas dependensi.

use lombokecc::{Gf256, ReedSolomon, PRIMITIVE_POLY};
use std::env;
use std::fs;
use std::process::exit;

struct Counter {
    checks: usize,
    failed: usize,
}

impl Counter {
    fn ok(&mut self, cond: bool, label: &str, detail: &str) {
        self.checks += 1;
        if cond {
            println!("  PASS  {label}");
        } else {
            self.failed += 1;
            if detail.is_empty() {
                println!("  FAIL  {label}");
            } else {
                println!("  FAIL  {label}  — {detail}");
            }
        }
    }
}

fn from_hex(s: &str) -> Vec<u8> {
    if s == "-" {
        return Vec::new();
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).expect("hex tidak valid"))
        .collect()
}

fn to_hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn main() {
    let path = env::args()
        .nth(1)
        .unwrap_or_else(|| "../vectors/lombok-ecc-vectors-v1.txt".to_string());
    let raw = match fs::read_to_string(&path) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Vector tidak ditemukan: {path}: {e}");
            exit(2);
        }
    };

    let mut c = Counter { checks: 0, failed: 0 };
    let mut n = 255usize;
    let mut k = 239usize;
    let mut t = 8usize;
    let mut poly = 0u32;

    // Pass 1: parameter
    for line in raw.lines() {
        let f: Vec<&str> = line.split_whitespace().collect();
        if f.first() == Some(&"PARAM") {
            let v: usize = f[2].parse().unwrap();
            match f[1] {
                "n" => n = v,
                "k" => k = v,
                "t" => t = v,
                "poly" => poly = v as u32,
                _ => {}
            }
        }
    }

    println!("Port Rust vs vector acuan (commit 313f827)");

    println!("\n[1] Parameter");
    let rs = ReedSolomon::new(n, k).expect("parameter tidak valid");
    c.ok(rs.n == n, "n cocok", "");
    c.ok(rs.k == k, "k cocok", "");
    c.ok(rs.t == t, "t cocok", "");
    c.ok(PRIMITIVE_POLY == poly, "polinomial primitif cocok", "");

    let gf = Gf256::new();
    let mut gf_bad = 0usize;
    let mut enc_i = 0usize;
    let mut dec_i = 0usize;
    let mut over_i = 0usize;
    let mut valid_i = 0usize;
    let mut section = 0u8;

    for line in raw.lines() {
        let f: Vec<&str> = line.split_whitespace().collect();
        match f.first() {
            Some(&"TABLE") => {
                if section < 2 {
                    println!("\n[2] Tabel GF(256)");
                    section = 2;
                }
                if f[1] == "exp" {
                    c.ok(to_hex(&gf.exp) == f[2], "tabel exp identik (512 entri)", "");
                } else {
                    let mut log_le = Vec::with_capacity(512);
                    for v in gf.log.iter() {
                        log_le.push((v & 0xff) as u8);
                        log_le.push((v >> 8) as u8);
                    }
                    c.ok(to_hex(&log_le) == f[2], "tabel log identik (256 x uint16 LE)", "");
                }
            }
            Some(&"GFOP") => {
                if section < 3 {
                    println!("\n[3] Operasi GF(256)");
                    section = 3;
                }
                let a: u32 = f[2].parse().unwrap();
                let b: u32 = f[3].parse().unwrap();
                let expect: i32 = f[4].parse().unwrap();
                let got: i32 = match f[1] {
                    "mul" => gf.mul(a as u8, b as u8) as i32,
                    "div" => gf.div(a as u8, b as u8).map(|v| v as i32).unwrap_or(-1),
                    "inv" => gf.inv(a as u8).map(|v| v as i32).unwrap_or(-1),
                    "pow" => gf.pow(a as u8, b as usize) as i32,
                    _ => -2,
                };
                if got != expect {
                    gf_bad += 1;
                    println!("        {}({a},{b}) = {got}, harusnya {expect}", f[1]);
                }
            }
            Some(&"GEN") => {
                c.ok(gf_bad == 0, "operasi GF cocok", &format!("{gf_bad} menyimpang"));
                println!("\n[4] Polinomial generator");
                let degree: usize = f[1].parse().unwrap();
                c.ok(to_hex(&rs.g) == f[2], "koefisien generator identik", "");
                c.ok(rs.g.len() - 1 == degree, "derajat generator cocok", "");
            }
            Some(&"ENC") => {
                if section < 5 {
                    println!("\n[5] Encode");
                    section = 5;
                }
                let msg = from_hex(f[2]);
                match rs.encode(&msg) {
                    Ok(cw) => c.ok(
                        to_hex(&cw) == f[3],
                        &format!("encode vektor {enc_i} (len {}) identik", f[1]),
                        "",
                    ),
                    Err(e) => c.ok(false, &format!("encode vektor {enc_i}"), &e.to_string()),
                }
                enc_i += 1;
            }
            Some(&"DEC") => {
                if section < 6 {
                    println!("\n[6] Decode dengan error pada posisi tertentu");
                    section = 6;
                }
                let nonzero = f[2] == "1";
                let received = from_hex(f[3]);
                c.ok(
                    rs.is_valid(&received) == !nonzero,
                    &format!("vektor {dec_i}: status isValid cocok"),
                    "",
                );
                match rs.decode(&received) {
                    Ok(d) => c.ok(
                        to_hex(&d) == f[4],
                        &format!("vektor {dec_i}: {} error → message identik", f[1]),
                        "",
                    ),
                    Err(e) => c.ok(
                        false,
                        &format!("vektor {dec_i}: decode {} error", f[1]),
                        &e.to_string(),
                    ),
                }
                dec_i += 1;
            }
            Some(&"OVER") => {
                if section < 7 {
                    println!("\n[7] Di atas kapasitas — wajib gagal, bukan sukses diam-diam");
                    section = 7;
                }
                let ref_threw = f[2] == "1";
                let threw = rs.decode(&from_hex(f[3])).is_err();
                if ref_threw {
                    c.ok(
                        threw,
                        &format!("vektor {over_i}: {} error → gagal seperti acuan", f[1]),
                        "",
                    );
                } else {
                    let s = if threw { "melempar" } else { "juga tidak" };
                    c.ok(true, &format!("vektor {over_i}: acuan tidak melempar, port {s}"), "");
                }
                over_i += 1;
            }
            Some(&"VALID") => {
                if section < 8 {
                    println!("\n[8] isValid");
                    section = 8;
                }
                let expect = f[1] == "1";
                c.ok(
                    rs.is_valid(&from_hex(f[2])) == expect,
                    &format!("isValid vektor {valid_i}"),
                    "",
                );
                valid_i += 1;
            }
            _ => {}
        }
    }

    // [9] Roundtrip mandiri dengan LCG deterministik (tanpa dependensi rand).
    println!("\n[9] Roundtrip mandiri (bukan dari vector)");
    let mut state: u32 = 20260812;
    let mut next = || {
        state = state.wrapping_mul(1664525).wrapping_add(1013904223);
        state >> 8 // buang low bits — periode low bits LCG pendek
    };
    let mut rt_fail = 0usize;
    for _ in 0..100 {
        let len = 1 + (next() as usize % 239);
        let msg: Vec<u8> = (0..len).map(|_| (next() & 0xff) as u8).collect();
        let mut cw = rs.encode(&msg).expect("encode gagal");

        let n_err = next() as usize % 9;
        let mut seen = vec![false; 255];
        let mut placed = 0;
        while placed < n_err {
            let p = next() as usize % 255;
            if !seen[p] {
                seen[p] = true;
                placed += 1;
                let delta = 1 + (next() % 255) as u16;
                cw[p] = ((cw[p] as u16 + delta) % 256) as u8; // delta 1..255
            }
        }

        match rs.decode(&cw) {
            Ok(d) => {
                if d[rs.k - len..] != msg[..] {
                    rt_fail += 1;
                }
            }
            Err(_) => rt_fail += 1,
        }
    }
    c.ok(rt_fail == 0, "100 roundtrip acak (0-8 error) pulih", &format!("{rt_fail} gagal"));

    println!("\n{}", "-".repeat(70));
    println!("  {} check, {} gagal", c.checks, c.failed);
    println!("{}", "-".repeat(70));
    if c.failed > 0 {
        println!("  HASIL: GAGAL");
        exit(1);
    }
    println!("  HASIL: LULUS");
}
