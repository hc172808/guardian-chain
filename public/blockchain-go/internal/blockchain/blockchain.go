// Package blockchain implements the core blockchain data structures and logic
package blockchain

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"math/big"
	"sync"
	"time"

	"chaincore/internal/storage"
)

// Config holds blockchain configuration
type Config struct {
	ChainID           uint64
	BlockTime         uint64 // Target block time in seconds
	MaxBlockSize      uint64 // Max block size in bytes
	MinGasPrice       uint64 // Minimum gas price
	ValidatorMinStake *big.Int
}

// Block represents a block in the blockchain
type Block struct {
	Header       BlockHeader
	Transactions []Transaction
	Validators   []ValidatorVote
	MiningShares []MiningShare
}

// BlockHeader contains block metadata
type BlockHeader struct {
	Version        uint32
	Height         uint64
	Timestamp      uint64
	PrevHash       [32]byte
	StateRoot      [32]byte
	TxRoot         [32]byte
	ReceiptsRoot   [32]byte
	ValidatorRoot  [32]byte
	MiningRoot     [32]byte
	ProposerAddr   [20]byte
	Difficulty     *big.Int // For mining shares only
	Nonce          uint64
	GasLimit       uint64
	GasUsed        uint64
	ExtraData      []byte
}

// Transaction represents a blockchain transaction
type Transaction struct {
	Version   uint8
	Nonce     uint64
	From      [20]byte
	To        [20]byte
	Value     *big.Int
	GasLimit  uint64
	GasPrice  uint64
	Data      []byte
	Signature [65]byte
	Hash      [32]byte
}

// ValidatorVote represents a validator's vote for PoS consensus
type ValidatorVote struct {
	ValidatorAddr [20]byte
	BlockHash     [32]byte
	Signature     [65]byte
	Timestamp     uint64
}

// MiningShare represents a valid mining share for reward distribution
type MiningShare struct {
	MinerAddr    [20]byte
	ShareHash    [32]byte
	Difficulty   *big.Int
	Nonce        uint64
	Timestamp    uint64
	HumanScore   uint8  // Anti-bot score 0-100
	SessionID    [32]byte
	PoolID       [20]byte // Zero if solo mining
}

// Blockchain manages the blockchain state
type Blockchain struct {
	config       Config
	db           storage.Database
	currentBlock *Block
	stateDB      *StateDB
	txPool       *TxPool
	mu           sync.RWMutex
}

// NewBlockchain creates a new blockchain instance
func NewBlockchain(db storage.Database, config Config) (*Blockchain, error) {
	bc := &Blockchain{
		config: config,
		db:     db,
	}

	// Initialize state database
	stateDB, err := NewStateDB(db)
	if err != nil {
		return nil, err
	}
	bc.stateDB = stateDB

	// Initialize transaction pool
	bc.txPool = NewTxPool(config)

	// Load or create genesis block
	currentBlock, err := bc.loadCurrentBlock()
	if err != nil {
		// Create genesis block
		genesis := bc.createGenesisBlock()
		if err := bc.saveBlock(genesis); err != nil {
			return nil, err
		}
		currentBlock = genesis
	}
	bc.currentBlock = currentBlock

	return bc, nil
}

// createGenesisBlock creates the genesis block
func (bc *Blockchain) createGenesisBlock() *Block {
	header := BlockHeader{
		Version:    1,
		Height:     0,
		Timestamp:  uint64(time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC).Unix()),
		Difficulty: big.NewInt(1000000),
		GasLimit:   30000000,
	}

	return &Block{
		Header:       header,
		Transactions: []Transaction{},
		Validators:   []ValidatorVote{},
		MiningShares: []MiningShare{},
	}
}

// Hash calculates the block hash
func (b *Block) Hash() [32]byte {
	data := make([]byte, 0, 256)
	
	// Serialize header fields
	data = append(data, byte(b.Header.Version))
	data = append(data, uint64ToBytes(b.Header.Height)...)
	data = append(data, uint64ToBytes(b.Header.Timestamp)...)
	data = append(data, b.Header.PrevHash[:]...)
	data = append(data, b.Header.StateRoot[:]...)
	data = append(data, b.Header.TxRoot[:]...)
	data = append(data, b.Header.ValidatorRoot[:]...)
	data = append(data, b.Header.ProposerAddr[:]...)
	
	return sha256.Sum256(data)
}

// HashHex returns the block hash as hex string
func (b *Block) HashHex() string {
	hash := b.Hash()
	return hex.EncodeToString(hash[:])
}

// AddTransaction adds a transaction to the pool
func (bc *Blockchain) AddTransaction(tx *Transaction) error {
	bc.mu.Lock()
	defer bc.mu.Unlock()

	// Validate transaction
	if err := bc.validateTransaction(tx); err != nil {
		return err
	}

	// Add to pool
	return bc.txPool.Add(tx)
}

// validateTransaction validates a transaction
func (bc *Blockchain) validateTransaction(tx *Transaction) error {
	// Check nonce
	account := bc.stateDB.GetAccount(tx.From)
	if tx.Nonce != account.Nonce {
		return errors.New("invalid nonce: transaction nonce must match account nonce")
	}

	// Check balance
	totalCost := new(big.Int).Mul(big.NewInt(int64(tx.GasLimit)), big.NewInt(int64(tx.GasPrice)))
	totalCost.Add(totalCost, tx.Value)
	if account.Balance.Cmp(totalCost) < 0 {
		return errors.New("insufficient balance for transaction")
	}

	// Check gas price
	if tx.GasPrice < bc.config.MinGasPrice {
		return errors.New("gas price below minimum")
	}

	// Verify signature
	if !verifySignature(tx) {
		return errors.New("invalid transaction signature")
	}

	return nil
}

// GetBlock retrieves a block by height
func (bc *Blockchain) GetBlock(height uint64) (*Block, error) {
	bc.mu.RLock()
	defer bc.mu.RUnlock()

	return bc.loadBlockByHeight(height)
}

// GetCurrentBlock returns the current block
func (bc *Blockchain) GetCurrentBlock() *Block {
	bc.mu.RLock()
	defer bc.mu.RUnlock()
	return bc.currentBlock
}

// GetBalance returns the balance of an address
func (bc *Blockchain) GetBalance(addr [20]byte) *big.Int {
	bc.mu.RLock()
	defer bc.mu.RUnlock()
	
	account := bc.stateDB.GetAccount(addr)
	return account.Balance
}

// Helper functions
func uint64ToBytes(n uint64) []byte {
	b := make([]byte, 8)
	for i := 0; i < 8; i++ {
		b[7-i] = byte(n >> (8 * i))
	}
	return b
}

func verifySignature(tx *Transaction) bool {
	// Implement ECDSA signature verification
	// For now, return true (implement full verification in production)
	return len(tx.Signature) == 65
}

func (bc *Blockchain) loadCurrentBlock() (*Block, error) {
	// Load from database
	return nil, errors.New("no current block")
}

func (bc *Blockchain) loadBlockByHeight(height uint64) (*Block, error) {
	// Load from database
	return nil, errors.New("block not found")
}

func (bc *Blockchain) saveBlock(block *Block) error {
	// Save to database
	return nil
}
