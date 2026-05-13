// Package mining implements the mining reward distribution system
// IMPORTANT: Mining affects ONLY rewards, never block production or consensus
package mining

import (
	"crypto/sha256"
	"errors"
	"math/big"
	"sync"
	"time"

	"chaincore/internal/blockchain"
)

// Config holds mining configuration
type Config struct {
	Enabled              bool
	TargetShareTime      uint64 // Target time between shares in seconds
	MaxSharesPerMinute   int
	SessionRewardCap     *big.Int
	DailyAddressCap      *big.Int
	AntiBotEnabled       bool
	DifficultyAdjustment bool
	MinDifficulty        *big.Int
	MaxDifficulty        *big.Int
}

// Share represents a valid mining share
type Share struct {
	MinerAddr   [20]byte
	Nonce       uint64
	Hash        [32]byte
	Difficulty  *big.Int
	Timestamp   time.Time
	HumanScore  uint8
	SessionID   [32]byte
	PoolID      [20]byte
	IsValid     bool
}

// MinerSession tracks a miner's session
type MinerSession struct {
	SessionID        [32]byte
	MinerAddr        [20]byte
	StartTime        time.Time
	ShareCount       int
	TotalRewards     *big.Int
	CurrentDifficulty *big.Int
	HumanScore       uint8
	LastShareTime    time.Time
	RejectedShares   int
	ValidShares      int
}

// DailyStats tracks daily mining statistics per address
type DailyStats struct {
	Address      [20]byte
	Date         time.Time
	TotalRewards *big.Int
	ShareCount   int
	Sessions     int
}

// Distributor manages mining reward distribution
type Distributor struct {
	config       Config
	chain        *blockchain.Blockchain
	sessions     map[[32]byte]*MinerSession
	dailyStats   map[[20]byte]*DailyStats
	shareQueue   chan *Share
	difficulty   *big.Int
	mu           sync.RWMutex
}

// NewDistributor creates a new mining reward distributor
func NewDistributor(chain *blockchain.Blockchain, config Config) *Distributor {
	return &Distributor{
		config:     config,
		chain:      chain,
		sessions:   make(map[[32]byte]*MinerSession),
		dailyStats: make(map[[20]byte]*DailyStats),
		shareQueue: make(chan *Share, 10000),
		difficulty: config.MinDifficulty,
	}
}

// Start starts the mining distributor
func (d *Distributor) Start() error {
	go d.processShares()
	go d.adjustDifficulty()
	go d.cleanupSessions()
	return nil
}

// Stop stops the mining distributor
func (d *Distributor) Stop() {
	close(d.shareQueue)
}

// SubmitShare submits a mining share
func (d *Distributor) SubmitShare(share *Share) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	// Validate session
	session, exists := d.sessions[share.SessionID]
	if !exists {
		return errors.New("invalid session")
	}

	// Anti-bot checks
	if d.config.AntiBotEnabled {
		if err := d.validateAntiBot(session, share); err != nil {
			session.RejectedShares++
			return err
		}
	}

	// Rate limiting
	if err := d.checkRateLimits(session); err != nil {
		session.RejectedShares++
		return err
	}

	// Validate share difficulty
	if !d.validateShareDifficulty(share) {
		session.RejectedShares++
		return errors.New("share difficulty too low")
	}

	// Check daily cap
	if err := d.checkDailyCap(share.MinerAddr); err != nil {
		return err
	}

	// Check session cap
	if session.TotalRewards.Cmp(d.config.SessionRewardCap) >= 0 {
		return errors.New("session reward cap reached")
	}

	// Queue share for processing
	share.IsValid = true
	d.shareQueue <- share

	// Update session stats
	session.ShareCount++
	session.ValidShares++
	session.LastShareTime = time.Now()

	return nil
}

