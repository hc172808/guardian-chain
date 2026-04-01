// Package database implements PostgreSQL persistence for the blockchain
// Extends in-memory logic without replacing it
package database

import (
	"context"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"strconv"
	"sync"
	"time"
)

// BlockRow represents a block stored in PostgreSQL
type BlockRow struct {
	Height       uint64    `json:"height"`
	Hash         string    `json:"hash"`
	PreviousHash string    `json:"previous_hash"`
	ProposerAddr string    `json:"proposer_addr"`
	TxCount      int       `json:"tx_count"`
	GasUsed      uint64    `json:"gas_used"`
	GasLimit     uint64    `json:"gas_limit"`
	Timestamp    time.Time `json:"timestamp"`
	Data         string    `json:"data"`
}

// TransactionRow represents a transaction stored in PostgreSQL
type TransactionRow struct {
	Hash      string    `json:"hash"`
	BlockHash string    `json:"block_hash"`
	Height    uint64    `json:"block_height"`
	FromAddr  string    `json:"from_addr"`
	ToAddr    string    `json:"to_addr"`
	Amount    string    `json:"amount"`
	Fee       string    `json:"fee"`
	CoinType  string    `json:"coin_type"`
	TxType    string    `json:"tx_type"`
	Status    string    `json:"status"`
	Nonce     uint64    `json:"nonce"`
	Timestamp time.Time `json:"timestamp"`
}

// PgConfig holds PostgreSQL connection parameters
type PgConfig struct {
	Host     string
	Port     int
	User     string
	Password string
	DBName   string
}

// PgConfigFromEnv reads configuration from environment variables
func PgConfigFromEnv() PgConfig {
	port, _ := strconv.Atoi(getEnv("DB_PORT", "5432"))
	return PgConfig{
		Host:     getEnv("DB_HOST", "localhost"),
		Port:     port,
		User:     getEnv("DB_USER", "chaincore"),
		Password: getEnv("DB_PASS", ""),
		DBName:   getEnv("DB_NAME", "chaincore"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ConnString returns the pgx connection string
func (c PgConfig) ConnString() string {
	return fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
		c.Host, c.Port, c.User, c.Password, c.DBName,
	)
}

// PgStore is the PostgreSQL storage layer.
// It wraps a pool interface so the actual pgx dependency stays in the wiring layer.
// For the reference implementation we use database/sql with pgx stdlib driver.
type PgStore struct {
	db  PgDB // thin interface – see pgdb.go
	mu  sync.RWMutex
	ok  bool // tracks whether DB is reachable
}

// PgDB is an interface satisfied by *sql.DB so we can keep this package
// free of a direct pgx import (the driver is registered in main).
type PgDB interface {
	ExecContext(ctx context.Context, query string, args ...interface{}) (Result, error)
	QueryContext(ctx context.Context, query string, args ...interface{}) (Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...interface{}) Row
	PingContext(ctx context.Context) error
	Close() error
}

// Result / Rows / Row mirror the database/sql interfaces
type Result interface{ RowsAffected() (int64, error) }
type Rows interface {
	Next() bool
	Scan(dest ...interface{}) error
	Close() error
}
type Row interface{ Scan(dest ...interface{}) error }

// NewPgStore creates a new PostgreSQL store
func NewPgStore(db PgDB) (*PgStore, error) {
	s := &PgStore{db: db}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		log.Printf("[pgstore] WARNING: database unreachable on startup: %v", err)
		s.ok = false
		return s, nil // graceful – node continues without DB
	}
	s.ok = true

	if err := s.migrate(ctx); err != nil {
		return nil, fmt.Errorf("migration failed: %w", err)
	}

	return s, nil
}

// migrate creates tables if they don't exist
func (s *PgStore) migrate(ctx context.Context) error {
	ddl := `
	CREATE TABLE IF NOT EXISTS blocks (
		height       BIGINT PRIMARY KEY,
		hash         VARCHAR(66) UNIQUE NOT NULL,
		previous_hash VARCHAR(66) NOT NULL DEFAULT '',
		proposer_addr VARCHAR(42) NOT NULL DEFAULT '',
		tx_count     INT NOT NULL DEFAULT 0,
		gas_used     BIGINT NOT NULL DEFAULT 0,
		gas_limit    BIGINT NOT NULL DEFAULT 0,
		data         TEXT NOT NULL DEFAULT '',
		timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);
	CREATE INDEX IF NOT EXISTS idx_blocks_hash ON blocks (hash);
	CREATE INDEX IF NOT EXISTS idx_blocks_timestamp ON blocks (timestamp DESC);

	CREATE TABLE IF NOT EXISTS transactions (
		hash         VARCHAR(66) PRIMARY KEY,
		block_hash   VARCHAR(66) NOT NULL DEFAULT '',
		block_height BIGINT NOT NULL DEFAULT 0,
		from_addr    VARCHAR(42) NOT NULL,
		to_addr      VARCHAR(42) NOT NULL,
		amount       VARCHAR(78) NOT NULL DEFAULT '0',
		fee          VARCHAR(78) NOT NULL DEFAULT '0',
		coin_type    VARCHAR(10) NOT NULL DEFAULT 'GYDS',
		tx_type      VARCHAR(20) NOT NULL DEFAULT 'transfer',
		status       VARCHAR(20) NOT NULL DEFAULT 'pending',
		nonce        BIGINT NOT NULL DEFAULT 0,
		timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);
	CREATE INDEX IF NOT EXISTS idx_tx_block_height ON transactions (block_height);
	CREATE INDEX IF NOT EXISTS idx_tx_from ON transactions (from_addr);
	CREATE INDEX IF NOT EXISTS idx_tx_to ON transactions (to_addr);
	CREATE INDEX IF NOT EXISTS idx_tx_timestamp ON transactions (timestamp DESC);
	`

	_, err := s.db.ExecContext(ctx, ddl)
	return err
}

// IsHealthy reports whether the last operation succeeded
func (s *PgStore) IsHealthy() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.ok
}

