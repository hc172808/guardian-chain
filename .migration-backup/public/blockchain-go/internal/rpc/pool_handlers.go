// Package rpc - Pool RPC handlers for production mining
package rpc

import (
	"encoding/hex"
	"encoding/json"
	"net/http"

	"chaincore/internal/mining"
)

// PoolHandlers holds pool-related RPC handlers
type PoolHandlers struct {
	pool *mining.Pool
}

// NewPoolHandlers creates new pool handlers
func NewPoolHandlers(pool *mining.Pool) *PoolHandlers {
	return &PoolHandlers{pool: pool}
}

// ConnectRequest represents a pool connect request
type ConnectRequest struct {
	Address    string `json:"address"`
	Algorithm  string `json:"algorithm"`
	WorkerName string `json:"workerName"`
}

// ConnectResponse represents a pool connect response
type ConnectResponse struct {
	SessionID  string `json:"sessionId"`
	Difficulty string `json:"difficulty"`
	PoolName   string `json:"poolName"`
	PoolFee    float64 `json:"poolFee"`
	Success    bool   `json:"success"`
	Message    string `json:"message,omitempty"`
}

// SubmitShareRequest represents a share submission
type SubmitShareRequest struct {
	SessionID string `json:"sessionId"`
	Nonce     string `json:"nonce"`
	Hash      string `json:"hash"`
	JobID     string `json:"jobId"`
}

// SubmitShareResponse represents share result
type SubmitShareResponse struct {
	Accepted      bool   `json:"accepted"`
	Reward        string `json:"reward,omitempty"`
	NewDifficulty string `json:"newDifficulty,omitempty"`
	Message       string `json:"message,omitempty"`
}

