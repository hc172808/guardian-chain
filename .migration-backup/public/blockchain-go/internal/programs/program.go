// Package programs defines the GPL (GYDS Program Library) interfaces.
// Programs are Solana-style modules: stateless code identified by a 20-byte
// program ID that operate on account state via deterministic instructions.
//
// This is the scaffolding layer (GPL-A1..A5, B1..B4). Concrete implementations
// live in subpackages (system, token, accounts, staking, vm, registry).
//
// The shared engine pattern: there is exactly ONE token program for ALL
// fungible tokens — individual mints are just records, not contracts.
package programs

import (
	"errors"
	"fmt"
)

// Address is a 20-byte account / program identifier.
type Address [20]byte

// String returns the lowercase hex form (no 0x prefix).
func (a Address) String() string {
	const hex = "0123456789abcdef"
	out := make([]byte, 40)
	for i, b := range a {
		out[i*2] = hex[b>>4]
		out[i*2+1] = hex[b&0x0f]
	}
	return string(out)
}

// AccountMeta describes an account passed to an instruction.
type AccountMeta struct {
	Address    Address
	IsSigner   bool
	IsWritable bool
}

// Instruction is the unit of work executed by a program.
type Instruction struct {
	ProgramID Address
	Accounts  []AccountMeta
	Data      []byte
}

// AccountView is the minimal read/write surface a Program needs over state.
// Implementations adapt the existing internal/blockchain/state.go StateDB.
type AccountView interface {
	Get(addr Address) ([]byte, bool)
	Put(addr Address, data []byte) error
	Owner(addr Address) (Address, bool)
	SetOwner(addr Address, owner Address) error
}

// Context is passed to every Program.Execute call. It carries the active
// accounts, signer set, gas meter, and a reference to state.
type Context struct {
	State    AccountView
	Accounts []AccountMeta
	Data     []byte
	GasLeft  uint64
	Slot     uint64 // current block height
}

// ChargeGas debits the meter and returns ErrOutOfGas if the budget is busted.
func (c *Context) ChargeGas(cost uint64) error {
	if cost > c.GasLeft {
		c.GasLeft = 0
		return ErrOutOfGas
	}
	c.GasLeft -= cost
	return nil
}

// Program is the interface every GPL module implements.
type Program interface {
	ID() Address
	Name() string
	Execute(ctx *Context) error
}

// Errors returned across the GPL stack.
var (
	ErrOutOfGas         = errors.New("gpl: out of gas")
	ErrUnknownProgram   = errors.New("gpl: unknown program id")
	ErrInvalidData      = errors.New("gpl: invalid instruction data")
	ErrUnauthorized     = errors.New("gpl: unauthorized signer")
	ErrAccountMissing   = errors.New("gpl: account missing")
	ErrNotWritable      = errors.New("gpl: account not writable")
	ErrAlreadyExists    = errors.New("gpl: account already exists")
	ErrSandboxViolation = errors.New("gpl: sandbox violation")
)

// Registry routes an Instruction to the Program identified by ProgramID.
// Concrete construction (registering system/token/staking/etc.) is wired in
// internal/programs/registry. Kept here so the interface is dependency-free.
type Registry interface {
	Register(p Program) error
	Lookup(id Address) (Program, bool)
	Dispatch(ctx *Context, ix Instruction) error
}

// MustRegister panics if registration fails. Use only at init.
func MustRegister(r Registry, p Program) {
	if err := r.Register(p); err != nil {
		panic(fmt.Sprintf("gpl: register %s: %v", p.Name(), err))
	}
}
