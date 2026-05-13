// Package registry implements GPL-B1: the program registry / dispatcher.
// Only registered programs can be invoked. Contract deploys gated to
// developer/admin/founder addresses via AllowDeploy().
package registry

import (
	"sync"

	"chaincore/internal/programs"
)

// DefaultGasPerCall is charged before any program code runs (covers dispatch).
const DefaultGasPerCall uint64 = 100

// Registry is an in-memory program registry. Safe for concurrent use.
type Registry struct {
	mu       sync.RWMutex
	programs map[programs.Address]programs.Program
	devs     map[programs.Address]bool // contract-deploy whitelist (GPL-B1)
}

// New creates an empty registry.
func New() *Registry {
	return &Registry{
		programs: make(map[programs.Address]programs.Program),
		devs:     make(map[programs.Address]bool),
	}
}

// Register adds a program. Returns programs.ErrAlreadyExists on collision.
func (r *Registry) Register(p programs.Program) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.programs[p.ID()]; ok {
		return programs.ErrAlreadyExists
	}
	r.programs[p.ID()] = p
	return nil
}

// Lookup returns the program for the given ID.
func (r *Registry) Lookup(id programs.Address) (programs.Program, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	p, ok := r.programs[id]
	return p, ok
}

// Dispatch routes an instruction to its program with a gas pre-charge.
func (r *Registry) Dispatch(ctx *programs.Context, ix programs.Instruction) error {
	if err := ctx.ChargeGas(DefaultGasPerCall); err != nil {
		return err
	}
	p, ok := r.Lookup(ix.ProgramID)
	if !ok {
		return programs.ErrUnknownProgram
	}
	ctx.Accounts = ix.Accounts
	ctx.Data = ix.Data
	return p.Execute(ctx)
}

// AllowDeploy whitelists an address for contract deployment (GPL-B1).
func (r *Registry) AllowDeploy(addr programs.Address) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.devs[addr] = true
}

// CanDeploy reports whether addr may deploy a contract.
func (r *Registry) CanDeploy(addr programs.Address) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.devs[addr]
}
