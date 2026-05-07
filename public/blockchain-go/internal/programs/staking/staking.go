// Package staking implements GPL-A4: validator + delegator stake records.
// Wraps the existing internal/consensus/pos.go logic — does NOT replace it.
// Stake math (rewards, slashing) still happens in the consensus layer; this
// program is the on-chain bookkeeping façade.
package staking

import (
	"encoding/binary"

	"chaincore/internal/programs"
)

// ProgramID — sentinel 0x…04.
var ProgramID = programs.Address{0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x04}

// Op codes.
const (
	OpInitStake    byte = 0x01
	OpDelegate     byte = 0x02
	OpUndelegate   byte = 0x03
	OpClaimRewards byte = 0x04
)

// Gas.
const (
	CostInitStake    uint64 = 400
	CostDelegate     uint64 = 300
	CostUndelegate   uint64 = 300
	CostClaimRewards uint64 = 250
)

// StakeAccount record. 20+20+8+8+8 = 64 bytes.
type StakeAccount struct {
	Owner      programs.Address
	Validator  programs.Address
	Amount     uint64
	ActiveSlot uint64
	Rewards    uint64
}

// Encode serializes a StakeAccount.
func (s *StakeAccount) Encode() []byte {
	buf := make([]byte, 64)
	copy(buf[0:20], s.Owner[:])
	copy(buf[20:40], s.Validator[:])
	binary.BigEndian.PutUint64(buf[40:48], s.Amount)
	binary.BigEndian.PutUint64(buf[48:56], s.ActiveSlot)
	binary.BigEndian.PutUint64(buf[56:64], s.Rewards)
	return buf
}

// DecodeStake deserializes.
func DecodeStake(b []byte) (*StakeAccount, error) {
	if len(b) < 64 {
		return nil, programs.ErrInvalidData
	}
	s := &StakeAccount{
		Amount:     binary.BigEndian.Uint64(b[40:48]),
		ActiveSlot: binary.BigEndian.Uint64(b[48:56]),
		Rewards:    binary.BigEndian.Uint64(b[56:64]),
	}
	copy(s.Owner[:], b[0:20])
	copy(s.Validator[:], b[20:40])
	return s, nil
}

// Program is the staking program.
type Program struct{}

// New constructs the staking program.
func New() *Program { return &Program{} }

// ID returns the program ID.
func (p *Program) ID() programs.Address { return ProgramID }

// Name returns the human-readable program name.
func (p *Program) Name() string { return "staking" }

// Execute dispatches by op code.
func (p *Program) Execute(ctx *programs.Context) error {
	if len(ctx.Data) == 0 {
		return programs.ErrInvalidData
	}
	switch ctx.Data[0] {
	case OpInitStake:
		return p.initStake(ctx)
	case OpDelegate:
		return p.delegate(ctx, true)
	case OpUndelegate:
		return p.delegate(ctx, false)
	case OpClaimRewards:
		return p.claim(ctx)
	default:
		return programs.ErrInvalidData
	}
}

// initStake: accounts[0]=stakeAcct(writable), accounts[1]=owner(signer),
// accounts[2]=validator. Data: [op].
func (p *Program) initStake(ctx *programs.Context) error {
	if err := ctx.ChargeGas(CostInitStake); err != nil {
		return err
	}
	if len(ctx.Accounts) < 3 {
		return programs.ErrInvalidData
	}
	if !ctx.Accounts[1].IsSigner {
		return programs.ErrUnauthorized
	}
	if _, exists := ctx.State.Get(ctx.Accounts[0].Address); exists {
		return programs.ErrAlreadyExists
	}
	s := &StakeAccount{
		Owner:      ctx.Accounts[1].Address,
		Validator:  ctx.Accounts[2].Address,
		ActiveSlot: ctx.Slot,
	}
	return ctx.State.Put(ctx.Accounts[0].Address, s.Encode())
}

// delegate: accounts[0]=stakeAcct(writable), accounts[1]=owner(signer).
// Data: [op, amount(8 BE)]. add=true delegates, false undelegates.
func (p *Program) delegate(ctx *programs.Context, add bool) error {
	cost := CostUndelegate
	if add {
		cost = CostDelegate
	}
	if err := ctx.ChargeGas(cost); err != nil {
		return err
	}
	if len(ctx.Accounts) < 2 || len(ctx.Data) < 1+8 {
		return programs.ErrInvalidData
	}
	if !ctx.Accounts[1].IsSigner {
		return programs.ErrUnauthorized
	}
	bytes, ok := ctx.State.Get(ctx.Accounts[0].Address)
	if !ok {
		return programs.ErrAccountMissing
	}
	s, err := DecodeStake(bytes)
	if err != nil {
		return err
	}
	if s.Owner != ctx.Accounts[1].Address {
		return programs.ErrUnauthorized
	}
	amount := binary.BigEndian.Uint64(ctx.Data[1:9])
	if add {
		s.Amount += amount
	} else {
		if s.Amount < amount {
			return programs.ErrInvalidData
		}
		s.Amount -= amount
	}
	return ctx.State.Put(ctx.Accounts[0].Address, s.Encode())
}

// claim: accounts[0]=stakeAcct(writable), accounts[1]=owner(signer).
func (p *Program) claim(ctx *programs.Context) error {
	if err := ctx.ChargeGas(CostClaimRewards); err != nil {
		return err
	}
	if len(ctx.Accounts) < 2 {
		return programs.ErrInvalidData
	}
	if !ctx.Accounts[1].IsSigner {
		return programs.ErrUnauthorized
	}
	bytes, ok := ctx.State.Get(ctx.Accounts[0].Address)
	if !ok {
		return programs.ErrAccountMissing
	}
	s, err := DecodeStake(bytes)
	if err != nil {
		return err
	}
	if s.Owner != ctx.Accounts[1].Address {
		return programs.ErrUnauthorized
	}
	s.Rewards = 0
	return ctx.State.Put(ctx.Accounts[0].Address, s.Encode())
}
