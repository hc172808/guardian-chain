package core

import (
	"fmt"
	"sync"
	"time"
)

// Chain is a lightweight in-memory chain for the RPC node.
// The RPC node is stateless — it relays requests and tracks the latest tip.
type Chain struct {
	mu      sync.RWMutex
	genesis *GenesisConfig
	tip     *Block
	height  uint64
	blocks  map[uint64]*Block
}

func NewChain(genesis *GenesisConfig) *Chain {
	gb := genesis.GenesisBlock()
	gb.Hash = gb.ComputeHash()
	c := &Chain{
		genesis: genesis,
		tip:     gb,
		height:  0,
		blocks:  make(map[uint64]*Block),
	}
	c.blocks[0] = gb
	return c
}

func (c *Chain) Height() uint64 {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.height
}

func (c *Chain) Tip() *Block {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.tip
}

func (c *Chain) AddBlock(b *Block) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if b.Header.Number != c.height+1 {
		return fmt.Errorf("block number mismatch: expected %d, got %d", c.height+1, b.Header.Number)
	}
	b.Hash = b.ComputeHash()
	c.blocks[b.Header.Number] = b
	c.tip = b
	c.height = b.Header.Number
	return nil
}

func (c *Chain) GetByNumber(number uint64) (*Block, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	b, ok := c.blocks[number]
	if !ok {
		return nil, fmt.Errorf("block %d not found", number)
	}
	return b, nil
}

func (c *Chain) GetByHash(hash string) (*Block, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	for _, b := range c.blocks {
		if b.Hash == hash {
			return b, nil
		}
	}
	return nil, fmt.Errorf("block %s not found", hash)
}

// MintBlock creates and appends a new block proposed by the given validator.
func (c *Chain) MintBlock(validator string, txs []*Transaction) *Block {
	c.mu.Lock()
	defer c.mu.Unlock()
	parent := c.tip
	b := &Block{
		Header: BlockHeader{
			Number:     parent.Header.Number + 1,
			ParentHash: parent.Hash,
			Timestamp:  uint64(time.Now().Unix()),
			GasLimit:   parent.Header.GasLimit,
			GasUsed:    uint64(len(txs)) * 21000,
			Validator:  validator,
			StateRoot:  parent.Header.StateRoot,
			TxRoot:     "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421",
			ExtraData:  "0x",
		},
		Transactions: txs,
	}
	b.Hash = b.ComputeHash()
	c.blocks[b.Header.Number] = b
	c.tip = b
	c.height = b.Header.Number
	return b
}
