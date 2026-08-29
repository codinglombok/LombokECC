// Memeriksa port C++ terhadap test vector dari implementasi TS acuan.
// Exit 0 hanya kalau SEMUA check lulus.
//
// Membaca format datar (.txt) yang diturunkan dari JSON acuan, supaya tidak
// perlu library JSON — header ini sengaja bebas dependensi.

#include "../include/lombok_ecc.hpp"

#include <cstdint>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

using lombokecc::GF256;
using lombokecc::ReedSolomon;

static std::size_t g_checks = 0;
static std::size_t g_failed = 0;

static void ok(bool cond, const std::string& label, const std::string& detail = "") {
  ++g_checks;
  if (cond) {
    std::cout << "  PASS  " << label << "\n";
  } else {
    ++g_failed;
    std::cout << "  FAIL  " << label;
    if (!detail.empty()) std::cout << "  — " << detail;
    std::cout << "\n";
  }
}

static std::vector<std::uint8_t> fromHex(const std::string& s) {
  if (s == "-") return {};
  std::vector<std::uint8_t> out;
  out.reserve(s.size() / 2);
  for (std::size_t i = 0; i + 1 < s.size(); i += 2) {
    out.push_back(static_cast<std::uint8_t>(std::stoul(s.substr(i, 2), nullptr, 16)));
  }
  return out;
}

static std::string toHex(const std::vector<std::uint8_t>& b) {
  static const char* d = "0123456789abcdef";
  std::string s;
  s.reserve(b.size() * 2);
  for (std::uint8_t x : b) {
    s.push_back(d[x >> 4]);
    s.push_back(d[x & 0xf]);
  }
  return s;
}

