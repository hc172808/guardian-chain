// Package mining - Difficulty adjustment system
package mining

import (
	"math"
	"math/big"
	"sync"
	"time"
)

// DifficultyConfig holds difficulty adjustment configuration
type DifficultyConfig struct {
	TargetBlockTime     time.Duration // Target time between shares
	AdjustmentWindow    int           // Number of blocks to consider
	MaxAdjustmentFactor float64       // Maximum adjustment per window
	MinDifficulty       *big.Int
	MaxDifficulty       *big.Int
	SmoothingFactor     float64       // For EMA smoothing
}

// DifficultyEngine manages difficulty adjustments
type DifficultyEngine struct {
	config          DifficultyConfig
	currentDiff     *big.Int
	shareHistory    []ShareRecord
	adjustmentLog   []DifficultyAdjustment
	networkHashRate float64
	mu              sync.RWMutex
}

// ShareRecord records share submission for difficulty analysis
type ShareRecord struct {
	Timestamp  time.Time
	Difficulty *big.Int
	MinerAddr  [20]byte
}

// DifficultyAdjustment records a difficulty adjustment event
type DifficultyAdjustment struct {
	Timestamp      time.Time
	OldDifficulty  *big.Int
	NewDifficulty  *big.Int
	Reason         string
	ActualTime     time.Duration
	TargetTime     time.Duration
	NetworkHashRate float64
}

// NewDifficultyEngine creates a new difficulty engine
func NewDifficultyEngine(config DifficultyConfig) *DifficultyEngine {
	return &DifficultyEngine{
		config:        config,
		currentDiff:   new(big.Int).Set(config.MinDifficulty),
		shareHistory:  make([]ShareRecord, 0, config.AdjustmentWindow*2),
		adjustmentLog: make([]DifficultyAdjustment, 0),
	}
}

// RecordShare records a share for difficulty calculation
func (de *DifficultyEngine) RecordShare(record ShareRecord) {
	de.mu.Lock()
	defer de.mu.Unlock()

	de.shareHistory = append(de.shareHistory, record)

	// Trim old records
	if len(de.shareHistory) > de.config.AdjustmentWindow*2 {
		de.shareHistory = de.shareHistory[len(de.shareHistory)-de.config.AdjustmentWindow:]
	}
}

// AdjustDifficulty performs difficulty adjustment
// Formula: D_new = D_old × (T_actual / T_target)
// With bounds: D_new = clamp(D_new, D_min, D_max)
// Smoothing: D_final = α × D_new + (1-α) × D_old
func (de *DifficultyEngine) AdjustDifficulty() *big.Int {
	de.mu.Lock()
	defer de.mu.Unlock()

	if len(de.shareHistory) < de.config.AdjustmentWindow {
		return de.currentDiff
	}

	// Calculate actual time for window
	window := de.shareHistory[len(de.shareHistory)-de.config.AdjustmentWindow:]
	actualTime := window[len(window)-1].Timestamp.Sub(window[0].Timestamp)
	
	// Target time for window
	targetTime := de.config.TargetBlockTime * time.Duration(de.config.AdjustmentWindow)

	// Calculate adjustment ratio
	ratio := float64(actualTime) / float64(targetTime)

	// Clamp ratio
	if ratio > de.config.MaxAdjustmentFactor {
		ratio = de.config.MaxAdjustmentFactor
	} else if ratio < 1.0/de.config.MaxAdjustmentFactor {
		ratio = 1.0 / de.config.MaxAdjustmentFactor
	}

	// Calculate new difficulty
	oldDiff := new(big.Int).Set(de.currentDiff)
	
	// D_new = D_old × ratio
	ratioNum := int64(ratio * 1000000)
	newDiff := new(big.Int).Mul(de.currentDiff, big.NewInt(ratioNum))
	newDiff.Div(newDiff, big.NewInt(1000000))

	// Apply smoothing: D_final = α × D_new + (1-α) × D_old
	alpha := int64(de.config.SmoothingFactor * 1000)
	oneMinusAlpha := 1000 - alpha

	smoothed := new(big.Int).Mul(newDiff, big.NewInt(alpha))
	oldSmoothed := new(big.Int).Mul(oldDiff, big.NewInt(oneMinusAlpha))
	smoothed.Add(smoothed, oldSmoothed)
	smoothed.Div(smoothed, big.NewInt(1000))

	// Apply bounds
	if smoothed.Cmp(de.config.MinDifficulty) < 0 {
		smoothed.Set(de.config.MinDifficulty)
	}
	if smoothed.Cmp(de.config.MaxDifficulty) > 0 {
		smoothed.Set(de.config.MaxDifficulty)
	}

	// Record adjustment
	de.adjustmentLog = append(de.adjustmentLog, DifficultyAdjustment{
		Timestamp:       time.Now(),
		OldDifficulty:   oldDiff,
		NewDifficulty:   smoothed,
		Reason:          "window_adjustment",
		ActualTime:      actualTime,
		TargetTime:      targetTime,
		NetworkHashRate: de.networkHashRate,
	})

	de.currentDiff = smoothed
	return de.currentDiff
}

