// ChainCore Full Node - Founder Only
// Hybrid PoS + PoW Blockchain Implementation
package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"chaincore/internal/blockchain"
	"chaincore/internal/consensus"
	"chaincore/internal/mining"
	"chaincore/internal/network"
	"chaincore/internal/rpc"
	"chaincore/internal/storage"
)

var (
	version     = "1.0.0"
	nodeType    = "fullnode"
	defaultPort = 8545
	rpcPort     = 8546
)

func main() {
	// Command line flags
	dataDir := flag.String("datadir", "/var/lib/chaincore", "Data directory for blockchain storage")
	storageSize := flag.Int64("storage", 100, "Maximum storage size in GB")
	rpcPortFlag := flag.Int("rpcport", rpcPort, "RPC server port for lite nodes")
	p2pPort := flag.Int("p2pport", defaultPort, "P2P network port")
	validatorKey := flag.String("validator-key", "", "Path to validator private key")
	enableMining := flag.Bool("mining", true, "Enable mining reward distribution")
	maxPeers := flag.Int("maxpeers", 50, "Maximum number of peers")
	founderMode := flag.Bool("founder", false, "Enable founder mode with full privileges")
	flag.Parse()

	fmt.Printf(`
╔═══════════════════════════════════════════════════════════════╗
║           ChainCore Full Node v%s                         ║
║        Hybrid PoS + PoW Blockchain - Founder Edition          ║
╚═══════════════════════════════════════════════════════════════╝
`, version)

	// Validate founder authentication
	if !*founderMode {
		log.Fatal("Full node requires founder authentication. Use --founder flag with valid credentials.")
	}

	// Initialize storage with size limit
	storageConfig := storage.Config{
		DataDir:     *dataDir,
		MaxSizeGB:   *storageSize,
		EnablePrune: true,
	}
	db, err := storage.NewLevelDB(storageConfig)
	if err != nil {
		log.Fatalf("Failed to initialize storage: %v", err)
	}
	defer db.Close()

	// Initialize blockchain
	chainConfig := blockchain.Config{
		ChainID:           13370, // GYDS Mainnet Chain ID
		BlockTime:         12,    // 12 seconds
		MaxBlockSize:      2 * 1024 * 1024, // 2MB
		MinGasPrice:       1000000000, // 1 Gwei
		ValidatorMinStake: 32000000000000000000, // 32 ETH equivalent
	}
	chain, err := blockchain.NewBlockchain(db, chainConfig)
	if err != nil {
		log.Fatalf("Failed to initialize blockchain: %v", err)
	}

	// Initialize PoS consensus engine
	posConfig := consensus.PoSConfig{
		ValidatorKeyPath:   *validatorKey,
		MinValidators:      4,
		BlockFinality:      2, // 2 blocks for finality
		SlashingEnabled:    true,
		RewardPerBlock:     2000000000000000000, // 2 tokens
	}
	posEngine, err := consensus.NewPoSEngine(chain, posConfig)
	if err != nil {
		log.Fatalf("Failed to initialize PoS engine: %v", err)
	}

	// Initialize mining reward distributor (PoW for rewards only)
	miningConfig := mining.Config{
		Enabled:              *enableMining,
		TargetShareTime:      10, // 10 seconds
		MaxSharesPerMinute:   100,
		SessionRewardCap:     1000000000000000000, // 1 token per session
		DailyAddressCap:      10000000000000000000, // 10 tokens per day
		AntiBotEnabled:       true,
		DifficultyAdjustment: true,
	}
	miningDistributor := mining.NewDistributor(chain, miningConfig)

	// Initialize P2P network
	networkConfig := network.Config{
		Port:           *p2pPort,
		MaxPeers:       *maxPeers,
		NodeType:       network.FullNode,
		EnableRelay:    true,
		EnableRPCProxy: true,
	}
	p2pNetwork, err := network.NewP2PNetwork(networkConfig)
	if err != nil {
		log.Fatalf("Failed to initialize P2P network: %v", err)
	}

	// Initialize RPC server for lite nodes
	rpcConfig := rpc.Config{
		Port:               *rpcPortFlag,
		MaxConnections:     1000,
		EnableWebSocket:    true,
		EnableMiningAPI:    true,
		EnableValidatorAPI: true,
		RateLimitPerSecond: 100,
	}
	rpcServer, err := rpc.NewServer(chain, posEngine, miningDistributor, rpcConfig)
	if err != nil {
		log.Fatalf("Failed to initialize RPC server: %v", err)
	}

	// Start all services
	log.Println("Starting ChainCore Full Node...")
	
	if err := p2pNetwork.Start(); err != nil {
		log.Fatalf("Failed to start P2P network: %v", err)
	}
	log.Printf("P2P network listening on port %d", *p2pPort)

	if err := posEngine.Start(); err != nil {
		log.Fatalf("Failed to start PoS engine: %v", err)
	}
	log.Println("PoS consensus engine started")

	if err := miningDistributor.Start(); err != nil {
		log.Fatalf("Failed to start mining distributor: %v", err)
	}
	log.Println("Mining reward distributor started")

	if err := rpcServer.Start(); err != nil {
		log.Fatalf("Failed to start RPC server: %v", err)
	}
	log.Printf("RPC server listening on port %d", *rpcPortFlag)

	log.Printf(`
╔═══════════════════════════════════════════════════════════════╗
║  Full Node Started Successfully!                               ║
║  P2P Port: %d | RPC Port: %d                              ║
║  Storage: %dGB | Max Peers: %d                               ║
╚═══════════════════════════════════════════════════════════════╝
`, *p2pPort, *rpcPortFlag, *storageSize, *maxPeers)

	// Wait for shutdown signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down ChainCore Full Node...")
	rpcServer.Stop()
	miningDistributor.Stop()
	posEngine.Stop()
	p2pNetwork.Stop()
	log.Println("Goodbye!")
}