int main(int argc, char** argv) {
  const std::string path = (argc > 1) ? argv[1] : "../vectors/lombok-ecc-vectors-v1.txt";
  std::ifstream in(path);
  if (!in) {
    std::cerr << "Vector tidak ditemukan: " << path << "\n";
    return 2;
  }

  std::vector<std::string> lines;
  for (std::string line; std::getline(in, line);) lines.push_back(line);

  std::size_t n = 255, k = 239, t = 8;
  std::uint32_t poly = 0;
  for (const auto& line : lines) {
    std::istringstream ss(line);
    std::string tag, key;
    ss >> tag;
    if (tag != "PARAM") continue;
    std::size_t v;
    ss >> key >> v;
    if (key == "n") n = v;
    else if (key == "k") k = v;
    else if (key == "t") t = v;
    else if (key == "poly") poly = static_cast<std::uint32_t>(v);
  }

  std::cout << "Port C++ vs vector acuan (commit 313f827)\n";

  std::cout << "\n[1] Parameter\n";
  ReedSolomon rs(n, k);
  ok(rs.n == n, "n cocok");
  ok(rs.k == k, "k cocok");
  ok(rs.t == t, "t cocok");
  ok(lombokecc::kPrimitivePoly == poly, "polinomial primitif cocok");

  GF256 gf;
  std::size_t gfBad = 0, encI = 0, decI = 0, overI = 0, validI = 0;
  int section = 0;

  for (const auto& line : lines) {
    std::istringstream ss(line);
    std::string tag;
    ss >> tag;

    if (tag == "TABLE") {
      if (section < 2) { std::cout << "\n[2] Tabel GF(256)\n"; section = 2; }
      std::string which, hex;
      ss >> which >> hex;
      if (which == "exp") {
        std::vector<std::uint8_t> e(gf.exp.begin(), gf.exp.end());
        ok(toHex(e) == hex, "tabel exp identik (512 entri)");
      } else {
        std::vector<std::uint8_t> logLe;
        logLe.reserve(512);
        for (std::uint16_t v : gf.log) {
          logLe.push_back(static_cast<std::uint8_t>(v & 0xff));
          logLe.push_back(static_cast<std::uint8_t>(v >> 8));
        }
        ok(toHex(logLe) == hex, "tabel log identik (256 x uint16 LE)");
      }
    } else if (tag == "GFOP") {
      if (section < 3) { std::cout << "\n[3] Operasi GF(256)\n"; section = 3; }
      std::string op;
      int a, b, expect;
      ss >> op >> a >> b >> expect;
      int got = -2;
      try {
        if (op == "mul") got = gf.mul(static_cast<std::uint8_t>(a), static_cast<std::uint8_t>(b));
        else if (op == "div") got = gf.div(static_cast<std::uint8_t>(a), static_cast<std::uint8_t>(b));
        else if (op == "inv") got = gf.inv(static_cast<std::uint8_t>(a));
        else if (op == "pow") got = gf.pow(static_cast<std::uint8_t>(a), static_cast<std::size_t>(b));
      } catch (...) { got = -1; }
      if (got != expect) {
        ++gfBad;
        std::cout << "        " << op << "(" << a << "," << b << ") = " << got
                  << ", harusnya " << expect << "\n";
      }
    } else if (tag == "GEN") {
      ok(gfBad == 0, "operasi GF cocok", std::to_string(gfBad) + " menyimpang");
      std::cout << "\n[4] Polinomial generator\n";
      std::size_t degree;
      std::string hex;
      ss >> degree >> hex;
      ok(toHex(rs.g) == hex, "koefisien generator identik");
      ok(rs.g.size() - 1 == degree, "derajat generator cocok");
    } else if (tag == "ENC") {
      if (section < 5) { std::cout << "\n[5] Encode\n"; section = 5; }
      std::size_t len;
      std::string msgHex, cwHex;
      ss >> len >> msgHex >> cwHex;
      try {
        auto cw = rs.encode(fromHex(msgHex));
        ok(toHex(cw) == cwHex,
           "encode vektor " + std::to_string(encI) + " (len " + std::to_string(len) + ") identik");
      } catch (const std::exception& e) {
        ok(false, "encode vektor " + std::to_string(encI), e.what());
      }
      ++encI;
    } else if (tag == "DEC") {
      if (section < 6) { std::cout << "\n[6] Decode dengan error pada posisi tertentu\n"; section = 6; }
      int nErr, nonzero;
      std::string recvHex, decHex;
      ss >> nErr >> nonzero >> recvHex >> decHex;
      auto received = fromHex(recvHex);
      ok(rs.isValid(received) == (nonzero == 0),
         "vektor " + std::to_string(decI) + ": status isValid cocok");
      try {
        auto d = rs.decode(received);
        ok(toHex(d) == decHex, "vektor " + std::to_string(decI) + ": " + std::to_string(nErr) +
                                   " error → message identik");
      } catch (const std::exception& e) {
        ok(false, "vektor " + std::to_string(decI) + ": decode " + std::to_string(nErr) + " error",
           e.what());
      }
      ++decI;
    } else if (tag == "OVER") {
      if (section < 7) {
        std::cout << "\n[7] Di atas kapasitas — wajib gagal, bukan sukses diam-diam\n";
        section = 7;
      }
      int nErr, refThrew;
      std::string recvHex;
      ss >> nErr >> refThrew >> recvHex;
      bool threw = false;
      try { rs.decode(fromHex(recvHex)); } catch (...) { threw = true; }
      if (refThrew) {
        ok(threw, "vektor " + std::to_string(overI) + ": " + std::to_string(nErr) +
                      " error → gagal seperti acuan");
      } else {
        ok(true, "vektor " + std::to_string(overI) + ": acuan tidak melempar, port " +
                     (threw ? "melempar" : "juga tidak"));
      }
      ++overI;
    } else if (tag == "VALID") {
      if (section < 8) { std::cout << "\n[8] isValid\n"; section = 8; }
      int expect;
      std::string cwHex;
      ss >> expect >> cwHex;
      ok(rs.isValid(fromHex(cwHex)) == (expect == 1), "isValid vektor " + std::to_string(validI));
      ++validI;
    }
  }

  // [9] Roundtrip mandiri, LCG deterministik (tanpa <random> supaya hasilnya
  // sama di semua implementasi pustaka standar).
  std::cout << "\n[9] Roundtrip mandiri (bukan dari vector)\n";
  std::uint32_t state = 20260812;
  auto next = [&state]() -> std::uint32_t {
    state = state * 1664525u + 1013904223u;
    return state >> 8;  // buang low bits — periode low bits LCG pendek
  };
  std::size_t rtFail = 0;
  for (int trial = 0; trial < 100; ++trial) {
    const std::size_t len = 1 + (next() % 239);
    std::vector<std::uint8_t> msg(len);
    for (auto& b : msg) b = static_cast<std::uint8_t>(next() & 0xff);
    auto cw = rs.encode(msg);

    const std::size_t nErr = next() % 9;
    std::vector<bool> seen(255, false);
    std::size_t placed = 0;
    while (placed < nErr) {
      const std::size_t p = next() % 255;
      if (!seen[p]) {
        seen[p] = true;
        ++placed;
        const std::uint32_t delta = 1 + (next() % 255);  // 1..255
        cw[p] = static_cast<std::uint8_t>((cw[p] + delta) % 256);
      }
    }

    try {
      auto d = rs.decode(cw);
      bool same = true;
      for (std::size_t i = 0; i < len; ++i) {
        if (d[rs.k - len + i] != msg[i]) { same = false; break; }
      }
      if (!same) ++rtFail;
    } catch (...) {
      ++rtFail;
    }
  }
  ok(rtFail == 0, "100 roundtrip acak (0-8 error) pulih", std::to_string(rtFail) + " gagal");

  std::cout << "\n" << std::string(70, '-') << "\n";
  std::cout << "  " << g_checks << " check, " << g_failed << " gagal\n";
  std::cout << std::string(70, '-') << "\n";
  if (g_failed > 0) {
    std::cout << "  HASIL: GAGAL\n";
    return 1;
  }
  std::cout << "  HASIL: LULUS\n";
  return 0;
}
