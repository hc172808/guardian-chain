// Package indexer - Reads blockchain via RPC/events and writes to PostgreSQL
// This is SEPARATE from consensus - PostgreSQL is read-only mirror
// Can be deleted and rebuilt from genesis without affecting blockchain
package indexer

import (
	"database/sql"
	"encoding/hex"
	"errors"
	"log"
	"math/big"
	"sync"
	"time"

	"chaincore/internal/blockchain"
)

// Config holds indexer configuration
type Config struct {
	// PostgreSQL connection
	DatabaseURL string
	
	// RPC endpoint for reading blockchain
	RPCEndpoint string
	WSEndpoint  string
	
	// Sync settings
	BatchSize       int
	SyncInterval    time.Duration
	StartFromBlock  uint64
	
	// Feature flags
	IndexTransactions bool
	IndexAccounts     bool
	IndexEvents       bool
}

// Indexer reads blockchain data and writes to PostgreSQL
type Indexer struct {
	config     Config
	db         *sql.DB
	bc         *blockchain.Blockchain
	lastBlock  uint64
	running    bool
	mu         sync.RWMutex
	stopChan   chan struct{}
}

// NewIndexer creates a new indexer instance
func NewIndexer(config Config, bc *blockchain.Blockchain) (*Indexer, error) {
	db, err := sql.Open("postgres", config.DatabaseURL)
	if err != nil {
		return nil, err
	}

	// Verify connection
	if err := db.Ping(); err != nil {
		return nil, err
	}

	return &Indexer{
		config:   config,
		db:       db,
		bc:       bc,
		stopChan: make(chan struct{}),
	}, nil
}

// Start begins the indexing process
func (idx *Indexer) Start() error {
	idx.mu.Lock()
	if idx.running {
		idx.mu.Unlock()
		return errors.New("indexer already running")
	}
	idx.running = true
	idx.mu.Unlock()

	// Initialize database schema
	if err := idx.initSchema(); err != nil {
		return err
	}

	// Get last indexed block
	idx.lastBlock = idx.getLastIndexedBlock()

	// Start real-time subscription
	go idx.subscribeToBlocks()
	go idx.subscribeToTransactions()

	// Start batch sync for catch-up
	go idx.syncLoop()

	log.Printf("Indexer started from block %d", idx.lastBlock)
	return nil
}

// Stop stops the indexer
func (idx *Indexer) Stop() error {
	idx.mu.Lock()
	defer idx.mu.Unlock()

	if !idx.running {
		return nil
	}

	close(idx.stopChan)
	idx.running = false
	return idx.db.Close()
}

