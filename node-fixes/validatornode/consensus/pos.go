package consensus

import (
	"fmt"
	"math/rand"
	"sync"
	"time"

	"github.com/gydschain/validatornode/core"
)

// ValidatorInfo holds staking and status info for a single validator.
type ValidatorInfo struct {
	Address        string
	StakedAmount   int64
	Commission     float64
	Active         bool
	Slashed        bool
	SlashCount     int
	BlocksProposed uint64
	Uptime         float64
	JoinedAt       time.Time
}

// ValidatorSet manages the active set of validators for PoS consensus.
type ValidatorSet struct {
	mu         sync.RWMutex
	validators map[string]*ValidatorInfo
	ordered    []string // ordered list for round-robin
	current    int
}

func NewValidatorSet(addresses []string) *ValidatorSet {
	vs := &ValidatorSet{
		validators: make(map[string]*ValidatorInfo),
		ordered:    make([]string, 0, len(addresses)),
	}
	for _, addr := range addresses {
		vs.validators[addr] = &ValidatorInfo{
			Address:      addr,
			StakedAmount: 1000,
			Commission:   0.05,
			Active:       true,
			Uptime:       1.0,
			JoinedAt:     time.Now(),
		}
		vs.ordered = append(vs.ordered, addr)
	}
	return vs
}

// Next returns the next proposer via round-robin.
func (vs *ValidatorSet) Next() string {
	vs.mu.Lock()
	defer vs.mu.Unlock()
	if len(vs.ordered) == 0 {
		return "0x0000000000000000000000000000000000000001"
	}
	// Find next active validator
	for i := 0; i < len(vs.ordered); i++ {
		idx := (vs.current + i) % len(vs.ordered)
		addr := vs.ordered[idx]
		if vs.validators[addr].Active && !vs.validators[addr].Slashed {
			vs.current = (idx + 1) % len(vs.ordered)
			return addr
		}
	}
	return vs.ordered[vs.current%len(vs.ordered)]
}

// Add registers a new validator in the set.
func (vs *ValidatorSet) Add(addr string, stake int64) error {
	vs.mu.Lock()
	defer vs.mu.Unlock()
	if _, exists := vs.validators[addr]; exists {
		return fmt.Errorf("validator %s already registered", addr)
	}
	vs.validators[addr] = &ValidatorInfo{
		Address:      addr,
		StakedAmount: stake,
		Commission:   0.05,
		Active:       true,
		Uptime:       1.0,
		JoinedAt:     time.Now(),
	}
	vs.ordered = append(vs.ordered, addr)
	return nil
}

// Slash penalizes a validator for misbehaviour.
func (vs *ValidatorSet) Slash(addr string, reason string) {
	vs.mu.Lock()
	defer vs.mu.Unlock()
	if v, ok := vs.validators[addr]; ok {
		v.SlashCount++
		v.StakedAmount = int64(float64(v.StakedAmount) * 0.9) // 10% slash
		if v.SlashCount >= 3 {
			v.Slashed = true
			v.Active = false
		}
		_ = reason
	}
}

// List returns all validator infos.
func (vs *ValidatorSet) List() []*ValidatorInfo {
	vs.mu.RLock()
	defer vs.mu.RUnlock()
	result := make([]*ValidatorInfo, 0, len(vs.validators))
	for _, v := range vs.validators {
		cp := *v
		result = append(result, &cp)
	}
	return result
}

func (vs *ValidatorSet) Count() int {
	vs.mu.RLock()
	defer vs.mu.RUnlock()
	return len(vs.validators)
}

// PoSEngine drives block production.
type PoSEngine struct {
	chain        *core.Chain
	validators   *ValidatorSet
	blockTime    time.Duration
	onNewBlock   func(*core.Block)
	stopCh       chan struct{}
	txPool       []*core.Transaction
	txPoolMu     sync.Mutex
	rewardPerBlk int64
}

func NewPoSEngine(chain *core.Chain, validators *ValidatorSet, blockTime time.Duration) *PoSEngine {
	return &PoSEngine{
		chain:        chain,
		validators:   validators,
		blockTime:    blockTime,
		stopCh:       make(chan struct{}),
		rewardPerBlk: 2, // 2 GYDS per block
	}
}

func (e *PoSEngine) OnNewBlock(fn func(*core.Block)) {
	e.onNewBlock = fn
}

func (e *PoSEngine) AddTx(tx *core.Transaction) {
	e.txPoolMu.Lock()
	defer e.txPoolMu.Unlock()
	e.txPool = append(e.txPool, tx)
}

func (e *PoSEngine) TxPoolSize() int {
	e.txPoolMu.Lock()
	defer e.txPoolMu.Unlock()
	return len(e.txPool)
}

func (e *PoSEngine) Start() {
	go func() {
		ticker := time.NewTicker(e.blockTime)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				e.produceBlock()
			case <-e.stopCh:
				return
			}
		}
	}()
}

func (e *PoSEngine) produceBlock() {
	proposer := e.validators.Next()

	e.txPoolMu.Lock()
	// Take up to 100 txs from pool
	limit := 100
	if len(e.txPool) < limit {
		limit = len(e.txPool)
	}
	// Add 1-5 synthetic txs for realism
	syntheticCount := rand.Intn(5)
	txs := make([]*core.Transaction, 0, limit+syntheticCount)
	txs = append(txs, e.txPool[:limit]...)
	e.txPool = e.txPool[limit:]
	e.txPoolMu.Unlock()

	for i := 0; i < syntheticCount; i++ {
		tx := core.NewTransaction(
			"0x"+fmt.Sprintf("%040x", rand.Int63()),
			"0x"+fmt.Sprintf("%040x", rand.Int63()),
			"0x"+fmt.Sprintf("%x", rand.Int63n(1_000_000_000_000_000)),
			21_000,
		)
		txs = append(txs, tx)
	}

	block := e.chain.NewBlock(proposer, txs)
	if err := e.chain.AddBlock(block); err != nil {
		return
	}

	// Update proposer stats
	if v, ok := e.validators.validators[proposer]; ok {
		v.BlocksProposed++
	}

	if e.onNewBlock != nil {
		e.onNewBlock(block)
	}
}

func (e *PoSEngine) Stop() {
	close(e.stopCh)
}