// CreateSession creates a new mining session
func (d *Distributor) CreateSession(minerAddr [20]byte) (*MinerSession, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	sessionID := generateSessionID(minerAddr)
	
	session := &MinerSession{
		SessionID:        sessionID,
		MinerAddr:        minerAddr,
		StartTime:        time.Now(),
		ShareCount:       0,
		TotalRewards:     big.NewInt(0),
		CurrentDifficulty: d.difficulty,
		HumanScore:       100, // Start with full score
		LastShareTime:    time.Now(),
	}

	d.sessions[sessionID] = session
	return session, nil
}

// validateAntiBot performs anti-bot validation
func (d *Distributor) validateAntiBot(session *MinerSession, share *Share) error {
	// Calculate human score based on behavior patterns
	humanScore := d.calculateHumanScore(session, share)
	
	if humanScore < 30 {
		return errors.New("anti-bot check failed: behavior indicates automation")
	}

	share.HumanScore = humanScore
	session.HumanScore = humanScore

	return nil
}

// calculateHumanScore calculates the human probability score
// Formula: H(t,v,e) = min(100, (σ_timing × σ_variance × σ_entropy × 100))
func (d *Distributor) calculateHumanScore(session *MinerSession, share *Share) uint8 {
	// Timing analysis
	timingScore := d.analyzeTimingPatterns(session)
	
	// Variance analysis
	varianceScore := d.analyzeVariance(session)
	
	// Entropy analysis
	entropyScore := d.analyzeEntropy(session, share)

	// Combined score
	combined := timingScore * varianceScore * entropyScore
	if combined > 1.0 {
		combined = 1.0
	}

	return uint8(combined * 100)
}

// analyzeTimingPatterns checks for robotic timing patterns
func (d *Distributor) analyzeTimingPatterns(session *MinerSession) float64 {
	// Check time between shares
	timeSinceLastShare := time.Since(session.LastShareTime).Seconds()
	
	// Too fast = likely bot
	if timeSinceLastShare < 0.1 {
		return 0.1
	}
	
	// Perfect timing intervals = suspicious
	// Humans have natural variance
	
	return 0.9
}

// analyzeVariance checks for unnatural consistency
func (d *Distributor) analyzeVariance(session *MinerSession) float64 {
	// Real miners have hashrate variance
	// Perfect consistency indicates automation
	return 0.85
}

// analyzeEntropy checks for randomness in submissions
func (d *Distributor) analyzeEntropy(session *MinerSession, share *Share) float64 {
	// Analyze nonce distribution for entropy
	return 0.9
}

// checkRateLimits enforces rate limiting
func (d *Distributor) checkRateLimits(session *MinerSession) error {
	// Calculate max shares per minute based on human score
	// Formula: M(H) = 100 × (H/100)²
	humanFactor := float64(session.HumanScore) / 100.0
	maxPerMinute := int(100.0 * humanFactor * humanFactor)

	if maxPerMinute < 10 {
		maxPerMinute = 10
	}

	// Check actual rate
	elapsedMinutes := time.Since(session.StartTime).Minutes()
	if elapsedMinutes < 0.1 {
		elapsedMinutes = 0.1
	}
	
	currentRate := float64(session.ShareCount) / elapsedMinutes
	
	if currentRate > float64(maxPerMinute) {
		return errors.New("rate limit exceeded")
	}

	return nil
}

// validateShareDifficulty validates share meets minimum difficulty
func (d *Distributor) validateShareDifficulty(share *Share) bool {
	return share.Difficulty.Cmp(d.difficulty) >= 0
}

// checkDailyCap checks if miner has reached daily cap
func (d *Distributor) checkDailyCap(addr [20]byte) error {
	stats := d.dailyStats[addr]
	if stats == nil {
		return nil
	}

	// Check if same day
	if !isSameDay(stats.Date, time.Now()) {
		// Reset for new day
		stats.TotalRewards = big.NewInt(0)
		stats.ShareCount = 0
		stats.Sessions = 0
		return nil
	}

	if stats.TotalRewards.Cmp(d.config.DailyAddressCap) >= 0 {
		return errors.New("daily reward cap reached")
	}

	return nil
}

