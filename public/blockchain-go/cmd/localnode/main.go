// GYDSchain Local Node — strictly 127.0.0.1, no peer discovery. Matches
// public/scripts/install-localnode.sh. Ports: P2P 30306 / RPC 8556 by default.
package main

import (
	"flag"; "fmt"; "log"; "os"; "os/signal"; "syscall"
	"chaincore/internal/nodebuilder"; "chaincore/internal/nodeconfig"
)

func main() {
	cfg := nodeconfig.Defaults(nodeconfig.RoleLocal)
	cfg.ListenAddr = "127.0.0.1"; cfg.MaxPeers = 0; cfg.Bootnodes = ""
	fs := flag.NewFlagSet("localnode", flag.ExitOnError); cfg.Bind(fs)
	confPath := fs.String("config", "", "Optional JSON config file")
	_ = fs.Parse(os.Args[1:])
	if err := cfg.LoadJSON(*confPath); err != nil { log.Fatalf("config: %v", err) }
	// Enforce loopback regardless of overrides
	cfg.ListenAddr = "127.0.0.1"; cfg.MaxPeers = 0; cfg.Bootnodes = ""

	stack, err := nodebuilder.Build(cfg, nodebuilder.Options{EnableRPC: true, EnablePoS: true, EnableMining: true, MiningAPI: true, ValidatorAPI: true})
	if err != nil { log.Fatalf("build: %v", err) }
	stack.Start()
	fmt.Printf("[localnode] loopback-only on 127.0.0.1:%d (rpc %d) chain=%d\n", cfg.P2PPort, cfg.RPCPort, cfg.ChainID)
	sig := make(chan os.Signal, 1); signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM); <-sig
	log.Println("[localnode] shutting down"); stack.Stop()
}
