// GYDSchain RPC Node — wide-open read-only JSON-RPC endpoint. No mining, no PoS producer role.
// Ports: P2P 30302 / RPC 8552 by default.
package main

import (
	"flag"; "fmt"; "log"; "os"; "os/signal"; "syscall"
	"chaincore/internal/nodebuilder"; "chaincore/internal/nodeconfig"
)

func main() {
	cfg := nodeconfig.Defaults(nodeconfig.RoleRPC)
	fs := flag.NewFlagSet("rpcnode", flag.ExitOnError); cfg.Bind(fs)
	confPath := fs.String("config", "", "Optional JSON config file")
	_ = fs.Parse(os.Args[1:])
	if err := cfg.LoadJSON(*confPath); err != nil { log.Fatalf("config: %v", err) }
	stack, err := nodebuilder.Build(cfg, nodebuilder.Options{EnableRPC: true, EnablePoS: false, EnableMining: false, MiningAPI: false, ValidatorAPI: false})
	if err != nil { log.Fatalf("build: %v", err) }
	stack.Start()
	fmt.Printf("[rpcnode] serving JSON-RPC on %s:%d (p2p %d) chain=%d\n", cfg.ListenAddr, cfg.RPCPort, cfg.P2PPort, cfg.ChainID)
	sig := make(chan os.Signal, 1); signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM); <-sig
	log.Println("[rpcnode] shutting down"); stack.Stop()
}
