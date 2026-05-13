// Package rpc - Ethereum-compatible JSON-RPC handlers for wallet integration
// Compatible with Trust Wallet, MetaMask, and EIP-3085 standard
package rpc

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"strings"

	"chaincore/internal/blockchain"
)

// ChainConfig holds network configuration
type ChainConfig struct {
	ChainID          uint64
	NetworkID        uint64
	ProtocolVersion  uint64
	ChainName        string
	Symbol           string
	Decimals         int
	BlockExplorerURL string
}

// DefaultChainConfig returns the GYDS mainnet configuration
func DefaultChainConfig() *ChainConfig {
	return &ChainConfig{
		ChainID:          13370,
		NetworkID:        13370,
		ProtocolVersion:  1,
		ChainName:        "GYDS Network",
		Symbol:           "GYDS",
		Decimals:         18,
		BlockExplorerURL: "https://explorer.gyds.network",
	}
}

// TestnetChainConfig returns the GYDS testnet configuration
func TestnetChainConfig() *ChainConfig {
	return &ChainConfig{
		ChainID:          13371,
		NetworkID:        13371,
		ProtocolVersion:  1,
		ChainName:        "GYDS Testnet",
		Symbol:           "tGYDS",
		Decimals:         18,
		BlockExplorerURL: "https://testnet-explorer.gyds.network",
	}
}

// EthHandlers provides Ethereum-compatible RPC handlers
type EthHandlers struct {
	chain  *blockchain.Blockchain
	config *ChainConfig
}

// NewEthHandlers creates new Ethereum-compatible handlers
func NewEthHandlers(chain *blockchain.Blockchain, config *ChainConfig) *EthHandlers {
	if config == nil {
		config = DefaultChainConfig()
	}
	return &EthHandlers{
		chain:  chain,
		config: config,
	}
}

// HandleMethod processes Ethereum-compatible RPC methods
func (h *EthHandlers) HandleMethod(method string, params json.RawMessage) (interface{}, error) {
	switch method {
	// Network methods
	case "eth_chainId":
		return h.ethChainId()
	case "net_version":
		return h.netVersion()
	case "eth_protocolVersion":
		return h.ethProtocolVersion()
	case "net_listening":
		return h.netListening()
	case "net_peerCount":
		return h.netPeerCount()
	case "web3_clientVersion":
		return h.web3ClientVersion()

	// Block methods
	case "eth_blockNumber":
		return h.ethBlockNumber()
	case "eth_getBlockByNumber":
		return h.ethGetBlockByNumber(params)
	case "eth_getBlockByHash":
		return h.ethGetBlockByHash(params)
	case "eth_getBlockTransactionCountByNumber":
		return h.ethGetBlockTransactionCountByNumber(params)
	case "eth_getBlockTransactionCountByHash":
		return h.ethGetBlockTransactionCountByHash(params)

	// Account methods
	case "eth_getBalance":
		return h.ethGetBalance(params)
	case "eth_getTransactionCount":
		return h.ethGetTransactionCount(params)
	case "eth_getCode":
		return h.ethGetCode(params)
	case "eth_getStorageAt":
		return h.ethGetStorageAt(params)
	case "eth_accounts":
		return h.ethAccounts()

	// Transaction methods
	case "eth_sendRawTransaction":
		return h.ethSendRawTransaction(params)
	case "eth_getTransactionByHash":
		return h.ethGetTransactionByHash(params)
	case "eth_getTransactionReceipt":
		return h.ethGetTransactionReceipt(params)
	case "eth_getTransactionByBlockNumberAndIndex":
		return h.ethGetTransactionByBlockNumberAndIndex(params)
	case "eth_getTransactionByBlockHashAndIndex":
		return h.ethGetTransactionByBlockHashAndIndex(params)

	// Gas methods
	case "eth_gasPrice":
		return h.ethGasPrice()
	case "eth_estimateGas":
		return h.ethEstimateGas(params)
	case "eth_maxPriorityFeePerGas":
		return h.ethMaxPriorityFeePerGas()
	case "eth_feeHistory":
		return h.ethFeeHistory(params)

	// Call methods
	case "eth_call":
		return h.ethCall(params)
	case "eth_getLogs":
		return h.ethGetLogs(params)

	// Sync status
	case "eth_syncing":
		return h.ethSyncing()

	default:
		return nil, fmt.Errorf("method not found: %s", method)
	}
}

