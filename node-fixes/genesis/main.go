package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"

	"github.com/gydschain/genesis/config"
	"github.com/gydschain/genesis/consensus"
	"github.com/gydschain/genesis/core"
	"github.com/gydschain/genesis/p2p"
	"github.com/gydschain/genesis/rpc"
)

var version = "1.0.0"

func main() {
	root := &cobra.Command{
		Use:   "gyds-genesis",
		Short: "GYDS Chain Genesis Node",
		Long: `GYDS Genesis Node — the origin and bootstrap node for the GYDS Chain.
Initialises the chain from block 0, archives all state, and serves as the
primary bootstrap peer for all other node types.
Run this ONCE to start the network — then distribute the genesis.json to peers.`,
	}

	root.AddCommand(startCmd(), exportGenesisCmd(), initCmd(), versionCmd())
	if err := root.Execute(); err != nil {
		os.Exit(1)
	}
}

func startCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "start",
		Short: "Start the GYDS genesis node",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runNode()
		},
	}
}

func versionCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print version",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Printf("gyds-genesis v%s\n", version)
		},
	}
}

// initCmd generates the genesis.json file for distribution to other nodes.
func initCmd() *cobra.Command {
	var validatorAddrs []string
	var outputFile string

	cmd := &cobra.Command{
		Use:   "init",
		Short: "Generate genesis.json from the embedded genesis config",
		Long: `Exports the compiled-in genesis configuration to a JSON file.
Distribute this genesis.json to all nodes before they start.

Example:
  gyds-genesis init --validators 0xYOUR_ADDR --output /etc/gyds/genesis.json`,
		RunE: func(cmd *cobra.Command, args []string) error {
			genesis := core.GydsGenesis
			if len(validatorAddrs) > 0 {
				genesis.Validators = validatorAddrs
			}

			out := map[string]interface{}{
				"chainId":     genesis.ChainID,
				"networkName": genesis.NetworkName,
				"timestamp":   genesis.Timestamp,
				"gasLimit":    genesis.GasLimit,
				"extraData":   genesis.ExtraData,
				"validators":  genesis.Validators,
				"alloc":       genesis.Alloc,
			}

			f := os.Stdout
			if outputFile != "" {
				var err error
				f, err = os.Create(outputFile)
				if err != nil {
					return fmt.Errorf("create output file: %w", err)
				}
				defer f.Close()
			}

			enc := json.NewEncoder(f)
			enc.SetIndent("", "  ")
			if err := enc.Encode(out); err != nil {
				return err
			}
			if outputFile != "" {
				fmt.Printf("✓ genesis.json written to %s\n", outputFile)
				fmt.Printf("  Chain ID   : %d\n", genesis.ChainID)
				fmt.Printf("  Validators : %v\n", genesis.Validators)
				fmt.Printf("  Distribute this file to all nodes before starting the network.\n")
			}
			return nil
		},
	}

	cmd.Flags().StringSliceVar(&validatorAddrs, "validators", nil, "Validator addresses (overrides compiled-in genesis)")
	cmd.Flags().StringVarP(&outputFile, "output", "o", "", "Output file path (defaults to stdout)")
	return cmd
}

// exportGenesisCmd exports the live genesis block from a running node.
func exportGenesisCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "export-genesis",
		Short: "Export the genesis block from the chain",
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg := config.FromEnv()
			chain := core.NewChain(core.GydsGenesis, cfg.DataDir)
			defer chain.Close()

			genesis, err := chain.GetByNumber(0)
			if err != nil {
				return fmt.Errorf("genesis block not found: %w", err)
			}
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			return enc.Encode(genesis.ToMap())
		},
	}
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
		Bool("archive", cfg.ArchiveMode).
		Msg("Starting GYDS genesis node")

	// Genesis node always archives — never prune state
	chain := core.NewChain(core.GydsGenesis, cfg.DataDir)
	log.Info().Uint64("height", chain.Height()).Msg("Chain initialised from genesis")

	vs := consensus.NewValidatorSet(core.GydsGenesis.Validators)
	engine := consensus.NewPoSEngine(chain, vs, cfg.BlockTime)

	rpcSrv := rpc.NewServer(chain, cfg.RPCPort, int(cfg.BlockTime.Seconds()))
	engine.OnNewBlock(func(b *core.Block) {
		log.Info().
			Uint64("number", b.Header.Number).
			Str("hash", b.Hash[:16]+"...").
			Int("txs", len(b.Transactions)).
			Str("validator", b.Header.Validator).
			Msg("New block")
		rpcSrv.NotifyNewBlock(b)
	})

	// Genesis node is the bootstrap peer — accept all incoming connections
	p2pSrv := p2p.NewServer(cfg.P2PPort, cfg.ChainID, chain.Height)

	if err := p2pSrv.Start(); err != nil {
		log.Warn().Err(err).Msg("P2P server failed to start")
	} else {
		log.Info().Int("port", cfg.P2PPort).Msg("Bootstrap P2P server ready — other nodes should connect here")
	}

	engine.Start()
	log.Info().Dur("blockTime", cfg.BlockTime).Msg("PoS engine started")

	log.Info().
		Str("rpc", fmt.Sprintf("http://0.0.0.0:%d", cfg.RPCPort)).
		Str("p2p", fmt.Sprintf("tcp://0.0.0.0:%d", cfg.P2PPort)).
		Msg("Genesis node is running — distribute this P2P address as GYDS_BOOTSTRAP_NODES to other nodes")

	errCh := make(chan error, 1)
	go func() {
		errCh <- rpcSrv.Start()
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)

	select {
	case s := <-sig:
		log.Info().Str("signal", s.String()).Msg("Shutting down genesis node")
		engine.Stop()
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		rpcSrv.Shutdown(ctx)
		chain.Close()
	case err := <-errCh:
		if err != nil {
			return fmt.Errorf("RPC server: %w", err)
		}
	}
	return nil
}