// initSchema creates the PostgreSQL tables for indexing
func (idx *Indexer) initSchema() error {
	schema := `
		-- Blocks table
		CREATE TABLE IF NOT EXISTS blocks (
			height BIGINT PRIMARY KEY,
			hash VARCHAR(66) NOT NULL UNIQUE,
			prev_hash VARCHAR(66) NOT NULL,
			timestamp TIMESTAMP NOT NULL,
			proposer VARCHAR(42) NOT NULL,
			tx_count INTEGER NOT NULL DEFAULT 0,
			gas_used BIGINT NOT NULL DEFAULT 0,
			gas_limit BIGINT NOT NULL DEFAULT 0,
			created_at TIMESTAMP DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_blocks_hash ON blocks(hash);
		CREATE INDEX IF NOT EXISTS idx_blocks_timestamp ON blocks(timestamp);

		-- Transactions table with dual-coin support
		CREATE TABLE IF NOT EXISTS indexed_transactions (
			hash VARCHAR(66) PRIMARY KEY,
			block_height BIGINT REFERENCES blocks(height),
			tx_index INTEGER NOT NULL,
			from_addr VARCHAR(42) NOT NULL,
			to_addr VARCHAR(42) NOT NULL,
			value_raw VARCHAR(78) NOT NULL,
			coin_type INTEGER NOT NULL, -- 0=GYDS, 1=GYD
			gas_price BIGINT NOT NULL,
			gas_used BIGINT NOT NULL,
			fee_payer VARCHAR(42), -- NULL if sender pays
			status INTEGER NOT NULL, -- 0=failed, 1=success
			timestamp TIMESTAMP NOT NULL,
			created_at TIMESTAMP DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_tx_from ON indexed_transactions(from_addr);
		CREATE INDEX IF NOT EXISTS idx_tx_to ON indexed_transactions(to_addr);
		CREATE INDEX IF NOT EXISTS idx_tx_block ON indexed_transactions(block_height);
		CREATE INDEX IF NOT EXISTS idx_tx_timestamp ON indexed_transactions(timestamp);
		CREATE INDEX IF NOT EXISTS idx_tx_fee_payer ON indexed_transactions(fee_payer);

		-- Account balances (mirror of on-chain state)
		CREATE TABLE IF NOT EXISTS account_balances (
			address VARCHAR(42) PRIMARY KEY,
			balance_gyds VARCHAR(78) NOT NULL DEFAULT '0',
			balance_gyd VARCHAR(78) NOT NULL DEFAULT '0',
			staked_gyds VARCHAR(78) NOT NULL DEFAULT '0',
			nonce BIGINT NOT NULL DEFAULT 0,
			last_active TIMESTAMP,
			created_at TIMESTAMP DEFAULT NOW(),
			updated_at TIMESTAMP DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_account_gyds ON account_balances(balance_gyds);
		CREATE INDEX IF NOT EXISTS idx_account_gyd ON account_balances(balance_gyd);

		-- Event logs
		CREATE TABLE IF NOT EXISTS event_logs (
			id SERIAL PRIMARY KEY,
			tx_hash VARCHAR(66) REFERENCES indexed_transactions(hash),
			log_index INTEGER NOT NULL,
			address VARCHAR(42) NOT NULL,
			topic0 VARCHAR(66),
			topic1 VARCHAR(66),
			topic2 VARCHAR(66),
			topic3 VARCHAR(66),
			data BYTEA,
			created_at TIMESTAMP DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_logs_address ON event_logs(address);
		CREATE INDEX IF NOT EXISTS idx_logs_topic0 ON event_logs(topic0);

		-- Indexer state
		CREATE TABLE IF NOT EXISTS indexer_state (
			key VARCHAR(64) PRIMARY KEY,
			value VARCHAR(256) NOT NULL,
			updated_at TIMESTAMP DEFAULT NOW()
		);

		-- Fee sponsorship tracking
		CREATE TABLE IF NOT EXISTS sponsored_fees (
			id SERIAL PRIMARY KEY,
			tx_hash VARCHAR(66) REFERENCES indexed_transactions(hash),
			sponsor_address VARCHAR(42) NOT NULL,
			beneficiary_address VARCHAR(42) NOT NULL,
			gas_paid VARCHAR(78) NOT NULL,
			timestamp TIMESTAMP NOT NULL,
			created_at TIMESTAMP DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_sponsor_address ON sponsored_fees(sponsor_address);
		CREATE INDEX IF NOT EXISTS idx_beneficiary ON sponsored_fees(beneficiary_address);
	`

	_, err := idx.db.Exec(schema)
	return err
}

// subscribeToBlocks listens for new blocks via blockchain event channel
func (idx *Indexer) subscribeToBlocks() {
	for {
		select {
		case <-idx.stopChan:
			return
		case block := <-idx.bc.BlockChan:
			if err := idx.indexBlock(block); err != nil {
				log.Printf("Error indexing block %d: %v", block.Header.Height, err)
			}
		}
	}
}

// subscribeToTransactions listens for new transactions
func (idx *Indexer) subscribeToTransactions() {
	for {
		select {
		case <-idx.stopChan:
			return
		case tx := <-idx.bc.TxChan:
			// Pending transactions - just log for now
			log.Printf("Pending tx: %s", hex.EncodeToString(tx.Hash[:]))
		}
	}
}

