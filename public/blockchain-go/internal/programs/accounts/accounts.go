// Package accounts implements GPL-A3: PDA-style addressing helpers and
// program-owner tagging. Used by other programs to derive deterministic
// addresses for child records (mints, token accounts, stake accounts).
package accounts

import (
	"crypto/sha256"

	"chaincore/internal/programs"
)

// DerivePDA returns a deterministic 20-byte address derived from a
// program ID and arbitrary seeds. Mirrors Solana's findProgramAddress
// shape but uses SHA-256 (the rest of the chain already uses sha256).
func DerivePDA(programID programs.Address, seeds ...[]byte) programs.Address {
	h := sha256.New()
	h.Write(programID[:])
	for _, s := range seeds {
		// Length-prefix each seed so concatenation is unambiguous.
		var lp [2]byte
		lp[0] = byte(len(s) >> 8)
		lp[1] = byte(len(s))
		h.Write(lp[:])
		h.Write(s)
	}
	h.Write([]byte("gpl-pda-v1"))
	sum := h.Sum(nil)
	var out programs.Address
	copy(out[:], sum[:20])
	return out
}

// IsZero reports whether addr is the zero address.
func IsZero(addr programs.Address) bool {
	for _, b := range addr {
		if b != 0 {
			return false
		}
	}
	return true
}
