package blockchain

import (
	"errors"
	"fmt"
	"sync"

	"chaincore/network"
	"chaincore/internal/storage"
)

// Blockchain represents the main chain
type Blockchain struct {
	state      *StateDB
	network    *network.P2PNetwork
	blocks     map[string]*Block
	blockOrder []string
	mu         sync.RWMutex
}

// Block represents a single block
type Block struct {
	Hash         string
	PrevHash     string
	Height       uint64
	Transactions []*Transaction
	Timestamp    uint64
}

// Transaction represents a blockchain transaction
type Transaction struct {
	From     [20]byte
	To       [20]byte
	Amount   uint64
	Fee      uint64
	Nonce    uint64
	Hash     string
	Metadata []byte
}

// NewBlockchain creates a new blockchain instance
func NewBlockchain(db storage.Database, p2p *network.P2PNetwork) (*Blockchain, error) {
	stateDB, err := NewStateDB(db)
	if err != nil {
		return nil, err
	}

	return &Blockchain{
		state:      stateDB,
		network:    p2p,
		blocks:     make(map[string]*Block),
		blockOrder: make([]string, 0),
	}, nil
}

// AddBlock adds a block to the chain
func (bc *Blockchain) AddBlock(block *Block) error {
	bc.mu.Lock()
	defer bc.mu.Unlock()

	if _, exists := bc.blocks[block.Hash]; exists {
		return errors.New("block already exists")
	}

	if block.PrevHash != "" {
		if _, ok := bc.blocks[block.PrevHash]; !ok {
			return errors.New("previous block not found")
		}
	}

	bc.blocks[block.Hash] = block
	bc.blockOrder = append(bc.blockOrder, block.Hash)

	// Broadcast new block
	bc.network.BroadcastBlock([]byte(block.Hash))
	return nil
}

// GetBlock returns a block by hash
func (bc *Blockchain) GetBlock(hash string) (*Block, error) {
	bc.mu.RLock()
	defer bc.mu.RUnlock()

	block, ok := bc.blocks[hash]
	if !ok {
		return nil, errors.New("block not found")
	}
	return block, nil
}

// GetLatestBlock returns the latest block in the chain
func (bc *Blockchain) GetLatestBlock() *Block {
	bc.mu.RLock()
	defer bc.mu.RUnlock()

	if len(bc.blockOrder) == 0 {
		return nil
	}
	latestHash := bc.blockOrder[len(bc.blockOrder)-1]
	return bc.blocks[latestHash]
}

// SubmitTransaction processes a transaction
func (bc *Blockchain) SubmitTransaction(tx *Transaction) error {
	// Validate sender balance
	sender := bc.state.GetAccount(tx.From)
	if sender.BalanceGYD.Cmp(newUint64BigInt(tx.Amount + tx.Fee)) < 0 {
		return errors.New("insufficient balance")
	}

	// Subtract from sender
	if err := bc.state.SubBalanceGYD(tx.From, newUint64BigInt(tx.Amount+tx.Fee)); err != nil {
		return err
	}

	// Add to recipient
	bc.state.AddBalanceGYD(tx.To, newUint64BigInt(tx.Amount))

	// Increment sender nonce
	bc.state.IncrementNonce(tx.From)

	// Broadcast transaction
	bc.network.BroadcastTx([]byte(tx.Hash))
	return nil
}

// Utility function: convert uint64 to *big.Int
func newUint64BigInt(v uint64) *big.Int {
	return new(big.Int).SetUint64(v)
}

// GetAccount returns an account from state
func (bc *Blockchain) GetAccount(addr [20]byte) *Account {
	return bc.state.GetAccount(addr)
}

// GetAllAccounts returns all accounts (for indexer)
func (bc *Blockchain) GetAllAccounts() []*Account {
	return bc.state.GetAllAccounts()
}

// Commit persists state
func (bc *Blockchain) Commit() error {
	return bc.state.Commit()
}

// GetChainHeight returns the current height
func (bc *Blockchain) GetChainHeight() uint64 {
	bc.mu.RLock()
	defer bc.mu.RUnlock()
	return uint64(len(bc.blockOrder))
}

// PrintChain prints the block hashes
func (bc *Blockchain) PrintChain() {
	bc.mu.RLock()
	defer bc.mu.RUnlock()
	fmt.Println("Blockchain:")
	for _, hash := range bc.blockOrder {
		fmt.Printf(" - %s\n", hash)
	}
}
