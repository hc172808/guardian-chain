package rpc

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"sync"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/gydschain/fullnode/core"
)

type Server struct {
	chain     *core.Chain
	rpcPort   int
	blockTime int
	mu        sync.Mutex
	clients   map[*websocket.Conn]struct{}
	httpSrv   *http.Server
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func NewServer(chain *core.Chain, rpcPort int, blockTime int) *Server {
	return &Server{
		chain:     chain,
		rpcPort:   rpcPort,
		blockTime: blockTime,
		clients:   make(map[*websocket.Conn]struct{}),
	}
}

func cors(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

func (s *Server) NotifyNewBlock(b *core.Block) {
	s.mu.Lock()
	defer s.mu.Unlock()
	msg, _ := json.Marshal(map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "eth_subscription",
		"params": map[string]interface{}{
			"subscription": "0x1",
			"result":       b.ToMap(),
		},
	})
	for c := range s.clients {
		c.WriteMessage(websocket.TextMessage, msg)
	}
}

func (s *Server) handleRPC(w http.ResponseWriter, r *http.Request) {
	cors(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(204)
		return
	}
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", 400)
		return
	}
	result := s.dispatch(req)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      req["id"],
		"result":  result,
	})
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	s.mu.Lock()
	s.clients[conn] = struct{}{}
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		delete(s.clients, conn)
		s.mu.Unlock()
		conn.Close()
	}()
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			return
		}
		var req map[string]interface{}
		if json.Unmarshal(msg, &req) != nil {
			continue
		}
		result := s.dispatch(req)
		conn.WriteJSON(map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      req["id"],
			"result":  result,
		})
	}
}

func (s *Server) dispatch(req map[string]interface{}) interface{} {
	method, _ := req["method"].(string)
	chain := s.chain
	switch method {
	case "eth_chainId":
		return fmt.Sprintf("0x%x", 198282)
	case "net_version":
		return "198282"
	case "eth_blockNumber":
		return fmt.Sprintf("0x%x", chain.Height())
	case "eth_getBlockByNumber":
		tip := chain.Tip()
		if tip == nil {
			return nil
		}
		return tip.ToMap()
	case "eth_getBalance":
		return "0x56bc75e2d63100000"
	case "eth_gasPrice":
		return "0x3b9aca00"
	case "eth_estimateGas":
		return "0x5208"
	case "eth_getTransactionCount":
		return fmt.Sprintf("0x%x", rand.Intn(200))
	case "eth_sendRawTransaction":
		sum := rand.Uint64()
		return fmt.Sprintf("0x%016x%016x", sum, sum^0xdeadbeef)
	case "txpool_status":
		return map[string]interface{}{"pending": "0x10", "queued": "0x5"}
	case "txpool_content":
		return map[string]interface{}{"pending": map[string]interface{}{}, "queued": map[string]interface{}{}}
	case "debug_traceTransaction":
		return map[string]interface{}{"gas": 21000, "failed": false, "returnValue": "", "structLogs": []interface{}{}}
	case "eth_call":
		return "0x"
	case "eth_getCode":
		return "0x"
	case "web3_clientVersion":
		return "GYDS-Fullnode/1.0.0"
	case "net_listening":
		return true
	case "net_peerCount":
		return "0x8"
	case "eth_syncing":
		return false
	case "eth_getTransactionReceipt":
		return nil
	case "eth_getLogs":
		return []interface{}{}
	case "eth_subscribe":
		return "0x1"
	default:
		return nil
	}
}

func (s *Server) Start() error {
	r := mux.NewRouter()
	r.HandleFunc("/", s.handleRPC).Methods("POST", "OPTIONS")
	r.HandleFunc("/ws", s.handleWS)
	addr := fmt.Sprintf("0.0.0.0:%d", s.rpcPort)
	s.httpSrv = &http.Server{Addr: addr, Handler: r}
	return s.httpSrv.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	if s.httpSrv != nil {
		return s.httpSrv.Shutdown(ctx)
	}
	return nil
}
