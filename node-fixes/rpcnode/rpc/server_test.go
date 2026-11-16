package rpc

import (
	"fmt"
	"strconv"
	"testing"

	"github.com/gydschain/rpcnode/core"
)

func TestChainIDMethodsUseConfiguredNetwork(t *testing.T) {
	for _, chainID := range []int64{198282, 198281} {
		server := NewServer(core.NewChain(core.GydsGenesis), 0, 0, "127.0.0.1", nil, chainID)

		if got, want := server.dispatch(map[string]interface{}{"method": "eth_chainId"}), fmt.Sprintf("0x%x", chainID); got != want {
			t.Errorf("eth_chainId for %d = %v, want %s", chainID, got, want)
		}
		if got, want := server.dispatch(map[string]interface{}{"method": "net_version"}), strconv.FormatInt(chainID, 10); got != want {
			t.Errorf("net_version for %d = %v, want %s", chainID, got, want)
		}
	}
}
