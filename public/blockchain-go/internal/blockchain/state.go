package blockchain

import (
	"errors"
	"math/big"
	"sync"

	"chaincore/internal/storage"
)

// Account represents a dual-coin account
type Account struct {
	Address     [20]byte
	Nonce       uint64
	BalanceGYDS *big.Int
	BalanceGYD  *big.Int
	CodeHash    [32]byte
	Storage     map[[32]byte][32]byte

	StakedGYDS *big.Int
	StakeTime  uint64
}

// StateDB manages accounts and blockchain state
type StateDB struct {
	db       storage.Database
	accounts map[[20]byte]*Account
	dirty    map[[20]byte]bool
	mu       sync.RWMutex

	snapshots  []stateSnapshot
	nextSnapID int
}

type stateSnapshot struct {
	id       int
	accounts map[[20]byte]*Account
}

// NewStateDB creates a new state database
func NewStateDB(db storage.Database) *StateDB {
	return &StateDB{
		db:        db,
		accounts:  make(map[[20]byte]*Account),
		dirty:     make(map[[20]byte]bool),
		snapshots: []stateSnapshot{},
	}
}

// ========== Account Operations ==========

func (s *StateDB) GetAccount(addr [20]byte) *Account {
	s.mu.RLock()
	if acc, ok := s.accounts[addr]; ok {
		s.mu.RUnlock()
		return acc
	}
	s.mu.RUnlock()

	s.mu.Lock()
	defer s.mu.Unlock()
	if acc, ok := s.accounts[addr]; ok {
		return acc
	}
	acc := s.loadOrCreateAccount(addr)
	s.accounts[addr] = acc
	return acc
}

func (s *StateDB) loadOrCreateAccount(addr [20]byte) *Account {
	key := append([]byte("account:"), addr[:]...)
	data, err := s.db.Get(key)
	if err == nil && data != nil {
		return s.deserializeAccount(data)
	}
	return &Account{
		Address:     addr,
		Nonce:       0,
		BalanceGYDS: big.NewInt(0),
		BalanceGYD:  big.NewInt(0),
		StakedGYDS:  big.NewInt(0),
		Storage:     make(map[[32]byte][32]byte),
	}
}

// ========== GYDS Operations ==========

func (s *StateDB) SetBalanceGYDS(addr [20]byte, amount *big.Int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	acc := s.getOrCreateAccount(addr)
	acc.BalanceGYDS = new(big.Int).Set(amount)
	s.dirty[addr] = true
}

func (s *StateDB) AddBalanceGYDS(addr [20]byte, amount *big.Int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	acc := s.getOrCreateAccount(addr)
	acc.BalanceGYDS.Add(acc.BalanceGYDS, amount)
	s.dirty[addr] = true
}

func (s *StateDB) SubBalanceGYDS(addr [20]byte, amount *big.Int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	acc := s.getOrCreateAccount(addr)
	if acc.BalanceGYDS.Cmp(amount) < 0 {
		return errors.New("insufficient GYDS")
	}
	acc.BalanceGYDS.Sub(acc.BalanceGYDS, amount)
	s.dirty[addr] = true
	return nil
}

func (s *StateDB) GetBalanceGYDS(addr [20]byte) *big.Int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if acc, ok := s.accounts[addr]; ok {
		return new(big.Int).Set(acc.BalanceGYDS)
	}
	return big.NewInt(0)
}

// ========== GYD Operations ==========

func (s *StateDB) SetBalanceGYD(addr [20]byte, amount *big.Int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	acc := s.getOrCreateAccount(addr)
	acc.BalanceGYD = new(big.Int).Set(amount)
	s.dirty[addr] = true
}

func (s *StateDB) AddBalanceGYD(addr [20]byte, amount *big.Int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	acc := s.getOrCreateAccount(addr)
	acc.BalanceGYD.Add(acc.BalanceGYD, amount)
	s.dirty[addr] = true
}

func (s *StateDB) SubBalanceGYD(addr [20]byte, amount *big.Int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	acc := s.getOrCreateAccount(addr)
	if acc.BalanceGYD.Cmp(amount) < 0 {
		return errors.New("insufficient GYD")
	}
	acc.BalanceGYD.Sub(acc.BalanceGYD, amount)
	s.dirty[addr] = true
	return nil
}

func (s *StateDB) GetBalanceGYD(addr [20]byte) *big.Int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if acc, ok := s.accounts[addr]; ok {
		return new(big.Int).Set(acc.BalanceGYD)
	}
	return big.NewInt(0)
}

// ========== Staking Operations ==========

func (s *StateDB) Stake(addr [20]byte, amount *big.Int, ts uint64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	acc := s.getOrCreateAccount(addr)
	if acc.BalanceGYDS.Cmp(amount) < 0 {
		return errors.New("insufficient GYDS")
	}
	acc.BalanceGYDS.Sub(acc.BalanceGYDS, amount)
	acc.StakedGYDS.Add(acc.StakedGYDS, amount)
	acc.StakeTime = ts
	s.dirty[addr] = true
	return nil
}

