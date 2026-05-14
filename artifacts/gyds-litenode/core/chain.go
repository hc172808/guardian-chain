package core

import (
	"errors"
	"sync"
)

var (
	ErrBlockNotFound   = errors.New("block not found")
	ErrInvalidBlock    = errors.New("invalid block")
	ErrParentNotFound  = errors.New("parent block not found")
)

type Chain struct {
	mu       sync.RWMutex
	blocks   []*Block
	byHash   map[string]*Block
	byNumber map[uint64]*Block
	genesis  *GenesisConfig
}

func NewChain(genesis *GenesisConfig) *Chain {
	c := &Chain{
		blocks:   make([]*Block, 0, 1024),
		byHash:   make(map[string]*Block),
		byNumber: make(map[uint64]*Block),
		genesis:  genesis,
	}
	genBlock := GenesisBlock(genesis)
	c.addBlock(genBlock)
	return c
}

func (c *Chain) addBlock(b *Block) {
	c.blocks = append(c.blocks, b)
	c.byHash[b.Hash] = b
	c.byNumber[b.Header.Number] = b
}

func (c *Chain) Head() *Block {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if len(c.blocks) == 0 {
		return nil
	}
	return c.blocks[len(c.blocks)-1]
}

func (c *Chain) Height() uint64 {
	h := c.Head()
	if h == nil {
		return 0
	}
	return h.Header.Number
}

func (c *Chain) GetByHash(hash string) (*Block, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	b, ok := c.byHash[hash]
	if !ok {
		return nil, ErrBlockNotFound
	}
	return b, nil
}

func (c *Chain) GetByNumber(num uint64) (*Block, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	b, ok := c.byNumber[num]
	if !ok {
		return nil, ErrBlockNotFound
	}
	return b, nil
}

func (c *Chain) LatestBlocks(n int) []*Block {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if n > len(c.blocks) {
		n = len(c.blocks)
	}
	start := len(c.blocks) - n
	result := make([]*Block, n)
	copy(result, c.blocks[start:])
	for i, j := 0, len(result)-1; i < j; i, j = i+1, j-1 {
		result[i], result[j] = result[j], result[i]
	}
	return result
}

func (c *Chain) InsertBlock(b *Block) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if _, exists := c.byHash[b.Hash]; exists {
		return nil
	}

	head := c.blocks[len(c.blocks)-1]
	if b.Header.ParentHash != head.Hash {
		return ErrParentNotFound
	}
	if b.Header.Number != head.Header.Number+1 {
		return ErrInvalidBlock
	}

	c.addBlock(b)
	return nil
}

func (c *Chain) Stats() map[string]interface{} {
	c.mu.RLock()
	defer c.mu.RUnlock()
	head := c.blocks[len(c.blocks)-1]
	return map[string]interface{}{
		"blockHeight":       head.Header.Number,
		"headHash":          head.Hash,
		"chainId":           c.genesis.ChainID,
		"networkName":       c.genesis.NetworkName,
		"totalBlocks":       len(c.blocks),
	}
}
