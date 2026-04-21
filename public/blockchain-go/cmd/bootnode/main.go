// ChainCore Bootnode - Peer Discovery Only
//
// A bootnode is a minimal node whose only job is to help new nodes discover
// each other on the network. It does NOT mine, validate, store full state,
// or expose RPC. It runs only the P2P listener and answers peer-discovery
// requests.
//
// Recommended deployment: 2-3 bootnodes on different cloud providers,
// pinned in the BootstrapNodes list of every fullnode/litenode config.
package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"chaincore/internal/network"
)

var (
	version  = "2.1.0"
	nodeType = "bootnode"
)

func main() {
	dataDir := flag.String("datadir", "/var/lib/gydschain/bootnode", "Data directory for node key & peer cache")
	p2pPort := flag.Int("p2pport", 30303, "P2P listen port")
	maxPeers := flag.Int("maxpeers", 100, "Maximum number of peers")
	nodeKey := flag.String("node-key", "", "Path to node key file (auto-generated if missing)")
	bootstrap := flag.String("bootstrap", "", "Comma-separated list of bootstrap peers (host:port)")
	chainID := flag.Uint64("chain-id", 13370, "Chain ID")
	publicAddr := flag.String("public-addr", "", "Public address to advertise (e.g. bootnode1.netlifegy.com:30303)")
	flag.Parse()

	fmt.Println("╔═══════════════════════════════════════════════════════════════╗")
	fmt.Printf("║           GYDSchain Bootnode v%-32s║\n", version)
	fmt.Println("║         Peer Discovery Service - Chain ID 13370               ║")
	fmt.Println("╚═══════════════════════════════════════════════════════════════╝")

	if err := os.MkdirAll(*dataDir, 0o750); err != nil {
		log.Fatalf("Failed to create data directory %s: %v", *dataDir, err)
	}

	keyPath := *nodeKey
	if keyPath == "" {
		keyPath = filepath.Join(*dataDir, "node.key")
	}
	nodeID, err := loadOrCreateNodeKey(keyPath)
	if err != nil {
		log.Fatalf("Failed to load/create node key: %v", err)
	}
	log.Printf("Node ID: %s", nodeID)

	var bootstrapPeers []string
	if *bootstrap != "" {
		for _, p := range strings.Split(*bootstrap, ",") {
			p = strings.TrimSpace(p)
			if p != "" {
				bootstrapPeers = append(bootstrapPeers, p)
			}
		}
	}

	cfg := network.Config{
		Port:           *p2pPort,
		MaxPeers:       *maxPeers,
		NodeType:       network.FullNode, // bootnodes advertise as full so peers will dial them
		EnableRelay:    true,
		EnableRPCProxy: false,
		BootstrapNodes: bootstrapPeers,
	}
	p2p, err := network.NewP2PNetwork(cfg)
	if err != nil {
		log.Fatalf("Failed to create P2P network: %v", err)
	}
	if err := p2p.Start(); err != nil {
		log.Fatalf("Failed to start P2P network: %v", err)
	}
	log.Printf("P2P network listening on port %d", *p2pPort)
	log.Printf("Chain ID: %d", *chainID)
	log.Printf("Max peers: %d", *maxPeers)
	if *publicAddr != "" {
		log.Printf("Public address: %s", *publicAddr)
	}

	fmt.Println()
	fmt.Println("╔═══════════════════════════════════════════════════════════════╗")
	fmt.Println("║  Bootnode Started Successfully!                               ║")
	fmt.Printf("║  P2P Port: %-5d | Max Peers: %-5d | Chain: %-6d         ║\n", *p2pPort, *maxPeers, *chainID)
	fmt.Println("║  No mining, no consensus, no RPC - discovery only.            ║")
	fmt.Println("╚═══════════════════════════════════════════════════════════════╝")

	if *publicAddr != "" {
		fmt.Printf("\nShare this bootstrap address with operators:\n  %s@%s\n\n", nodeID, *publicAddr)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go statusLoop(ctx, p2p)

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Println("Shutting down bootnode...")
	cancel()
	p2p.Stop()
	log.Println("Goodbye!")
}

func loadOrCreateNodeKey(path string) (string, error) {
	if data, err := os.ReadFile(path); err == nil {
		key := strings.TrimSpace(string(data))
		if len(key) >= 16 {
			return shortNodeID(key), nil
		}
	}
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	key := hex.EncodeToString(buf)
	if err := os.WriteFile(path, []byte(key), 0o600); err != nil {
		return "", err
	}
	log.Printf("Generated new node key at %s", path)
	return shortNodeID(key), nil
}

func shortNodeID(key string) string {
	if len(key) > 16 {
		return key[:16]
	}
	return key
}

func statusLoop(ctx context.Context, p2p *network.P2PNetwork) {
	t := time.NewTicker(60 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			peers := p2p.GetPeers()
			log.Printf("[status] connected peers: %d", len(peers))
		}
	}
}
