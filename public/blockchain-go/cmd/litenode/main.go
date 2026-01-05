// ChainCore Lite Node - Public Access
// Connects to Full Nodes via RPC for blockchain interaction
package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"chaincore/internal/liteclient"
	"chaincore/internal/mining"
	"chaincore/internal/storage"
	"chaincore/internal/wallet"
)

var (
	version  = "1.0.0"
	nodeType = "litenode"
)

func main() {
	// Command line flags
	dataDir := flag.String("datadir", "~/.chaincore-lite", "Data directory for wallet and cache")
	storageSize := flag.Int64("storage", 10, "Maximum storage size in GB (for caching)")
	rpcEndpoints := flag.String("rpc", "", "Comma-separated list of full node RPC endpoints")
	enableMining := flag.Bool("mining", false, "Enable browser/CPU mining for rewards")
	miningThreads := flag.Int("threads", 2, "Number of mining threads (CPU mining)")
	walletPath := flag.String("wallet", "", "Path to wallet file")
	createWallet := flag.Bool("new-wallet", false, "Create a new wallet")
	apiPort := flag.Int("api", 3000, "Local API port for web interface")
	flag.Parse()

	fmt.Printf(`
╔═══════════════════════════════════════════════════════════════╗
║           ChainCore Lite Node v%s                         ║
║        Hybrid PoS + PoW Blockchain - Public Edition            ║
╚═══════════════════════════════════════════════════════════════╝
`, version)

	// Validate RPC endpoints
	if *rpcEndpoints == "" {
		log.Fatal("At least one RPC endpoint is required. Use --rpc flag.")
	}
	endpoints := strings.Split(*rpcEndpoints, ",")
	for i, ep := range endpoints {
		endpoints[i] = strings.TrimSpace(ep)
	}

	// Initialize storage with size limit
	storageConfig := storage.LiteConfig{
		DataDir:      *dataDir,
		MaxCacheMB:   *storageSize * 1024, // Convert GB to MB
		EnableCache:  true,
		CacheBlocks:  1000,
		CacheHeaders: 10000,
	}
	cache, err := storage.NewLiteCache(storageConfig)
	if err != nil {
		log.Fatalf("Failed to initialize cache: %v", err)
	}
	defer cache.Close()

	// Initialize or load wallet
	var w *wallet.Wallet
	if *createWallet {
		w, err = wallet.CreateNew(*dataDir)
		if err != nil {
			log.Fatalf("Failed to create wallet: %v", err)
		}
		log.Printf("New wallet created: %s", w.Address())
	} else if *walletPath != "" {
		w, err = wallet.Load(*walletPath)
		if err != nil {
			log.Fatalf("Failed to load wallet: %v", err)
		}
		log.Printf("Wallet loaded: %s", w.Address())
	}

	// Initialize lite client (connects to full nodes)
	clientConfig := liteclient.Config{
		RPCEndpoints:    endpoints,
		MaxRetries:      3,
		TimeoutSeconds:  30,
		EnableFailover:  true,
		SyncHeaders:     true,
		ValidateProofs:  true, // SPV validation
	}
	client, err := liteclient.NewClient(clientConfig, cache)
	if err != nil {
		log.Fatalf("Failed to initialize lite client: %v", err)
	}

	// Initialize mining client (optional)
	var miner *mining.LiteMiner
	if *enableMining && w != nil {
		minerConfig := mining.LiteMinerConfig{
			Threads:            *miningThreads,
			MinerAddress:       w.Address(),
			EnableCPU:          true,
			EnableBrowser:      false, // CLI mode
			ShareSubmitTimeout: 5,
		}
		miner, err = mining.NewLiteMiner(client, minerConfig)
		if err != nil {
			log.Fatalf("Failed to initialize miner: %v", err)
		}
	}

	// Start services
	log.Println("Starting ChainCore Lite Node...")

	if err := client.Start(); err != nil {
		log.Fatalf("Failed to start lite client: %v", err)
	}
	log.Printf("Connected to %d full node(s)", len(endpoints))

	// Sync headers
	log.Println("Syncing block headers...")
	if err := client.SyncHeaders(); err != nil {
		log.Printf("Warning: Header sync incomplete: %v", err)
	}

	// Start miner if enabled
	if miner != nil {
		if err := miner.Start(); err != nil {
			log.Fatalf("Failed to start miner: %v", err)
		}
		log.Printf("Mining started with %d threads", *miningThreads)
	}

	// Start local API server
	apiServer := liteclient.NewAPIServer(client, w, miner, *apiPort)
	if err := apiServer.Start(); err != nil {
		log.Fatalf("Failed to start API server: %v", err)
	}
	log.Printf("Local API server running on http://localhost:%d", *apiPort)

	log.Printf(`
╔═══════════════════════════════════════════════════════════════╗
║  Lite Node Started Successfully!                               ║
║  RPC Endpoints: %d | Storage: %dGB                           ║
║  Mining: %v | API Port: %d                                   ║
╚═══════════════════════════════════════════════════════════════╝
`, len(endpoints), *storageSize, *enableMining, *apiPort)

	// Wait for shutdown signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down ChainCore Lite Node...")
	if miner != nil {
		miner.Stop()
	}
	apiServer.Stop()
	client.Stop()
	log.Println("Goodbye!")
}
