// Package blockchain - Transaction pool management
package blockchain

import (
	"errors"
	"math/big"
	"sort"
	"sync"
)

// TxPool manages pending transactions
type TxPool struct {
	config     Config
	pending    map[[32]byte]*Transaction
	queued     map[[20]byte][]*Transaction // Transactions waiting for nonce
	priceHeap  []*Transaction              // Sorted by gas price
	mu         sync.RWMutex
	maxSize    int
	maxPerAddr int
}

// NewTxPool creates a new transaction pool
func NewTxPool(config Config) *TxPool {
	return &TxPool{
		config:     config,
		pending:    make(map[[32]byte]*Transaction),
		queued:     make(map[[20]byte][]*Transaction),
		priceHeap:  make([]*Transaction, 0),
		maxSize:    10000,
		maxPerAddr: 100,
	}
}

// Add adds a transaction to the pool
func (tp *TxPool) Add(tx *Transaction) error {
	tp.mu.Lock()
	defer tp.mu.Unlock()

	// Check if transaction already exists
	if _, exists := tp.pending[tx.Hash]; exists {
		return errors.New("transaction already in pool")
	}

	// Check pool size
	if len(tp.pending) >= tp.maxSize {
		// Remove lowest gas price transaction
		if len(tp.priceHeap) > 0 && tx.GasPrice > tp.priceHeap[0].GasPrice {
			tp.removeLowPriceTx()
		} else {
			return errors.New("transaction pool full")
		}
	}

	// Check per-address limit
	if len(tp.queued[tx.From]) >= tp.maxPerAddr {
		return errors.New("too many pending transactions from address")
	}

	// Add to pending
	tp.pending[tx.Hash] = tx
	tp.queued[tx.From] = append(tp.queued[tx.From], tx)

	// Add to price heap
	tp.insertByPrice(tx)

	return nil
}

// Get retrieves a transaction by hash
func (tp *TxPool) Get(hash [32]byte) *Transaction {
	tp.mu.RLock()
	defer tp.mu.RUnlock()
	return tp.pending[hash]
}

// GetPending returns transactions ready for inclusion
func (tp *TxPool) GetPending(maxCount int, maxGas uint64) []*Transaction {
	tp.mu.RLock()
	defer tp.mu.RUnlock()

	result := make([]*Transaction, 0, maxCount)
	gasUsed := uint64(0)

	// Get highest gas price transactions first
	for i := len(tp.priceHeap) - 1; i >= 0 && len(result) < maxCount; i-- {
		tx := tp.priceHeap[i]
		if gasUsed+tx.GasLimit > maxGas {
			continue
		}
		result = append(result, tx)
		gasUsed += tx.GasLimit
	}

	return result
}

// Remove removes a transaction from the pool
func (tp *TxPool) Remove(hash [32]byte) {
	tp.mu.Lock()
	defer tp.mu.Unlock()

	tx, exists := tp.pending[hash]
	if !exists {
		return
	}

	delete(tp.pending, hash)
	tp.removeFromQueued(tx)
	tp.removeFromPriceHeap(tx)
}

// ValidateNonceSequence validates nonce ordering for an address
func (tp *TxPool) ValidateNonceSequence(addr [20]byte, expectedNonce uint64) error {
	tp.mu.RLock()
	defer tp.mu.RUnlock()

	txs := tp.queued[addr]
	if len(txs) == 0 {
		return nil
	}

	// Sort by nonce
	sort.Slice(txs, func(i, j int) bool {
		return txs[i].Nonce < txs[j].Nonce
	})

	// Validate sequence
	nonce := expectedNonce
	for _, tx := range txs {
		if tx.Nonce != nonce {
			return errors.New("nonce gap detected: missing transaction in sequence")
		}
		nonce++
	}

	return nil
}

// DetectDoubleSpend checks for double-spend attempts
func (tp *TxPool) DetectDoubleSpend(tx *Transaction, stateNonce uint64) error {
	tp.mu.RLock()
	defer tp.mu.RUnlock()

	// Check if nonce already used
	if tx.Nonce < stateNonce {
		return errors.New("double-spend attempt: nonce already used")
	}

	// Check for conflicting transaction with same nonce
	for _, existing := range tp.queued[tx.From] {
		if existing.Nonce == tx.Nonce && existing.Hash != tx.Hash {
			return errors.New("double-spend attempt: conflicting transaction with same nonce")
		}
	}

	return nil
}

// Stats returns pool statistics
func (tp *TxPool) Stats() (pending int, queued int) {
	tp.mu.RLock()
	defer tp.mu.RUnlock()

	pending = len(tp.pending)
	queued = 0
	for _, txs := range tp.queued {
		queued += len(txs)
	}
	return
}

// Clear removes all transactions
func (tp *TxPool) Clear() {
	tp.mu.Lock()
	defer tp.mu.Unlock()

	tp.pending = make(map[[32]byte]*Transaction)
	tp.queued = make(map[[20]byte][]*Transaction)
	tp.priceHeap = make([]*Transaction, 0)
}

// Helper functions
func (tp *TxPool) insertByPrice(tx *Transaction) {
	// Binary insert by gas price
	i := sort.Search(len(tp.priceHeap), func(i int) bool {
		return tp.priceHeap[i].GasPrice >= tx.GasPrice
	})
	tp.priceHeap = append(tp.priceHeap, nil)
	copy(tp.priceHeap[i+1:], tp.priceHeap[i:])
	tp.priceHeap[i] = tx
}

func (tp *TxPool) removeLowPriceTx() {
	if len(tp.priceHeap) == 0 {
		return
	}
	tx := tp.priceHeap[0]
	tp.priceHeap = tp.priceHeap[1:]
	delete(tp.pending, tx.Hash)
	tp.removeFromQueued(tx)
}

func (tp *TxPool) removeFromQueued(tx *Transaction) {
	txs := tp.queued[tx.From]
	for i, t := range txs {
		if t.Hash == tx.Hash {
			tp.queued[tx.From] = append(txs[:i], txs[i+1:]...)
			break
		}
	}
}

func (tp *TxPool) removeFromPriceHeap(tx *Transaction) {
	for i, t := range tp.priceHeap {
		if t.Hash == tx.Hash {
			tp.priceHeap = append(tp.priceHeap[:i], tp.priceHeap[i+1:]...)
			break
		}
	}
}

// TransferValue represents a value transfer for double-spend detection
type TransferValue struct {
	From   [20]byte
	To     [20]byte
	Value  *big.Int
	Nonce  uint64
}