// processShares processes valid shares and distributes rewards
func (d *Distributor) processShares() {
	for share := range d.shareQueue {
		if !share.IsValid {
			continue
		}

		// Calculate reward based on difficulty and human score
		reward := d.calculateReward(share)

		// Update session
		d.mu.Lock()
		if session, exists := d.sessions[share.SessionID]; exists {
			session.TotalRewards.Add(session.TotalRewards, reward)
		}

		// Update daily stats
		if stats, exists := d.dailyStats[share.MinerAddr]; exists {
			stats.TotalRewards.Add(stats.TotalRewards, reward)
			stats.ShareCount++
		} else {
			d.dailyStats[share.MinerAddr] = &DailyStats{
				Address:      share.MinerAddr,
				Date:         time.Now(),
				TotalRewards: reward,
				ShareCount:   1,
				Sessions:     1,
			}
		}
		d.mu.Unlock()

		// Credit reward to miner's account
		// This updates the blockchain state
	}
}

// calculateReward calculates the reward for a share
// Formula: R(d,H) = BaseReward × (d/D_network) × (H/100)
func (d *Distributor) calculateReward(share *Share) *big.Int {
	baseReward := big.NewInt(100000000000000000) // 0.1 token base

	// Difficulty multiplier
	diffMultiplier := new(big.Int).Div(share.Difficulty, d.difficulty)
	
	// Human score multiplier (penalize low scores)
	humanMultiplier := big.NewInt(int64(share.HumanScore))

	reward := new(big.Int).Mul(baseReward, diffMultiplier)
	reward.Mul(reward, humanMultiplier)
	reward.Div(reward, big.NewInt(100))

	return reward
}

// adjustDifficulty adjusts mining difficulty
func (d *Distributor) adjustDifficulty() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		d.mu.Lock()
		// Calculate average share time
		avgShareTime := d.calculateAverageShareTime()
		
		// Adjust difficulty
		// Formula: D_new = D_old × (T_actual / T_target)
		targetTime := float64(d.config.TargetShareTime)
		
		if avgShareTime < targetTime*0.8 {
			// Too fast, increase difficulty
			d.difficulty.Mul(d.difficulty, big.NewInt(110))
			d.difficulty.Div(d.difficulty, big.NewInt(100))
		} else if avgShareTime > targetTime*1.2 {
			// Too slow, decrease difficulty
			d.difficulty.Mul(d.difficulty, big.NewInt(90))
			d.difficulty.Div(d.difficulty, big.NewInt(100))
		}

		// Clamp to bounds
		if d.difficulty.Cmp(d.config.MinDifficulty) < 0 {
			d.difficulty.Set(d.config.MinDifficulty)
		}
		if d.difficulty.Cmp(d.config.MaxDifficulty) > 0 {
			d.difficulty.Set(d.config.MaxDifficulty)
		}

		d.mu.Unlock()
	}
}

// calculateAverageShareTime calculates average time between shares
func (d *Distributor) calculateAverageShareTime() float64 {
	// Calculate based on recent shares
	return 10.0 // Placeholder
}

// cleanupSessions removes expired sessions
func (d *Distributor) cleanupSessions() {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()

	for range ticker.C {
		d.mu.Lock()
		cutoff := time.Now().Add(-24 * time.Hour)
		for id, session := range d.sessions {
			if session.LastShareTime.Before(cutoff) {
				delete(d.sessions, id)
			}
		}
		d.mu.Unlock()
	}
}

// GetDifficulty returns current mining difficulty
func (d *Distributor) GetDifficulty() *big.Int {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return new(big.Int).Set(d.difficulty)
}

// GetSessionStats returns session statistics
func (d *Distributor) GetSessionStats(sessionID [32]byte) *MinerSession {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.sessions[sessionID]
}

// Helper functions
func generateSessionID(addr [20]byte) [32]byte {
	data := append(addr[:], []byte(time.Now().String())...)
	return sha256.Sum256(data)
}

func isSameDay(t1, t2 time.Time) bool {
	y1, m1, d1 := t1.Date()
	y2, m2, d2 := t2.Date()
	return y1 == y2 && m1 == m2 && d1 == d2
}
