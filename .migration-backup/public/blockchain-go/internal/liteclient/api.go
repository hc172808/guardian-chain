// Package liteclient - Local API server for web interface
package liteclient

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"chaincore/internal/mining"
	"chaincore/internal/wallet"
)

// APIServer serves a local web interface
type APIServer struct {
	client     *Client
	wallet     *wallet.Wallet
	miner      *mining.LiteMiner
	port       int
	httpServer *http.Server
}

// NewAPIServer creates a new API server
func NewAPIServer(client *Client, wallet *wallet.Wallet, miner *mining.LiteMiner, port int) *APIServer {
	return &APIServer{
		client: client,
		wallet: wallet,
		miner:  miner,
		port:   port,
	}
}

// Start starts the API server
func (api *APIServer) Start() error {
	mux := http.NewServeMux()

	// CORS middleware
	handler := corsMiddleware(mux)

	// API endpoints
	mux.HandleFunc("/api/status", api.handleStatus)
	mux.HandleFunc("/api/balance", api.handleBalance)
	mux.HandleFunc("/api/send", api.handleSend)
	mux.HandleFunc("/api/mining/start", api.handleMiningStart)
	mux.HandleFunc("/api/mining/stop", api.handleMiningStop)
	mux.HandleFunc("/api/mining/stats", api.handleMiningStats)
	mux.HandleFunc("/api/blocks", api.handleBlocks)
	mux.HandleFunc("/api/transactions", api.handleTransactions)

	api.httpServer = &http.Server{
		Addr:    fmt.Sprintf(":%d", api.port),
		Handler: handler,
	}

	go api.httpServer.ListenAndServe()
	return nil
}

// Stop stops the API server
func (api *APIServer) Stop() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	api.httpServer.Shutdown(ctx)
}

// corsMiddleware adds CORS headers
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// handleStatus returns node status
func (api *APIServer) handleStatus(w http.ResponseWriter, r *http.Request) {
	status := map[string]interface{}{
		"syncing":      api.client.IsSyncing(),
		"latestBlock":  api.client.GetLatestHeight(),
		"connected":    true,
		"nodeType":     "litenode",
	}

	if api.wallet != nil {
		status["address"] = api.wallet.Address()
	}

	if api.miner != nil {
		status["mining"] = api.miner.IsRunning()
		status["hashRate"] = api.miner.GetHashRate()
	}

	json.NewEncoder(w).Encode(status)
}

// handleBalance returns wallet balance
func (api *APIServer) handleBalance(w http.ResponseWriter, r *http.Request) {
	if api.wallet == nil {
		http.Error(w, "No wallet loaded", http.StatusBadRequest)
		return
	}

	balance, err := api.client.GetBalance(api.wallet.Address())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{
		"address": api.wallet.Address(),
		"balance": balance,
	})
}

// handleSend sends a transaction
func (api *APIServer) handleSend(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if api.wallet == nil {
		http.Error(w, "No wallet loaded", http.StatusBadRequest)
		return
	}

	var req struct {
		To     string `json:"to"`
		Amount string `json:"amount"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Create and sign transaction
	tx, err := api.wallet.CreateTransaction(req.To, req.Amount)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Send transaction
	txHash, err := api.client.SendTransaction(tx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{
		"txHash": txHash,
	})
}

// handleMiningStart starts mining
func (api *APIServer) handleMiningStart(w http.ResponseWriter, r *http.Request) {
	if api.miner == nil {
		http.Error(w, "Mining not configured", http.StatusBadRequest)
		return
	}

	if err := api.miner.Start(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]bool{"started": true})
}

// handleMiningStop stops mining
func (api *APIServer) handleMiningStop(w http.ResponseWriter, r *http.Request) {
	if api.miner == nil {
		http.Error(w, "Mining not configured", http.StatusBadRequest)
		return
	}

	api.miner.Stop()
	json.NewEncoder(w).Encode(map[string]bool{"stopped": true})
}

// handleMiningStats returns mining statistics
func (api *APIServer) handleMiningStats(w http.ResponseWriter, r *http.Request) {
	if api.miner == nil {
		http.Error(w, "Mining not configured", http.StatusBadRequest)
		return
	}

	stats := api.miner.GetStats()
	json.NewEncoder(w).Encode(stats)
}

// handleBlocks returns recent blocks
func (api *APIServer) handleBlocks(w http.ResponseWriter, r *http.Request) {
	// Return recent blocks
	json.NewEncoder(w).Encode([]interface{}{})
}

// handleTransactions returns recent transactions
func (api *APIServer) handleTransactions(w http.ResponseWriter, r *http.Request) {
	// Return recent transactions
	json.NewEncoder(w).Encode([]interface{}{})
}
