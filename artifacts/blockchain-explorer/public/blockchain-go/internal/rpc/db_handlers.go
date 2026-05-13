// Package rpc – REST handlers for PostgreSQL-backed block/tx queries
package rpc

import (
	"encoding/json"
	"net/http"
	"strconv"

	"chaincore/internal/database"
)

// DBHandlers serves blocks and transactions from PostgreSQL
type DBHandlers struct {
	store *database.PgStore
}

// NewDBHandlers creates new DB-backed REST handlers
func NewDBHandlers(store *database.PgStore) *DBHandlers {
	return &DBHandlers{store: store}
}

// RegisterRoutes adds the REST endpoints to the given mux
func (h *DBHandlers) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/blocks", h.handleBlocks)
	mux.HandleFunc("/transactions", h.handleTransactions)
	mux.HandleFunc("/health/db", h.handleDBHealth)
}

// GET /blocks?limit=20
func (h *DBHandlers) handleBlocks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 {
			limit = n
		}
	}

	blocks, err := h.store.LatestBlocks(r.Context(), limit)
	if err != nil {
		http.Error(w, "database error", http.StatusServiceUnavailable)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"blocks": blocks,
		"count":  len(blocks),
	})
}

// GET /transactions?limit=20
func (h *DBHandlers) handleTransactions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 {
			limit = n
		}
	}

	txs, err := h.store.LatestTransactions(r.Context(), limit)
	if err != nil {
		http.Error(w, "database error", http.StatusServiceUnavailable)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"transactions": txs,
		"count":        len(txs),
	})
}

// GET /health/db
func (h *DBHandlers) handleDBHealth(w http.ResponseWriter, r *http.Request) {
	healthy := h.store.IsHealthy()
	status := "ok"
	code := http.StatusOK
	if !healthy {
		status = "degraded"
		code = http.StatusServiceUnavailable
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"database": status})
}
