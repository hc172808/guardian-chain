package core

// GydsGenesis is the shared genesis configuration for the GYDS Chain.
var GydsGenesis = &GenesisConfig{
	ChainID:     198282,
	NetworkName: "GYDS Chain",
	Timestamp:   1700000000,
	GasLimit:    30_000_000,
	ExtraData:   "0x47594453636861696e2047656e65736973",
	Validators: []string{
		"0x0000000000000000000000000000000000000001",
		"0x0000000000000000000000000000000000000002",
		"0x0000000000000000000000000000000000000003",
	},
	Alloc: map[string]GenesisAccount{
		"0x0000000000000000000000000000000000000001": {Balance: "100000000000000000000000"},
		"0x0000000000000000000000000000000000000002": {Balance: "50000000000000000000000"},
		"0x0000000000000000000000000000000000000003": {Balance: "50000000000000000000000"},
	},
}

type GenesisConfig struct {
	ChainID     int64
	NetworkName string
	Timestamp   int64
	GasLimit    uint64
	ExtraData   string
	Validators  []string
	Alloc       map[string]GenesisAccount
}

type GenesisAccount struct {
	Balance string
}

func (g *GenesisConfig) GenesisBlock() *Block {
	return &Block{
		Header: BlockHeader{
			Number:     0,
			ParentHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
			Timestamp:  uint64(g.Timestamp),
			GasLimit:   g.GasLimit,
			GasUsed:    0,
			Validator:  g.Validators[0],
			StateRoot:  "0x" + repeat("d", 64),
			ExtraData:  g.ExtraData,
		},
		Transactions: []*Transaction{},
		Hash:         "0x" + repeat("0", 63) + "1",
	}
}

func repeat(s string, n int) string {
	out := make([]byte, n*len(s))
	for i := 0; i < n; i++ {
		copy(out[i*len(s):], s)
	}
	return string(out)
}
