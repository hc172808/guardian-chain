// Package mining - Production Mining Pool Implementation
package mining

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"math/big"
	"sync"
	"sync/atomic"
	"time"

	"chaincore/internal/blockchain"
)

// PoolConfig holds mining pool configuration
type PoolConfig struct {
	Name            string
	Fee             float64 // Pool fee percentage
	MinPayout       *big.Int
	BlockReward     *big.Int
	TargetBlockTime uint64 // Target block time in seconds (120)
	MaxMiners       int
	Enabled         bool
}

// PoolStats holds pool statistics
type PoolStats struct {
	TotalHashRate  uint64    `json:"totalHashRate"`
	ActiveMiners   int       `json:"activeMiners"`
	BlocksFound    uint64    `json:"blocksFound"`
	LastBlockTime  time.Time `json:"lastBlockTime"`
	TotalPaid      *big.Int  `json:"totalPaid"`
	PendingRewards *big.Int  `json:"pendingRewards"`
	Luck           float64   `json:"luck"`
	Difficulty     *big.Int  `json:"difficulty"`
}

// PoolMiner represents a connected miner
type PoolMiner struct {
	Address        [20]byte
	PublicKey      []byte
	SessionID      [32]byte
	Algorithm      string // "randomx" or "kheavyhash"
	HashRate       uint64
	ValidShares    uint64
	RejectedShares uint64
	PendingReward  *big.Int
	TotalPaid      *big.Int
	LastShareTime  time.Time
	ConnectedAt    time.Time
	HumanScore     uint8
	IsOnline       bool
	WorkerName     string
	IPAddress      string
	mu             sync.Mutex
}

// Pool implements a production mining pool
type Pool struct {
	config      PoolConfig
	chain       *blockchain.Blockchain
	distributor *Distributor
	miners      map[[20]byte]*PoolMiner
	sessions    map[[32]byte]*PoolMiner
	stats       PoolStats
	running     int32
	stopCh      chan struct{}
	mu          sync.RWMutex
}

// NewPool creates a new mining pool
func NewPool(chain *blockchain.Blockchain, distributor *Distributor, config PoolConfig) *Pool {
	return &Pool{
		config:      config,
		chain:       chain,
		distributor: distributor,
		miners:      make(map[[20]byte]*PoolMiner),
		sessions:    make(map[[32]byte]*PoolMiner),
		stats: PoolStats{
			TotalPaid:      big.NewInt(0),
			PendingRewards: big.NewInt(0),
			Difficulty:     distributor.GetDifficulty(),
		},
		stopCh: make(chan struct{}),
	}
}

// Start starts the mining pool
func (p *Pool) Start() error {
	if !atomic.CompareAndSwapInt32(&p.running, 0, 1) {
		return nil // Already running
	}

	go p.statsUpdater()
	go p.payoutProcessor()
	go p.minerCleanup()

	return nil
}

// Stop stops the mining pool
func (p *Pool) Stop() {
	if !atomic.CompareAndSwapInt32(&p.running, 1, 0) {
		return
	}
	close(p.stopCh)
}

// Connect connects a new miner to the pool
func (p *Pool) Connect(address [20]byte, algorithm string, workerName string, ipAddress string) (*PoolMiner, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	// Check max miners
	if len(p.miners) >= p.config.MaxMiners {
		return nil, errors.New("pool is full")
	}

	// Check if miner already connected
	if existing, exists := p.miners[address]; exists {
		existing.IsOnline = true
		existing.ConnectedAt = time.Now()
		return existing, nil
	}

	// Create new session
	sessionID := p.generateSessionID(address)

	miner := &PoolMiner{
		Address:       address,
		SessionID:     sessionID,
		Algorithm:     algorithm,
		HashRate:      0,
		ValidShares:   0,
		PendingReward: big.NewInt(0),
		TotalPaid:     big.NewInt(0),
		ConnectedAt:   time.Now(),
		LastShareTime: time.Now(),
		HumanScore:    100,
		IsOnline:      true,
		WorkerName:    workerName,
		IPAddress:     ipAddress,
	}

	p.miners[address] = miner
	p.sessions[sessionID] = miner

	return miner, nil
}

// Disconnect disconnects a miner from the pool
func (p *Pool) Disconnect(sessionID [32]byte) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if miner, exists := p.sessions[sessionID]; exists {
		miner.IsOnline = false
	}
}

