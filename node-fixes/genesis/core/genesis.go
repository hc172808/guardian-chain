package core

// GydsGenesis is the shared genesis configuration for the GYDS Chain.
var GydsGenesis = &GenesisConfig{
	ChainID:     13370,
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
			Validator:  "0x0000000000000000000000000000000000000000",
			StateRoot:  "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421",
			TxRoot:     "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421",
			ExtraData:  g.ExtraData,
		},
		Transactions: []*Transaction{},
	}
}

func GenesisBlock(g *GenesisConfig) *Block {
	b := g.GenesisBlock()
	b.Hash = b.ComputeHash()
	return b
}
