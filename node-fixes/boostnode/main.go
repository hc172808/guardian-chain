package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"

	"github.com/gydschain/boostnode/config"
	"github.com/gydschain/boostnode/consensus"
	"github.com/gydschain/boostnode/core"
	"github.com/gydschain/boostnode/p2p"
	"github.com/gydschain/boostnode/rpc"
)

var version = "1.0.0"

func main() {
	root := &cobra.Command{
		Use:   "gyds-boostnode",
		Short: "GYDS Chain Boost Node",
		Long: `GYDS Boostnode — a high-throughput relay node for the GYDS Chain.
Optimised for 1-second block times, MEV bundle submission, and fast peer propagation.`,
	}

	root.AddCommand(startCmd(), genesisCmd(), versionCmd(), healthCmd(), peersCmd())
	if err := root.Execute(); err != nil {
		os.Exit(1)
	}
}

func startCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "start",
		Short: "Start the GYDS boostnode",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runNode()
		},
	}
}

func genesisCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "genesis",
		Short: "Print genesis block",
		Run: func(cmd *cobra.Command, args []string) {
			b := core.GenesisBlock(core.GydsGenesis)
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			enc.Encode(b.ToMap())
		},
	}
}

func versionCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print version",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Printf("gyds-boostnode v%s\n", version)
		},
	}
}

func healthCmd() *cobra.Command {
	var host string
	var port int
	var timeoutSec int
	var jsonOut bool

	cmd := &cobra.Command{
		Use:   "health",
		Short: "Check the health of a running boostnode",
		Long: `Query the local RPC server and print node health status.

Examples:
  gyds-boostnode health
  gyds-boostnode health --port 8547
  gyds-boostnode health --json`,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runHealth(host, port, timeoutSec, jsonOut)
		},
	}

	defaultHost := envOrDefault("GYDS_RPC_HOST", "127.0.0.1")
	defaultPort := envIntOrDefault("GYDS_RPC_PORT", 8547)

	cmd.Flags().StringVar(&host, "host", defaultHost, "RPC host to query")
	cmd.Flags().IntVarP(&port, "port", "p", defaultPort, "RPC port to query")
	cmd.Flags().IntVar(&timeoutSec, "timeout", 5, "Request timeout in seconds")
	cmd.Flags().BoolVar(&jsonOut, "json", false, "Output result as JSON")

	return cmd
}

func peersCmd() *cobra.Command {
	var host string
	var port int
	var timeoutSec int
	var jsonOut bool
	var watch bool

	cmd := &cobra.Command{
		Use:   "peers",
		Short: "List connected P2P peers of a running boostnode",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runPeers(host, port, timeoutSec, jsonOut, watch)
		},
	}

	defaultHost := envOrDefault("GYDS_RPC_HOST", "127.0.0.1")
	defaultPort := envIntOrDefault("GYDS_RPC_PORT", 8547)

	cmd.Flags().StringVar(&host, "host", defaultHost, "RPC host")
	cmd.Flags().IntVarP(&port, "port", "p", defaultPort, "RPC port")
	cmd.Flags().IntVar(&timeoutSec, "timeout", 5, "Timeout in seconds")
	cmd.Flags().BoolVar(&jsonOut, "json", false, "JSON output")
	cmd.Flags().BoolVarP(&watch, "watch", "w", false, "Refresh every 5 seconds")

	return cmd
}

func runNode() error {
	cfg := config.FromEnv()

	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	if cfg.LogFormat == "pretty" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})
	}
	level, err := zerolog.ParseLevel(cfg.LogLevel)
	if err != nil {
		level = zerolog.InfoLevel
	}
	zerolog.SetGlobalLevel(level)

	log.Info().
		Str("version", version).
		Str("mode", cfg.NodeMode).
		Int64("chainId", cfg.ChainID).
		Dur("blockTime", cfg.BlockTime).
		Msg("Starting GYDS boostnode")

	chain := core.NewChain(core.GydsGenesis)
	log.Info().Uint64("height", chain.Height()).Msg("Chain initialised from genesis")

	vs := consensus.NewValidatorSet(core.GydsGenesis.Validators)
	// Use configured block time — default 1s for boost mode
	engine := consensus.NewPoSEngine(chain, vs, cfg.BlockTime)

	rpcSrv := rpc.NewServer(chain, cfg.RPCPort)
	engine.OnNewBlock(func(b *core.Block) {
		log.Info().
			Uint64("number", b.Header.Number).
			Str("hash", b.Hash[:16]+"...").
			Int("txs", len(b.Transactions)).
			Str("validator", b.Header.Validator).
			Msg("New block")
		rpcSrv.NotifyNewBlock(b)
	})

	p2pSrv := p2p.NewServer(cfg.P2PPort, cfg.ChainID, chain.Height)
	rpcSrv.SetP2P(p2pSrv)

	for _, addr := range cfg.P2PBootstrap {
		if err := p2pSrv.ConnectTo(addr); err != nil {
			log.Warn().Err(err).Str("addr", addr).Msg("Failed to connect to bootstrap peer")
		}
	}
	if err := p2pSrv.Start(); err != nil {
		log.Warn().Err(err).Msg("P2P server failed to start (continuing without P2P)")
	}

	engine.Start()
	log.Info().Dur("blockTime", cfg.BlockTime).Msg("PoS engine started")

	errCh := make(chan error, 1)
	go func() {
		errCh <- rpcSrv.Start()
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)

	select {
	case s := <-sig:
		log.Info().Str("signal", s.String()).Msg("Shutting down")
		engine.Stop()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		rpcSrv.Shutdown(ctx)
	case err := <-errCh:
		if err != nil {
			return fmt.Errorf("RPC server: %w", err)
		}
	}
	return nil
}

