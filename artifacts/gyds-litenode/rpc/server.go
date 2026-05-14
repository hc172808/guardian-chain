package rpc

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"

	"github.com/gydschain/litenode/core"
)

type Server struct {
	chain      *core.Chain
	router     *mux.Router
	httpServer *http.Server
	upgrader   websocket.Upgrader
	subs       map[string]*subscriber
	subsMu     sync.RWMutex
	port       int
}

type subscriber struct {
	conn *websocket.Conn
	ch   chan interface{}
}

func NewServer(chain *core.Chain, port int) *Server {
	s := &Server{
		chain: chain,
		port:  port,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
		subs: make(map[string]*subscriber),
	}
	s.setupRoutes()
	return s
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) setupRoutes() {
	r := mux.NewRouter()

	r.HandleFunc("/health", s.handleHealth).Methods("GET")
	r.HandleFunc("/", s.handleJSONRPC).Methods("POST")
	r.HandleFunc("/rpc", s.handleJSONRPC).Methods("POST")

	api := r.PathPrefix("/api").Subrouter()
	api.HandleFunc("/status", s.handleStatus).Methods("GET")
	api.HandleFunc("/blocks", s.handleBlocks).Methods("GET")
	api.HandleFunc("/blocks/{id}", s.handleBlock).Methods("GET")
	api.HandleFunc("/transactions", s.handleTransactions).Methods("GET")
	api.HandleFunc("/peers", s.handlePeers).Methods("GET")
	api.HandleFunc("/ws", s.handleWS)

	r.Use(cors)
	s.router = r
}

func (s *Server) Start() error {
	s.httpServer = &http.Server{
		Addr:         fmt.Sprintf(":%d", s.port),
		Handler:      s.router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}
	log.Info().Int("port", s.port).Msg("RPC server listening")
	return s.httpServer.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	return s.httpServer.Shutdown(ctx)
}

func (s *Server) NotifyNewBlock(b *core.Block) {
	msg := map[string]interface{}{
		"type": "newBlock",
		"data": b.ToMap(),
	}
	s.broadcast(msg)
}

func (s *Server) broadcast(msg interface{}) {
	s.subsMu.RLock()
	defer s.subsMu.RUnlock()
	for _, sub := range s.subs {
		select {
		case sub.ch <- msg:
		default:
		}
	}
}

func jsonOK(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func jsonErr(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, map[string]interface{}{"status": "ok", "height": s.chain.Height()})
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, s.chain.Stats())
}

func (s *Server) handleBlocks(w http.ResponseWriter, r *http.Request) {
	limitStr := r.URL.Query().Get("limit")
	limit := 20
	if limitStr != "" {
		if n, err := strconv.Atoi(limitStr); err == nil && n > 0 {
			if n > 50 {
				n = 50
			}
			limit = n
		}
	}
	blocks := s.chain.LatestBlocks(limit)
	out := make([]map[string]interface{}, len(blocks))
	for i, b := range blocks {
		out[i] = b.ToMap()
	}
	jsonOK(w, map[string]interface{}{"blocks": out, "count": len(out)})
}

func (s *Server) handleBlock(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	var block *core.Block
	var err error
	if num, e := strconv.ParseUint(id, 10, 64); e == nil {
		block, err = s.chain.GetByNumber(num)
	} else {
		block, err = s.chain.GetByHash(id)
	}
	if err != nil {
		jsonErr(w, http.StatusNotFound, "block not found")
		return
	}
	jsonOK(w, map[string]interface{}{"block": block.ToMap()})
}

func (s *Server) handleTransactions(w http.ResponseWriter, r *http.Request) {
	limitStr := r.URL.Query().Get("limit")
	limit := 20
	if limitStr != "" {
		if n, err := strconv.Atoi(limitStr); err == nil && n > 0 {
			if n > 50 {
				n = 50
			}
			limit = n
		}
	}
	blocks := s.chain.LatestBlocks(limit)
	var txs []map[string]interface{}
	for _, b := range blocks {
		for _, tx := range b.Transactions {
			txs = append(txs, tx.ToMap())
			if len(txs) >= limit {
				break
			}
		}
		if len(txs) >= limit {
			break
		}
	}
	jsonOK(w, map[string]interface{}{"transactions": txs, "count": len(txs)})
}

func (s *Server) handlePeers(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, map[string]interface{}{"peers": []interface{}{}, "count": 0})
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	id := fmt.Sprintf("%p", conn)
	sub := &subscriber{conn: conn, ch: make(chan interface{}, 32)}
	s.subsMu.Lock()
	s.subs[id] = sub
	s.subsMu.Unlock()
	defer func() {
		s.subsMu.Lock()
		delete(s.subs, id)
		s.subsMu.Unlock()
		conn.Close()
	}()
	go func() {
		for msg := range sub.ch {
			conn.WriteJSON(msg)
		}
	}()
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			return
		}
	}
}

type jsonRPCRequest struct {
	JSONRPC string        `json:"jsonrpc"`
	Method  string        `json:"method"`
	Params  []interface{} `json:"params"`
	ID      interface{}   `json:"id"`
}

type jsonRPCResponse struct {
	JSONRPC string      `json:"jsonrpc"`
	Result  interface{} `json:"result,omitempty"`
	Error   interface{} `json:"error,omitempty"`
	ID      interface{} `json:"id"`
}

func (s *Server) handleJSONRPC(w http.ResponseWriter, r *http.Request) {
	var req jsonRPCRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	resp := jsonRPCResponse{JSONRPC: "2.0", ID: req.ID}
	switch req.Method {
	case "eth_blockNumber":
		resp.Result = fmt.Sprintf("0x%x", s.chain.Height())
	case "eth_chainId":
		stats := s.chain.Stats()
		resp.Result = fmt.Sprintf("0x%x", stats["chainId"])
	case "net_version":
		stats := s.chain.Stats()
		resp.Result = fmt.Sprintf("%v", stats["chainId"])
	case "eth_getBlockByNumber":
		if len(req.Params) > 0 {
			if numStr, ok := req.Params[0].(string); ok {
				var num uint64
				fmt.Sscanf(numStr, "0x%x", &num)
				if b, err := s.chain.GetByNumber(num); err == nil {
					resp.Result = b.ToMap()
				} else {
					resp.Result = nil
				}
			}
		}
	case "eth_syncing":
		resp.Result = false
	case "net_peerCount":
		resp.Result = "0x0"
	default:
		resp.Error = map[string]interface{}{
			"code":    -32601,
			"message": fmt.Sprintf("method %s not found", req.Method),
		}
	}
	jsonOK(w, resp)
}
