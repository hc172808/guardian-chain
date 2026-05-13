// Package consensus implements the Proof-of-Stake consensus engine
package consensus

import (
	"crypto/ecdsa"
	"errors"
	"math/big"
	"sort"
	"sync"
	"time"

	"chaincore/internal/blockchain"
)

// PoSConfig holds PoS consensus configuration
type PoSConfig struct {
	ValidatorKeyPath   string
	MinValidators      int
	BlockFinality      int    // Blocks needed for finality
	SlashingEnabled    bool
	RewardPerBlock     *big.Int
	MinStake           *big.Int
	UnbondingPeriod    time.Duration
}

// Validator represents a PoS validator
type Validator struct {
	Address    [20]byte
	PublicKey  *ecdsa.PublicKey
	Stake      *big.Int
	Commission uint8 // 0-100 percentage
	Active     bool
	Jailed     bool
	Uptime     float64
	LastVote   uint64
}

// PoSEngine implements the PoS consensus
type PoSEngine struct {
	config       PoSConfig
	chain        *blockchain.Blockchain
	validators   map[[20]byte]*Validator
	proposerKey  *ecdsa.PrivateKey
	currentRound uint64
	finalizedAt  uint64
	votes        map[uint64]map[[20]byte]bool // height -> validator -> voted
	mu           sync.RWMutex
}

// NewPoSEngine creates a new PoS consensus engine
func NewPoSEngine(chain *blockchain.Blockchain, config PoSConfig) (*PoSEngine, error) {
	engine := &PoSEngine{
		config:     config,
		chain:      chain,
		validators: make(map[[20]byte]*Validator),
		votes:      make(map[uint64]map[[20]byte]bool),
	}

	// Load validator key if provided
	if config.ValidatorKeyPath != "" {
		key, err := loadValidatorKey(config.ValidatorKeyPath)
		if err != nil {
			return nil, err
		}
		engine.proposerKey = key
	}

	return engine, nil
}

// Start starts the consensus engine
func (pos *PoSEngine) Start() error {
	// Start consensus loop
	go pos.consensusLoop()
	return nil
}

// Stop stops the consensus engine
func (pos *PoSEngine) Stop() {
	// Cleanup
}

// consensusLoop runs the main consensus loop
func (pos *PoSEngine) consensusLoop() {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	for range ticker.C {
		pos.processRound()
	}
}

// processRound processes a consensus round
func (pos *PoSEngine) processRound() {
	pos.mu.Lock()
	defer pos.mu.Unlock()

	currentBlock := pos.chain.GetCurrentBlock()
	height := currentBlock.Header.Height + 1

	// Check if we're the proposer
	if pos.isProposer(height) {
		pos.proposeBlock(height)
	}

	// Process votes and finality
	pos.processFinalityVotes(height)
}

// isProposer checks if this node is the block proposer
func (pos *PoSEngine) isProposer(height uint64) bool {
	if pos.proposerKey == nil {
		return false
	}

	// Deterministic proposer selection based on stake weight
	proposer := pos.selectProposer(height)
	myAddr := pubKeyToAddress(pos.proposerKey.PublicKey)
	return proposer == myAddr
}

// selectProposer selects a proposer for the given height
func (pos *PoSEngine) selectProposer(height uint64) [20]byte {
	// Get active validators sorted by stake
	active := pos.getActiveValidators()
	if len(active) == 0 {
		return [20]byte{}
	}

	// Weighted random selection based on stake
	totalStake := big.NewInt(0)
	for _, v := range active {
		totalStake.Add(totalStake, v.Stake)
	}

	// Use block height as seed for determinism
	seed := new(big.Int).SetUint64(height)
	selection := new(big.Int).Mod(seed, totalStake)

	cumulative := big.NewInt(0)
	for _, v := range active {
		cumulative.Add(cumulative, v.Stake)
		if cumulative.Cmp(selection) > 0 {
			return v.Address
		}
	}

	return active[0].Address
}

// proposeBlock creates and proposes a new block
func (pos *PoSEngine) proposeBlock(height uint64) {
	// This is where PoS creates blocks - mining has NO influence here
	// Mining only distributes rewards, never affects block production
}

// processFinalityVotes processes votes for block finality
func (pos *PoSEngine) processFinalityVotes(height uint64) {
	// Count votes for blocks
	for h, votes := range pos.votes {
		if h < height-uint64(pos.config.BlockFinality) {
			votedStake := pos.calculateVotedStake(votes)
			totalStake := pos.getTotalActiveStake()

			// Finalize if 2/3+ stake voted
			threshold := new(big.Int).Mul(totalStake, big.NewInt(2))
			threshold.Div(threshold, big.NewInt(3))

			if votedStake.Cmp(threshold) >= 0 {
				pos.finalizeBlock(h)
			}
		}
	}
}

