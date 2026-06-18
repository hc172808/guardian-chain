package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gydschain/litenode/config"
	"github.com/gydschain/litenode/header-sync"
)

var version = "2.2.0"

// LiteNode is a header-only, non-block-producing node.
// It syncs block headers from full nodes and validates them against
// the known validator set. It does NOT produce blocks, mine, or stake.
type LiteNode struct {
	cfg        config.LiteNodeConfig
	syncMgr    *headersync.SyncManager
	apiServer  *http.Server
}

func main() {
	fmt.Printf(`
╔═══════════════════════════════════════════════════════════════╗
║           GYDS Lite Node v%s                              ║
║      Header-Only Sync — Never Produces Blocks               ║
╚═══════════════════════════════════════════════════════════════╝
`, version)

	cfg := config.Default()

	// Validate config
	if len(cfg.RPCEndpoints) == 0 {
		log.Fatal("At least one RPC endpoint is required. Set LITE_RPC_ENDPOINTS env var.")
	}
	if cfg.EnableMining {
		log.Println("WARNING: EnableMining is true but lite nodes cannot mine. Ignored.")
		cfg.EnableMining = false
	}

	// Create sync manager
	syncMgr, err := headersync.NewSyncManager(cfg.RPCEndpoints, cfg.SyncInterval, cfg.ValidatorSet)
	if err != nil {
		log.Fatalf("Failed to create sync manager: %v", err)
	}

	// Create a real RPC client (stub for now — implement real HTTP client)
	client := &httpRPCClient{endpoints: cfg.RPCEndpoints}
	syncMgr.SetRPCClient(client)

	node := &LiteNode{
		cfg:     cfg,
		syncMgr: syncMgr,
	}

	// Start header sync
	if err := syncMgr.Start(); err != nil {
		log.Fatalf("Failed to start sync manager: %v", err)
	}
	log.Printf("Header sync started — endpoints: %v", cfg.RPCEndpoints)

	// Start local API
	node.startAPI()

	// Wait for shutdown
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Println("Shutting down...")
	node.stop()
}

// startAPI starts a minimal HTTP API for status and SPV queries.
func (n *LiteNode) startAPI() {
	mux := http.NewServeMux()
	mux.HandleFunc("/status", n.handleStatus)
	mux.HandleFunc("/headers/latest", n.handleLatestHeader)
	mux.HandleFunc("/headers/", n.handleHeaderByHeight)
	mux.HandleFunc("/spv/verify", n.handleSPVVerify)

	addr := fmt.Sprintf(":%d", n.cfg.RPCPort)
	n.apiServer = &http.Server{Addr: addr, Handler: mux}
	go func() {
		log.Printf("API server listening on %s", addr)
		if err := n.apiServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("API server error: %v", err)
		}
	}()
}

// stop gracefully shuts down the node.
func (n *LiteNode) stop() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	n.apiServer.Shutdown(ctx)
	n.syncMgr.Stop()
}

// --- HTTP handlers ---

func (n *LiteNode) handleStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{
  "node": "gyds-litenode",
  "version": "%s",
  "mode": "header-only",
  "syncedHeight": %d,
  "headerCount": %d,
  "endpoints": %d,
  "spvEnabled": %v,
  "mining": false
}
`, version, n.syncMgr.GetLatestHeight(), n.syncMgr.GetHeaderCount(), len(n.cfg.RPCEndpoints), n.cfg.EnableSPV)
}

func (n *LiteNode) handleLatestHeader(w http.ResponseWriter, r *http.Request) {
	h := n.syncMgr.GetLatestHeight()
	if h == 0 {
		w.WriteHeader(http.StatusServiceUnavailable)
		fmt.Fprint(w, `{"error": "not synced yet"}`)
		return
	}
	// Return header as JSON
	fmt.Fprintf(w, `{"height": %d, "status": "synced"}`, h)
}

func (n *LiteNode) handleHeaderByHeight(w http.ResponseWriter, r *http.Request) {
	// Path: /headers/{height}
	fmt.Fprintf(w, `{"error": "not yet implemented"}`)
}

func (n *LiteNode) handleSPVVerify(w http.ResponseWriter, r *http.Request) {
	// POST with SPVProof JSON
	fmt.Fprintf(w, `{"error": "not yet implemented"}`)
}

// --- HTTP RPC client (stub — full implementation in production) ---

type httpRPCClient struct {
	endpoints []string
	current   int
}

func (c *httpRPCClient) GetLatestHeight() (uint64, error) {
	// In production, make HTTP POST to endpoint with JSON-RPC "eth_blockNumber"
	// For now, return 0 to indicate no real connection
	return 0, nil
}

func (c *httpRPCClient) GetBlockHeader(height uint64) (*headersync.Header, error) {
	// In production, make HTTP POST to endpoint with JSON-RPC "eth_getBlockByNumber"
	return nil, fmt.Errorf("not implemented")
}
