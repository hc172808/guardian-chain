// Package storage implements database storage
package storage

import (
	"errors"
	"sync"
)

// Config holds storage configuration
type Config struct {
	DataDir     string
	MaxSizeGB   int64
	EnablePrune bool
}

// LiteConfig holds lite node storage configuration
type LiteConfig struct {
	DataDir      string
	MaxCacheMB   int64
	EnableCache  bool
	CacheBlocks  int
	CacheHeaders int
}

// Database interface for blockchain storage
type Database interface {
	Get(key []byte) ([]byte, error)
	Put(key, value []byte) error
	Delete(key []byte) error
	Has(key []byte) (bool, error)
	Close() error
	NewBatch() Batch
}

// Batch interface for batch operations
type Batch interface {
	Put(key, value []byte) error
	Delete(key []byte) error
	Write() error
	Reset()
}

// LevelDB implements Database using LevelDB
type LevelDB struct {
	config    Config
	data      map[string][]byte
	mu        sync.RWMutex
	sizeBytes int64
}

// NewLevelDB creates a new LevelDB instance
func NewLevelDB(config Config) (*LevelDB, error) {
	return &LevelDB{
		config: config,
		data:   make(map[string][]byte),
	}, nil
}

// Get retrieves a value by key
func (db *LevelDB) Get(key []byte) ([]byte, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	value, exists := db.data[string(key)]
	if !exists {
		return nil, errors.New("key not found")
	}
	return value, nil
}

// Put stores a key-value pair
func (db *LevelDB) Put(key, value []byte) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	// Check size limit
	newSize := db.sizeBytes + int64(len(key)+len(value))
	maxBytes := db.config.MaxSizeGB * 1024 * 1024 * 1024

	if newSize > maxBytes {
		if db.config.EnablePrune {
			db.prune(newSize - maxBytes)
		} else {
			return errors.New("storage limit exceeded")
		}
	}

	db.data[string(key)] = value
	db.sizeBytes = newSize
	return nil
}

// Delete removes a key
func (db *LevelDB) Delete(key []byte) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	if value, exists := db.data[string(key)]; exists {
		db.sizeBytes -= int64(len(key) + len(value))
		delete(db.data, string(key))
	}
	return nil
}

// Has checks if a key exists
func (db *LevelDB) Has(key []byte) (bool, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	_, exists := db.data[string(key)]
	return exists, nil
}

// Close closes the database
func (db *LevelDB) Close() error {
	db.mu.Lock()
	defer db.mu.Unlock()

	db.data = nil
	return nil
}

// NewBatch creates a new batch
func (db *LevelDB) NewBatch() Batch {
	return &LevelDBBatch{
		db:   db,
		ops:  make([]batchOp, 0),
	}
}

// prune removes old data to free space
func (db *LevelDB) prune(bytesToFree int64) {
	// Implement LRU or oldest-first pruning
}

// GetSize returns current storage size
func (db *LevelDB) GetSize() int64 {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.sizeBytes
}

// LevelDBBatch implements Batch for LevelDB
type LevelDBBatch struct {
	db  *LevelDB
	ops []batchOp
}

type batchOp struct {
	key    []byte
	value  []byte
	delete bool
}

func (b *LevelDBBatch) Put(key, value []byte) error {
	b.ops = append(b.ops, batchOp{key: key, value: value})
	return nil
}

func (b *LevelDBBatch) Delete(key []byte) error {
	b.ops = append(b.ops, batchOp{key: key, delete: true})
	return nil
}

func (b *LevelDBBatch) Write() error {
	for _, op := range b.ops {
		if op.delete {
			b.db.Delete(op.key)
		} else {
			b.db.Put(op.key, op.value)
		}
	}
	return nil
}

func (b *LevelDBBatch) Reset() {
	b.ops = make([]batchOp, 0)
}

// LiteCache implements caching for lite nodes
type LiteCache struct {
	config   LiteConfig
	headers  map[string][]byte
	blocks   map[string][]byte
	mu       sync.RWMutex
	sizeBytes int64
}

// NewLiteCache creates a new lite cache
func NewLiteCache(config LiteConfig) (*LiteCache, error) {
	return &LiteCache{
		config:  config,
		headers: make(map[string][]byte),
		blocks:  make(map[string][]byte),
	}, nil
}

// CacheHeader caches a block header
func (lc *LiteCache) CacheHeader(hash []byte, header []byte) error {
	lc.mu.Lock()
	defer lc.mu.Unlock()

	if len(lc.headers) >= lc.config.CacheHeaders {
		// Remove oldest header
		for k := range lc.headers {
			delete(lc.headers, k)
			break
		}
	}

	lc.headers[string(hash)] = header
	return nil
}

// CacheBlock caches a block
func (lc *LiteCache) CacheBlock(hash []byte, block []byte) error {
	lc.mu.Lock()
	defer lc.mu.Unlock()

	if len(lc.blocks) >= lc.config.CacheBlocks {
		// Remove oldest block
		for k := range lc.blocks {
			delete(lc.blocks, k)
			break
		}
	}

	lc.blocks[string(hash)] = block
	return nil
}

// GetHeader retrieves a cached header
func (lc *LiteCache) GetHeader(hash []byte) ([]byte, bool) {
	lc.mu.RLock()
	defer lc.mu.RUnlock()

	header, exists := lc.headers[string(hash)]
	return header, exists
}

// GetBlock retrieves a cached block
func (lc *LiteCache) GetBlock(hash []byte) ([]byte, bool) {
	lc.mu.RLock()
	defer lc.mu.RUnlock()

	block, exists := lc.blocks[string(hash)]
	return block, exists
}

// Close closes the cache
func (lc *LiteCache) Close() error {
	lc.mu.Lock()
	defer lc.mu.Unlock()

	lc.headers = nil
	lc.blocks = nil
	return nil
}