// Network methods
func (h *EthHandlers) ethChainId() (interface{}, error) {
	return fmt.Sprintf("0x%x", h.config.ChainID), nil
}

func (h *EthHandlers) netVersion() (interface{}, error) {
	return fmt.Sprintf("%d", h.config.NetworkID), nil
}

func (h *EthHandlers) ethProtocolVersion() (interface{}, error) {
	return fmt.Sprintf("0x%x", h.config.ProtocolVersion), nil
}

func (h *EthHandlers) netListening() (interface{}, error) {
	return true, nil
}

func (h *EthHandlers) netPeerCount() (interface{}, error) {
	// TODO: Get actual peer count from p2p network
	return "0xa", nil // 10 peers
}

func (h *EthHandlers) web3ClientVersion() (interface{}, error) {
	return "GYDS/v1.0.0/go", nil
}

// Block methods
func (h *EthHandlers) ethBlockNumber() (interface{}, error) {
	block := h.chain.GetCurrentBlock()
	return fmt.Sprintf("0x%x", block.Header.Height), nil
}

func (h *EthHandlers) ethGetBlockByNumber(params json.RawMessage) (interface{}, error) {
	var args []interface{}
	if err := json.Unmarshal(params, &args); err != nil {
		return nil, err
	}

	if len(args) < 1 {
		return nil, fmt.Errorf("missing block number parameter")
	}

	blockNumberStr, ok := args[0].(string)
	if !ok {
		return nil, fmt.Errorf("invalid block number")
	}

	var height uint64
	if blockNumberStr == "latest" {
		block := h.chain.GetCurrentBlock()
		height = block.Header.Height
	} else if blockNumberStr == "pending" {
		block := h.chain.GetCurrentBlock()
		height = block.Header.Height
	} else if blockNumberStr == "earliest" {
		height = 0
	} else {
		// Parse hex number
		blockNumberStr = strings.TrimPrefix(blockNumberStr, "0x")
		n := new(big.Int)
		n.SetString(blockNumberStr, 16)
		height = n.Uint64()
	}

	block, err := h.chain.GetBlock(height)
	if err != nil {
		return nil, err
	}

	fullTx := false
	if len(args) > 1 {
		fullTx, _ = args[1].(bool)
	}

	return h.formatBlock(block, fullTx), nil
}

func (h *EthHandlers) ethGetBlockByHash(params json.RawMessage) (interface{}, error) {
	// TODO: Implement block by hash lookup
	return nil, nil
}

func (h *EthHandlers) ethGetBlockTransactionCountByNumber(params json.RawMessage) (interface{}, error) {
	var args []interface{}
	if err := json.Unmarshal(params, &args); err != nil {
		return nil, err
	}

	// TODO: Get actual transaction count
	return "0x0", nil
}

func (h *EthHandlers) ethGetBlockTransactionCountByHash(params json.RawMessage) (interface{}, error) {
	return "0x0", nil
}

// Account methods
func (h *EthHandlers) ethGetBalance(params json.RawMessage) (interface{}, error) {
	var args []string
	if err := json.Unmarshal(params, &args); err != nil {
		return nil, err
	}

	if len(args) < 1 {
		return nil, fmt.Errorf("missing address parameter")
	}

	address := args[0]
	addr, err := h.parseAddress(address)
	if err != nil {
		return nil, err
	}

	balance := h.chain.GetBalance(addr)
	return fmt.Sprintf("0x%x", balance), nil
}

