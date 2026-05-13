// Package rpc - Dual-coin RPC handlers
// Handles balance queries for GYDS and GYD native coins
// Handles fee-sponsored transaction submission
package rpc

import (
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"

	"chaincore/internal/banking"
	"chaincore/internal/blockchain"
)

// DualCoinHandlers handles dual-coin specific RPC methods
type DualCoinHandlers struct {
	chain          *blockchain.Blockchain
	sponsorManager *banking.SponsorManager
}

// NewDualCoinHandlers creates dual-coin RPC handlers
func NewDualCoinHandlers(chain *blockchain.Blockchain, sm *banking.SponsorManager) *DualCoinHandlers {
	return &DualCoinHandlers{
		chain:          chain,
		sponsorManager: sm,
	}
}

// BalanceResponse represents a balance query response
type BalanceResponse struct {
	Address     string `json:"address"`
	BalanceGYDS string `json:"balance_gyds"`
	BalanceGYD  string `json:"balance_gyd"`
	Nonce       uint64 `json:"nonce"`
	Stake       string `json:"stake,omitempty"`
}

// SponsoredTxRequest represents a fee-sponsored transaction request
type SponsoredTxRequest struct {
	From       string `json:"from"`        // User wallet address
	To         string `json:"to"`          // Recipient address
	Amount     string `json:"amount"`      // Amount in GYD (smallest unit)
	Nonce      uint64 `json:"nonce"`       // User's nonce
	SponsorID  string `json:"sponsor_id"`  // Bank/sponsor address
	Signature  string `json:"signature"`   // User's signature
}

// SponsoredTxResponse represents a sponsored transaction response
type SponsoredTxResponse struct {
	TxHash    string `json:"tx_hash"`
	Status    string `json:"status"`
	GasUsed   uint64 `json:"gas_used"`
	GasPayer  string `json:"gas_payer"`
}

// GetDualBalance handles dual-coin balance queries
// RPC method: chain_getDualBalance
func (h *DualCoinHandlers) GetDualBalance(params json.RawMessage) (interface{}, error) {
	var addrHex string
	if err := json.Unmarshal(params, &addrHex); err != nil {
		// Try array format
		var arr []string
		if err := json.Unmarshal(params, &arr); err != nil {
			return nil, errors.New("invalid address parameter")
		}
		if len(arr) == 0 {
			return nil, errors.New("address required")
		}
		addrHex = arr[0]
	}

	// Remove 0x prefix if present
	if len(addrHex) >= 2 && addrHex[:2] == "0x" {
		addrHex = addrHex[2:]
	}

	// Parse address
	addrBytes, err := hex.DecodeString(addrHex)
	if err != nil || len(addrBytes) != 20 {
		return nil, errors.New("invalid address format")
	}

	var addr [20]byte
	copy(addr[:], addrBytes)

	// Get balances
	gyds, gyd := h.chain.GetDualBalance(addr)
	nonce := h.chain.GetNonce(addr)
	stake := h.chain.GetStake(addr)

	return BalanceResponse{
		Address:     "0x" + addrHex,
		BalanceGYDS: gyds.String(),
		BalanceGYD:  gyd.String(),
		Nonce:       nonce,
		Stake:       stake.String(),
	}, nil
}

// GetBalanceGYDS handles GYDS balance queries
// RPC method: chain_getBalanceGYDS
func (h *DualCoinHandlers) GetBalanceGYDS(params json.RawMessage) (interface{}, error) {
	addr, err := parseAddressParam(params)
	if err != nil {
		return nil, err
	}

	balance := h.chain.GetBalanceGYDS(addr)
	return balance.String(), nil
}

// GetBalanceGYD handles GYD balance queries
// RPC method: chain_getBalanceGYD
func (h *DualCoinHandlers) GetBalanceGYD(params json.RawMessage) (interface{}, error) {
	addr, err := parseAddressParam(params)
	if err != nil {
		return nil, err
	}

	balance := h.chain.GetBalanceGYD(addr)
	return balance.String(), nil
}

// SubmitSponsoredTransaction handles fee-sponsored transaction submission
// RPC method: chain_sendSponsoredTransaction
// This allows banks to pay gas (GYDS) on behalf of users
// Users only see GYD transfers - they never touch GYDS
func (h *DualCoinHandlers) SubmitSponsoredTransaction(params json.RawMessage) (interface{}, error) {
	var req SponsoredTxRequest
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, fmt.Errorf("invalid request: %w", err)
	}

	// Parse addresses
	fromAddr, err := parseHexAddress(req.From)
	if err != nil {
		return nil, fmt.Errorf("invalid from address: %w", err)
	}

	toAddr, err := parseHexAddress(req.To)
	if err != nil {
		return nil, fmt.Errorf("invalid to address: %w", err)
	}

	sponsorAddr, err := parseHexAddress(req.SponsorID)
	if err != nil {
		return nil, fmt.Errorf("invalid sponsor address: %w", err)
	}

	// Parse amount
	amount, ok := new(big.Int).SetString(req.Amount, 10)
	if !ok {
		return nil, errors.New("invalid amount")
	}

	// Create sponsored transaction via sponsor manager
	tx, err := h.sponsorManager.CreateSponsoredTransaction(
		sponsorAddr,
		fromAddr,
		toAddr,
		amount,
		req.Nonce,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create sponsored transaction: %w", err)
	}

	// Parse and set user's signature
	if req.Signature != "" {
		sigBytes, err := hex.DecodeString(trimHexPrefix(req.Signature))
		if err != nil || len(sigBytes) != 65 {
			return nil, errors.New("invalid signature")
		}
		copy(tx.Signature[:], sigBytes)
	}

	// Add to transaction pool
	if err := h.chain.AddTransaction(tx); err != nil {
		return nil, fmt.Errorf("failed to add transaction: %w", err)
	}

	return SponsoredTxResponse{
		TxHash:   hex.EncodeToString(tx.Hash[:]),
		Status:   "pending",
		GasUsed:  tx.GasLimit,
		GasPayer: "0x" + hex.EncodeToString(sponsorAddr[:]),
	}, nil
}

