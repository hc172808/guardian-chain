package blockchain

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"sync"
	"time"

	"chaincore/network"
)

// Block represents a blockchain block
type Block struct {
	Height       uint64
	Timestamp    uint64
	PrevHash     string
	Hash         string
	Transactions []*Transaction
	Miner        [20]byte
	Nonce        uint64
}

// Transaction represents a blockchain transaction
type Transaction struct {
	From     [20]byte
	To       [20]byte
	AmountGYD *big.Int
	AmountGYDS *big.Int
	Nonce    uint64
	Hash     string
}

// Blockchain manages the chain
type Blockchain struct {
	state      *StateDB
	blocks     []*Block
	mu         sync.RWMutex
	p2p        *network.P2PNetwork
	mempool    []*Transaction
}

// NewBlockchain creates a blockchain instance
func NewBlockchain(state *StateDB, p2p *network.P2PNetwork) *Blockchain {
	bc := &Blockchain{
		state:   state,
		blocks:  []*Block{},
		p2p:     p2p,
		mempool: []*Transaction{},
	}
	// Register block/tx handlers
	p2p.RegisterHandler(network.MsgBlockAnnounce, bc.handleBlockAnnounce)
	p2p.RegisterHandler(network.MsgTxAnnounce, bc.handleTxAnnounce)
	return bc
}

// AddTransaction adds tx to mempool
func (bc *Blockchain) AddTransaction(tx *Transaction) error {
	if err := bc.state.ValidateNonce(tx.From, tx.Nonce); err != nil {
		return err
	}

	bc.mu.Lock()
	defer bc.mu.Unlock()
	bc.mempool = append(bc.mempool, tx)

	// Broadcast tx
	bc.p2p.BroadcastTx([]byte(tx.Hash))
	return nil
}

// MineBlock creates a new block
func (bc *Blockchain) MineBlock(miner [20]byte) (*Block, error) {
	bc.mu.Lock()
	defer bc.mu.Unlock()

	if len(bc.mempool) == 0 {
		return nil, errors.New("no transactions to mine")
	}

	prevHash := ""
	height := uint64(0)
	if len(bc.blocks) > 0 {
		prev := bc.blocks[len(bc.blocks)-1]
		prevHash = prev.Hash
		height = prev.Height + 1
	}

	block := &Block{
		Height:       height,
		Timestamp:    uint64(time.Now().Unix()),
		PrevHash:     prevHash,
		Transactions: bc.mempool,
		Miner:        miner,
	}

	block.Hash = bc.calculateBlockHash(block)
	bc.blocks = append(bc.blocks, block)

	// Apply transactions to state
	for _, tx := range bc.mempool {
		bc.applyTransaction(tx)
	}

	// Clear mempool
	bc.mempool = []*Transaction{}

	// Broadcast new block
	bc.p2p.BroadcastBlock([]byte(block.Hash))
	return block, nil
}

// calculateBlockHash computes hash
func (bc *Blockchain) calculateBlockHash(b *Block) string {
	data := b.PrevHash + string(b.Height) + string(b.Timestamp) + hex.EncodeToString(b.Miner[:])
	for _, tx := range b.Transactions {
		data += tx.Hash
	}
	sum := sha256.Sum256([]byte(data))
	return hex.EncodeToString(sum[:])
}

// applyTransaction applies balances
func (bc *Blockchain) applyTransaction(tx *Transaction) {
	bc.state.SubBalanceGYD(tx.From, tx.AmountGYD)
	bc.state.SubBalanceGYDS(tx.From, tx.AmountGYDS)
	bc.state.AddBalanceGYD(tx.To, tx.AmountGYD)
	bc.state.AddBalanceGYDS(tx.To, tx.AmountGYDS)
	bc.state.IncrementNonce(tx.From)
}

// handleBlockAnnounce handles incoming block
func (bc *Blockchain) handleBlockAnnounce(msg *network.Message) error {
	// For simplicity, we just log; real validation is needed
	// TODO: deserialize block from msg.Payload
	return nil
}

// handleTxAnnounce handles incoming transaction
func (bc *Blockchain) handleTxAnnounce(msg *network.Message) error {
	// TODO: deserialize tx from msg.Payload and add to mempool
	return nil
}

// GetLatestBlock returns the tip
func (bc *Blockchain) GetLatestBlock() *Block {
	bc.mu.RLock()
	defer bc.mu.RUnlock()
	if len(bc.blocks) == 0 {
		return nil
	}
	return bc.blocks[len(bc.blocks)-1]
}

// GetBlockByHeight fetches block
func (bc *Blockchain) GetBlockByHeight(height uint64) *Block {
	bc.mu.RLock()
	defer bc.mu.RUnlock()
	if int(height) >= len(bc.blocks) {
		return nil
	}
	return bc.blocks[height]
}

// GetBlockCount returns total blocks
func (bc *Blockchain) GetBlockCount() uint64 {
	bc.mu.RLock()
	defer bc.mu.RUnlock()
	return uint64(len(bc.blocks))
}

// ValidateChain checks all hashes
func (bc *Blockchain) ValidateChain() bool {
	bc.mu.RLock()
	defer bc.mu.RUnlock()
	for i := 1; i < len(bc.blocks); i++ {
		prev := bc.blocks[i-1]
		curr := bc.blocks[i]
		if curr.PrevHash != prev.Hash {
			return false
		}
		if curr.Hash != bc.calculateBlockHash(curr) {
			return false
		}
	}
	return true
}