func (s *StateDB) Unstake(addr [20]byte, amount *big.Int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	acc := s.getOrCreateAccount(addr)
	if acc.StakedGYDS.Cmp(amount) < 0 {
		return errors.New("insufficient staked GYDS")
	}
	acc.StakedGYDS.Sub(acc.StakedGYDS, amount)
	acc.BalanceGYDS.Add(acc.BalanceGYDS, amount)
	s.dirty[addr] = true
	return nil
}

func (s *StateDB) GetStakedGYDS(addr [20]byte) *big.Int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if acc, ok := s.accounts[addr]; ok {
		return new(big.Int).Set(acc.StakedGYDS)
	}
	return big.NewInt(0)
}

// ========== Nonce Operations ==========

func (s *StateDB) IncrementNonce(addr [20]byte) {
	s.mu.Lock()
	defer s.mu.Unlock()
	acc := s.getOrCreateAccount(addr)
	acc.Nonce++
	s.dirty[addr] = true
}

func (s *StateDB) GetNonce(addr [20]byte) uint64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if acc, ok := s.accounts[addr]; ok {
		return acc.Nonce
	}
	return 0
}

func (s *StateDB) ValidateNonce(addr [20]byte, nonce uint64) error {
	s.mu.RLock()
	defer s.mu.RUnlock()
	acc := s.accounts[addr]
	if acc == nil {
		if nonce != 0 {
			return errors.New("first tx must have nonce 0")
		}
		return nil
	}
	if nonce != acc.Nonce {
		return errors.New("invalid nonce")
	}
	return nil
}

// ========== Persistence ==========

func (s *StateDB) Commit() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	batch := s.db.NewBatch()
	for addr := range s.dirty {
		acc := s.accounts[addr]
		data := s.serializeAccount(acc)
		key := append([]byte("account:"), addr[:]...)
		if err := batch.Put(key, data); err != nil {
			return err
		}
	}
	if err := batch.Write(); err != nil {
		return err
	}
	s.dirty = make(map[[20]byte]bool)
	return nil
}

// ========== Snapshots ==========

func (s *StateDB) Snapshot() int {
	s.mu.Lock()
	defer s.mu.Unlock()

	id := s.nextSnapID
	s.nextSnapID++

	snap := stateSnapshot{
		id:       id,
		accounts: make(map[[20]byte]*Account),
	}
	for addr, acc := range s.accounts {
		snap.accounts[addr] = s.copyAccount(acc)
	}
	s.snapshots = append(s.snapshots, snap)
	return id
}

func (s *StateDB) RevertToSnapshot(id int) {
	s.mu.Lock()
	defer s.mu.Unlock()

	idx := -1
	for i, snap := range s.snapshots {
		if snap.id == id {
			idx = i
			break
		}
	}
	if idx == -1 {
		return
	}

	s.accounts = s.snapshots[idx].accounts
	s.snapshots = s.snapshots[:idx]
	s.dirty = make(map[[20]byte]bool)
	for addr := range s.accounts {
		s.dirty[addr] = true
	}
}

// ========== Helpers ==========

func (s *StateDB) getOrCreateAccount(addr [20]byte) *Account {
	if acc, ok := s.accounts[addr]; ok {
		return acc
	}
	acc := &Account{
		Address:     addr,
		BalanceGYDS: big.NewInt(0),
		BalanceGYD:  big.NewInt(0),
		StakedGYDS:  big.NewInt(0),
		Storage:     make(map[[32]byte][32]byte),
	}
	s.accounts[addr] = acc
	return acc
}

func (s *StateDB) copyAccount(acc *Account) *Account {
	newAcc := &Account{
		Address:     acc.Address,
		Nonce:       acc.Nonce,
		BalanceGYDS: new(big.Int).Set(acc.BalanceGYDS),
		BalanceGYD:  new(big.Int).Set(acc.BalanceGYD),
		CodeHash:    acc.CodeHash,
		Storage:     make(map[[32]byte][32]byte),
		StakedGYDS:  new(big.Int).Set(acc.StakedGYDS),
		StakeTime:   acc.StakeTime,
	}
	for k, v := range acc.Storage {
		newAcc.Storage[k] = v
	}
	return newAcc
}

func (s *StateDB) serializeAccount(acc *Account) []byte {
	data := []byte{}
	data = append(data, acc.Address[:]...)
	data = append(data, acc.BalanceGYDS.Bytes()...)
	data = append(data, acc.BalanceGYD.Bytes()...)
	data = append(data, acc.StakedGYDS.Bytes()...)
	return data
}

func (s *StateDB) deserializeAccount(data []byte) *Account {
	var addr [20]byte
	copy(addr[:], data[:20])
	return &Account{
		Address:     addr,
		BalanceGYDS: new(big.Int).SetBytes(data[20:]),
		BalanceGYD:  big.NewInt(0),
		StakedGYDS:  big.NewInt(0),
		Storage:     make(map[[32]byte][32]byte),
	}
}