// syncLoop periodically syncs missed blocks
func (idx *Indexer) syncLoop() {
	ticker := time.NewTicker(idx.config.SyncInterval)
	defer ticker.Stop()

	for {
		select {
		case <-idx.stopChan:
			return
		case <-ticker.C:
			idx.syncMissedBlocks()
		}
	}
}

// syncMissedBlocks catches up on any missed blocks
func (idx *Indexer) syncMissedBlocks() {
	currentBlock := idx.bc.GetCurrentBlock()
	if currentBlock == nil {
		return
	}

	for height := idx.lastBlock + 1; height <= currentBlock.Header.Height; height++ {
		block, err := idx.bc.GetBlock(height)
		if err != nil {
			log.Printf("Error getting block %d: %v", height, err)
			continue
		}

		if err := idx.indexBlock(block); err != nil {
			log.Printf("Error indexing block %d: %v", height, err)
			break
		}
	}
}

// indexBlock indexes a single block and its transactions
func (idx *Indexer) indexBlock(block *blockchain.Block) error {
	tx, err := idx.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	blockHash := hex.EncodeToString(block.Hash()[:])
	prevHash := hex.EncodeToString(block.Header.PrevHash[:])
	proposer := hex.EncodeToString(block.Header.ProposerAddr[:])
	timestamp := time.Unix(int64(block.Header.Timestamp), 0)

	// Insert block
	_, err = tx.Exec(`
		INSERT INTO blocks (height, hash, prev_hash, timestamp, proposer, tx_count, gas_used, gas_limit)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (height) DO UPDATE SET
			hash = EXCLUDED.hash,
			tx_count = EXCLUDED.tx_count,
			gas_used = EXCLUDED.gas_used
	`, block.Header.Height, blockHash, prevHash, timestamp, proposer,
		len(block.Transactions), block.Header.GasUsed, block.Header.GasLimit)
	if err != nil {
		return err
	}

	// Index transactions
	for i, txn := range block.Transactions {
		if err := idx.indexTransaction(tx, txn, block.Header.Height, i, timestamp); err != nil {
			return err
		}
	}

	// Update indexer state
	_, err = tx.Exec(`
		INSERT INTO indexer_state (key, value, updated_at)
		VALUES ('last_indexed_block', $1, NOW())
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
	`, block.Header.Height)
	if err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	idx.mu.Lock()
	idx.lastBlock = block.Header.Height
	idx.mu.Unlock()

	log.Printf("Indexed block %d with %d txs", block.Header.Height, len(block.Transactions))
	return nil
}

// indexTransaction indexes a single transaction
func (idx *Indexer) indexTransaction(tx *sql.Tx, txn *blockchain.Transaction, blockHeight uint64, txIndex int, timestamp time.Time) error {
	txHash := hex.EncodeToString(txn.Hash[:])
	fromAddr := hex.EncodeToString(txn.From[:])
	toAddr := hex.EncodeToString(txn.To[:])
	
	var feePayer *string
	if txn.FeePayer != [20]byte{} {
		fp := hex.EncodeToString(txn.FeePayer[:])
		feePayer = &fp
	}

	// Insert transaction
	_, err := tx.Exec(`
		INSERT INTO indexed_transactions 
		(hash, block_height, tx_index, from_addr, to_addr, value_raw, coin_type, gas_price, gas_used, fee_payer, status, timestamp)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		ON CONFLICT (hash) DO NOTHING
	`, txHash, blockHeight, txIndex, fromAddr, toAddr, txn.Value.String(),
		int(txn.CoinType), txn.GasPrice, txn.GasUsed, feePayer, 1, timestamp)
	if err != nil {
		return err
	}

	// Track sponsored fees
	if feePayer != nil {
		gasPaid := new(big.Int).Mul(
			big.NewInt(int64(txn.GasUsed)),
			big.NewInt(int64(txn.GasPrice)),
		)
		_, err = tx.Exec(`
			INSERT INTO sponsored_fees (tx_hash, sponsor_address, beneficiary_address, gas_paid, timestamp)
			VALUES ($1, $2, $3, $4, $5)
		`, txHash, *feePayer, fromAddr, gasPaid.String(), timestamp)
		if err != nil {
			return err
		}
	}

	// Update account balances
	if err := idx.updateAccountBalance(tx, txn.From); err != nil {
		return err
	}
	if err := idx.updateAccountBalance(tx, txn.To); err != nil {
		return err
	}
	if feePayer != nil {
		var fpAddr [20]byte
		copy(fpAddr[:], txn.FeePayer[:])
		if err := idx.updateAccountBalance(tx, fpAddr); err != nil {
			return err
		}
	}

	return nil
}

