package consensus

import (
	"sync"
	"time"

	"github.com/gydschain/rpcnode/core"
)

type ValidatorInfo struct {
	Address        string
	StakedAmount   int64
	Commission     float64
	Active         bool
	BlocksProposed uint64
	Uptime         float64
	JoinedAt       time.Time
}

type ValidatorSet struct {
	mu         sync.RWMutex
	validators map[string]*ValidatorInfo
	ordered    []string
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

func (vs *ValidatorSet) Next() string {
	vs.mu.Lock()
	defer vs.mu.Unlock()
	if len(vs.ordered) == 0 {
		return "0x0000000000000000000000000000000000000001"
	}
	for i := 0; i < len(vs.ordered); i++ {
		addr := vs.ordered[vs.current%len(vs.ordered)]
		vs.current++
		if info := vs.validators[addr]; info != nil && info.Active {
			return addr
		}
	}
	vs.current++
	return vs.ordered[0]
}

func (vs *ValidatorSet) List() []*ValidatorInfo {
	vs.mu.RLock()
	defer vs.mu.RUnlock()
	out := make([]*ValidatorInfo, 0, len(vs.ordered))
	for _, addr := range vs.ordered {
		out = append(out, vs.validators[addr])
	}
	return out
}

type PoSEngine struct {
	mu        sync.Mutex
	chain     *core.Chain
	vs        *ValidatorSet
	blockTime time.Duration
	callbacks []func(*core.Block)
	quit      chan struct{}
}

func NewPoSEngine(chain *core.Chain, vs *ValidatorSet, blockTime time.Duration) *PoSEngine {
	return &PoSEngine{
		chain:     chain,
		vs:        vs,
		blockTime: blockTime,
		quit:      make(chan struct{}),
	}
}

func (e *PoSEngine) OnNewBlock(cb func(*core.Block)) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.callbacks = append(e.callbacks, cb)
}

func (e *PoSEngine) Start() {
	go func() {
		ticker := time.NewTicker(e.blockTime)
		defer ticker.Stop()
		for {
			select {
			case <-e.quit:
				return
			case <-ticker.C:
				proposer := e.vs.Next()
				b := e.chain.MintBlock(proposer, nil)
				e.mu.Lock()
				cbs := make([]func(*core.Block), len(e.callbacks))
				copy(cbs, e.callbacks)
				e.mu.Unlock()
				for _, cb := range cbs {
					go cb(b)
				}
			}
		}
	}()
}

func (e *PoSEngine) Stop() {
	select {
	case <-e.quit:
	default:
		close(e.quit)
	}
}
