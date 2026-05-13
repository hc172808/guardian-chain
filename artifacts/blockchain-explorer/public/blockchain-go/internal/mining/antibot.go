// Package mining - Anti-bot protection system
package mining

import (
	"crypto/sha256"
	"encoding/binary"
	"math"
	"sync"
	"time"
)

// AntiBotConfig holds anti-bot configuration
type AntiBotConfig struct {
	MinHumanScore           uint8
	TimingAnalysisWindow    time.Duration
	VarianceThreshold       float64
	EntropyMinimum          float64
	BehaviorCacheSize       int
	ChallengeEnabled        bool
	ChallengeInterval       time.Duration
}

// BehaviorPattern tracks miner behavior for analysis
type BehaviorPattern struct {
	SubmissionTimes  []time.Time
	NonceValues      []uint64
	DifficultyDeltas []int64
	HashRates        []float64
	GeoLocations     []string
	UserAgents       []string
}

// AntiBotEngine implements bot detection
type AntiBotEngine struct {
	config    AntiBotConfig
	patterns  map[[20]byte]*BehaviorPattern
	scores    map[[20]byte]uint8
	blacklist map[[20]byte]time.Time
	mu        sync.RWMutex
}

// NewAntiBotEngine creates a new anti-bot engine
func NewAntiBotEngine(config AntiBotConfig) *AntiBotEngine {
	return &AntiBotEngine{
		config:    config,
		patterns:  make(map[[20]byte]*BehaviorPattern),
		scores:    make(map[[20]byte]uint8),
		blacklist: make(map[[20]byte]time.Time),
	}
}

// AnalyzeSubmission analyzes a share submission for bot behavior
func (ab *AntiBotEngine) AnalyzeSubmission(addr [20]byte, submission *ShareSubmission) (uint8, error) {
	ab.mu.Lock()
	defer ab.mu.Unlock()

	// Check blacklist
	if expiry, blacklisted := ab.blacklist[addr]; blacklisted {
		if time.Now().Before(expiry) {
			return 0, nil
		}
		delete(ab.blacklist, addr)
	}

	// Get or create pattern
	pattern := ab.getOrCreatePattern(addr)
	
	// Record this submission
	pattern.SubmissionTimes = append(pattern.SubmissionTimes, time.Now())
	pattern.NonceValues = append(pattern.NonceValues, submission.Nonce)

	// Trim old data
	ab.trimPattern(pattern)

	// Calculate human score
	score := ab.calculateScore(pattern)
	ab.scores[addr] = score

	// Blacklist if score too low
	if score < ab.config.MinHumanScore {
		ab.blacklist[addr] = time.Now().Add(time.Hour)
	}

	return score, nil
}

// ShareSubmission represents a share submission for analysis
type ShareSubmission struct {
	Nonce      uint64
	Hash       [32]byte
	Difficulty uint64
	Timestamp  time.Time
	UserAgent  string
	IP         string
}

// calculateScore calculates the human probability score
// H(t,v,e) = min(100, σ_timing × σ_variance × σ_entropy × 100)
func (ab *AntiBotEngine) calculateScore(pattern *BehaviorPattern) uint8 {
	if len(pattern.SubmissionTimes) < 2 {
		return 100 // Not enough data, assume human
	}

	// σ_timing: Timing analysis (0-1)
	timingScore := ab.calculateTimingScore(pattern)
	
	// σ_variance: Variance analysis (0-1)
	varianceScore := ab.calculateVarianceScore(pattern)
	
	// σ_entropy: Entropy analysis (0-1)
	entropyScore := ab.calculateEntropyScore(pattern)

	// Combined score
	combined := timingScore * varianceScore * entropyScore * 100
	
	if combined > 100 {
		combined = 100
	}
	if combined < 0 {
		combined = 0
	}

	return uint8(combined)
}

// calculateTimingScore analyzes timing patterns
// Bots tend to submit at regular intervals
func (ab *AntiBotEngine) calculateTimingScore(pattern *BehaviorPattern) float64 {
	if len(pattern.SubmissionTimes) < 3 {
		return 1.0
	}

	// Calculate intervals
	intervals := make([]float64, len(pattern.SubmissionTimes)-1)
	for i := 1; i < len(pattern.SubmissionTimes); i++ {
		intervals[i-1] = pattern.SubmissionTimes[i].Sub(pattern.SubmissionTimes[i-1]).Seconds()
	}

	// Calculate coefficient of variation (CV)
	// Low CV = regular intervals = likely bot
	mean := average(intervals)
	stdDev := standardDeviation(intervals, mean)
	
	if mean < 0.001 {
		return 0.1 // Too fast
	}

	cv := stdDev / mean

	// Humans typically have CV > 0.3
	// Bots typically have CV < 0.1
	if cv < 0.1 {
		return 0.2
	} else if cv < 0.3 {
		return 0.5
	} else if cv < 0.5 {
		return 0.8
	}
	
	return 1.0
}

// calculateVarianceScore analyzes nonce variance
// Bots may use predictable nonce patterns
func (ab *AntiBotEngine) calculateVarianceScore(pattern *BehaviorPattern) float64 {
	if len(pattern.NonceValues) < 3 {
		return 1.0
	}

	// Check for sequential nonces
	sequentialCount := 0
	for i := 1; i < len(pattern.NonceValues); i++ {
		if pattern.NonceValues[i] == pattern.NonceValues[i-1]+1 {
			sequentialCount++
		}
	}

	sequentialRatio := float64(sequentialCount) / float64(len(pattern.NonceValues)-1)

	// High sequential ratio = likely bot
	if sequentialRatio > 0.8 {
		return 0.2
	} else if sequentialRatio > 0.5 {
		return 0.5
	}

	return 1.0
}