// GetSponsors returns list of registered fee sponsors (banks)
// RPC method: sponsor_getAll
func (h *DualCoinHandlers) GetSponsors(params json.RawMessage) (interface{}, error) {
	sponsors := h.sponsorManager.GetAllSponsors()

	result := make([]map[string]interface{}, 0, len(sponsors))
	for _, s := range sponsors {
		result = append(result, map[string]interface{}{
			"address":         "0x" + hex.EncodeToString(s.Address[:]),
			"name":            s.Name,
			"is_active":       s.IsActive,
			"daily_gas_used":  s.DailyGasUsed,
			"daily_gas_limit": s.DailyGasLimit,
			"tx_count":        s.TxCount,
		})
	}

	return result, nil
}

// GetSponsorStats returns statistics for a specific sponsor
// RPC method: sponsor_getStats
func (h *DualCoinHandlers) GetSponsorStats(params json.RawMessage) (interface{}, error) {
	addr, err := parseAddressParam(params)
	if err != nil {
		return nil, err
	}

	stats := h.sponsorManager.GetSponsorStats(addr)
	if stats == nil {
		return nil, errors.New("sponsor not found")
	}

	return stats, nil
}

// TransferGYD handles GYD-only transfers (users never see GYDS)
// This is for regular (non-sponsored) GYD transfers
// RPC method: chain_transferGYD
func (h *DualCoinHandlers) TransferGYD(params json.RawMessage) (interface{}, error) {
	var req struct {
		From      string `json:"from"`
		To        string `json:"to"`
		Amount    string `json:"amount"`
		Nonce     uint64 `json:"nonce"`
		GasLimit  uint64 `json:"gas_limit"`
		GasPrice  uint64 `json:"gas_price"`
		Signature string `json:"signature"`
	}

	if err := json.Unmarshal(params, &req); err != nil {
		return nil, fmt.Errorf("invalid request: %w", err)
	}

	fromAddr, err := parseHexAddress(req.From)
	if err != nil {
		return nil, err
	}

	toAddr, err := parseHexAddress(req.To)
	if err != nil {
		return nil, err
	}

	amount, ok := new(big.Int).SetString(req.Amount, 10)
	if !ok {
		return nil, errors.New("invalid amount")
	}

	tx := &blockchain.Transaction{
		Version:  1,
		TxType:   blockchain.TxTypeTransfer,
		From:     fromAddr,
		To:       toAddr,
		Value:    amount,
		CoinType: blockchain.CoinGYD, // GYD transfer
		GasLimit: req.GasLimit,
		GasPrice: req.GasPrice,
		Nonce:    req.Nonce,
	}

	// Parse signature
	if req.Signature != "" {
		sigBytes, err := hex.DecodeString(trimHexPrefix(req.Signature))
		if err != nil || len(sigBytes) != 65 {
			return nil, errors.New("invalid signature")
		}
		copy(tx.Signature[:], sigBytes)
	}

	tx.Hash = tx.CalculateHash()

	if err := h.chain.AddTransaction(tx); err != nil {
		return nil, fmt.Errorf("failed to add transaction: %w", err)
	}

	return map[string]interface{}{
		"tx_hash": "0x" + hex.EncodeToString(tx.Hash[:]),
		"status":  "pending",
	}, nil
}

// HTTP handler for dual-coin balance endpoint
func (h *DualCoinHandlers) HandleDualBalanceHTTP(w http.ResponseWriter, r *http.Request) {
	address := r.URL.Query().Get("address")
	if address == "" {
		http.Error(w, "address required", http.StatusBadRequest)
		return
	}

	params, _ := json.Marshal(address)
	result, err := h.GetDualBalance(params)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// HTTP handler for sponsored transaction submission
func (h *DualCoinHandlers) HandleSponsoredTxHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SponsoredTxRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	params, _ := json.Marshal(req)
	result, err := h.SubmitSponsoredTransaction(params)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// Helper functions
func parseAddressParam(params json.RawMessage) ([20]byte, error) {
	var addrHex string
	if err := json.Unmarshal(params, &addrHex); err != nil {
		var arr []string
		if err := json.Unmarshal(params, &arr); err != nil {
			return [20]byte{}, errors.New("invalid address parameter")
		}
		if len(arr) == 0 {
			return [20]byte{}, errors.New("address required")
		}
		addrHex = arr[0]
	}
	return parseHexAddress(addrHex)
}

func parseHexAddress(addrHex string) ([20]byte, error) {
	addrHex = trimHexPrefix(addrHex)

	addrBytes, err := hex.DecodeString(addrHex)
	if err != nil || len(addrBytes) != 20 {
		return [20]byte{}, errors.New("invalid address format")
	}

	var addr [20]byte
	copy(addr[:], addrBytes)
	return addr, nil
}

func trimHexPrefix(s string) string {
	if len(s) >= 2 && s[:2] == "0x" {
		return s[2:]
	}
	return s
}