// SubmitShare processes a share submission from a miner
func (p *Pool) SubmitShare(sessionID [32]byte, nonce uint64, hash [32]byte, jobID string) (bool, *big.Int, error) {
	p.mu.RLock()
	miner, exists := p.sessions[sessionID]
	p.mu.RUnlock()

	if !exists {
		return false, nil, errors.New("invalid session")
	}

	miner.mu.Lock()
	defer miner.mu.Unlock()

	// Rate limiting - minimum 5 seconds between shares
	if time.Since(miner.LastShareTime) < 5*time.Second {
		miner.RejectedShares++
		return false, nil, errors.New("rate limited")
	}

	// Create share for distributor
	share := &Share{
		MinerAddr:  miner.Address,
		Nonce:      nonce,
		Hash:       hash,
		Difficulty: p.stats.Difficulty,
		Timestamp:  time.Now(),
		HumanScore: miner.HumanScore,
		SessionID:  sessionID,
		IsValid:    false,
	}

	// Submit to distributor for validation and reward calculation
	if err := p.distributor.SubmitShare(share); err != nil {
		miner.RejectedShares++
		return false, nil, err
	}

	// Share accepted
	miner.ValidShares++
	miner.LastShareTime = time.Now()

	// Calculate share reward based on algorithm
	reward := p.calculateShareReward(miner.Algorithm, miner.HumanScore)

	// Apply pool fee
	poolFee := new(big.Int).Mul(reward, big.NewInt(int64(p.config.Fee*100)))
	poolFee.Div(poolFee, big.NewInt(10000))
	minerReward := new(big.Int).Sub(reward, poolFee)

	// Add to pending rewards
	miner.PendingReward.Add(miner.PendingReward, minerReward)

	// Update pool pending rewards
	p.mu.Lock()
	p.stats.PendingRewards.Add(p.stats.PendingRewards, minerReward)
	p.mu.Unlock()

	return true, minerReward, nil
}

// calculateShareReward calculates reward based on algorithm
// RandomX (CPU): 1 KH/s = 0.00032077 GYDS/day
// kHeavyHash (GPU): 1000 GH/s = 0.00000298 GYDS/day
func (p *Pool) calculateShareReward(algorithm string, humanScore uint8) *big.Int {
	// Base reward in wei (18 decimals)
	var baseReward *big.Int

	if algorithm == "randomx" {
		// RandomX: 0.00032077 / 86400 / 1000 per H/s per second ≈ 3.7e-12 per share
		// Assuming 1 share = 5 seconds of work at ~1000 H/s
		baseReward = big.NewInt(1855) // ~1.855e-15 tokens per share (scaled up)
	} else {
		// kHeavyHash: 0.00000298 / 86400 / 1000 per GH/s per second
		baseReward = big.NewInt(17) // Much smaller due to high hash rates
	}

	// Apply human score multiplier
	humanMultiplier := big.NewInt(int64(humanScore))
	baseReward.Mul(baseReward, humanMultiplier)
	baseReward.Div(baseReward, big.NewInt(100))

	// Scale up for token decimals
	baseReward.Mul(baseReward, big.NewInt(1e12))

	return baseReward
}

// GetWork returns current mining work for a miner
func (p *Pool) GetWork(sessionID [32]byte) (map[string]interface{}, error) {
	p.mu.RLock()
	miner, exists := p.sessions[sessionID]
	p.mu.RUnlock()

	if !exists {
		return nil, errors.New("invalid session")
	}

	// Get current block data
	currentBlock := p.chain.GetCurrentBlock()

	work := map[string]interface{}{
		"jobId":         hex.EncodeToString(p.generateJobID()),
		"target":        p.stats.Difficulty.Text(16),
		"difficulty":    p.stats.Difficulty.String(),
		"blockHeight":   currentBlock.Header.Height + 1,
		"prevBlockHash": hex.EncodeToString(currentBlock.Header.BlockHash[:]),
		"timestamp":     time.Now().Unix(),
		"algorithm":     miner.Algorithm,
	}

	return work, nil
}