// HandleConnect handles miner connection
func (h *PoolHandlers) HandleConnect(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ConnectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSONError(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Parse address
	addrBytes, err := hex.DecodeString(req.Address)
	if err != nil || len(addrBytes) != 20 {
		sendJSONError(w, "Invalid address", http.StatusBadRequest)
		return
	}

	var addr [20]byte
	copy(addr[:], addrBytes)

	// Connect to pool
	miner, err := h.pool.Connect(addr, req.Algorithm, req.WorkerName, r.RemoteAddr)
	if err != nil {
		json.NewEncoder(w).Encode(ConnectResponse{
			Success: false,
			Message: err.Error(),
		})
		return
	}

	stats := h.pool.GetPoolStats()

	json.NewEncoder(w).Encode(ConnectResponse{
		SessionID:  hex.EncodeToString(miner.SessionID[:]),
		Difficulty: stats.Difficulty.String(),
		PoolName:   "GYDS Mining Pool",
		PoolFee:    1.0,
		Success:    true,
	})
}

// HandleDisconnect handles miner disconnection
func (h *PoolHandlers) HandleDisconnect(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSONError(w, "Invalid request", http.StatusBadRequest)
		return
	}

	sessionBytes, err := hex.DecodeString(req.SessionID)
	if err != nil || len(sessionBytes) != 32 {
		sendJSONError(w, "Invalid session ID", http.StatusBadRequest)
		return
	}

	var sessionID [32]byte
	copy(sessionID[:], sessionBytes)

	h.pool.Disconnect(sessionID)

	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// HandleGetWork handles work requests
func (h *PoolHandlers) HandleGetWork(w http.ResponseWriter, r *http.Request) {
	sessionID, err := parseSessionID(r)
	if err != nil {
		sendJSONError(w, "Invalid session", http.StatusBadRequest)
		return
	}

	work, err := h.pool.GetWork(sessionID)
	if err != nil {
		sendJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	json.NewEncoder(w).Encode(work)
}

// HandleSubmitShare handles share submissions
func (h *PoolHandlers) HandleSubmitShare(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SubmitShareRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSONError(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Parse session ID
	sessionBytes, err := hex.DecodeString(req.SessionID)
	if err != nil || len(sessionBytes) != 32 {
		json.NewEncoder(w).Encode(SubmitShareResponse{
			Accepted: false,
			Message:  "Invalid session ID",
		})
		return
	}
	var sessionID [32]byte
	copy(sessionID[:], sessionBytes)

	// Parse nonce
	nonceBytes, err := hex.DecodeString(req.Nonce)
	if err != nil {
		json.NewEncoder(w).Encode(SubmitShareResponse{
			Accepted: false,
			Message:  "Invalid nonce",
		})
		return
	}
	var nonce uint64
	for _, b := range nonceBytes {
		nonce = (nonce << 8) | uint64(b)
	}

	// Parse hash
	hashBytes, err := hex.DecodeString(req.Hash)
	if err != nil || len(hashBytes) != 32 {
		json.NewEncoder(w).Encode(SubmitShareResponse{
			Accepted: false,
			Message:  "Invalid hash",
		})
		return
	}
	var hash [32]byte
	copy(hash[:], hashBytes)

	// Submit to pool
	accepted, reward, err := h.pool.SubmitShare(sessionID, nonce, hash, req.JobID)
	
	response := SubmitShareResponse{
		Accepted: accepted,
	}

	if err != nil {
		response.Message = err.Error()
	}

	if reward != nil {
		response.Reward = reward.String()
	}

	// Get updated difficulty
	stats := h.pool.GetPoolStats()
	response.NewDifficulty = stats.Difficulty.String()

	json.NewEncoder(w).Encode(response)
}

// HandleGetStats handles stats requests
func (h *PoolHandlers) HandleGetStats(w http.ResponseWriter, r *http.Request) {
	sessionID, err := parseSessionID(r)
	if err != nil {
		// Return pool stats if no session
		stats := h.pool.GetPoolStats()
		json.NewEncoder(w).Encode(stats)
		return
	}

	miner, err := h.pool.GetMinerStats(sessionID)
	if err != nil {
		sendJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"hashRate":       miner.HashRate,
		"validShares":    miner.ValidShares,
		"rejectedShares": miner.RejectedShares,
		"pendingReward":  miner.PendingReward.String(),
		"totalPaid":      miner.TotalPaid.String(),
		"humanScore":     miner.HumanScore,
		"isOnline":       miner.IsOnline,
		"algorithm":      miner.Algorithm,
	})
}

// HandleGetPoolInfo handles pool info requests
func (h *PoolHandlers) HandleGetPoolInfo(w http.ResponseWriter, r *http.Request) {
	stats := h.pool.GetPoolStats()

	json.NewEncoder(w).Encode(map[string]interface{}{
		"name":           "GYDS Mining Pool",
		"totalHashRate":  stats.TotalHashRate,
		"activeMiners":   stats.ActiveMiners,
		"blocksFound":    stats.BlocksFound,
		"poolFee":        1.0,
		"minPayout":      "100000000000000", // 0.0001 tokens
		"difficulty":     stats.Difficulty.String(),
		"luck":           stats.Luck,
		"totalPaid":      stats.TotalPaid.String(),
		"pendingRewards": stats.PendingRewards.String(),
	})
}

// Helper functions
func parseSessionID(r *http.Request) ([32]byte, error) {
	var sessionID [32]byte

	sessionStr := r.URL.Query().Get("sessionId")
	if sessionStr == "" {
		// Try to parse from body
		var req struct {
			SessionID string `json:"sessionId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil {
			sessionStr = req.SessionID
		}
	}

	if sessionStr == "" {
		return sessionID, nil
	}

	sessionBytes, err := hex.DecodeString(sessionStr)
	if err != nil || len(sessionBytes) != 32 {
		return sessionID, err
	}

	copy(sessionID[:], sessionBytes)
	return sessionID, nil
}

func sendJSONError(w http.ResponseWriter, message string, status int) {
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

// RegisterPoolRoutes registers pool RPC routes
func RegisterPoolRoutes(mux *http.ServeMux, handlers *PoolHandlers) {
	// Mining pool endpoints
	mux.HandleFunc("/pool/connect", handlers.HandleConnect)
	mux.HandleFunc("/pool/disconnect", handlers.HandleDisconnect)
	mux.HandleFunc("/pool/getwork", handlers.HandleGetWork)
	mux.HandleFunc("/pool/submit", handlers.HandleSubmitShare)
	mux.HandleFunc("/pool/stats", handlers.HandleGetStats)
	mux.HandleFunc("/pool/info", handlers.HandleGetPoolInfo)

	// JSON-RPC compatible endpoints
	mux.HandleFunc("/mining/connect", handlers.HandleConnect)
	mux.HandleFunc("/mining/getWork", handlers.HandleGetWork)
	mux.HandleFunc("/mining/submitShare", handlers.HandleSubmitShare)
	mux.HandleFunc("/mining/stats", handlers.HandleGetStats)
	mux.HandleFunc("/mining/poolInfo", handlers.HandleGetPoolInfo)
}