func (h *EthHandlers) ethGetTransactionCount(params json.RawMessage) (interface{}, error) {
	var args []string
	if err := json.Unmarshal(params, &args); err != nil {
		return nil, err
	}

	if len(args) < 1 {
		return nil, fmt.Errorf("missing address parameter")
	}

	// TODO: Get actual nonce from state
	return "0x0", nil
}

func (h *EthHandlers) ethGetCode(params json.RawMessage) (interface{}, error) {
	// GYDS doesn't support smart contracts in v1
	return "0x", nil
}

func (h *EthHandlers) ethGetStorageAt(params json.RawMessage) (interface{}, error) {
	return "0x0000000000000000000000000000000000000000000000000000000000000000", nil
}

func (h *EthHandlers) ethAccounts() (interface{}, error) {
	// Node doesn't hold accounts - wallets manage their own keys
	return []string{}, nil
}

// Transaction methods
func (h *EthHandlers) ethSendRawTransaction(params json.RawMessage) (interface{}, error) {
	var args []string
	if err := json.Unmarshal(params, &args); err != nil {
		return nil, err
	}

	if len(args) < 1 {
		return nil, fmt.Errorf("missing transaction data")
	}

	rawTx := args[0]
	rawTx = strings.TrimPrefix(rawTx, "0x")

	txBytes, err := hex.DecodeString(rawTx)
	if err != nil {
		return nil, fmt.Errorf("invalid transaction data: %v", err)
	}

	// Parse and validate transaction
	tx, err := h.parseTransaction(txBytes)
	if err != nil {
		return nil, err
	}

	// Add to transaction pool
	if err := h.chain.AddTransaction(tx); err != nil {
		return nil, err
	}

	return fmt.Sprintf("0x%s", tx.HashHex()), nil
}

func (h *EthHandlers) ethGetTransactionByHash(params json.RawMessage) (interface{}, error) {
	// TODO: Implement transaction lookup by hash
	return nil, nil
}

func (h *EthHandlers) ethGetTransactionReceipt(params json.RawMessage) (interface{}, error) {
	// TODO: Implement transaction receipt
	return nil, nil
}

func (h *EthHandlers) ethGetTransactionByBlockNumberAndIndex(params json.RawMessage) (interface{}, error) {
	return nil, nil
}

func (h *EthHandlers) ethGetTransactionByBlockHashAndIndex(params json.RawMessage) (interface{}, error) {
	return nil, nil
}

// Gas methods
func (h *EthHandlers) ethGasPrice() (interface{}, error) {
	// 1 Gwei = 1000000000 wei
	return "0x3b9aca00", nil
}

func (h *EthHandlers) ethEstimateGas(params json.RawMessage) (interface{}, error) {
	// Default gas for simple transfer: 21000
	return "0x5208", nil
}

func (h *EthHandlers) ethMaxPriorityFeePerGas() (interface{}, error) {
	// 1.5 Gwei
	return "0x59682f00", nil
}

func (h *EthHandlers) ethFeeHistory(params json.RawMessage) (interface{}, error) {
	return map[string]interface{}{
		"baseFeePerGas": []string{"0x3b9aca00"},
		"gasUsedRatio":  []float64{0.5},
		"oldestBlock":   "0x1",
		"reward":        [][]string{{"0x59682f00"}},
	}, nil
}

// Call methods
func (h *EthHandlers) ethCall(params json.RawMessage) (interface{}, error) {
	// GYDS v1 doesn't support smart contract calls
	return "0x", nil
}

func (h *EthHandlers) ethGetLogs(params json.RawMessage) (interface{}, error) {
	// Return empty logs for v1
	return []interface{}{}, nil
}

// Sync status
func (h *EthHandlers) ethSyncing() (interface{}, error) {
	// TODO: Return actual sync status
	return false, nil
}

