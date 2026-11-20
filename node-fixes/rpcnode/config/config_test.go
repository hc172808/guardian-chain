package config

import "testing"

func TestValidateSupportedNetworks(t *testing.T) {
	for _, chainID := range []int64{198282, 198281} {
		cfg := DefaultConfig()
		cfg.ChainID = chainID
		if err := cfg.Validate(); err != nil {
			t.Errorf("Validate() rejected supported chain ID %d: %v", chainID, err)
		}
	}
}

func TestValidateRejectsUnknownNetwork(t *testing.T) {
	cfg := DefaultConfig()
	cfg.ChainID = 1
	if err := cfg.Validate(); err == nil {
		t.Fatal("Validate() accepted an unrecognized chain ID")
	}
}

func TestFromEnvAcceptsNetworkNames(t *testing.T) {
	for _, test := range []struct {
		name string
		want int64
	}{
		{name: "mainnet", want: 198282},
		{name: "testnet", want: 198281},
	} {
		t.Setenv("GYDS_CHAIN_ID", test.name)
		cfg := FromEnv()
		if cfg.ChainID != test.want {
			t.Errorf("FromEnv() chain ID for %q = %d, want %d", test.name, cfg.ChainID, test.want)
		}
		if err := cfg.Validate(); err != nil {
			t.Errorf("Validate() rejected %q: %v", test.name, err)
		}
	}
}

func TestFromEnvMarksInvalidChainIDAsInvalid(t *testing.T) {
	t.Setenv("GYDS_CHAIN_ID", "not-a-network")
	cfg := FromEnv()
	if err := cfg.Validate(); err == nil {
		t.Fatal("Validate() accepted an invalid chain ID string")
	}
}
