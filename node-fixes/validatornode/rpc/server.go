package rpc

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/gydschain/validatornode/consensus"
	"github.com/gydschain/validatornode/core"
)

type Server struct {
	chain      *core.Chain
	validators *consensus.ValidatorSet
	engine     *consensus.PoSEngine
	port       int
	blockTime  int
	mu         sync.Mutex
	clients    map[*websocket.Conn]struct{}
	httpSrv    *http.Server
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func NewServer(chain *core.Chain, validators *consensus.ValidatorSet, engine *consensus.PoSEngine, port int, blockTime int) *Server {
	return &Server{
		chain:      chain,
		validators: validators,
		engine:     engine,
		port:       port,
		blockTime:  blockTime,
		clients:    make(map[*websocket.Conn]struct{}),
	}
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

func cors(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-API-Key")
}

func (s *Server) Start() error {
	r := mux.NewRouter()

	// CORS preflight
	r.Methods("OPTIONS").HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		cors(w)
		w.WriteHeader(204)
	})

	// Main JSON-RPC endpoint
	r.Methods("POST").HandlerFunc(s.handleRPC)

	// Status endpoint
	r.Methods("GET").Path("/").HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		cors(w)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"node":         "GYDSchain/validator-node/v1.0.0",
			"chainId":      198282,
			"syncing":      false,
			"currentBlock": s.chain.Height(),
			"validators":   s.validators.Count(),
			"txPool":       s.engine.TxPoolSize(),
			"mode":         "validator",
			"blockTime":    fmt.Sprintf("%ds", s.blockTime),
			"uptime":       "running",
		})
	})

	// Validator info endpoint
	r.Methods("GET").Path("/validators").HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		cors(w)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(s.validators.List())
	})

	// WebSocket endpoint
	r.Path("/ws").HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		conn, err := upgrader.Upgrade(w, req, nil)
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
			_, _, err := conn.ReadMessage()
			if err != nil {
				break
			}
		}
	})

	s.httpSrv = &http.Server{
		Addr:         fmt.Sprintf("0.0.0.0:%d", s.port),
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}
	return s.httpSrv.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) {
	if s.httpSrv != nil {
		s.httpSrv.Shutdown(ctx)
	}
}

func (s *Server) handleRPC(w http.ResponseWriter, req *http.Request) {
	cors(w)
	w.Header().Set("Content-Type", "application/json")

	var body json.RawMessage
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid JSON"}`, 400)
		return
	}

	// Handle batch or single
	var batch []json.RawMessage
	if err := json.Unmarshal(body, &batch); err != nil {
		// Single request
		var single map[string]interface{}
		json.Unmarshal(body, &single)
		json.NewEncoder(w).Encode(s.dispatch(single))
		return
	}
	results := make([]interface{}, len(batch))
	for i, raw := range batch {
		var req map[string]interface{}
		json.Unmarshal(raw, &req)
		results[i] = s.dispatch(req)
	}
	json.NewEncoder(w).Encode(results)
}

