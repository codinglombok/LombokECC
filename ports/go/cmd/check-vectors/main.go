// Command check-vectors memeriksa port Go terhadap test vector dari
// implementasi TS acuan. Exit 0 hanya kalau SEMUA check lulus.
package main

import (
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"runtime"

	lombokecc "lombokecc"
)

type vectors struct {
	GeneratedBy string `json:"generatedBy"`
	Params      struct {
		N, K, T       int
		PrimitivePoly int `json:"primitivePoly"`
	} `json:"params"`
	GfTables struct {
		Exp string `json:"exp"`
		Log string `json:"log"`
	} `json:"gfTables"`
	GfOps []struct {
		Op      string `json:"op"`
		A, B, R int
	} `json:"gfOps"`
	Generator struct {
		Degree int    `json:"degree"`
		Bytes  string `json:"bytes"`
	} `json:"generator"`
	EncodeVectors []struct {
		MessageLen int    `json:"messageLen"`
		Message    string `json:"message"`
		Codeword   string `json:"codeword"`
	} `json:"encodeVectors"`
	DecodeVectors []struct {
		NErr             int    `json:"nErr"`
		Received         string `json:"received"`
		Decoded          string `json:"decoded"`
		SyndromesNonZero bool   `json:"syndromesNonZero"`
	} `json:"decodeVectors"`
	OvercapacityVectors []struct {
		NErr           int    `json:"nErr"`
		Received       string `json:"received"`
		ReferenceThrew bool   `json:"referenceThrew"`
	} `json:"overcapacityVectors"`
	IsValidVectors []struct {
		Codeword string `json:"codeword"`
		Expect   bool   `json:"expect"`
		Note     string `json:"note"`
	} `json:"isValidVectors"`
}

var checks, failed int

func ok(cond bool, label string, detail ...string) {
	checks++
	if cond {
		fmt.Printf("  PASS  %s\n", label)
		return
	}
	failed++
	if len(detail) > 0 && detail[0] != "" {
		fmt.Printf("  FAIL  %s  — %s\n", label, detail[0])
	} else {
		fmt.Printf("  FAIL  %s\n", label)
	}
}

func mustHex(s string) []byte {
	b, err := hex.DecodeString(s)
	if err != nil {
		panic(err)
	}
	return b
}

