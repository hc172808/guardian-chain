// GYDSchain Boost Node — full node + mining-pool coordinator. Distributes PoW-style
// mining rewards to registered miners. Ports: P2P 30303 / RPC 8553 by default.
package main

import (
	"flag"; "fmt"; "log"; "os"; "os/signal"; "syscall"
	"chaincore/internal/nodebuilder"; "chaincore/internal/nodeconfig"
)

func main() {
	cfg := nodeconfig.Defaults(nodeconfig.RoleBoost)
	fs := flag.NewFlagSet("boostnode", flag.ExitOnError); cfg.Bind(fs)
	confPath := fs.String("config", "", "Optional JSON config file")
	_ = fs.Parse(os.Args[1:])
	if err := cfg.LoadJSON(*confPath); err != nil { log.Fatalf("config: %v", err) }
	stack, err := nodebuilder.Build(cfg, nodebuilder.Options{EnableRPC: true, EnablePoS: true, EnableMining: true, MiningAPI: true, ValidatorAPI: false})
	if err != nil { log.Fatalf("build: %v", err) }
	stack.Start()
	fmt.Printf("[boostnode] pool coordinator on %s:%d (rpc %d) chain=%d threads=%d\n", cfg.ListenAddr, cfg.P2PPort, cfg.RPCPort, cfg.ChainID, cfg.MiningThreads)
	sig := make(chan os.Signal, 1); signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM); <-sig
	log.Println("[boostnode] shutting down"); stack.Stop()
}
