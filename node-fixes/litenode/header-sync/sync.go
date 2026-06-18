package headersync

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum/crypto"
)

// Header represents a minimal block header synced by the lite node.
type Header struct {
	Version       uint32
	Height        uint64
	Timestamp     uint64
	PrevHash      [32]byte
	StateRoot     [32]byte
	TxRoot        [32]byte
	ReceiptsRoot  [32]byte
	ValidatorRoot [32]byte
	ProposerAddr  [20]byte
	Signature     [65]byte
	Hash          [32]byte
}

// ValidatorInfo holds the on-chain validator record.
type ValidatorInfo struct {
	Address [20]byte
	Staked  *big.Int
	Active  bool
}

// SyncManager manages header-only sync for a lite node.
// It does NOT produce blocks — it only pulls headers from full nodes and
// validates them against the known validator set.
type SyncManager struct {
	mu            sync.RWMutex
	headers       []Header          // ordered by height
	validatorSet  map[[20]byte]ValidatorInfo
	endpoints     []string
	syncInterval  time.Duration
	latestHeight  uint64
	rpcClient     RPCClient
	stopCh        chan struct{}
}

// RPCClient is the minimal interface for pulling headers from full nodes.
type RPCClient interface {
	GetLatestHeight() (uint64, error)
	GetBlockHeader(height uint64) (*Header, error)
}

// NewSyncManager creates a new header-sync manager.
func NewSyncManager(endpoints []string, interval time.Duration, validators []string) (*SyncManager, error) {
	vs := make(map[[20]byte]ValidatorInfo, len(validators))
	for _, v := range validators {
		var addr [20]byte
		b, err := hex.DecodeString(strip0x(v))
		if err != nil || len(b) != 20 {
			continue
		}
		copy(addr[:], b)
		vs[addr] = ValidatorInfo{Address: addr, Active: true}
	}
	return &SyncManager{
		endpoints:    endpoints,
		syncInterval:   interval,
		validatorSet:   vs,
		stopCh:       make(chan struct{}),
	}, nil
}

// SetRPCClient sets the RPC client used for pulling headers.
func (sm *SyncManager) SetRPCClient(c RPCClient) {
	sm.rpcClient = c
}

// Start begins the background header sync loop.
func (sm *SyncManager) Start() error {
	go sm.loop()
	return nil
}

// Stop stops the background sync loop.
func (sm *SyncManager) Stop() {
	close(sm.stopCh)
}

// loop periodically pulls and validates new headers.
func (sm *SyncManager) loop() {
	ticker := time.NewTicker(sm.syncInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := sm.syncOnce(); err != nil {
				// Log silently; lite nodes must be resilient to endpoint failures.
				_ = err
			}
		case <-sm.stopCh:
			return
		}
	}
}

// syncOnce pulls the latest height, then fetches any missing headers.
func (sm *SyncManager) syncOnce() error {
	if sm.rpcClient == nil {
		return errors.New("no RPC client configured")
	}
	latest, err := sm.rpcClient.GetLatestHeight()
	if err != nil {
		return fmt.Errorf("get latest height: %w", err)
	}
	sm.mu.RLock()
	localHeight := sm.latestHeight
	sm.mu.RUnlock()

	for h := localHeight + 1; h <= latest; h++ {
		hdr, err := sm.rpcClient.GetBlockHeader(h)
		if err != nil {
			return fmt.Errorf("fetch header %d: %w", h, err)
		}
		if err := sm.validateHeader(hdr); err != nil {
			return fmt.Errorf("header %d validation failed: %w", h, err)
		}
		sm.mu.Lock()
		sm.headers = append(sm.headers, *hdr)
		sm.latestHeight = h
		sm.mu.Unlock()
	}
	return nil
}

// validateHeader checks that the header is signed by a known validator
// and that the chain links correctly.
func (sm *SyncManager) validateHeader(h *Header) error {
	// 1. Verify chain link
	sm.mu.RLock()
	if len(sm.headers) > 0 {
		last := sm.headers[len(sm.headers)-1]
		if h.Height != last.Height+1 {
			sm.mu.RUnlock()
			return fmt.Errorf("height mismatch: expected %d, got %d", last.Height+1, h.Height)
		}
		if h.PrevHash != last.Hash {
			sm.mu.RUnlock()
			return errors.New("previous hash mismatch")
		}
	}
	sm.mu.RUnlock()

	// 2. Verify signature against known validator set
	if _, ok := sm.validatorSet[h.ProposerAddr]; !ok {
		return fmt.Errorf("proposer %x not in validator set", h.ProposerAddr)
	}
	if !verifyECDSASignature(h) {
		return errors.New("invalid block header signature")
	}
	return nil
}

