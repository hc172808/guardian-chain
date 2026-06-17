package core

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/syndtr/goleveldb/leveldb"
)

type Chain struct {
	mu      sync.RWMutex
	genesis *GenesisConfig
	db      *leveldb.DB
	tip     *Block
	height  uint64
	dataDir string
}

func NewChain(genesis *GenesisConfig, dataDir string) *Chain {
	db, err := leveldb.OpenFile(dataDir+"/blocks", nil)
	if err != nil {
		// Fallback to in-memory mode if LevelDB unavailable
		db = nil
	}

	c := &Chain{
		genesis: genesis,
		db:      db,
		height:  0,
		dataDir: dataDir,
	}

	// Initialize with genesis block
	gb := genesis.GenesisBlock()
	c.tip = gb
	c.height = 0

	if db != nil {
		if data, _ := db.Get([]byte("height"), nil); len(data) > 0 {
			var h uint64
			if err := json.Unmarshal(data, &h); err == nil {
				c.height = h
			}
		}
	}

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
	c.tip = b
	c.height = b.Header.Number

	if c.db != nil {
		data, _ := json.Marshal(b)
		key := fmt.Sprintf("block:%d", b.Header.Number)
		c.db.Put([]byte(key), data, nil)
		heightData, _ := json.Marshal(c.height)
		c.db.Put([]byte("height"), heightData, nil)
	}

	return nil
}

func (c *Chain) GetByNumber(n uint64) (*Block, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if n == 0 {
		return c.genesis.GenesisBlock(), nil
	}
	if n == c.height {
		return c.tip, nil
	}

	if c.db != nil {
		key := fmt.Sprintf("block:%d", n)
		data, err := c.db.Get([]byte(key), nil)
		if err == nil {
			var b Block
			if err := json.Unmarshal(data, &b); err == nil {
				return &b, nil
			}
		}
	}

	return nil, fmt.Errorf("block %d not found", n)
}

func (c *Chain) NewBlock(validator string, txs []*Transaction) *Block {
	c.mu.RLock()
	parentHash := c.tip.Hash
	number := c.height + 1
	c.mu.RUnlock()

	gasUsed := uint64(len(txs)) * 21_000
	txRoot := "0x" + repeat("e", 64)
	if len(txs) == 0 {
		txRoot = "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421"
	}

	return &Block{
		Header: BlockHeader{
			Number:     number,
			ParentHash: parentHash,
			Timestamp:  uint64(time.Now().Unix()),
			GasLimit:   30_000_000,
			GasUsed:    gasUsed,
			Validator:  validator,
			StateRoot:  "0x" + repeat("d", 64),
			TxRoot:     txRoot,
			ExtraData:  "0x47594453636861696e",
		},
		Transactions: txs,
	}
}

func (c *Chain) Close() {
	if c.db != nil {
		c.db.Close()
	}
}