// updateAccountBalance syncs account balance from blockchain to PostgreSQL
func (idx *Indexer) updateAccountBalance(tx *sql.Tx, addr [20]byte) error {
	acc := idx.bc.GetAccountState(addr)
	if acc == nil {
		return nil
	}

	addrStr := hex.EncodeToString(addr[:])

	_, err := tx.Exec(`
		INSERT INTO account_balances (address, balance_gyds, balance_gyd, staked_gyds, nonce, last_active, updated_at)
		VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
		ON CONFLICT (address) DO UPDATE SET
			balance_gyds = EXCLUDED.balance_gyds,
			balance_gyd = EXCLUDED.balance_gyd,
			staked_gyds = EXCLUDED.staked_gyds,
			nonce = EXCLUDED.nonce,
			last_active = NOW(),
			updated_at = NOW()
	`, addrStr, acc.BalanceGYDS.String(), acc.BalanceGYD.String(), acc.StakedGYDS.String(), acc.Nonce)

	return err
}

// getLastIndexedBlock returns the last indexed block height
func (idx *Indexer) getLastIndexedBlock() uint64 {
	var value string
	err := idx.db.QueryRow(`
		SELECT value FROM indexer_state WHERE key = 'last_indexed_block'
	`).Scan(&value)
	
	if err != nil {
		return idx.config.StartFromBlock
	}

	var height uint64
	if _, err := hex.Decode([]byte(value), []byte{}); err == nil {
		return height
	}
	return idx.config.StartFromBlock
}

// RebuildFromGenesis deletes all data and rebuilds from block 0
func (idx *Indexer) RebuildFromGenesis() error {
	log.Println("Rebuilding index from genesis...")

	// Clear all tables
	tables := []string{
		"sponsored_fees", "event_logs", "indexed_transactions", 
		"account_balances", "blocks", "indexer_state",
	}
	for _, table := range tables {
		if _, err := idx.db.Exec("TRUNCATE TABLE " + table + " CASCADE"); err != nil {
			return err
		}
	}

	idx.mu.Lock()
	idx.lastBlock = 0
	idx.mu.Unlock()

	// Re-sync from genesis
	idx.syncMissedBlocks()
	
	log.Println("Rebuild complete")
	return nil
}

// GetStats returns indexer statistics
func (idx *Indexer) GetStats() map[string]interface{} {
	idx.mu.RLock()
	defer idx.mu.RUnlock()

	var blockCount, txCount, accountCount int64
	idx.db.QueryRow("SELECT COUNT(*) FROM blocks").Scan(&blockCount)
	idx.db.QueryRow("SELECT COUNT(*) FROM indexed_transactions").Scan(&txCount)
	idx.db.QueryRow("SELECT COUNT(*) FROM account_balances").Scan(&accountCount)

	return map[string]interface{}{
		"last_indexed_block": idx.lastBlock,
		"total_blocks":       blockCount,
		"total_transactions": txCount,
		"total_accounts":     accountCount,
		"running":            idx.running,
	}
}