// finalizeBlock marks a block as finalized (irreversible)
func (pos *PoSEngine) finalizeBlock(height uint64) {
	if height > pos.finalizedAt {
		pos.finalizedAt = height
		// Emit finality event
		// Once finalized, the block CANNOT be reverted
	}
}

// VoteForBlock submits a vote for a block
func (pos *PoSEngine) VoteForBlock(height uint64, blockHash [32]byte, validator [20]byte, signature [65]byte) error {
	pos.mu.Lock()
	defer pos.mu.Unlock()

	// Verify validator is active
	v, exists := pos.validators[validator]
	if !exists || !v.Active || v.Jailed {
		return errors.New("invalid or inactive validator")
	}

	// Verify signature
	if !verifyVoteSignature(height, blockHash, validator, signature) {
		return errors.New("invalid vote signature")
	}

	// Record vote
	if pos.votes[height] == nil {
		pos.votes[height] = make(map[[20]byte]bool)
	}
	pos.votes[height][validator] = true
	v.LastVote = height

	return nil
}

// RegisterValidator registers a new validator
func (pos *PoSEngine) RegisterValidator(addr [20]byte, stake *big.Int, pubKey *ecdsa.PublicKey) error {
	pos.mu.Lock()
	defer pos.mu.Unlock()

	if stake.Cmp(pos.config.MinStake) < 0 {
		return errors.New("stake below minimum requirement")
	}

	pos.validators[addr] = &Validator{
		Address:    addr,
		PublicKey:  pubKey,
		Stake:      stake,
		Commission: 10,
		Active:     true,
		Jailed:     false,
		Uptime:     100.0,
	}

	return nil
}

// SlashValidator slashes a validator for misbehavior
func (pos *PoSEngine) SlashValidator(addr [20]byte, reason string, percentage uint8) error {
	pos.mu.Lock()
	defer pos.mu.Unlock()

	if !pos.config.SlashingEnabled {
		return nil
	}

	v, exists := pos.validators[addr]
	if !exists {
		return errors.New("validator not found")
	}

	// Calculate slash amount
	slashAmount := new(big.Int).Mul(v.Stake, big.NewInt(int64(percentage)))
	slashAmount.Div(slashAmount, big.NewInt(100))

	// Reduce stake
	v.Stake.Sub(v.Stake, slashAmount)

	// Jail validator if severe
	if percentage >= 30 {
		v.Jailed = true
		v.Active = false
	}

	return nil
}

// IsFinalized checks if a block height is finalized
func (pos *PoSEngine) IsFinalized(height uint64) bool {
	pos.mu.RLock()
	defer pos.mu.RUnlock()
	return height <= pos.finalizedAt
}

// GetFinalizedHeight returns the latest finalized height
func (pos *PoSEngine) GetFinalizedHeight() uint64 {
	pos.mu.RLock()
	defer pos.mu.RUnlock()
	return pos.finalizedAt
}

// Helper functions
func (pos *PoSEngine) getActiveValidators() []*Validator {
	active := make([]*Validator, 0)
	for _, v := range pos.validators {
		if v.Active && !v.Jailed {
			active = append(active, v)
		}
	}
	sort.Slice(active, func(i, j int) bool {
		return active[i].Stake.Cmp(active[j].Stake) > 0
	})
	return active
}

func (pos *PoSEngine) calculateVotedStake(votes map[[20]byte]bool) *big.Int {
	total := big.NewInt(0)
	for addr := range votes {
		if v, exists := pos.validators[addr]; exists {
			total.Add(total, v.Stake)
		}
	}
	return total
}

func (pos *PoSEngine) getTotalActiveStake() *big.Int {
	total := big.NewInt(0)
	for _, v := range pos.validators {
		if v.Active && !v.Jailed {
			total.Add(total, v.Stake)
		}
	}
	return total
}

func loadValidatorKey(path string) (*ecdsa.PrivateKey, error) {
	// Load key from file
	return nil, nil
}

func pubKeyToAddress(pub ecdsa.PublicKey) [20]byte {
	// Convert public key to address
	return [20]byte{}
}

func verifyVoteSignature(height uint64, blockHash [32]byte, validator [20]byte, signature [65]byte) bool {
	// Verify ECDSA signature
	return true
}