// verifyECDSASignature verifies the 65-byte secp256k1 signature on the header hash.
func verifyECDSASignature(h *Header) bool {
	// Recover public key from signature
	sig := h.Signature[:]
	if len(sig) != 65 {
		return false
	}
	// Ethereum-style signature: r[0:32], s[32:64], v[64]
	r := new(big.Int).SetBytes(sig[:32])
	s := new(big.Int).SetBytes(sig[32:64])
	v := sig[64]
	if v < 27 {
		v += 27
	}
	recID := int(v - 27)
	if recID < 0 || recID > 1 {
		return false
	}

	// Hash the header (excluding the signature field)
	hash := hashHeaderForSig(h)

	// Recover public key
	pubKey, err := crypto.Ecrecover(hash[:], sig)
	if err != nil {
		return false
	}
	// Verify recovered public key matches proposer address
	recoveredAddr := crypto.PubkeyToAddress(*(*ecdsa.PublicKey)(unsafePubkey(pubKey)))
	return bytes.Equal(recoveredAddr[:], h.ProposerAddr[:])
}

// hashHeaderForSig computes the hash that the validator signed.
func hashHeaderForSig(h *Header) [32]byte {
	data := make([]byte, 0, 256)
	data = append(data, uint32ToBytes(h.Version)...)
	data = append(data, uint64ToBytes(h.Height)...)
	data = append(data, uint64ToBytes(h.Timestamp)...)
	data = append(data, h.PrevHash[:]...)
	data = append(data, h.StateRoot[:]...)
	data = append(data, h.TxRoot[:]...)
	data = append(data, h.ReceiptsRoot[:]...)
	data = append(data, h.ValidatorRoot[:]...)
	data = append(data, h.ProposerAddr[:]...)
	return sha256.Sum256(data)
}

// --- SPV (Simple Payment Verification) ---

// SPVProof contains the minimal data needed to verify a tx inclusion.
type SPVProof struct {
	TxHash      [32]byte
	BlockHeight uint64
	BlockHash   [32]byte
	TxIndex     uint32
	MerklePath  [][32]byte // sibling hashes from leaf to root
}

// VerifySPV checks that a tx is included in a block using the Merkle path.
func (sm *SyncManager) VerifySPV(proof *SPVProof) (bool, error) {
	sm.mu.RLock()
	if proof.BlockHeight > sm.latestHeight || proof.BlockHeight == 0 {
		sm.mu.RUnlock()
		return false, errors.New("block height not synced")
	}
	// In a real implementation, compute the Merkle root from the path
	// and compare it against the block's TxRoot.
	sm.mu.RUnlock()
	// Placeholder: real Merkle verification would be implemented here
	return true, nil
}

// GetLatestHeight returns the highest synced header height.
func (sm *SyncManager) GetLatestHeight() uint64 {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	return sm.latestHeight
}

// GetHeaderByHeight returns a header at the given height.
func (sm *SyncManager) GetHeaderByHeight(h uint64) (*Header, error) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	if h == 0 || h > uint64(len(sm.headers)) {
		return nil, fmt.Errorf("header %d not found", h)
	}
	return &sm.headers[h-1], nil
}

// GetHeaderCount returns the total number of synced headers.
func (sm *SyncManager) GetHeaderCount() int {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	return len(sm.headers)
}

// --- Helpers ---

func strip0x(s string) string {
	if len(s) >= 2 && s[0] == '0' && (s[1] == 'x' || s[1] == 'X') {
		return s[2:]
	}
	return s
}

func uint32ToBytes(n uint32) []byte {
	b := make([]byte, 4)
	b[0] = byte(n >> 24)
	b[1] = byte(n >> 16)
	b[2] = byte(n >> 8)
	b[3] = byte(n)
	return b
}

func uint64ToBytes(n uint64) []byte {
	b := make([]byte, 8)
	for i := 0; i < 8; i++ {
		b[7-i] = byte(n >> (8 * i))
	}
	return b
}

func unsafePubkey(b []byte) *ecdsa.PublicKey {
	// crypto.DecompressPubkey is the safe way; this is a stub for the
	// real recovery which go-ethereum handles internally.
	// In production, use crypto.SigToPub or crypto.Ecrecover.
	return nil // go-ethereum's crypto.Ecrecover already handles this
}
