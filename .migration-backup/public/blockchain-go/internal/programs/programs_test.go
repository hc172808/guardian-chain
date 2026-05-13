// Smoke tests for the GPL scaffolding (GPL-A1..A5 + B1..B2). These verify
// the registry/dispatch path, gas accounting, and sandbox limits — they do
// NOT yet exercise the chain-state adapter (that lands with GPL wiring).
package programs_test

import (
	"encoding/binary"
	"testing"

	"chaincore/internal/programs"
	"chaincore/internal/programs/accounts"
	"chaincore/internal/programs/registry"
	"chaincore/internal/programs/staking"
	"chaincore/internal/programs/system"
	"chaincore/internal/programs/token"
	"chaincore/internal/programs/vm"
)

// memState is an in-memory AccountView used only for tests.
type memState struct {
	data  map[programs.Address][]byte
	owner map[programs.Address]programs.Address
}

func newMemState() *memState {
	return &memState{
		data:  make(map[programs.Address][]byte),
		owner: make(map[programs.Address]programs.Address),
	}
}

func (m *memState) Get(addr programs.Address) ([]byte, bool) {
	b, ok := m.data[addr]
	return b, ok
}
func (m *memState) Put(addr programs.Address, data []byte) error {
	m.data[addr] = data
	return nil
}
func (m *memState) Owner(addr programs.Address) (programs.Address, bool) {
	o, ok := m.owner[addr]
	return o, ok
}
func (m *memState) SetOwner(addr programs.Address, owner programs.Address) error {
	m.owner[addr] = owner
	return nil
}

func TestRegistry_Dispatch(t *testing.T) {
	r := registry.New()
	programs.MustRegister(r, system.New())
	programs.MustRegister(r, token.New())
	programs.MustRegister(r, staking.New())

	for _, id := range []programs.Address{system.ProgramID, token.ProgramID, staking.ProgramID} {
		if _, ok := r.Lookup(id); !ok {
			t.Fatalf("program %x not registered", id)
		}
	}

	// Unknown program id should fail dispatch with ErrUnknownProgram.
	ctx := &programs.Context{State: newMemState(), GasLeft: 10_000}
	err := r.Dispatch(ctx, programs.Instruction{ProgramID: programs.Address{0xff}})
	if err != programs.ErrUnknownProgram {
		t.Fatalf("want ErrUnknownProgram, got %v", err)
	}
}

func TestSystem_CreateAccount(t *testing.T) {
	r := registry.New()
	programs.MustRegister(r, system.New())

	state := newMemState()
	funder := programs.Address{0x01}
	target := programs.Address{0x02}
	owner := system.ProgramID

	data := append([]byte{system.OpCreateAccount}, owner[:]...)
	ctx := &programs.Context{State: state, GasLeft: 10_000}
	err := r.Dispatch(ctx, programs.Instruction{
		ProgramID: system.ProgramID,
		Accounts: []programs.AccountMeta{
			{Address: funder, IsSigner: true},
			{Address: target, IsWritable: true},
		},
		Data: data,
	})
	if err != nil {
		t.Fatalf("create account: %v", err)
	}
	if _, ok := state.Get(target); !ok {
		t.Fatalf("target not created")
	}
	if got, _ := state.Owner(target); got != owner {
		t.Fatalf("owner not set, got %x", got)
	}
}

func TestToken_MintAndTransfer(t *testing.T) {
	r := registry.New()
	programs.MustRegister(r, token.New())

	state := newMemState()
	mintAddr := programs.Address{0x10}
	authority := programs.Address{0x11}
	holderA := programs.Address{0x12}
	holderB := programs.Address{0x13}

	// Init mint with 6 decimals, no freeze authority.
	initData := append([]byte{token.OpInitMint, 6}, make([]byte, 20)...)
	ctx := &programs.Context{State: state, GasLeft: 100_000}
	if err := r.Dispatch(ctx, programs.Instruction{
		ProgramID: token.ProgramID,
		Accounts: []programs.AccountMeta{
			{Address: mintAddr, IsWritable: true},
			{Address: authority, IsSigner: true},
		},
		Data: initData,
	}); err != nil {
		t.Fatalf("init mint: %v", err)
	}

	// Mint 1000 to holderA.
	mintData := []byte{token.OpMintTo, 0, 0, 0, 0, 0, 0, 0, 0}
	binary.BigEndian.PutUint64(mintData[1:], 1000)
	if err := r.Dispatch(ctx, programs.Instruction{
		ProgramID: token.ProgramID,
		Accounts: []programs.AccountMeta{
			{Address: mintAddr, IsWritable: true},
			{Address: holderA, IsWritable: true},
			{Address: authority, IsSigner: true},
		},
		Data: mintData,
	}); err != nil {
		t.Fatalf("mint to: %v", err)
	}

	// Transfer 400 A→B.
	xferData := []byte{token.OpTransfer, 0, 0, 0, 0, 0, 0, 0, 0}
	binary.BigEndian.PutUint64(xferData[1:], 400)
	if err := r.Dispatch(ctx, programs.Instruction{
		ProgramID: token.ProgramID,
		Accounts: []programs.AccountMeta{
			{Address: holderA, IsSigner: true, IsWritable: true},
			{Address: holderB, IsWritable: true},
		},
		Data: xferData,
	}); err != nil {
		t.Fatalf("transfer: %v", err)
	}

	a, _ := token.DecodeTokenAccount(state.data[holderA])
	b, _ := token.DecodeTokenAccount(state.data[holderB])
	if a.Amount != 600 || b.Amount != 400 {
		t.Fatalf("balances wrong: a=%d b=%d", a.Amount, b.Amount)
	}
}

func TestVM_OutOfGas(t *testing.T) {
	// Push 1, push 2, add, halt — costs 1+2+2+0 = 5 + dispatch overhead.
	code := []byte{vm.OpPushU8, 1, vm.OpPushU8, 2, vm.OpAdd, vm.OpHalt}
	ctx := &programs.Context{State: newMemState(), GasLeft: 3} // not enough
	if _, err := vm.Run(ctx, code); err != programs.ErrOutOfGas {
		t.Fatalf("want ErrOutOfGas, got %v", err)
	}
}

func TestVM_HaltsCleanly(t *testing.T) {
	code := []byte{vm.OpPushU8, 1, vm.OpPushU8, 2, vm.OpAdd, vm.OpHalt}
	ctx := &programs.Context{State: newMemState(), GasLeft: 100}
	res, err := vm.Run(ctx, code)
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if !res.Halted || len(res.Stack) != 1 || res.Stack[0] != 3 {
		t.Fatalf("bad result: %+v", res)
	}
}

func TestPDA_Deterministic(t *testing.T) {
	a := accounts.DerivePDA(token.ProgramID, []byte("mint"), []byte("gyds"))
	b := accounts.DerivePDA(token.ProgramID, []byte("mint"), []byte("gyds"))
	if a != b {
		t.Fatalf("PDA must be deterministic")
	}
	c := accounts.DerivePDA(token.ProgramID, []byte("mint"), []byte("other"))
	if a == c {
		t.Fatalf("different seeds must yield different PDAs")
	}
}

func TestRegistry_AllowDeploy(t *testing.T) {
	r := registry.New()
	dev := programs.Address{0xaa}
	if r.CanDeploy(dev) {
		t.Fatalf("should default-deny")
	}
	r.AllowDeploy(dev)
	if !r.CanDeploy(dev) {
		t.Fatalf("whitelist failed")
	}
}