func main() {
	path := "../vectors/lombok-ecc-vectors-v1.json"
	if len(os.Args) > 1 {
		path = os.Args[1]
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Vector tidak ditemukan: %v\n", err)
		os.Exit(2)
	}
	var V vectors
	if err := json.Unmarshal(raw, &V); err != nil {
		fmt.Fprintf(os.Stderr, "JSON rusak: %v\n", err)
		os.Exit(2)
	}

	fmt.Printf("Port Go %s vs %s\n", runtime.Version(), V.GeneratedBy)

	// [1] Parameter
	fmt.Println("\n[1] Parameter")
	rs, err := lombokecc.New(V.Params.N, V.Params.K)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	ok(rs.N == V.Params.N, "n cocok")
	ok(rs.K == V.Params.K, "k cocok")
	ok(rs.T == V.Params.T, "t cocok")
	ok(lombokecc.PrimitivePoly == V.Params.PrimitivePoly, "polinomial primitif cocok")

	// [2] Tabel GF
	fmt.Println("\n[2] Tabel GF(256)")
	gf := lombokecc.NewGF256()
	ok(hex.EncodeToString(gf.Exp[:]) == V.GfTables.Exp, "tabel exp identik (512 entri)")
	logLE := make([]byte, 512)
	for i, v := range gf.Log {
		binary.LittleEndian.PutUint16(logLE[i*2:], v)
	}
	ok(hex.EncodeToString(logLE) == V.GfTables.Log, "tabel log identik (256 x uint16 LE)")

	// [3] Operasi GF
	fmt.Println("\n[3] Operasi GF(256)")
	bad := 0
	for _, t := range V.GfOps {
		var r int
		switch t.Op {
		case "mul":
			r = int(gf.Mul(byte(t.A), byte(t.B)))
		case "div":
			v, e := gf.Div(byte(t.A), byte(t.B))
			if e != nil {
				r = -1
			} else {
				r = int(v)
			}
		case "inv":
			v, e := gf.Inv(byte(t.A))
			if e != nil {
				r = -1
			} else {
				r = int(v)
			}
		case "pow":
			r = int(gf.Pow(byte(t.A), t.B))
		}
		if r != t.R {
			bad++
			fmt.Printf("        %s(%d,%d) = %d, harusnya %d\n", t.Op, t.A, t.B, r, t.R)
		}
	}
	ok(bad == 0, fmt.Sprintf("%d operasi GF cocok", len(V.GfOps)), fmt.Sprintf("%d menyimpang", bad))

	// [4] Generator
	fmt.Println("\n[4] Polinomial generator")
	ok(hex.EncodeToString(rs.G) == V.Generator.Bytes, "koefisien generator identik")
	ok(len(rs.G)-1 == V.Generator.Degree, "derajat generator cocok")

	// [5] Encode
	fmt.Println("\n[5] Encode")
	for i, t := range V.EncodeVectors {
		cw, err := rs.Encode(mustHex(t.Message))
		if err != nil {
			ok(false, fmt.Sprintf("encode vektor %d", i), err.Error())
			continue
		}
		ok(hex.EncodeToString(cw) == t.Codeword,
			fmt.Sprintf("encode vektor %d (len %d) identik", i, t.MessageLen))
	}

	// [6] Decode
	fmt.Println("\n[6] Decode dengan error pada posisi tertentu")
	for i, t := range V.DecodeVectors {
		received := mustHex(t.Received)
		ok(rs.IsValid(received) == !t.SyndromesNonZero, fmt.Sprintf("vektor %d: status isValid cocok", i))
		decoded, err := rs.Decode(received)
		if err != nil {
			ok(false, fmt.Sprintf("vektor %d: decode %d error", i, t.NErr), err.Error())
			continue
		}
		ok(hex.EncodeToString(decoded) == t.Decoded,
			fmt.Sprintf("vektor %d: %d error → message identik", i, t.NErr))
	}

	// [7] Di atas kapasitas
	fmt.Println("\n[7] Di atas kapasitas — wajib gagal, bukan sukses diam-diam")
	for i, t := range V.OvercapacityVectors {
		_, err := rs.Decode(mustHex(t.Received))
		threw := err != nil
		if t.ReferenceThrew {
			ok(threw, fmt.Sprintf("vektor %d: %d error → gagal seperti acuan", i, t.NErr))
		} else {
			s := "juga tidak"
			if threw {
				s = "melempar"
			}
			ok(true, fmt.Sprintf("vektor %d: acuan tidak melempar, port %s", i, s))
		}
	}

	// [8] isValid
	fmt.Println("\n[8] isValid")
	for i, t := range V.IsValidVectors {
		ok(rs.IsValid(mustHex(t.Codeword)) == t.Expect, fmt.Sprintf("isValid vektor %d: %s", i, t.Note))
	}

	// [9] Roundtrip mandiri
	fmt.Println("\n[9] Roundtrip mandiri (bukan dari vector)")
	rng := rand.New(rand.NewSource(20260812))
	rtFail := 0
	for trial := 0; trial < 100; trial++ {
		length := 1 + rng.Intn(239)
		msg := make([]byte, length)
		for i := range msg {
			msg[i] = byte(rng.Intn(256))
		}
		cw, err := rs.Encode(msg)
		if err != nil {
			rtFail++
			continue
		}
		nErr := rng.Intn(9)
		seen := map[int]bool{}
		for len(seen) < nErr {
			seen[rng.Intn(255)] = true
		}
		for p := range seen {
			cw[p] = byte((int(cw[p]) + 1 + rng.Intn(255)) % 256) // delta 1..255
		}
		decoded, err := rs.Decode(cw)
		if err != nil {
			rtFail++
			continue
		}
		tail := decoded[rs.K-length:]
		for i := range msg {
			if tail[i] != msg[i] {
				rtFail++
				break
			}
		}
	}
	ok(rtFail == 0, "100 roundtrip acak (0-8 error) pulih", fmt.Sprintf("%d gagal", rtFail))

	fmt.Println("\n" + "----------------------------------------------------------------------")
	fmt.Printf("  %d check, %d gagal\n", checks, failed)
	fmt.Println("----------------------------------------------------------------------")
	if failed > 0 {
		fmt.Println("  HASIL: GAGAL")
		os.Exit(1)
	}
	fmt.Println("  HASIL: LULUS")
}
