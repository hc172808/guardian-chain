// Package mining - Lite node miner implementation
package mining

import (
	"crypto/sha256"
	"encoding/binary"
	"math/big"
	"sync"
	"sync/atomic"
	"time"

	"chaincore/internal/liteclient"
)

// LiteMinerConfig holds lite miner configuration
type LiteMinerConfig struct {
	Threads            int
	MinerAddress       string
	EnableCPU          bool
	EnableBrowser      bool
	ShareSubmitTimeout int
}

// LiteMiner implements mining for lite nodes
type LiteMiner struct {
	config      LiteMinerConfig
	client      *liteclient.Client
	running     int32
	hashCount   uint64
	validShares uint64
	rejected    uint64
	startTime   time.Time
	difficulty  *big.Int
	wg          sync.WaitGroup
	stopCh      chan struct{}
}

// MiningStats holds mining statistics
type MiningStats struct {
	HashRate     float64 `json:"hashRate"`
	ValidShares  uint64  `json:"validShares"`
	RejectedShares uint64 `json:"rejectedShares"`
	Uptime       string  `json:"uptime"`
	Difficulty   string  `json:"difficulty"`
}

// NewLiteMiner creates a new lite miner
func NewLiteMiner(client *liteclient.Client, config LiteMinerConfig) (*LiteMiner, error) {
	return &LiteMiner{
		config:     config,
		client:     client,
		difficulty: big.NewInt(1000000),
		stopCh:     make(chan struct{}),
	}, nil
}

// Start starts mining
func (m *LiteMiner) Start() error {
	if !atomic.CompareAndSwapInt32(&m.running, 0, 1) {
		return nil // Already running
	}

	m.startTime = time.Now()
	m.stopCh = make(chan struct{})

	// Get initial work
	work, err := m.client.GetMiningWork()
	if err != nil {
		atomic.StoreInt32(&m.running, 0)
		return err
	}

	// Parse difficulty
	if diffStr, ok := work["difficulty"].(string); ok {
		m.difficulty, _ = new(big.Int).SetString(diffStr, 10)
	}

	// Start mining threads
	for i := 0; i < m.config.Threads; i++ {
		m.wg.Add(1)
		go m.miningThread(i)
	}

	// Start work updater
	go m.workUpdater()

	return nil
}

// Stop stops mining
func (m *LiteMiner) Stop() {
	if !atomic.CompareAndSwapInt32(&m.running, 1, 0) {
		return // Not running
	}

	close(m.stopCh)
	m.wg.Wait()
}

// IsRunning returns whether mining is active
func (m *LiteMiner) IsRunning() bool {
	return atomic.LoadInt32(&m.running) == 1
}

// GetHashRate returns the current hash rate
func (m *LiteMiner) GetHashRate() float64 {
	elapsed := time.Since(m.startTime).Seconds()
	if elapsed < 1 {
		elapsed = 1
	}
	return float64(atomic.LoadUint64(&m.hashCount)) / elapsed
}

// GetStats returns mining statistics
func (m *LiteMiner) GetStats() MiningStats {
	return MiningStats{
		HashRate:       m.GetHashRate(),
		ValidShares:   atomic.LoadUint64(&m.validShares),
		RejectedShares: atomic.LoadUint64(&m.rejected),
		Uptime:        time.Since(m.startTime).String(),
		Difficulty:    m.difficulty.String(),
	}
}

// miningThread runs a single mining thread
func (m *LiteMiner) miningThread(id int) {
	defer m.wg.Done()

	var nonce uint64 = uint64(id) * 1000000000
	target := new(big.Int).Div(
		new(big.Int).Lsh(big.NewInt(1), 256),
		m.difficulty,
	)

	for atomic.LoadInt32(&m.running) == 1 {
		select {
		case <-m.stopCh:
			return
		default:
			// Mine
			hash := m.computeHash(nonce)
			atomic.AddUint64(&m.hashCount, 1)

			// Check if valid share
			hashInt := new(big.Int).SetBytes(hash[:])
			if hashInt.Cmp(target) < 0 {
				m.submitShare(nonce, hash)
			}

			nonce++
		}
	}
}

// computeHash computes the mining hash
func (m *LiteMiner) computeHash(nonce uint64) [32]byte {
	data := make([]byte, 40)
	copy(data[:32], []byte(m.config.MinerAddress))
	binary.BigEndian.PutUint64(data[32:], nonce)
	return sha256.Sum256(data)
}

// submitShare submits a valid share
func (m *LiteMiner) submitShare(nonce uint64, hash [32]byte) {
	share := map[string]interface{}{
		"minerAddr": m.config.MinerAddress,
		"nonce":     nonce,
		"hash":      hash[:],
	}

	accepted, err := m.client.SubmitMiningShare(share)
	if err != nil || !accepted {
		atomic.AddUint64(&m.rejected, 1)
		return
	}

	atomic.AddUint64(&m.validShares, 1)
}

// workUpdater updates mining work periodically
func (m *LiteMiner) workUpdater() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-m.stopCh:
			return
		case <-ticker.C:
			work, err := m.client.GetMiningWork()
			if err != nil {
				continue
			}

			if diffStr, ok := work["difficulty"].(string); ok {
				newDiff, _ := new(big.Int).SetString(diffStr, 10)
				m.difficulty = newDiff
			}
		}
	}
}