// ---------------------------------------------------------------------------
// Write operations – called by the blockchain after in-memory commit
// ---------------------------------------------------------------------------

// InsertBlock stores a block. Duplicate heights are silently ignored (genesis safety).
func (s *PgStore) InsertBlock(ctx context.Context, b BlockRow) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO blocks (height, hash, previous_hash, proposer_addr, tx_count, gas_used, gas_limit, data, timestamp)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		 ON CONFLICT (height) DO NOTHING`,
		b.Height, b.Hash, b.PreviousHash, b.ProposerAddr,
		b.TxCount, b.GasUsed, b.GasLimit, b.Data, b.Timestamp,
	)
	if err != nil {
		log.Printf("[pgstore] InsertBlock height=%d err=%v", b.Height, err)
		s.ok = false
		return err
	}
	s.ok = true
	return nil
}

// InsertTransaction stores a transaction. Duplicates silently ignored.
func (s *PgStore) InsertTransaction(ctx context.Context, tx TransactionRow) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO transactions (hash, block_hash, block_height, from_addr, to_addr, amount, fee, coin_type, tx_type, status, nonce, timestamp)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		 ON CONFLICT (hash) DO UPDATE SET status = EXCLUDED.status, block_hash = EXCLUDED.block_hash, block_height = EXCLUDED.block_height`,
		tx.Hash, tx.BlockHash, tx.Height, tx.FromAddr, tx.ToAddr,
		tx.Amount, tx.Fee, tx.CoinType, tx.TxType, tx.Status, tx.Nonce, tx.Timestamp,
	)
	if err != nil {
		log.Printf("[pgstore] InsertTransaction hash=%s err=%v", tx.Hash, err)
		s.ok = false
		return err
	}
	s.ok = true
	return nil
}

// ---------------------------------------------------------------------------
// Read operations – used by the RPC layer
// ---------------------------------------------------------------------------

// LatestBlocks returns the N most recent blocks
func (s *PgStore) LatestBlocks(ctx context.Context, limit int) ([]BlockRow, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit <= 0 || limit > 100 {
		limit = 20
	}

	rows, err := s.db.QueryContext(ctx,
		`SELECT height, hash, previous_hash, proposer_addr, tx_count, gas_used, gas_limit, data, timestamp
		 FROM blocks ORDER BY height DESC LIMIT $1`, limit)
	if err != nil {
		s.markUnhealthy()
		return nil, err
	}
	defer rows.Close()

	var blocks []BlockRow
	for rows.Next() {
		var b BlockRow
		if err := rows.Scan(&b.Height, &b.Hash, &b.PreviousHash, &b.ProposerAddr,
			&b.TxCount, &b.GasUsed, &b.GasLimit, &b.Data, &b.Timestamp); err != nil {
			return nil, err
		}
		blocks = append(blocks, b)
	}
	return blocks, nil
}

// LatestTransactions returns the N most recent transactions
func (s *PgStore) LatestTransactions(ctx context.Context, limit int) ([]TransactionRow, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit <= 0 || limit > 100 {
		limit = 20
	}

	rows, err := s.db.QueryContext(ctx,
		`SELECT hash, block_hash, block_height, from_addr, to_addr, amount, fee, coin_type, tx_type, status, nonce, timestamp
		 FROM transactions ORDER BY timestamp DESC LIMIT $1`, limit)
	if err != nil {
		s.markUnhealthy()
		return nil, err
	}
	defer rows.Close()

	var txs []TransactionRow
	for rows.Next() {
		var t TransactionRow
		if err := rows.Scan(&t.Hash, &t.BlockHash, &t.Height, &t.FromAddr, &t.ToAddr,
			&t.Amount, &t.Fee, &t.CoinType, &t.TxType, &t.Status, &t.Nonce, &t.Timestamp); err != nil {
			return nil, err
		}
		txs = append(txs, t)
	}
	return txs, nil
}

// GenesisExists checks if height-0 block already exists
func (s *PgStore) GenesisExists(ctx context.Context) (bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	row := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM blocks WHERE height = 0`)
	var count int
	if err := row.Scan(&count); err != nil {
		return false, err
	}
	return count > 0, nil
}

// Close closes the database connection
func (s *PgStore) Close() error {
	return s.db.Close()
}

func (s *PgStore) markUnhealthy() {
	// safe to call under RLock since ok is only advisory
	s.mu.RUnlock()
	s.mu.Lock()
	s.ok = false
	s.mu.Unlock()
	s.mu.RLock()
}

// Helper to format [20]byte address as 0x hex
func FormatAddress(addr [20]byte) string {
	return "0x" + hex.EncodeToString(addr[:])
}

// Helper to format [32]byte hash as 0x hex
func FormatHash(hash [32]byte) string {
	return "0x" + hex.EncodeToString(hash[:])
}