// calculateEntropyScore measures randomness in submissions
func (ab *AntiBotEngine) calculateEntropyScore(pattern *BehaviorPattern) float64 {
	if len(pattern.NonceValues) < 5 {
		return 1.0
	}

	// Calculate Shannon entropy of nonce distribution
	entropy := shannonEntropy(pattern.NonceValues)
	
	// Expected entropy for random 64-bit values is high
	// Low entropy indicates patterns
	maxEntropy := math.Log2(float64(len(pattern.NonceValues)))
	normalizedEntropy := entropy / maxEntropy

	if normalizedEntropy < 0.3 {
		return 0.2
	} else if normalizedEntropy < 0.6 {
		return 0.5
	}

	return normalizedEntropy
}

// GetMaxSharesPerMinute calculates rate limit based on human score
// M(H) = 100 × (H/100)²
func GetMaxSharesPerMinute(humanScore uint8) int {
	h := float64(humanScore) / 100.0
	return int(100.0 * h * h)
}

// GetSessionRewardCap calculates session reward cap
// S(H) = BaseSessionCap × (H/100)^1.5
func GetSessionRewardCap(humanScore uint8, baseCap float64) float64 {
	h := float64(humanScore) / 100.0
	return baseCap * math.Pow(h, 1.5)
}

// GetDailyAddressCap calculates daily address cap
// A(H,d) = BaseDailyCap × (H/100) × (1 + ln(d+1)/10)
// where d = days active
func GetDailyAddressCap(humanScore uint8, daysActive int, baseCap float64) float64 {
	h := float64(humanScore) / 100.0
	loyaltyBonus := 1.0 + math.Log(float64(daysActive)+1)/10.0
	return baseCap * h * loyaltyBonus
}

// GenerateChallenge generates a PoW challenge for verification
func (ab *AntiBotEngine) GenerateChallenge(addr [20]byte) *Challenge {
	challenge := &Challenge{
		ID:         generateChallengeID(addr),
		Difficulty: calculateChallengeDifficulty(ab.scores[addr]),
		CreatedAt:  time.Now(),
		ExpiresAt:  time.Now().Add(time.Minute),
	}
	return challenge
}

// Challenge represents a PoW challenge for bot verification
type Challenge struct {
	ID         [32]byte
	Difficulty uint64
	CreatedAt  time.Time
	ExpiresAt  time.Time
}

// VerifyChallenge verifies a challenge response
func (ab *AntiBotEngine) VerifyChallenge(addr [20]byte, challenge *Challenge, nonce uint64) bool {
	if time.Now().After(challenge.ExpiresAt) {
		return false
	}

	// Verify PoW
	data := make([]byte, 40)
	copy(data[:32], challenge.ID[:])
	binary.BigEndian.PutUint64(data[32:], nonce)
	
	hash := sha256.Sum256(data)
	
	// Check leading zeros
	requiredZeros := challenge.Difficulty / 8
	for i := uint64(0); i < requiredZeros; i++ {
		if hash[i] != 0 {
			return false
		}
	}

	return true
}

// Helper functions
func (ab *AntiBotEngine) getOrCreatePattern(addr [20]byte) *BehaviorPattern {
	if pattern, exists := ab.patterns[addr]; exists {
		return pattern
	}
	pattern := &BehaviorPattern{
		SubmissionTimes: make([]time.Time, 0, 100),
		NonceValues:     make([]uint64, 0, 100),
	}
	ab.patterns[addr] = pattern
	return pattern
}

func (ab *AntiBotEngine) trimPattern(pattern *BehaviorPattern) {
	maxSize := ab.config.BehaviorCacheSize
	if maxSize == 0 {
		maxSize = 100
	}

	if len(pattern.SubmissionTimes) > maxSize {
		pattern.SubmissionTimes = pattern.SubmissionTimes[len(pattern.SubmissionTimes)-maxSize:]
	}
	if len(pattern.NonceValues) > maxSize {
		pattern.NonceValues = pattern.NonceValues[len(pattern.NonceValues)-maxSize:]
	}
}

func average(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sum := 0.0
	for _, v := range values {
		sum += v
	}
	return sum / float64(len(values))
}

func standardDeviation(values []float64, mean float64) float64 {
	if len(values) < 2 {
		return 0
	}
	sumSquares := 0.0
	for _, v := range values {
		diff := v - mean
		sumSquares += diff * diff
	}
	return math.Sqrt(sumSquares / float64(len(values)-1))
}

func shannonEntropy(values []uint64) float64 {
	if len(values) == 0 {
		return 0
	}

	// Count occurrences
	counts := make(map[uint64]int)
	for _, v := range values {
		counts[v]++
	}

	// Calculate entropy
	entropy := 0.0
	n := float64(len(values))
	for _, count := range counts {
		p := float64(count) / n
		entropy -= p * math.Log2(p)
	}

	return entropy
}

func generateChallengeID(addr [20]byte) [32]byte {
	data := append(addr[:], []byte(time.Now().String())...)
	return sha256.Sum256(data)
}

func calculateChallengeDifficulty(score uint8) uint64 {
	// Lower scores = harder challenges
	base := uint64(16)
	if score < 50 {
		base = 24
	} else if score < 30 {
		base = 32
	}
	return base
}