// ── Health command helpers ────────────────────────────────────────────────────

func runHealth(host string, port, timeoutSec int, jsonOut bool) error {
	base := fmt.Sprintf("http://%s:%d", host, port)
	client := &http.Client{Timeout: time.Duration(timeoutSec) * time.Second}

	start := time.Now()
	data, err := getJSON(client, base+"/health")
	latency := time.Since(start).Milliseconds()

	type result struct {
		Reachable   bool        `json:"reachable"`
		Status      string      `json:"status"`
		BlockHeight interface{} `json:"block_height"`
		Endpoint    string      `json:"endpoint"`
		LatencyMs   int64       `json:"latency_ms"`
		Error       string      `json:"error,omitempty"`
	}

	r := result{Endpoint: base, LatencyMs: latency}
	if err != nil {
		r.Reachable = false
		r.Status = "unreachable"
		r.Error = err.Error()
		if jsonOut {
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			return enc.Encode(r)
		}
		fmt.Printf("\n  ✗  boostnode unreachable at %s\n  Error: %s\n\n", base, err)
		return fmt.Errorf("unreachable: %w", err)
	}

	r.Reachable = true
	r.BlockHeight = data["height"]
	if s, ok := data["status"].(string); ok {
		r.Status = s
	} else {
		r.Status = "ok"
	}

	if jsonOut {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(r)
	}

	fmt.Printf("\n  ✓  GYDS Boost Node healthy\n")
	fmt.Printf("  Endpoint : %s\n", base)
	fmt.Printf("  Latency  : %dms\n", latency)
	fmt.Printf("  Block    : #%v\n\n", r.BlockHeight)
	return nil
}

func runPeers(host string, port, timeoutSec int, jsonOut, watch bool) error {
	base := fmt.Sprintf("http://%s:%d", host, port)
	client := &http.Client{Timeout: time.Duration(timeoutSec) * time.Second}

	show := func() {
		data, err := getJSON(client, base+"/api/peers")
		if err != nil {
			fmt.Printf("  ✗  unreachable: %s\n", err)
			return
		}
		if jsonOut {
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			enc.Encode(data)
			return
		}
		count := 0
		if c, ok := data["count"].(float64); ok {
			count = int(c)
		}
		fmt.Printf("\n  GYDS Boost Node — %d peer(s) connected at %s\n\n", count, base)
	}

	if !watch {
		show()
		return nil
	}

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	for {
		fmt.Print("\033[H\033[2J")
		show()
		fmt.Println("  Refreshing every 5s — Ctrl-C to stop")
		select {
		case <-sig:
			return nil
		case <-ticker.C:
		}
	}
}

func getJSON(client *http.Client, url string) (map[string]interface{}, error) {
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var out map[string]interface{}
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("invalid JSON: %w", err)
	}
	return out, nil
}

func probeTCPLatency(addr string, timeout time.Duration) int64 {
	if addr == "" {
		return -1
	}
	start := time.Now()
	conn, err := net.DialTimeout("tcp", addr, timeout)
	if err != nil {
		return -1
	}
	conn.Close()
	return time.Since(start).Milliseconds()
}

func formatUptime(sec int64) string {
	switch {
	case sec < 60:
		return fmt.Sprintf("%ds", sec)
	case sec < 3600:
		return fmt.Sprintf("%dm%ds", sec/60, sec%60)
	default:
		return fmt.Sprintf("%dh%dm", sec/3600, (sec%3600)/60)
	}
}

func strVal(m map[string]interface{}, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envIntOrDefault(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
			return n
		}
	}
	return def
}
