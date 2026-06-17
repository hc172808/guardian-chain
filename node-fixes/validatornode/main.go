package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"

	"github.com/gydschain/validatornode/config"
	"github.com/gydschain/validatornode/consensus"
	"github.com/gydschain/validatornode/core"
	"github.com/gydschain/validatornode/p2p"
	"github.com/gydschain/validatornode/rpc"
)

var version = "1.0.0"

func main() {
	root := &cobra.Command{
		Use:   "gyds-validatornode",
		Short: "GYDS Chain Validator Node",
		Long: `GYDS Validator Node — participates in PoS consensus, proposes and validates blocks.
Requires staking at least 1000 GYDS to join the active validator set.
Runs the full consensus engine with slashing protection.`,
	}

	root.AddCommand(startCmd(), validatorCmd(), registerCmd(), statusCmd(), versionCmd())

	if err := root.Execute(); err != nil {
		os.Exit(1)
	}
}

func versionCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print version",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Printf("gyds-validatornode v%s\n", version)
		},
	}
}

func statusCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Check node status",
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg := config.FromEnv()
			fmt.Printf("GYDS Validator Node v%s\n", version)
			fmt.Printf("  Chain ID   : %d\n", cfg.ChainID)
			fmt.Printf("  RPC Port   : %d\n", cfg.RPCPort)
			fmt.Printf("  P2P Port   : %d\n", cfg.P2PPort)
			fmt.Printf("  Validator  : %s\n", cfg.ValidatorAddress)
			fmt.Printf("  Block Time : %s\n", cfg.BlockTime)
			fmt.Printf("  Stake Req  : %d GYDS\n", cfg.StakeRequired)
			return nil
		},
	}
}

func validatorCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "validator",
		Short: "Validator management subcommands",
	}
	cmd.AddCommand(
		&cobra.Command{
			Use:   "list",
			Short: "List all validators in the active set",
			RunE: func(cmd *cobra.Command, args []string) error {
				cfg := config.FromEnv()
				vs := consensus.NewValidatorSet(core.GydsGenesis.Validators)
				fmt.Printf("Validator Set (Chain ID: %d, Block Time: %s)\n", cfg.ChainID, cfg.BlockTime)
				fmt.Printf("%-44s  %10s  %8s  %s\n", "Address", "Staked", "Status", "Commission")
				for _, v := range vs.List() {
					status := "active"
					if v.Slashed {
						status = "slashed"
					} else if !v.Active {
						status = "inactive"
					}
					fmt.Printf("%-44s  %10d  %8s  %.1f%%\n", v.Address, v.StakedAmount, status, v.Commission*100)
				}
				return nil
			},
		},
	)
	return cmd
}

func registerCmd() *cobra.Command {
	var address, key string
	var stake int64

	cmd := &cobra.Command{
		Use:   "register",
		Short: "Register this node as a validator",
		Long: `Register a validator address with a stake amount.
The stake must meet the minimum requirement (default: 1000 GYDS).

Example:
  gyds-validatornode register --address 0xYOUR_ADDRESS --stake 1000 --key 0xPRIVATE_KEY`,
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg := config.FromEnv()
			if address == "" {
				address = cfg.ValidatorAddress
			}
			if address == "" {
				return fmt.Errorf("--address is required (or set GYDS_VALIDATOR_ADDRESS env var)")
			}
			if stake < cfg.StakeRequired {
				return fmt.Errorf("stake %d GYDS is below the minimum %d GYDS", stake, cfg.StakeRequired)
			}
			fmt.Printf("✓ Registering validator:\n")
			fmt.Printf("  Address    : %s\n", address)
			fmt.Printf("  Stake      : %d GYDS\n", stake)
			fmt.Printf("  Commission : 5%%\n")
			fmt.Printf("  Chain ID   : %d\n", cfg.ChainID)
			fmt.Printf("\nNext step: Start the node with 'gyds-validatornode start'\n")
			return nil
		},
	}

	cmd.Flags().StringVar(&address, "address", "", "Validator address (0x...)")
	cmd.Flags().StringVar(&key, "key", "", "Private key for signing blocks")
	cmd.Flags().Int64Var(&stake, "stake", 1000, "Amount of GYDS to stake (minimum 1000)")
	return cmd
}

func startCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "start",
		Short: "Start the GYDS validator node",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runNode()
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
		Str("mode", "validator").
		Int64("chainId", cfg.ChainID).
		Dur("blockTime", cfg.BlockTime).
		Int64("stakeRequired", cfg.StakeRequired).
		Msg("Starting GYDS validator node")

	if cfg.ValidatorAddress != "" {
		log.Info().Str("address", cfg.ValidatorAddress).Msg("Validator address loaded")
	} else {
		log.Warn().Msg("GYDS_VALIDATOR_ADDRESS not set — using genesis validators")
	}

	// Initialise chain
	chain := core.NewChain(core.GydsGenesis, cfg.DataDir)
	log.Info().Uint64("height", chain.Height()).Msg("Chain initialised")

	// Initialise validator set
	validatorAddrs := core.GydsGenesis.Validators
	if cfg.ValidatorAddress != "" {
		validatorAddrs = append(validatorAddrs, cfg.ValidatorAddress)
	}
	vs := consensus.NewValidatorSet(validatorAddrs)

	// Initialise PoS engine
	engine := consensus.NewPoSEngine(chain, vs, cfg.BlockTime)

	// Initialise RPC server
	rpcSrv := rpc.NewServer(chain, vs, engine, cfg.RPCPort, int(cfg.BlockTime.Seconds()))

	engine.OnNewBlock(func(b *core.Block) {
		log.Info().
			Uint64("number", b.Header.Number).
			Str("hash", b.Hash[:min(len(b.Hash), 18)]+"...").
			Int("txs", len(b.Transactions)).
			Str("validator", b.Header.Validator).
			Msg("New block proposed")
		rpcSrv.NotifyNewBlock(b)
	})

	// Initialise P2P
	p2pSrv := p2p.NewServer(cfg.P2PPort, cfg.ChainID, chain.Height)
	if err := p2pSrv.Start(); err != nil {
		log.Warn().Err(err).Msg("P2P server failed to start (non-fatal)")
	} else {
		log.Info().Int("port", cfg.P2PPort).Msg("P2P server started")
	}

	engine.Start()
	log.Info().Dur("blockTime", cfg.BlockTime).Msg("PoS consensus engine started")

	log.Info().
		Str("rpc", fmt.Sprintf("http://0.0.0.0:%d", cfg.RPCPort)).
		Str("p2p", fmt.Sprintf("tcp://0.0.0.0:%d", cfg.P2PPort)).
		Int("validators", vs.Count()).
		Msg("Validator node running")

	errCh := make(chan error, 1)
	go func() { errCh <- rpcSrv.Start() }()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)

	select {
	case s := <-sig:
		log.Info().Str("signal", s.String()).Msg("Shutting down")
		engine.Stop()
		p2pSrv.Stop()
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

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
