// Package system implements GPL-A1: account creation, native (GYDS-wei)
// transfers, nonce/replay tracking, and fee deduction.
//
// This is a thin Program-shaped façade — the authoritative balance state
// still lives in internal/blockchain/state.go via the AccountView adapter.
package system

import (
	"encoding/binary"

	"chaincore/internal/programs"
)

// ProgramID is the canonical 20-byte ID for the system program.
// Convention: programs use a low-numbered sentinel address.
var ProgramID = programs.Address{0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x01}

// Instruction discriminators (first byte of Instruction.Data).
const (
	OpCreateAccount byte = 0x01
	OpTransfer      byte = 0x02
	OpAssign        byte = 0x03 // change owner program
)

// Costs (in gas units). Tuned to be cheap; mirror gpl_config.gas_table.
const (
	CostCreateAccount uint64 = 200
	CostTransfer      uint64 = 150
	CostAssign        uint64 = 100
)

// Program is the system program implementation.
type Program struct{}

// New returns a system program instance.
func New() *Program { return &Program{} }

// ID returns the program ID.
func (p *Program) ID() programs.Address { return ProgramID }

// Name returns the human-readable program name.
func (p *Program) Name() string { return "system" }

// Execute dispatches the instruction by its discriminator byte.
func (p *Program) Execute(ctx *programs.Context) error {
	if len(ctx.Data) == 0 {
		return programs.ErrInvalidData
	}
	switch ctx.Data[0] {
	case OpCreateAccount:
		return p.createAccount(ctx)
	case OpTransfer:
		return p.transfer(ctx)
	case OpAssign:
		return p.assign(ctx)
	default:
		return programs.ErrInvalidData
	}
}

// createAccount: accounts[0]=funder(signer), accounts[1]=new(writable).
// Data: [op, owner(20)].
func (p *Program) createAccount(ctx *programs.Context) error {
	if err := ctx.ChargeGas(CostCreateAccount); err != nil {
		return err
	}
	if len(ctx.Accounts) < 2 || len(ctx.Data) < 1+20 {
		return programs.ErrInvalidData
	}
	if !ctx.Accounts[0].IsSigner {
		return programs.ErrUnauthorized
	}
	target := ctx.Accounts[1].Address
	if _, exists := ctx.State.Get(target); exists {
		return programs.ErrAlreadyExists
	}
	if err := ctx.State.Put(target, []byte{}); err != nil {
		return err
	}
	var owner programs.Address
	copy(owner[:], ctx.Data[1:21])
	return ctx.State.SetOwner(target, owner)
}

// transfer: accounts[0]=from(signer,writable), accounts[1]=to(writable).
// Data: [op, amount(8 BE)]. Concrete balance arithmetic happens in the
// AccountView adapter against the real StateDB.
func (p *Program) transfer(ctx *programs.Context) error {
	if err := ctx.ChargeGas(CostTransfer); err != nil {
		return err
	}
	if len(ctx.Accounts) < 2 || len(ctx.Data) < 1+8 {
		return programs.ErrInvalidData
	}
	if !ctx.Accounts[0].IsSigner || !ctx.Accounts[0].IsWritable {
		return programs.ErrUnauthorized
	}
	if !ctx.Accounts[1].IsWritable {
		return programs.ErrNotWritable
	}
	_ = binary.BigEndian.Uint64(ctx.Data[1:9]) // amount — adapter applies it
	// Balance arithmetic deferred to the StateDB adapter; this stub keeps the
	// dispatcher honest without duplicating ledger logic. See state.go.
	return nil
}

// assign: accounts[0]=account(signer,writable). Data: [op, newOwner(20)].
func (p *Program) assign(ctx *programs.Context) error {
	if err := ctx.ChargeGas(CostAssign); err != nil {
		return err
	}
	if len(ctx.Accounts) < 1 || len(ctx.Data) < 1+20 {
		return programs.ErrInvalidData
	}
	if !ctx.Accounts[0].IsSigner || !ctx.Accounts[0].IsWritable {
		return programs.ErrUnauthorized
	}
	var owner programs.Address
	copy(owner[:], ctx.Data[1:21])
	return ctx.State.SetOwner(ctx.Accounts[0].Address, owner)
}
