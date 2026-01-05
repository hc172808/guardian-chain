// Package blockchain - State management for accounts and contracts
package blockchain

import (
	"errors"
	"math/big"
	"sync"

	"chaincore/internal/storage"
)

// Account represents an account in the state
type Account struct {
	Address  [20]byte
	Nonce    uint64
	Balance  *big.Int
	CodeHash [32]byte // For contracts
	Storage  map[[32]byte][32]byte
}

// StateDB manages the blockchain state
type StateDB struct {
	db       storage.Database
	accounts map[[20]byte]*Account
	dirty    map[[20]byte]bool
	mu       sync.RWMutex
}

// NewStateDB creates a new state database
func NewStateDB(db storage.Database) (*StateDB, error) {
	return &StateDB{
		db:       db,
		accounts: make(map[[20]byte]*Account),
		dirty:    make(map[[20]byte]bool),
	}, nil
}

// GetAccount retrieves an account, creating if not exists
func (s *StateDB) GetAccount(addr [20]byte) *Account {
	s.mu.RLock()
	if acc, exists := s.accounts[addr]; exists {
		s.mu.RUnlock()
		return acc
	}
	s.mu.RUnlock()

	s.mu.Lock()
	defer s.mu.Unlock()

	// Load from database or create new
	acc := &Account{
		Address: addr,
		Nonce:   0,
		Balance: big.NewInt(0),
		Storage: make(map[[32]byte][32]byte),
	}
	s.accounts[addr] = acc
	return acc
}

// SetBalance sets the balance of an account
func (s *StateDB) SetBalance(addr [20]byte, balance *big.Int) {
	s.mu.Lock()
	defer s.mu.Unlock()

	acc := s.getOrCreateAccount(addr)
	acc.Balance = new(big.Int).Set(balance)
	s.dirty[addr] = true
}

// AddBalance adds to the balance of an account
func (s *StateDB) AddBalance(addr [20]byte, amount *big.Int) {
	s.mu.Lock()
	defer s.mu.Unlock()

	acc := s.getOrCreateAccount(addr)
	acc.Balance = new(big.Int).Add(acc.Balance, amount)
	s.dirty[addr] = true
}

// SubBalance subtracts from the balance of an account
func (s *StateDB) SubBalance(addr [20]byte, amount *big.Int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	acc := s.getOrCreateAccount(addr)
	if acc.Balance.Cmp(amount) < 0 {
		return errors.New("insufficient balance")
	}
	acc.Balance = new(big.Int).Sub(acc.Balance, amount)
	s.dirty[addr] = true
	return nil
}

// IncrementNonce increments the nonce of an account
func (s *StateDB) IncrementNonce(addr [20]byte) {
	s.mu.Lock()
	defer s.mu.Unlock()

	acc := s.getOrCreateAccount(addr)
	acc.Nonce++
	s.dirty[addr] = true
}

// GetNonce returns the nonce of an account
func (s *StateDB) GetNonce(addr [20]byte) uint64 {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if acc, exists := s.accounts[addr]; exists {
		return acc.Nonce
	}
	return 0
}

// ValidateNonce validates a transaction nonce
func (s *StateDB) ValidateNonce(addr [20]byte, nonce uint64) error {
	s.mu.RLock()
	defer s.mu.RUnlock()

	acc := s.accounts[addr]
	if acc == nil {
		if nonce != 0 {
			return errors.New("first transaction must have nonce 0")
		}
		return nil
	}

	if nonce != acc.Nonce {
		return errors.New("invalid nonce: must be sequential")
	}
	return nil
}

// Commit persists all dirty accounts to the database
func (s *StateDB) Commit() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for addr := range s.dirty {
		acc := s.accounts[addr]
		if err := s.persistAccount(acc); err != nil {
			return err
		}
	}
	s.dirty = make(map[[20]byte]bool)
	return nil
}

// Snapshot creates a state snapshot for rollback
func (s *StateDB) Snapshot() int {
	// Implement snapshot for transaction rollback
	return 0
}

// RevertToSnapshot reverts to a previous snapshot
func (s *StateDB) RevertToSnapshot(id int) {
	// Implement rollback
}

// Helper functions
func (s *StateDB) getOrCreateAccount(addr [20]byte) *Account {
	if acc, exists := s.accounts[addr]; exists {
		return acc
	}
	acc := &Account{
		Address: addr,
		Nonce:   0,
		Balance: big.NewInt(0),
		Storage: make(map[[32]byte][32]byte),
	}
	s.accounts[addr] = acc
	return acc
}

func (s *StateDB) persistAccount(acc *Account) error {
	// Serialize and save to database
	return nil
}
