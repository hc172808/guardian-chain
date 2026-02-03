// Package blockchain implements the core blockchain data structures and logic
// GYDSchain - Dual native coin blockchain
// GYDS: Network gas, staking, validator rewards (users never touch directly)
// GYD: Stablecoin for user transactions, banking deposits (never used for gas)
package blockchain

import (
	"crypto/ecdsa"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"math/big"
	"sync"
	"time"

	"chaincore/internal/storage"
)

// CoinType represents the type of native coin
type CoinType uint8

const (
	CoinGYDS CoinType = 0 // Gas, staking, network fees - users never touch
	CoinGYD  CoinType = 1 // Stablecoin, user money, bank deposits - never gas
)

// TxType represents the transaction type
type TxType uint8

const (
	TxTypeTransfer    TxType = 0 // Standard transfer
	TxTypeStake       TxType = 1 // Stake GYDS for validation
	TxTypeUnstake     TxType = 2 // Unstake GYDS
	TxTypeSponsoredTx TxType = 3 // Fee-sponsored transaction (bank pays gas)
	TxTypeBurnGYD     TxType = 4 // Burn GYD (admin only)
	TxTypeMintGYD     TxType = 5 // Mint GYD (admin only)
)

// Config holds blockchain configuration
type Config struct {
	ChainID           uint64
	ChainName         string
	BlockTime         uint64   // Target block time in seconds
	MaxBlockSize      uint64   // Max block size in bytes
	MinGasPrice       uint64   // Minimum gas price in GYDS
	ValidatorMinStake *big.Int // Minimum stake for validators
	FounderAddress    [20]byte // Founder/admin address (controls genesis)
	GenesisGYDS       *big.Int // Initial GYDS supply to founder
	GenesisGYD        *big.Int // Initial GYD supply (0 - minted on demand)
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
	Version       uint32
	Height        uint64
	Timestamp     uint64
	PrevHash      [32]byte
	StateRoot     [32]byte
	TxRoot        [32]byte
	ReceiptsRoot  [32]byte
	ValidatorRoot [32]byte
	MiningRoot    [32]byte
	ProposerAddr  [20]byte
	Difficulty    *big.Int // For mining shares only
	Nonce         uint64
	GasLimit      uint64
	GasUsed       uint64
	ExtraData     []byte
}