// GetPoolStats returns current pool statistics
func (p *Pool) GetPoolStats() PoolStats {
	p.mu.RLock()
	defer p.mu.RUnlock()

	stats := p.stats
	stats.Difficulty = p.distributor.GetDifficulty()

	// Count active miners
	activeCount := 0
	var totalHashRate uint64

	for _, miner := range p.miners {
		if miner.IsOnline && time.Since(miner.LastShareTime) < 5*time.Minute {
			activeCount++
			totalHashRate += miner.HashRate
		}
	}

	stats.ActiveMiners = activeCount
	stats.TotalHashRate = totalHashRate

	return stats
}

// GetMinerStats returns stats for a specific miner
func (p *Pool) GetMinerStats(sessionID [32]byte) (*PoolMiner, error) {
	p.mu.RLock()
	defer p.mu.RUnlock()

	miner, exists := p.sessions[sessionID]
	if !exists {
		return nil, errors.New("miner not found")
	}

	return miner, nil
}

// statsUpdater updates pool statistics periodically
func (p *Pool) statsUpdater() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-p.stopCh:
			return
		case <-ticker.C:
			p.updateStats()
		}
	}
}

func (p *Pool) updateStats() {
	p.mu.Lock()
	defer p.mu.Unlock()

	// Update difficulty from distributor
	p.stats.Difficulty = p.distributor.GetDifficulty()

	// Calculate hash rates for all miners
	var totalHashRate uint64
	activeCount := 0

	for _, miner := range p.miners {
		miner.mu.Lock()
		if miner.IsOnline && time.Since(miner.LastShareTime) < 5*time.Minute {
			// Estimate hash rate from share rate
			elapsed := time.Since(miner.ConnectedAt).Seconds()
			if elapsed > 0 {
				shareRate := float64(miner.ValidShares) / elapsed
				// Estimate H/s from shares (assuming 5s share time target)
				if miner.Algorithm == "randomx" {
					miner.HashRate = uint64(shareRate * 1000 * 5) // H/s
				} else {
					miner.HashRate = uint64(shareRate * 1e9 * 5) // H/s (for GH/s display)
				}
			}
			totalHashRate += miner.HashRate
			activeCount++
		} else if time.Since(miner.LastShareTime) > 5*time.Minute {
			miner.IsOnline = false
		}
		miner.mu.Unlock()
	}

	p.stats.TotalHashRate = totalHashRate
	p.stats.ActiveMiners = activeCount
}

// payoutProcessor processes pending payouts
func (p *Pool) payoutProcessor() {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-p.stopCh:
			return
		case <-ticker.C:
			p.processPayouts()
		}
	}
}

func (p *Pool) processPayouts() {
	p.mu.Lock()
	defer p.mu.Unlock()

	for _, miner := range p.miners {
		miner.mu.Lock()
		// Check if pending reward exceeds minimum payout
		if miner.PendingReward.Cmp(p.config.MinPayout) >= 0 {
			// In production, this would create a blockchain transaction
			// For now, just track the payout
			miner.TotalPaid.Add(miner.TotalPaid, miner.PendingReward)
			p.stats.TotalPaid.Add(p.stats.TotalPaid, miner.PendingReward)
			p.stats.PendingRewards.Sub(p.stats.PendingRewards, miner.PendingReward)
			miner.PendingReward = big.NewInt(0)
		}
		miner.mu.Unlock()
	}
}

// minerCleanup removes inactive miners
func (p *Pool) minerCleanup() {
	ticker := time.NewTicker(30 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-p.stopCh:
			return
		case <-ticker.C:
			p.cleanupInactiveMiners()
		}
	}
}

func (p *Pool) cleanupInactiveMiners() {
	p.mu.Lock()
	defer p.mu.Unlock()

	cutoff := time.Now().Add(-24 * time.Hour)

	for addr, miner := range p.miners {
		if miner.LastShareTime.Before(cutoff) && miner.PendingReward.Cmp(big.NewInt(0)) == 0 {
			delete(p.sessions, miner.SessionID)
			delete(p.miners, addr)
		}
	}
}

func (p *Pool) generateSessionID(addr [20]byte) [32]byte {
	data := append(addr[:], []byte(time.Now().String())...)
	return sha256.Sum256(data)
}

func (p *Pool) generateJobID() []byte {
	data := []byte(time.Now().String())
	hash := sha256.Sum256(data)
	return hash[:8]
}
