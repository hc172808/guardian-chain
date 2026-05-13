// Package rpc implements database connection management for the RPC server
package rpc

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"
)

// DatabaseConfig holds external database configuration
type DatabaseConfig struct {
	Type     string `json:"type"` // "cloud" or "external"
	Enabled  bool   `json:"enabled"`
	Host     string `json:"host,omitempty"`
	Port     int    `json:"port,omitempty"`
	Database string `json:"database,omitempty"`
	Username string `json:"username,omitempty"`
	Password string `json:"password,omitempty"`
	SSLMode  string `json:"ssl_mode,omitempty"`
}

// DatabaseManager manages database connections
type DatabaseManager struct {
	config       DatabaseConfig
	cloudDB      *sql.DB
	externalDB   *sql.DB
	activeDB     *sql.DB
	isConnected  bool
	lastPing     time.Time
	mu           sync.RWMutex
}

// NewDatabaseManager creates a new database manager
func NewDatabaseManager() *DatabaseManager {
	return &DatabaseManager{
		config: DatabaseConfig{
			Type:    "cloud",
			Enabled: true,
		},
	}
}

// Configure updates the database configuration
func (dm *DatabaseManager) Configure(config DatabaseConfig) error {
	dm.mu.Lock()
	defer dm.mu.Unlock()

	dm.config = config

	if config.Type == "external" && config.Enabled {
		return dm.connectExternal()
	} else if config.Type == "cloud" && config.Enabled {
		return dm.connectCloud()
	}

	return nil
}

// connectCloud connects to the cloud database
func (dm *DatabaseManager) connectCloud() error {
	// Cloud database connection is managed by Supabase
	// This is a placeholder for the Go node's cloud connection
	dm.isConnected = true
	dm.lastPing = time.Now()
	return nil
}

// connectExternal connects to an external database
func (dm *DatabaseManager) connectExternal() error {
	if dm.config.Host == "" {
		return errors.New("external database host not configured")
	}

	connStr := fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		dm.config.Host,
		dm.config.Port,
		dm.config.Username,
		dm.config.Password,
		dm.config.Database,
		dm.config.SSLMode,
	)

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return fmt.Errorf("failed to open external database: %w", err)
	}

	// Test connection
	if err := db.Ping(); err != nil {
		db.Close()
		return fmt.Errorf("failed to ping external database: %w", err)
	}

	// Configure connection pool
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	dm.externalDB = db
	dm.activeDB = db
	dm.isConnected = true
	dm.lastPing = time.Now()

	return nil
}

// Disconnect closes all database connections
func (dm *DatabaseManager) Disconnect() error {
	dm.mu.Lock()
	defer dm.mu.Unlock()

	var errs []error

	if dm.externalDB != nil {
		if err := dm.externalDB.Close(); err != nil {
			errs = append(errs, err)
		}
		dm.externalDB = nil
	}

	if dm.cloudDB != nil {
		if err := dm.cloudDB.Close(); err != nil {
			errs = append(errs, err)
		}
		dm.cloudDB = nil
	}

	dm.activeDB = nil
	dm.isConnected = false

	if len(errs) > 0 {
		return fmt.Errorf("errors during disconnect: %v", errs)
	}

	return nil
}

// DisableCloud disables the cloud database
func (dm *DatabaseManager) DisableCloud() error {
	dm.mu.Lock()
	defer dm.mu.Unlock()

	if dm.cloudDB != nil {
		dm.cloudDB.Close()
		dm.cloudDB = nil
	}

	dm.config.Type = "external"
	dm.config.Enabled = dm.externalDB != nil

	if dm.externalDB != nil {
		dm.activeDB = dm.externalDB
	} else {
		dm.activeDB = nil
		dm.isConnected = false
	}

	return nil
}

// EnableCloud enables the cloud database
func (dm *DatabaseManager) EnableCloud() error {
	dm.mu.Lock()
	defer dm.mu.Unlock()

	dm.config.Type = "cloud"
	dm.config.Enabled = true

	return dm.connectCloud()
}

// GetActiveDB returns the currently active database connection
func (dm *DatabaseManager) GetActiveDB() *sql.DB {
	dm.mu.RLock()
	defer dm.mu.RUnlock()
	return dm.activeDB
}

// IsConnected returns whether a database is connected
func (dm *DatabaseManager) IsConnected() bool {
	dm.mu.RLock()
	defer dm.mu.RUnlock()
	return dm.isConnected
}

// GetConfig returns the current configuration
func (dm *DatabaseManager) GetConfig() DatabaseConfig {
	dm.mu.RLock()
	defer dm.mu.RUnlock()
	return dm.config
}

// Ping tests the database connection
func (dm *DatabaseManager) Ping() error {
	dm.mu.Lock()
	defer dm.mu.Unlock()

	if dm.activeDB == nil {
		return errors.New("no active database connection")
	}

	if err := dm.activeDB.Ping(); err != nil {
		dm.isConnected = false
		return err
	}

	dm.lastPing = time.Now()
	dm.isConnected = true
	return nil
}

// GetStats returns database statistics
func (dm *DatabaseManager) GetStats() map[string]interface{} {
	dm.mu.RLock()
	defer dm.mu.RUnlock()

	stats := map[string]interface{}{
		"type":        dm.config.Type,
		"enabled":     dm.config.Enabled,
		"connected":   dm.isConnected,
		"last_ping":   dm.lastPing,
	}

	if dm.activeDB != nil {
		dbStats := dm.activeDB.Stats()
		stats["open_connections"] = dbStats.OpenConnections
		stats["in_use"] = dbStats.InUse
		stats["idle"] = dbStats.Idle
	}

	return stats
}

// ToJSON returns the config as JSON
func (dm *DatabaseManager) ToJSON() ([]byte, error) {
	dm.mu.RLock()
	defer dm.mu.RUnlock()
	return json.Marshal(dm.config)
}

// FromJSON loads config from JSON
func (dm *DatabaseManager) FromJSON(data []byte) error {
	var config DatabaseConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return err
	}
	return dm.Configure(config)
}