// Helper methods
func (h *EthHandlers) parseAddress(addr string) ([20]byte, error) {
	var address [20]byte
	addr = strings.TrimPrefix(addr, "0x")
	if len(addr) != 40 {
		return address, fmt.Errorf("invalid address length")
	}

	bytes, err := hex.DecodeString(addr)
	if err != nil {
		return address, err
	}

	copy(address[:], bytes)
	return address, nil
}

func (h *EthHandlers) parseTransaction(data []byte) (*blockchain.Transaction, error) {
	// Parse RLP-encoded transaction
	// This is a simplified version - production would use proper RLP decoding
	tx := &blockchain.Transaction{
		// Parse fields from RLP data
	}
	return tx, nil
}

func (h *EthHandlers) formatBlock(block *blockchain.Block, fullTx bool) map[string]interface{} {
	result := map[string]interface{}{
		"number":           fmt.Sprintf("0x%x", block.Header.Height),
		"hash":             fmt.Sprintf("0x%s", block.HashHex()),
		"parentHash":       fmt.Sprintf("0x%x", block.Header.ParentHash),
		"nonce":            fmt.Sprintf("0x%016x", block.Header.Nonce),
		"sha3Uncles":       "0x0000000000000000000000000000000000000000000000000000000000000000",
		"logsBloom":        "0x" + strings.Repeat("0", 512),
		"transactionsRoot": fmt.Sprintf("0x%x", block.Header.TxRoot),
		"stateRoot":        fmt.Sprintf("0x%x", block.Header.StateRoot),
		"receiptsRoot":     "0x0000000000000000000000000000000000000000000000000000000000000000",
		"miner":            fmt.Sprintf("0x%x", block.Header.ProposerAddress),
		"difficulty":       fmt.Sprintf("0x%x", block.Header.Difficulty),
		"totalDifficulty":  fmt.Sprintf("0x%x", block.Header.Difficulty),
		"extraData":        fmt.Sprintf("0x%x", block.Header.ExtraData),
		"size":             "0x0",
		"gasLimit":         fmt.Sprintf("0x%x", block.Header.GasLimit),
		"gasUsed":          fmt.Sprintf("0x%x", block.Header.GasUsed),
		"timestamp":        fmt.Sprintf("0x%x", block.Header.Timestamp),
		"uncles":           []string{},
		"baseFeePerGas":    "0x3b9aca00",
	}

	if fullTx {
		txs := make([]map[string]interface{}, len(block.Transactions))
		for i, tx := range block.Transactions {
			txs[i] = h.formatTransaction(tx, block, uint64(i))
		}
		result["transactions"] = txs
	} else {
		txHashes := make([]string, len(block.Transactions))
		for i, tx := range block.Transactions {
			txHashes[i] = fmt.Sprintf("0x%s", tx.HashHex())
		}
		result["transactions"] = txHashes
	}

	return result
}

func (h *EthHandlers) formatTransaction(tx *blockchain.Transaction, block *blockchain.Block, index uint64) map[string]interface{} {
	return map[string]interface{}{
		"hash":             fmt.Sprintf("0x%s", tx.HashHex()),
		"nonce":            fmt.Sprintf("0x%x", tx.Nonce),
		"blockHash":        fmt.Sprintf("0x%s", block.HashHex()),
		"blockNumber":      fmt.Sprintf("0x%x", block.Header.Height),
		"transactionIndex": fmt.Sprintf("0x%x", index),
		"from":             fmt.Sprintf("0x%x", tx.From),
		"to":               fmt.Sprintf("0x%x", tx.To),
		"value":            fmt.Sprintf("0x%x", tx.Value),
		"gas":              fmt.Sprintf("0x%x", tx.GasLimit),
		"gasPrice":         fmt.Sprintf("0x%x", tx.GasPrice),
		"input":            "0x",
		"v":                "0x0",
		"r":                "0x0",
		"s":                "0x0",
		"type":             "0x0",
	}
}
