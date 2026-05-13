// Package token implements GPL-A2: a single shared engine for ALL fungible
// tokens (GYDS-20). Tokens are NOT individual contracts — each token is a
// `Mint` record + per-holder `TokenAccount` records owned by this program.
//
// Layout follows the SPL token model:
//   Mint{authority, supply, decimals, freeze_authority}
//   TokenAccount{mint, owner, amount, frozen}
package token

import (
	"encoding/binary"

	"chaincore/internal/programs"
)

// ProgramID — sentinel 0x…02.
var ProgramID = programs.Address{0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x02}

// Instruction discriminators.
const (
	OpInitMint        byte = 0x01
	OpInitTokenAcct   byte = 0x02
	OpMintTo          byte = 0x03
	OpTransfer        byte = 0x04
	OpBurn            byte = 0x05
	OpFreeze          byte = 0x06
	OpThaw            byte = 0x07
	OpSetAuthority    byte = 0x08
)

// Gas costs.
const (
	CostInitMint      uint64 = 500
	CostInitTokenAcct uint64 = 300
	CostMintTo        uint64 = 300
	CostTransfer      uint64 = 200
	CostBurn          uint64 = 200
	CostFreeze        uint64 = 100
	CostThaw          uint64 = 100
	CostSetAuthority  uint64 = 100
)

// Mint record (serialized). 20+8+1+20 = 49 bytes.
type Mint struct {
	Authority       programs.Address
	Supply          uint64
	Decimals        uint8
	FreezeAuthority programs.Address
}

// Encode serializes a Mint.
func (m *Mint) Encode() []byte {
	buf := make([]byte, 49)
	copy(buf[0:20], m.Authority[:])
	binary.BigEndian.PutUint64(buf[20:28], m.Supply)
	buf[28] = m.Decimals
	copy(buf[29:49], m.FreezeAuthority[:])
	return buf
}

// DecodeMint deserializes.
func DecodeMint(b []byte) (*Mint, error) {
	if len(b) < 49 {
		return nil, programs.ErrInvalidData
	}
	m := &Mint{Supply: binary.BigEndian.Uint64(b[20:28]), Decimals: b[28]}
	copy(m.Authority[:], b[0:20])
	copy(m.FreezeAuthority[:], b[29:49])
	return m, nil
}

// TokenAccount record. 20+20+8+1 = 49 bytes.
type TokenAccount struct {
	Mint   programs.Address
	Owner  programs.Address
	Amount uint64
	Frozen bool
}

// Encode serializes a TokenAccount.
func (t *TokenAccount) Encode() []byte {
	buf := make([]byte, 49)
	copy(buf[0:20], t.Mint[:])
	copy(buf[20:40], t.Owner[:])
	binary.BigEndian.PutUint64(buf[40:48], t.Amount)
	if t.Frozen {
		buf[48] = 1
	}
	return buf
}

// DecodeTokenAccount deserializes.
func DecodeTokenAccount(b []byte) (*TokenAccount, error) {
	if len(b) < 49 {
		return nil, programs.ErrInvalidData
	}
	t := &TokenAccount{Amount: binary.BigEndian.Uint64(b[40:48]), Frozen: b[48] == 1}
	copy(t.Mint[:], b[0:20])
	copy(t.Owner[:], b[20:40])
	return t, nil
}

// Program is the GYDS-20 program.
type Program struct{}

// New constructs the token program.
func New() *Program { return &Program{} }

// ID returns the program ID.
func (p *Program) ID() programs.Address { return ProgramID }

// Name returns the program name.
func (p *Program) Name() string { return "token" }

// Execute dispatches by op code.
func (p *Program) Execute(ctx *programs.Context) error {
	if len(ctx.Data) == 0 {
		return programs.ErrInvalidData
	}
	switch ctx.Data[0] {
	case OpInitMint:
		return p.initMint(ctx)
	case OpMintTo:
		return p.mintTo(ctx)
	case OpTransfer:
		return p.transfer(ctx)
	case OpBurn:
		return p.burn(ctx)
	case OpFreeze, OpThaw:
		return p.freezeOrThaw(ctx, ctx.Data[0] == OpFreeze)
	default:
		return programs.ErrInvalidData
	}
}

// initMint: accounts[0]=mintAccount(writable), accounts[1]=authority(signer).
// Data: [op, decimals, freezeAuthority(20)].
func (p *Program) initMint(ctx *programs.Context) error {
	if err := ctx.ChargeGas(CostInitMint); err != nil {
		return err
	}
	if len(ctx.Accounts) < 2 || len(ctx.Data) < 1+1+20 {
		return programs.ErrInvalidData
	}
	if !ctx.Accounts[1].IsSigner {
		return programs.ErrUnauthorized
	}
	if !ctx.Accounts[0].IsWritable {
		return programs.ErrNotWritable
	}
	if _, exists := ctx.State.Get(ctx.Accounts[0].Address); exists {
		return programs.ErrAlreadyExists
	}
	m := &Mint{Authority: ctx.Accounts[1].Address, Decimals: ctx.Data[1]}
	copy(m.FreezeAuthority[:], ctx.Data[2:22])
	return ctx.State.Put(ctx.Accounts[0].Address, m.Encode())
}

