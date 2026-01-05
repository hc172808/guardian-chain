// Package rpc implements the RPC server for lite node connections
package rpc

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"chaincore/internal/blockchain"
	"chaincore/internal/consensus"
	"chaincore/internal/mining"
)

// Config holds RPC server configuration
type Config struct {
	Port               int
	MaxConnections     int
	EnableWebSocket    bool
	EnableMiningAPI    bool
	EnableValidatorAPI bool
	RateLimitPerSecond int
}

// Server implements the RPC server
type Server struct {
	config      Config
	chain       *blockchain.Blockchain
	pos         *consensus.PoSEngine
	mining      *mining.Distributor
	httpServer  *http.Server
	clients     map[string]*Client
	rateLimiter *RateLimiter
	mu          sync.RWMutex
}

// Client represents a connected client
type Client struct {
	ID          string
	Address     string
	ConnectedAt time.Time
	Requests    int
}

// Request represents a JSON-RPC request
type Request struct {
	JSONRPC string          `json:"jsonrpc"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
	ID      interface{}     `json:"id"`
}

// Response represents a JSON-RPC response
type Response struct {
	JSONRPC string      `json:"jsonrpc"`
	Result  interface{} `json:"result,omitempty"`
	Error   *RPCError   `json:"error,omitempty"`
	ID      interface{} `json:"id"`
}

// RPCError represents an RPC error
type RPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// NewServer creates a new RPC server
func NewServer(chain *blockchain.Blockchain, pos *consensus.PoSEngine, mining *mining.Distributor, config Config) (*Server, error) {
	return &Server{
		config:      config,
		chain:       chain,
		pos:         pos,
		mining:      mining,
		clients:     make(map[string]*Client),
		rateLimiter: NewRateLimiter(config.RateLimitPerSecond),
	}, nil
}

// Start starts the RPC server
func (s *Server) Start() error {
	mux := http.NewServeMux()
	
	// Main RPC endpoint
	mux.HandleFunc("/", s.handleRPC)
	
	// WebSocket endpoint
	if s.config.EnableWebSocket {
		mux.HandleFunc("/ws", s.handleWebSocket)
	}
	
	// Mining API
	if s.config.EnableMiningAPI {
		mux.HandleFunc("/mining/submit", s.handleMiningSubmit)
		mux.HandleFunc("/mining/stats", s.handleMiningStats)
		mux.HandleFunc("/mining/difficulty", s.handleMiningDifficulty)
	}
	
	// Validator API
	if s.config.EnableValidatorAPI {
		mux.HandleFunc("/validator/status", s.handleValidatorStatus)
	}

	s.httpServer = &http.Server{
		Addr:         fmt.Sprintf(":%d", s.config.Port),
		Handler:      s.middleware(mux),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	go s.httpServer.ListenAndServe()
	return nil
}

// Stop stops the RPC server
func (s *Server) Stop() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	s.httpServer.Shutdown(ctx)
}

// middleware applies rate limiting and logging
func (s *Server) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Rate limiting
		clientIP := r.RemoteAddr
		if !s.rateLimiter.Allow(clientIP) {
			http.Error(w, "Rate limit exceeded", http.StatusTooManyRequests)
			return
		}

		// CORS headers
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			return
		}

		next.ServeHTTP(w, r)
	})
}

// handleRPC handles JSON-RPC requests
func (s *Server) handleRPC(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req Request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.sendError(w, -32700, "Parse error", nil)
		return
	}

	result, err := s.handleMethod(req.Method, req.Params)
	if err != nil {
		s.sendError(w, -32000, err.Error(), req.ID)
		return
	}

	s.sendResult(w, result, req.ID)
}

// handleMethod dispatches RPC methods
func (s *Server) handleMethod(method string, params json.RawMessage) (interface{}, error) {
	switch method {
	// Blockchain methods
	case "chain_getBlockNumber":
		return s.getBlockNumber()
	case "chain_getBlock":
		return s.getBlock(params)
	case "chain_getTransaction":
		return s.getTransaction(params)
	case "chain_sendTransaction":
		return s.sendTransaction(params)
	case "chain_getBalance":
		return s.getBalance(params)
	case "chain_getNonce":
		return s.getNonce(params)
	
	// PoS methods
	case "pos_getValidators":
		return s.getValidators()
	case "pos_getFinalizedBlock":
		return s.getFinalizedBlock()
	case "pos_getStake":
		return s.getStake(params)
	
	// Mining methods
	case "mining_getWork":
		return s.getMiningWork(params)
	case "mining_submitShare":
		return s.submitMiningShare(params)
	case "mining_getStats":
		return s.getMiningStats(params)
	case "mining_getDifficulty":
		return s.getMiningDifficulty()
	
	default:
		return nil, fmt.Errorf("method not found: %s", method)
	}
}

// Blockchain RPC implementations
func (s *Server) getBlockNumber() (interface{}, error) {
	block := s.chain.GetCurrentBlock()
	return block.Header.Height, nil
}

func (s *Server) getBlock(params json.RawMessage) (interface{}, error) {
	var height uint64
	if err := json.Unmarshal(params, &height); err != nil {
		return nil, err
	}
	return s.chain.GetBlock(height)
}

func (s *Server) getTransaction(params json.RawMessage) (interface{}, error) {
	// Implementation
	return nil, nil
}

func (s *Server) sendTransaction(params json.RawMessage) (interface{}, error) {
	// Implementation
	return nil, nil
}

func (s *Server) getBalance(params json.RawMessage) (interface{}, error) {
	var addr [20]byte
	// Parse address from params
	balance := s.chain.GetBalance(addr)
	return balance.String(), nil
}

func (s *Server) getNonce(params json.RawMessage) (interface{}, error) {
	// Implementation
	return nil, nil
}

// PoS RPC implementations
func (s *Server) getValidators() (interface{}, error) {
	// Return validator list
	return nil, nil
}

func (s *Server) getFinalizedBlock() (interface{}, error) {
	height := s.pos.GetFinalizedHeight()
	return height, nil
}

func (s *Server) getStake(params json.RawMessage) (interface{}, error) {
	// Implementation
	return nil, nil
}

// Mining RPC implementations
func (s *Server) getMiningWork(params json.RawMessage) (interface{}, error) {
	difficulty := s.mining.GetDifficulty()
	return map[string]interface{}{
		"difficulty": difficulty.String(),
		"target":     difficulty.String(),
	}, nil
}

func (s *Server) submitMiningShare(params json.RawMessage) (interface{}, error) {
	var share mining.Share
	if err := json.Unmarshal(params, &share); err != nil {
		return nil, err
	}
	
	err := s.mining.SubmitShare(&share)
	if err != nil {
		return map[string]bool{"accepted": false}, err
	}
	
	return map[string]bool{"accepted": true}, nil
}

func (s *Server) getMiningStats(params json.RawMessage) (interface{}, error) {
	var sessionID [32]byte
	// Parse session ID
	stats := s.mining.GetSessionStats(sessionID)
	return stats, nil
}

func (s *Server) getMiningDifficulty() (interface{}, error) {
	difficulty := s.mining.GetDifficulty()
	return difficulty.String(), nil
}

// WebSocket handler
func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	// WebSocket upgrade and handling
}

// Mining API handlers
func (s *Server) handleMiningSubmit(w http.ResponseWriter, r *http.Request) {
	// Handle mining share submission
}

func (s *Server) handleMiningStats(w http.ResponseWriter, r *http.Request) {
	// Handle mining stats request
}

func (s *Server) handleMiningDifficulty(w http.ResponseWriter, r *http.Request) {
	difficulty := s.mining.GetDifficulty()
	json.NewEncoder(w).Encode(map[string]string{
		"difficulty": difficulty.String(),
	})
}

// Validator API handlers
func (s *Server) handleValidatorStatus(w http.ResponseWriter, r *http.Request) {
	// Handle validator status request
}

// Helper methods
func (s *Server) sendResult(w http.ResponseWriter, result interface{}, id interface{}) {
	resp := Response{
		JSONRPC: "2.0",
		Result:  result,
		ID:      id,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (s *Server) sendError(w http.ResponseWriter, code int, message string, id interface{}) {
	resp := Response{
		JSONRPC: "2.0",
		Error: &RPCError{
			Code:    code,
			Message: message,
		},
		ID: id,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// RateLimiter implements rate limiting
type RateLimiter struct {
	limit   int
	clients map[string]*rateLimitEntry
	mu      sync.Mutex
}

type rateLimitEntry struct {
	count     int
	resetTime time.Time
}

func NewRateLimiter(limit int) *RateLimiter {
	return &RateLimiter{
		limit:   limit,
		clients: make(map[string]*rateLimitEntry),
	}
}

func (rl *RateLimiter) Allow(clientIP string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	entry, exists := rl.clients[clientIP]
	now := time.Now()

	if !exists || now.After(entry.resetTime) {
		rl.clients[clientIP] = &rateLimitEntry{
			count:     1,
			resetTime: now.Add(time.Second),
		}
		return true
	}

	if entry.count >= rl.limit {
		return false
	}

	entry.count++
	return true
}
