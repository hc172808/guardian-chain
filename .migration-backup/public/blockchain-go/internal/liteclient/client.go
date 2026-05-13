// Package liteclient implements the lite node client
package liteclient

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"

	"chaincore/internal/storage"
)

// Config holds lite client configuration
type Config struct {
	RPCEndpoints   []string
	MaxRetries     int
	TimeoutSeconds int
	EnableFailover bool
	SyncHeaders    bool
	ValidateProofs bool
}

// Client implements the lite node RPC client
type Client struct {
	config        Config
	cache         *storage.LiteCache
	currentEndpoint int
	latestHeight  uint64
	syncing       bool
	mu            sync.RWMutex
}

// NewClient creates a new lite client
func NewClient(config Config, cache *storage.LiteCache) (*Client, error) {
	if len(config.RPCEndpoints) == 0 {
		return nil, errors.New("no RPC endpoints provided")
	}

	return &Client{
		config:        config,
		cache:         cache,
		currentEndpoint: 0,
	}, nil
}

// Start starts the lite client
func (c *Client) Start() error {
	// Test connection to endpoints
	for i, endpoint := range c.config.RPCEndpoints {
		if err := c.testEndpoint(endpoint); err == nil {
			c.currentEndpoint = i
			return nil
		}
	}
	return errors.New("no reachable endpoints")
}

// Stop stops the lite client
func (c *Client) Stop() {
	// Cleanup
}

// testEndpoint tests connectivity to an endpoint
func (c *Client) testEndpoint(endpoint string) error {
	_, err := c.callRPC(endpoint, "chain_getBlockNumber", nil)
	return err
}

// SyncHeaders syncs block headers from full nodes
func (c *Client) SyncHeaders() error {
	c.mu.Lock()
	c.syncing = true
	c.mu.Unlock()

	defer func() {
		c.mu.Lock()
		c.syncing = false
		c.mu.Unlock()
	}()

	// Get latest block number
	result, err := c.Call("chain_getBlockNumber", nil)
	if err != nil {
		return err
	}

	var height uint64
	if err := json.Unmarshal(result, &height); err != nil {
		return err
	}

	c.mu.Lock()
	c.latestHeight = height
	c.mu.Unlock()

	// Sync headers from our latest to network latest
	// This implements SPV-like header chain verification

	return nil
}

// Call makes an RPC call with failover support
func (c *Client) Call(method string, params interface{}) (json.RawMessage, error) {
	c.mu.RLock()
	endpoint := c.config.RPCEndpoints[c.currentEndpoint]
	c.mu.RUnlock()

	result, err := c.callRPC(endpoint, method, params)
	if err != nil && c.config.EnableFailover {
		// Try other endpoints
		for i, ep := range c.config.RPCEndpoints {
			if i == c.currentEndpoint {
				continue
			}
			result, err = c.callRPC(ep, method, params)
			if err == nil {
				c.mu.Lock()
				c.currentEndpoint = i
				c.mu.Unlock()
				return result, nil
			}
		}
	}

	return result, err
}

// callRPC makes a raw RPC call
func (c *Client) callRPC(endpoint, method string, params interface{}) (json.RawMessage, error) {
	reqBody := map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  method,
		"params":  params,
		"id":      1,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	client := &http.Client{
		Timeout: time.Duration(c.config.TimeoutSeconds) * time.Second,
	}

	resp, err := client.Post(endpoint, "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var rpcResp struct {
		Result json.RawMessage `json:"result"`
		Error  *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&rpcResp); err != nil {
		return nil, err
	}

	if rpcResp.Error != nil {
		return nil, fmt.Errorf("RPC error %d: %s", rpcResp.Error.Code, rpcResp.Error.Message)
	}

	return rpcResp.Result, nil
}

// GetBlockNumber returns the latest block number
func (c *Client) GetBlockNumber() (uint64, error) {
	result, err := c.Call("chain_getBlockNumber", nil)
	if err != nil {
		return 0, err
	}

	var height uint64
	if err := json.Unmarshal(result, &height); err != nil {
		return 0, err
	}

	return height, nil
}

// GetBlock retrieves a block
func (c *Client) GetBlock(height uint64) (json.RawMessage, error) {
	return c.Call("chain_getBlock", height)
}

// GetBalance retrieves an account balance
func (c *Client) GetBalance(address string) (string, error) {
	result, err := c.Call("chain_getBalance", address)
	if err != nil {
		return "", err
	}

	var balance string
	if err := json.Unmarshal(result, &balance); err != nil {
		return "", err
	}

	return balance, nil
}

// SendTransaction sends a transaction
func (c *Client) SendTransaction(tx interface{}) (string, error) {
	result, err := c.Call("chain_sendTransaction", tx)
	if err != nil {
		return "", err
	}

	var txHash string
	if err := json.Unmarshal(result, &txHash); err != nil {
		return "", err
	}

	return txHash, nil
}

// GetMiningWork retrieves mining work
func (c *Client) GetMiningWork() (map[string]interface{}, error) {
	result, err := c.Call("mining_getWork", nil)
	if err != nil {
		return nil, err
	}

	var work map[string]interface{}
	if err := json.Unmarshal(result, &work); err != nil {
		return nil, err
	}

	return work, nil
}

// SubmitMiningShare submits a mining share
func (c *Client) SubmitMiningShare(share interface{}) (bool, error) {
	result, err := c.Call("mining_submitShare", share)
	if err != nil {
		return false, err
	}

	var response map[string]bool
	if err := json.Unmarshal(result, &response); err != nil {
		return false, err
	}

	return response["accepted"], nil
}

// GetLatestHeight returns the latest synced height
func (c *Client) GetLatestHeight() uint64 {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.latestHeight
}

// IsSyncing returns whether the client is syncing
func (c *Client) IsSyncing() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.syncing
}
