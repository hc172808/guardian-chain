// Package vm implements GPL-A5 + GPL-B2: a sandboxed deterministic VM
// for user-deployed contracts. This is a constrained byte-code interpreter
// (the WASM/wazero path is deliberately deferred to phase 2).
//
// Strict determinism rules enforced:
//   - No host clock, no randomness, no I/O.
//   - Hard memory ceiling per call.
//   - Hard gas ceiling per call.
//   - No syscalls — only the published opcode set.
//
// Programs deployed through this VM are stored as opaque byte-code and
// invoked via the contract registry (see internal/programs/registry).
package vm

import (
	"encoding/binary"

	"chaincore/internal/programs"
)

// Limits — tuned conservatively so a buggy contract cannot DOS a node.
const (
	MaxMemoryBytes  uint64 = 64 * 1024 // 64 KiB per call
	MaxStackDepth   int    = 1024
	MaxInstructions uint64 = 1_000_000
)

// Opcodes — minimal stack machine. Extend deliberately.
const (
	OpHalt   byte = 0x00
	OpPushU8 byte = 0x01 // [op, val]
	OpPushU64 byte = 0x02 // [op, val(8 BE)]
	OpPop    byte = 0x03
	OpAdd    byte = 0x10
	OpSub    byte = 0x11
	OpMul    byte = 0x12
	OpDiv    byte = 0x13
	OpEq     byte = 0x14
	OpJump   byte = 0x20 // [op, addr(4 BE)]
	OpJumpIf byte = 0x21 // [op, addr(4 BE)]
	OpLog    byte = 0x30 // pops u64, appends to log
)

// Per-op gas. Anything not listed is 1.
var gasTable = map[byte]uint64{
	OpHalt: 0, OpPushU8: 1, OpPushU64: 2,
	OpPop: 1, OpAdd: 2, OpSub: 2, OpMul: 4, OpDiv: 6,
	OpEq: 2, OpJump: 1, OpJumpIf: 2, OpLog: 5,
}

// Result is the execution outcome.
type Result struct {
	GasUsed uint64
	Stack   []uint64
	Logs    []uint64
	Halted  bool
}

// Run executes the program with the given gas budget. Caller passes
// ctx.GasLeft for budget; we mutate it in-place via ChargeGas.
func Run(ctx *programs.Context, code []byte) (*Result, error) {
	if uint64(len(code)) > MaxMemoryBytes {
		return nil, programs.ErrSandboxViolation
	}
	res := &Result{}
	stack := make([]uint64, 0, 64)
	var ip int
	var executed uint64

	push := func(v uint64) error {
		if len(stack) >= MaxStackDepth {
			return programs.ErrSandboxViolation
		}
		stack = append(stack, v)
		return nil
	}
	pop := func() (uint64, error) {
		if len(stack) == 0 {
			return 0, programs.ErrSandboxViolation
		}
		v := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		return v, nil
	}

	for ip < len(code) {
		if executed >= MaxInstructions {
			return nil, programs.ErrSandboxViolation
		}
		executed++
		op := code[ip]
		cost := gasTable[op]
		if cost == 0 && op != OpHalt {
			cost = 1
		}
		if err := ctx.ChargeGas(cost); err != nil {
			return nil, err
		}

		switch op {
		case OpHalt:
			res.Halted = true
			res.Stack = stack
			return res, nil
		case OpPushU8:
			if ip+1 >= len(code) {
				return nil, programs.ErrInvalidData
			}
			if err := push(uint64(code[ip+1])); err != nil {
				return nil, err
			}
			ip += 2
		case OpPushU64:
			if ip+8 >= len(code) {
				return nil, programs.ErrInvalidData
			}
			if err := push(binary.BigEndian.Uint64(code[ip+1 : ip+9])); err != nil {
				return nil, err
			}
			ip += 9
		case OpPop:
			if _, err := pop(); err != nil {
				return nil, err
			}
			ip++
		case OpAdd, OpSub, OpMul, OpDiv, OpEq:
			b, err := pop()
			if err != nil {
				return nil, err
			}
			a, err := pop()
			if err != nil {
				return nil, err
			}
			var v uint64
			switch op {
			case OpAdd:
				v = a + b
			case OpSub:
				v = a - b
			case OpMul:
				v = a * b
			case OpDiv:
				if b == 0 {
					return nil, programs.ErrInvalidData
				}
				v = a / b
			case OpEq:
				if a == b {
					v = 1
				}
			}
			if err := push(v); err != nil {
				return nil, err
			}
			ip++
		case OpJump:
			if ip+4 >= len(code) {
				return nil, programs.ErrInvalidData
			}
			ip = int(binary.BigEndian.Uint32(code[ip+1 : ip+5]))
		case OpJumpIf:
			if ip+4 >= len(code) {
				return nil, programs.ErrInvalidData
			}
			cond, err := pop()
			if err != nil {
				return nil, err
			}
			if cond != 0 {
				ip = int(binary.BigEndian.Uint32(code[ip+1 : ip+5]))
			} else {
				ip += 5
			}
		case OpLog:
			v, err := pop()
			if err != nil {
				return nil, err
			}
			res.Logs = append(res.Logs, v)
			ip++
		default:
			return nil, programs.ErrInvalidData
		}
	}
	res.Stack = stack
	return res, nil
}