// mintTo: accounts[0]=mint(writable), accounts[1]=tokenAcct(writable),
// accounts[2]=authority(signer). Data: [op, amount(8 BE)].
func (p *Program) mintTo(ctx *programs.Context) error {
	if err := ctx.ChargeGas(CostMintTo); err != nil {
		return err
	}
	if len(ctx.Accounts) < 3 || len(ctx.Data) < 1+8 {
		return programs.ErrInvalidData
	}
	if !ctx.Accounts[2].IsSigner {
		return programs.ErrUnauthorized
	}
	mintBytes, ok := ctx.State.Get(ctx.Accounts[0].Address)
	if !ok {
		return programs.ErrAccountMissing
	}
	m, err := DecodeMint(mintBytes)
	if err != nil {
		return err
	}
	if m.Authority != ctx.Accounts[2].Address {
		return programs.ErrUnauthorized
	}
	amount := binary.BigEndian.Uint64(ctx.Data[1:9])

	tBytes, ok := ctx.State.Get(ctx.Accounts[1].Address)
	var t *TokenAccount
	if !ok {
		t = &TokenAccount{Mint: ctx.Accounts[0].Address, Owner: ctx.Accounts[1].Address}
	} else {
		t, err = DecodeTokenAccount(tBytes)
		if err != nil {
			return err
		}
	}
	t.Amount += amount
	m.Supply += amount

	if err := ctx.State.Put(ctx.Accounts[0].Address, m.Encode()); err != nil {
		return err
	}
	return ctx.State.Put(ctx.Accounts[1].Address, t.Encode())
}

// transfer: accounts[0]=src(signer,writable), accounts[1]=dst(writable).
// Data: [op, amount(8 BE)].
func (p *Program) transfer(ctx *programs.Context) error {
	if err := ctx.ChargeGas(CostTransfer); err != nil {
		return err
	}
	if len(ctx.Accounts) < 2 || len(ctx.Data) < 1+8 {
		return programs.ErrInvalidData
	}
	if !ctx.Accounts[0].IsSigner {
		return programs.ErrUnauthorized
	}
	srcBytes, ok := ctx.State.Get(ctx.Accounts[0].Address)
	if !ok {
		return programs.ErrAccountMissing
	}
	src, err := DecodeTokenAccount(srcBytes)
	if err != nil {
		return err
	}
	if src.Frozen {
		return programs.ErrUnauthorized
	}
	amount := binary.BigEndian.Uint64(ctx.Data[1:9])
	if src.Amount < amount {
		return programs.ErrInvalidData
	}
	dstBytes, ok := ctx.State.Get(ctx.Accounts[1].Address)
	var dst *TokenAccount
	if !ok {
		dst = &TokenAccount{Mint: src.Mint, Owner: ctx.Accounts[1].Address}
	} else {
		dst, err = DecodeTokenAccount(dstBytes)
		if err != nil {
			return err
		}
		if dst.Mint != src.Mint {
			return programs.ErrInvalidData
		}
	}
	src.Amount -= amount
	dst.Amount += amount
	if err := ctx.State.Put(ctx.Accounts[0].Address, src.Encode()); err != nil {
		return err
	}
	return ctx.State.Put(ctx.Accounts[1].Address, dst.Encode())
}

// burn: accounts[0]=tokenAcct(signer,writable), accounts[1]=mint(writable).
// Data: [op, amount(8 BE)].
func (p *Program) burn(ctx *programs.Context) error {
	if err := ctx.ChargeGas(CostBurn); err != nil {
		return err
	}
	if len(ctx.Accounts) < 2 || len(ctx.Data) < 1+8 {
		return programs.ErrInvalidData
	}
	if !ctx.Accounts[0].IsSigner {
		return programs.ErrUnauthorized
	}
	tBytes, ok := ctx.State.Get(ctx.Accounts[0].Address)
	if !ok {
		return programs.ErrAccountMissing
	}
	t, err := DecodeTokenAccount(tBytes)
	if err != nil {
		return err
	}
	mBytes, ok := ctx.State.Get(ctx.Accounts[1].Address)
	if !ok {
		return programs.ErrAccountMissing
	}
	m, err := DecodeMint(mBytes)
	if err != nil {
		return err
	}
	amount := binary.BigEndian.Uint64(ctx.Data[1:9])
	if t.Amount < amount || m.Supply < amount {
		return programs.ErrInvalidData
	}
	t.Amount -= amount
	m.Supply -= amount
	if err := ctx.State.Put(ctx.Accounts[0].Address, t.Encode()); err != nil {
		return err
	}
	return ctx.State.Put(ctx.Accounts[1].Address, m.Encode())
}

// freezeOrThaw: accounts[0]=tokenAcct(writable), accounts[1]=mint,
// accounts[2]=freezeAuthority(signer).
func (p *Program) freezeOrThaw(ctx *programs.Context, freeze bool) error {
	cost := CostThaw
	if freeze {
		cost = CostFreeze
	}
	if err := ctx.ChargeGas(cost); err != nil {
		return err
	}
	if len(ctx.Accounts) < 3 {
		return programs.ErrInvalidData
	}
	if !ctx.Accounts[2].IsSigner {
		return programs.ErrUnauthorized
	}
	mBytes, ok := ctx.State.Get(ctx.Accounts[1].Address)
	if !ok {
		return programs.ErrAccountMissing
	}
	m, err := DecodeMint(mBytes)
	if err != nil {
		return err
	}
	if m.FreezeAuthority != ctx.Accounts[2].Address {
		return programs.ErrUnauthorized
	}
	tBytes, ok := ctx.State.Get(ctx.Accounts[0].Address)
	if !ok {
		return programs.ErrAccountMissing
	}
	t, err := DecodeTokenAccount(tBytes)
	if err != nil {
		return err
	}
	t.Frozen = freeze
	return ctx.State.Put(ctx.Accounts[0].Address, t.Encode())
}