// GetDifficulty returns current difficulty
func (de *DifficultyEngine) GetDifficulty() *big.Int {
	de.mu.RLock()
	defer de.mu.RUnlock()
	return new(big.Int).Set(de.currentDiff)
}

// UpdateNetworkHashRate updates the estimated network hash rate
func (de *DifficultyEngine) UpdateNetworkHashRate() {
	de.mu.Lock()
	defer de.mu.Unlock()

	if len(de.shareHistory) < 2 {
		return
	}

	// Calculate hash rate from recent shares
	// H = D × shares / time
	window := de.shareHistory[len(de.shareHistory)-min(100, len(de.shareHistory)):]
	
	duration := window[len(window)-1].Timestamp.Sub(window[0].Timestamp).Seconds()
	if duration < 1 {
		return
	}

	// Sum of difficulties
	totalDiff := big.NewInt(0)
	for _, share := range window {
		totalDiff.Add(totalDiff, share.Difficulty)
	}

	// Hash rate = total difficulty / time
	hashRate := new(big.Float).SetInt(totalDiff)
	hashRate.Quo(hashRate, big.NewFloat(duration))

	de.networkHashRate, _ = hashRate.Float64()
}

// GetNetworkHashRate returns estimated network hash rate
func (de *DifficultyEngine) GetNetworkHashRate() float64 {
	de.mu.RLock()
	defer de.mu.RUnlock()
	return de.networkHashRate
}

// CalculateMinerDifficulty calculates personalized difficulty for a miner
// Formula: D_miner = D_network × performance_factor × human_score_factor
func (de *DifficultyEngine) CalculateMinerDifficulty(minerHashRate float64, humanScore uint8) *big.Int {
	de.mu.RLock()
	networkDiff := new(big.Int).Set(de.currentDiff)
	networkHash := de.networkHashRate
	de.mu.RUnlock()

	// Performance factor: miner's share of network
	var performanceFactor float64
	if networkHash > 0 {
		performanceFactor = minerHashRate / networkHash
		if performanceFactor > 10 {
			performanceFactor = 10 // Cap at 10x
		}
		if performanceFactor < 0.1 {
			performanceFactor = 0.1 // Min 0.1x
		}
	} else {
		performanceFactor = 1.0
	}

	// Human score factor: lower scores get higher difficulty
	humanFactor := float64(humanScore) / 100.0
	if humanFactor < 0.3 {
		humanFactor = 0.3
	}

	// Combined factor
	factor := performanceFactor * humanFactor
	factorInt := int64(factor * 1000000)

	minerDiff := new(big.Int).Mul(networkDiff, big.NewInt(factorInt))
	minerDiff.Div(minerDiff, big.NewInt(1000000))

	// Apply bounds
	if minerDiff.Cmp(de.config.MinDifficulty) < 0 {
		minerDiff.Set(de.config.MinDifficulty)
	}

	return minerDiff
}

// GetDifficultyCurve returns the difficulty curve parameters
func (de *DifficultyEngine) GetDifficultyCurve() DifficultyParameters {
	de.mu.RLock()
	defer de.mu.RUnlock()

	return DifficultyParameters{
		CurrentDifficulty:   new(big.Int).Set(de.currentDiff),
		MinDifficulty:       new(big.Int).Set(de.config.MinDifficulty),
		MaxDifficulty:       new(big.Int).Set(de.config.MaxDifficulty),
		TargetTime:          de.config.TargetBlockTime,
		AdjustmentWindow:    de.config.AdjustmentWindow,
		SmoothingFactor:     de.config.SmoothingFactor,
		MaxAdjustmentFactor: de.config.MaxAdjustmentFactor,
		NetworkHashRate:     de.networkHashRate,
	}
}

// DifficultyParameters holds current difficulty parameters
type DifficultyParameters struct {
	CurrentDifficulty   *big.Int
	MinDifficulty       *big.Int
	MaxDifficulty       *big.Int
	TargetTime          time.Duration
	AdjustmentWindow    int
	SmoothingFactor     float64
	MaxAdjustmentFactor float64
	NetworkHashRate     float64
}

// PredictDifficulty predicts future difficulty based on trends
func (de *DifficultyEngine) PredictDifficulty(futureBlocks int) *big.Int {
	de.mu.RLock()
	defer de.mu.RUnlock()

	if len(de.adjustmentLog) < 2 {
		return de.currentDiff
	}

	// Calculate trend from recent adjustments
	recent := de.adjustmentLog[max(0, len(de.adjustmentLog)-10):]
	
	var trend float64
	for i := 1; i < len(recent); i++ {
		oldF, _ := new(big.Float).SetInt(recent[i-1].NewDifficulty).Float64()
		newF, _ := new(big.Float).SetInt(recent[i].NewDifficulty).Float64()
		if oldF > 0 {
			trend += (newF - oldF) / oldF
		}
	}
	trend /= float64(len(recent) - 1)

	// Project difficulty
	adjustmentsToMake := futureBlocks / de.config.AdjustmentWindow
	projectedChange := math.Pow(1+trend, float64(adjustmentsToMake))

	currentF, _ := new(big.Float).SetInt(de.currentDiff).Float64()
	predictedF := currentF * projectedChange

	predicted := new(big.Int)
	new(big.Float).SetFloat64(predictedF).Int(predicted)

	return predicted
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