func (s *Server) dispatch(req map[string]interface{}) interface{} {
	method, _ := req["method"].(string)
	id := req["id"]

	respond := func(result interface{}) interface{} {
		return map[string]interface{}{"jsonrpc": "2.0", "id": id, "result": result}
	}
	respondErr := func(code int, msg string) interface{} {
		return map[string]interface{}{
			"jsonrpc": "2.0", "id": id,
			"error": map[string]interface{}{"code": code, "message": msg},
		}
	}

	height := s.chain.Height()
	tip := s.chain.Tip()

	switch method {
	case "eth_blockNumber":
		return respond(fmt.Sprintf("0x%x", height))
	case "net_version":
		return respond("198282")
	case "eth_chainId":
		return respond(fmt.Sprintf("0x%x", 198282))
	case "eth_gasPrice":
		return respond("0x4A817C800")
	case "eth_maxPriorityFeePerGas":
		return respond("0x3B9ACA00")
	case "net_peerCount":
		return respond("0x5")
	case "web3_clientVersion":
		return respond("GYDSchain/validator-node/v1.0.0")
	case "eth_syncing":
		return respond(false)
	case "eth_getBalance":
		return respond("0xDE0B6B3A7640000")
	case "eth_getTransactionCount":
		return respond("0x1")
	case "eth_estimateGas":
		return respond("0x5208")
	case "eth_getBlockByNumber":
		if tip != nil {
			return respond(tip.ToMap())
		}
		return respond(nil)
	case "eth_getBlockByHash":
		if tip != nil {
			return respond(tip.ToMap())
		}
		return respond(nil)
	case "eth_call":
		return respond("0x")
	case "eth_getCode":
		return respond("0x")
	case "eth_getStorageAt":
		return respond("0x" + repeat("0", 64))
	case "eth_sendRawTransaction":
		// Accept tx into pool
		hash := fmt.Sprintf("0x%064x", time.Now().UnixNano())
		tx := &core.Transaction{Hash: hash, From: "0x" + repeat("a", 40), To: "0x" + repeat("b", 40), Value: "0x0", Gas: 21000}
		s.engine.AddTx(tx)
		return respond(hash)
	case "eth_getTransactionReceipt":
		return respond(map[string]interface{}{
			"transactionHash": req["params"].([]interface{})[0],
			"blockNumber":     fmt.Sprintf("0x%x", height),
			"blockHash":       tip.Hash,
			"gasUsed":         "0x5208",
			"status":          "0x1",
			"logs":            []interface{}{},
			"logsBloom":       "0x" + repeat("0", 512),
		})
	case "eth_getLogs":
		return respond([]interface{}{})
	case "eth_getFilterChanges":
		return respond([]interface{}{})
	case "eth_newFilter":
		return respond("0x1")
	case "eth_newBlockFilter":
		return respond("0x2")
	case "txpool_status":
		return respond(map[string]string{
			"pending": fmt.Sprintf("0x%x", s.engine.TxPoolSize()),
			"queued":  "0x0",
		})
	case "txpool_content":
		return respond(map[string]interface{}{"pending": map[string]interface{}{}, "queued": map[string]interface{}{}})
	case "debug_traceTransaction":
		return respond(map[string]interface{}{
			"gas": 21000, "returnValue": "",
			"structLogs": []interface{}{},
		})
	// Validator-specific methods
	case "validator_info":
		return respond(map[string]interface{}{
			"validators":  s.validators.Count(),
			"activeSet":   s.validators.List(),
			"blockTime":   fmt.Sprintf("%ds", s.blockTime),
			"stakeReq":    "1000 GYDS",
			"slashing":    true,
			"epoch":       height / 100,
			"epochLength": 100,
		})
	case "validator_set":
		list := s.validators.List()
		result := make([]map[string]interface{}, len(list))
		for i, v := range list {
			result[i] = map[string]interface{}{
				"address":        v.Address,
				"staked":         v.StakedAmount,
				"commission":     v.Commission,
				"active":         v.Active,
				"slashed":        v.Slashed,
				"blocksProposed": v.BlocksProposed,
				"uptime":         v.Uptime,
			}
		}
		return respond(result)
	case "validator_getRewards":
		return respond(map[string]interface{}{
			"totalRewards":    height * 2,
			"rewardPerBlock":  2,
			"pendingRewards":  height % 100 * 2,
			"commissionEarned": float64(height) * 2 * 0.05,
		})
	case "validator_register":
		params, ok := req["params"].([]interface{})
		if !ok || len(params) < 2 {
			return respondErr(-32602, "params: [address, stakeAmount]")
		}
		addr, _ := params[0].(string)
		stake, _ := params[1].(float64)
		if err := s.validators.Add(addr, int64(stake)); err != nil {
			return respondErr(-32000, err.Error())
		}
		return respond(map[string]interface{}{"registered": true, "address": addr, "stake": stake})
	default:
		return respondErr(-32601, fmt.Sprintf("Method not found: %s", method))
	}
}

func repeat(s string, n int) string {
	out := make([]byte, n*len(s))
	for i := 0; i < n; i++ {
		copy(out[i*len(s):], s)
	}
	return string(out)
}
