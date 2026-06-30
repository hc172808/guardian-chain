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
		db = nil
	}

	c := &Chain{
		genesis: genesis,
		db:      db,
		height:  0,
		dataDir: dataDir,
	}

	gb := genesis.GenesisBlock()
	gb.Hash = gb.ComputeHash()
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
		hd, _ := json.Marshal(c.height)
		c.db.Put([]byte("height"), hd, nil)
	}
	return nil
}

func (c *Chain) GetByNumber(number uint64) (*Block, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.db != nil {
		key := fmt.Sprintf("block:%d", number)
		data, err := c.db.Get([]byte(key), nil)
		if err == nil {
			var b Block
			if json.Unmarshal(data, &b) == nil {
				return &b, nil
			}
		}
	}
	if number == 0 {
		return c.genesis.GenesisBlock(), nil
	}
	return nil, fmt.Errorf("block %d not found", number)
}

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
	c.tip = b
	c.height = b.Header.Number
	if c.db != nil {
		data, _ := json.Marshal(b)
		c.db.Put([]byte(fmt.Sprintf("block:%d", b.Header.Number)), data, nil)
		hd, _ := json.Marshal(c.height)
		c.db.Put([]byte("height"), hd, nil)
	}
	return b
}

func (c *Chain) Close() {
	if c.db != nil {
		c.db.Close()
		c.db = nil
	}
}