// Transaction represents a blockchain transaction
// Supports dual-coin (GYDS/GYD) and fee sponsorship
type Transaction struct {
	Version   uint8
	TxType    TxType
	Nonce     uint64
	From      [20]byte
	To        [20]byte
	Value     *big.Int
	CoinType  CoinType  // Which coin is being transferred
	GasLimit  uint64
	GasPrice  uint64    // Always in GYDS
	Data      []byte
	Signature [65]byte
	Hash      [32]byte

	// Fee sponsorship fields - allows third party (bank) to pay gas
	FeePayer    [20]byte // Address that pays gas (zero = sender pays)
	FeePayerSig [65]byte // Fee payer's signature authorizing gas payment
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
	MinerAddr  [20]byte
	ShareHash  [32]byte
	Difficulty *big.Int
	Nonce      uint64
	Timestamp  uint64
	HumanScore uint8 // Anti-bot score 0-100
	SessionID  [32]byte
	PoolID     [20]byte // Zero if solo mining
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
		// Create genesis block - ONLY founder/admin can do this
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
// Only the founder address receives initial GYDS supply
// GYD starts at 0 - must be minted by admin
func (bc *Blockchain) createGenesisBlock() *Block {
	header := BlockHeader{
		Version:      1,
		Height:       0,
		Timestamp:    uint64(time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC).Unix()),
		Difficulty:   big.NewInt(1000000),
		GasLimit:     30000000,
		ProposerAddr: bc.config.FounderAddress, // Founder creates genesis
		ExtraData:    []byte("GYDSchain Genesis - Dual Native Coin Blockchain"),
	}

	// Initialize founder account with genesis GYDS
	// GYD starts at 0 - admin must mint
	bc.stateDB.SetBalance(bc.config.FounderAddress, CoinGYDS, bc.config.GenesisGYDS)
	bc.stateDB.SetBalance(bc.config.FounderAddress, CoinGYD, big.NewInt(0))

	// Commit genesis state
	stateRoot := bc.stateDB.Commit()
	header.StateRoot = stateRoot

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

// CalculateHash calculates the transaction hash
func (tx *Transaction) CalculateHash() [32]byte {
	data := make([]byte, 0, 256)

	data = append(data, byte(tx.Version))
	data = append(data, byte(tx.TxType))
	data = append(data, uint64ToBytes(tx.Nonce)...)
	data = append(data, tx.From[:]...)
	data = append(data, tx.To[:]...)
	data = append(data, tx.Value.Bytes()...)
	data = append(data, byte(tx.CoinType))
	data = append(data, uint64ToBytes(tx.GasLimit)...)
	data = append(data, uint64ToBytes(tx.GasPrice)...)
	data = append(data, tx.Data...)
	data = append(data, tx.FeePayer[:]...)

	return sha256.Sum256(data)
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
	// GYD can NEVER be used for gas
	// Gas is ALWAYS paid in GYDS
	if tx.CoinType == CoinGYD && tx.TxType == TxTypeStake {
		return errors.New("cannot stake GYD - only GYDS can be staked")
	}

	// Determine who pays gas
	gasPayer := tx.From
	if !isZeroAddress(tx.FeePayer) {
		// Fee sponsored transaction - bank pays gas
		gasPayer = tx.FeePayer

		// Verify fee payer signature
		if !verifyFeePayerSignature(tx) {
			return errors.New("invalid fee payer signature")
		}
	}

	// Check gas payer has enough GYDS for gas
	gasPayerAccount := bc.stateDB.GetAccount(gasPayer)
	gasCost := new(big.Int).Mul(big.NewInt(int64(tx.GasLimit)), big.NewInt(int64(tx.GasPrice)))
	if gasPayerAccount.BalanceGYDS.Cmp(gasCost) < 0 {
		return errors.New("insufficient GYDS for gas")
	}

	// Check sender nonce
	senderAccount := bc.stateDB.GetAccount(tx.From)
	if tx.Nonce != senderAccount.Nonce {
		return errors.New("invalid nonce")
	}

	// Check sender balance for the coin being transferred
	switch tx.CoinType {
	case CoinGYDS:
		// If sender is also paying gas, include gas cost
		totalCost := new(big.Int).Set(tx.Value)
		if isZeroAddress(tx.FeePayer) {
			totalCost.Add(totalCost, gasCost)
		}
		if senderAccount.BalanceGYDS.Cmp(totalCost) < 0 {
			return errors.New("insufficient GYDS balance")
		}
	case CoinGYD:
		if senderAccount.BalanceGYD.Cmp(tx.Value) < 0 {
			return errors.New("insufficient GYD balance")
		}
	}

	// Check gas price
	if tx.GasPrice < bc.config.MinGasPrice {
		return errors.New("gas price below minimum")
	}

	// Verify sender signature
	if !verifySignature(tx) {
		return errors.New("invalid transaction signature")
	}

	return nil
}

// ExecuteTransaction executes a validated transaction
func (bc *Blockchain) ExecuteTransaction(tx *Transaction) error {
	bc.mu.Lock()
	defer bc.mu.Unlock()

	// Deduct gas from gas payer (in GYDS)
	gasPayer := tx.From
	if !isZeroAddress(tx.FeePayer) {
		gasPayer = tx.FeePayer
	}

	gasCost := new(big.Int).Mul(big.NewInt(int64(tx.GasLimit)), big.NewInt(int64(tx.GasPrice)))
	bc.stateDB.SubBalance(gasPayer, CoinGYDS, gasCost)

	// Execute based on transaction type
	switch tx.TxType {
	case TxTypeTransfer, TxTypeSponsoredTx:
		// Transfer the specified coin
		bc.stateDB.SubBalance(tx.From, tx.CoinType, tx.Value)
		bc.stateDB.AddBalance(tx.To, tx.CoinType, tx.Value)

	case TxTypeStake:
		// Stake GYDS - only GYDS can be staked
		if tx.CoinType != CoinGYDS {
			return errors.New("can only stake GYDS")
		}
		bc.stateDB.SubBalance(tx.From, CoinGYDS, tx.Value)
		bc.stateDB.AddStake(tx.From, tx.Value)

	case TxTypeUnstake:
		// Unstake GYDS
		bc.stateDB.SubStake(tx.From, tx.Value)
		bc.stateDB.AddBalance(tx.From, CoinGYDS, tx.Value)

	case TxTypeMintGYD:
		// Mint GYD - only founder/admin can do this
		if tx.From != bc.config.FounderAddress {
			return errors.New("only founder can mint GYD")
		}
		bc.stateDB.AddBalance(tx.To, CoinGYD, tx.Value)

	case TxTypeBurnGYD:
		// Burn GYD
		bc.stateDB.SubBalance(tx.From, CoinGYD, tx.Value)
	}

	// Increment sender nonce
	bc.stateDB.IncrementNonce(tx.From)

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

// GetBalance returns the balance of an address for a specific coin
func (bc *Blockchain) GetBalance(addr [20]byte) *big.Int {
	bc.mu.RLock()
	defer bc.mu.RUnlock()

	account := bc.stateDB.GetAccount(addr)
	return account.BalanceGYDS
}

// GetBalanceGYDS returns the GYDS balance
func (bc *Blockchain) GetBalanceGYDS(addr [20]byte) *big.Int {
	bc.mu.RLock()
	defer bc.mu.RUnlock()

	account := bc.stateDB.GetAccount(addr)
	return new(big.Int).Set(account.BalanceGYDS)
}

// GetBalanceGYD returns the GYD balance
func (bc *Blockchain) GetBalanceGYD(addr [20]byte) *big.Int {
	bc.mu.RLock()
	defer bc.mu.RUnlock()

	account := bc.stateDB.GetAccount(addr)
	return new(big.Int).Set(account.BalanceGYD)
}

// GetDualBalance returns both GYDS and GYD balances
func (bc *Blockchain) GetDualBalance(addr [20]byte) (gyds *big.Int, gyd *big.Int) {
	bc.mu.RLock()
	defer bc.mu.RUnlock()

	account := bc.stateDB.GetAccount(addr)
	return new(big.Int).Set(account.BalanceGYDS), new(big.Int).Set(account.BalanceGYD)
}

// GetNonce returns the nonce for an address
func (bc *Blockchain) GetNonce(addr [20]byte) uint64 {
	bc.mu.RLock()
	defer bc.mu.RUnlock()

	account := bc.stateDB.GetAccount(addr)
	return account.Nonce
}

// GetStake returns the staked GYDS for an address
func (bc *Blockchain) GetStake(addr [20]byte) *big.Int {
	bc.mu.RLock()
	defer bc.mu.RUnlock()

	account := bc.stateDB.GetAccount(addr)
	return new(big.Int).Set(account.Stake)
}

// IsFounder checks if an address is the founder
func (bc *Blockchain) IsFounder(addr [20]byte) bool {
	return addr == bc.config.FounderAddress
}

// GetConfig returns the blockchain configuration
func (bc *Blockchain) GetConfig() Config {
	return bc.config
}

// Helper functions
func uint64ToBytes(n uint64) []byte {
	b := make([]byte, 8)
	for i := 0; i < 8; i++ {
		b[7-i] = byte(n >> (8 * i))
	}
	return b
}

func isZeroAddress(addr [20]byte) bool {
	var zero [20]byte
	return addr == zero
}

func verifySignature(tx *Transaction) bool {
	// Implement ECDSA signature verification
	// Verify tx.From signed the transaction
	return len(tx.Signature) == 65
}

func verifyFeePayerSignature(tx *Transaction) bool {
	// Verify that FeePayer authorized paying gas for this transaction
	// The fee payer signs: hash(from, to, value, gasLimit, nonce)
	return len(tx.FeePayerSig) == 65
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

// SignTransaction signs a transaction with the given private key
func SignTransaction(tx *Transaction, privateKey *ecdsa.PrivateKey) error {
	// Calculate transaction hash
	hash := tx.CalculateHash()

	// Sign with ECDSA
	// In production, use proper crypto/ecdsa signing
	copy(tx.Signature[:32], hash[:])
	tx.Signature[64] = 1 // Recovery ID

	tx.Hash = hash
	return nil
}
