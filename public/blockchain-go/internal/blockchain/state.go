// Package blockchain - State management for dual-coin accounts
// Each account has separate balances for GYDS (gas) and GYD (stablecoin)
package blockchain

import (
        "errors"
        "math/big"
        "sync"

        "chaincore/internal/storage"
)

// Account represents an account with dual-coin balances
type Account struct {
        Address     [20]byte
        Nonce       uint64
        BalanceGYDS *big.Int            // Gas/staking coin
        BalanceGYD  *big.Int            // Stablecoin (user money)
        CodeHash    [32]byte            // For contracts
        Storage     map[[32]byte][32]byte
        
        // Staking info (for validators)
        StakedGYDS  *big.Int
        StakeTime   uint64
}

// StateDB manages the blockchain state with dual-coin support
type StateDB struct {
        db       storage.Database
        accounts map[[20]byte]*Account
        dirty    map[[20]byte]bool
        mu       sync.RWMutex
        
        // Snapshots for rollback
        snapshots []stateSnapshot
        nextSnapID int
}

type stateSnapshot struct {
        id       int
        accounts map[[20]byte]*Account
}

// NewStateDB creates a new state database
func NewStateDB(db storage.Database) (*StateDB, error) {
        return &StateDB{
                db:        db,
                accounts:  make(map[[20]byte]*Account),
                dirty:     make(map[[20]byte]bool),
                snapshots: make([]stateSnapshot, 0),
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

        // Double-check after acquiring write lock
        if acc, exists := s.accounts[addr]; exists {
                return acc
        }

        // Load from database or create new
        acc := s.loadOrCreateAccount(addr)
        s.accounts[addr] = acc
        return acc
}

func (s *StateDB) loadOrCreateAccount(addr [20]byte) *Account {
        // Try to load from database
        key := append([]byte("account:"), addr[:]...)
        data, err := s.db.Get(key)
        if err == nil && data != nil {
                return s.deserializeAccount(data)
        }

        // Create new account with zero balances
        return &Account{
                Address:     addr,
                Nonce:       0,
                BalanceGYDS: big.NewInt(0),
                BalanceGYD:  big.NewInt(0),
                Storage:     make(map[[32]byte][32]byte),
                StakedGYDS:  big.NewInt(0),
        }
}

// ========== GYDS Balance Operations (Gas/Staking Coin) ==========

// SetBalanceGYDS sets the GYDS balance of an account
func (s *StateDB) SetBalanceGYDS(addr [20]byte, balance *big.Int) {
        s.mu.Lock()
        defer s.mu.Unlock()

        acc := s.getOrCreateAccount(addr)
        acc.BalanceGYDS = new(big.Int).Set(balance)
        s.dirty[addr] = true
}

// AddBalanceGYDS adds to the GYDS balance of an account
func (s *StateDB) AddBalanceGYDS(addr [20]byte, amount *big.Int) {
        s.mu.Lock()
        defer s.mu.Unlock()

        acc := s.getOrCreateAccount(addr)
        acc.BalanceGYDS = new(big.Int).Add(acc.BalanceGYDS, amount)
        s.dirty[addr] = true
}

// SubBalanceGYDS subtracts from the GYDS balance
func (s *StateDB) SubBalanceGYDS(addr [20]byte, amount *big.Int) error {
        s.mu.Lock()
        defer s.mu.Unlock()

        acc := s.getOrCreateAccount(addr)
        if acc.BalanceGYDS.Cmp(amount) < 0 {
                return errors.New("insufficient GYDS balance")
        }
        acc.BalanceGYDS = new(big.Int).Sub(acc.BalanceGYDS, amount)
        s.dirty[addr] = true
        return nil
}

// GetBalanceGYDS returns the GYDS balance
func (s *StateDB) GetBalanceGYDS(addr [20]byte) *big.Int {
        s.mu.RLock()
        defer s.mu.RUnlock()

        if acc, exists := s.accounts[addr]; exists {
                return new(big.Int).Set(acc.BalanceGYDS)
        }
        return big.NewInt(0)
}

// ========== GYD Balance Operations (Stablecoin) ==========

// SetBalanceGYD sets the GYD balance of an account
func (s *StateDB) SetBalanceGYD(addr [20]byte, balance *big.Int) {
        s.mu.Lock()
        defer s.mu.Unlock()

        acc := s.getOrCreateAccount(addr)
        acc.BalanceGYD = new(big.Int).Set(balance)
        s.dirty[addr] = true
}

// AddBalanceGYD adds to the GYD balance of an account
func (s *StateDB) AddBalanceGYD(addr [20]byte, amount *big.Int) {
        s.mu.Lock()
        defer s.mu.Unlock()

        acc := s.getOrCreateAccount(addr)
        acc.BalanceGYD = new(big.Int).Add(acc.BalanceGYD, amount)
        s.dirty[addr] = true
}

// SubBalanceGYD subtracts from the GYD balance
func (s *StateDB) SubBalanceGYD(addr [20]byte, amount *big.Int) error {
        s.mu.Lock()
        defer s.mu.Unlock()

        acc := s.getOrCreateAccount(addr)
        if acc.BalanceGYD.Cmp(amount) < 0 {
                return errors.New("insufficient GYD balance")
        }
        acc.BalanceGYD = new(big.Int).Sub(acc.BalanceGYD, amount)
        s.dirty[addr] = true
        return nil
}

// GetBalanceGYD returns the GYD balance
func (s *StateDB) GetBalanceGYD(addr [20]byte) *big.Int {
        s.mu.RLock()
        defer s.mu.RUnlock()

        if acc, exists := s.accounts[addr]; exists {
                return new(big.Int).Set(acc.BalanceGYD)
        }
        return big.NewInt(0)
}

// ========== Staking Operations (GYDS only) ==========

// Stake moves GYDS from balance to staked
func (s *StateDB) Stake(addr [20]byte, amount *big.Int, timestamp uint64) error {
        s.mu.Lock()
        defer s.mu.Unlock()

        acc := s.getOrCreateAccount(addr)
        if acc.BalanceGYDS.Cmp(amount) < 0 {
                return errors.New("insufficient GYDS for staking")
        }

        acc.BalanceGYDS = new(big.Int).Sub(acc.BalanceGYDS, amount)
        acc.StakedGYDS = new(big.Int).Add(acc.StakedGYDS, amount)
        acc.StakeTime = timestamp
        s.dirty[addr] = true
        return nil
}

// Unstake moves GYDS from staked back to balance
func (s *StateDB) Unstake(addr [20]byte, amount *big.Int) error {
        s.mu.Lock()
        defer s.mu.Unlock()

        acc := s.getOrCreateAccount(addr)
        if acc.StakedGYDS.Cmp(amount) < 0 {
                return errors.New("insufficient staked GYDS")
        }

        acc.StakedGYDS = new(big.Int).Sub(acc.StakedGYDS, amount)
        acc.BalanceGYDS = new(big.Int).Add(acc.BalanceGYDS, amount)
        s.dirty[addr] = true
        return nil
}

// GetStakedGYDS returns the staked GYDS amount
func (s *StateDB) GetStakedGYDS(addr [20]byte) *big.Int {
        s.mu.RLock()
        defer s.mu.RUnlock()

        if acc, exists := s.accounts[addr]; exists {
                return new(big.Int).Set(acc.StakedGYDS)
        }
        return big.NewInt(0)
}

// ========== Nonce Operations ==========

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

// ========== Persistence ==========

// Commit persists all dirty accounts to the database
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

// ========== Snapshots for Transaction Rollback ==========

// Snapshot creates a state snapshot for rollback
func (s *StateDB) Snapshot() int {
        s.mu.Lock()
        defer s.mu.Unlock()

        id := s.nextSnapID
        s.nextSnapID++

        // Deep copy current accounts
        snapshot := stateSnapshot{
                id:       id,
                accounts: make(map[[20]byte]*Account),
        }

        for addr, acc := range s.accounts {
                snapshot.accounts[addr] = s.copyAccount(acc)
        }

        s.snapshots = append(s.snapshots, snapshot)
        return id
}

// RevertToSnapshot reverts to a previous snapshot
func (s *StateDB) RevertToSnapshot(id int) {
        s.mu.Lock()
        defer s.mu.Unlock()

        // Find snapshot
        var snapIdx int = -1
        for i, snap := range s.snapshots {
                if snap.id == id {
                        snapIdx = i
                        break
                }
        }

        if snapIdx == -1 {
                return
        }

        // Restore accounts
        s.accounts = s.snapshots[snapIdx].accounts
        
        // Remove this and newer snapshots
        s.snapshots = s.snapshots[:snapIdx]
        
        // Mark all as dirty to force re-persistence
        s.dirty = make(map[[20]byte]bool)
        for addr := range s.accounts {
                s.dirty[addr] = true
        }
}

// ========== Helper Functions ==========

func (s *StateDB) getOrCreateAccount(addr [20]byte) *Account {
        if acc, exists := s.accounts[addr]; exists {
                return acc
        }
        acc := &Account{
                Address:     addr,
                Nonce:       0,
                BalanceGYDS: big.NewInt(0),
                BalanceGYD:  big.NewInt(0),
                Storage:     make(map[[32]byte][32]byte),
                StakedGYDS:  big.NewInt(0),
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
        // Simple serialization - in production use RLP or protobuf
        data := make([]byte, 0, 256)
        data = append(data, acc.Address[:]...)
        data = append(data, uint64ToBytes(acc.Nonce)...)
        data = append(data, acc.BalanceGYDS.Bytes()...)
        data = append(data, acc.BalanceGYD.Bytes()...)
        data = append(data, acc.StakedGYDS.Bytes()...)
        return data
}

func (s *StateDB) deserializeAccount(data []byte) *Account {
        // Simple deserialization
        if len(data) < 28 {
                return s.loadOrCreateAccount([20]byte{})
        }
        
        var addr [20]byte
        copy(addr[:], data[:20])
        
        return &Account{
                Address:     addr,
                Nonce:       bytesToUint64(data[20:28]),
                BalanceGYDS: new(big.Int).SetBytes(data[28:]),
                BalanceGYD:  big.NewInt(0),
                Storage:     make(map[[32]byte][32]byte),
                StakedGYDS:  big.NewInt(0),
        }
}

// uint64ToBytes is defined in blockchain.go

// SetBalance dispatches to the per-coin setter.
func (s *StateDB) SetBalance(addr [20]byte, coin CoinType, balance *big.Int) {
        if coin == CoinGYDS {
                s.SetBalanceGYDS(addr, balance)
        } else {
                s.SetBalanceGYD(addr, balance)
        }
}

// AddBalance dispatches to the per-coin adder.
func (s *StateDB) AddBalance(addr [20]byte, coin CoinType, amount *big.Int) {
        if coin == CoinGYDS {
                s.AddBalanceGYDS(addr, amount)
        } else {
                s.AddBalanceGYD(addr, amount)
        }
}

// SubBalance dispatches to the per-coin subtractor.
func (s *StateDB) SubBalance(addr [20]byte, coin CoinType, amount *big.Int) error {
        if coin == CoinGYDS {
                return s.SubBalanceGYDS(addr, amount)
        }
        return s.SubBalanceGYD(addr, amount)
}

// AddStake stakes GYDS for a validator.
func (s *StateDB) AddStake(addr [20]byte, amount *big.Int) error {
        return s.Stake(addr, amount, 0)
}

// SubStake unstakes GYDS for a validator.
func (s *StateDB) SubStake(addr [20]byte, amount *big.Int) error {
        return s.Unstake(addr, amount)
}

func bytesToUint64(b []byte) uint64 {
        if len(b) < 8 {
                return 0
        }
        return uint64(b[0])<<56 | uint64(b[1])<<48 | uint64(b[2])<<40 | uint64(b[3])<<32 |
                uint64(b[4])<<24 | uint64(b[5])<<16 | uint64(b[6])<<8 | uint64(b[7])
}

// ========== State Queries for Indexer ==========

// GetAllAccounts returns all accounts (for indexer sync)
func (s *StateDB) GetAllAccounts() []*Account {
        s.mu.RLock()
        defer s.mu.RUnlock()

        accounts := make([]*Account, 0, len(s.accounts))
        for _, acc := range s.accounts {
                accounts = append(accounts, s.copyAccount(acc))
        }
        return accounts
}

// GetAccountCount returns total number of accounts
func (s *StateDB) GetAccountCount() int {
        s.mu.RLock()
        defer s.mu.RUnlock()
        return len(s.accounts)
}
