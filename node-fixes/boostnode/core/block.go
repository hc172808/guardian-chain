package core

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
)

type BlockHeader struct {
	Number     uint64 `json:"number"`
	ParentHash string `json:"parentHash"`
	Timestamp  uint64 `json:"timestamp"`
	GasLimit   uint64 `json:"gasLimit"`
	GasUsed    uint64 `json:"gasUsed"`
	Validator  string `json:"validator"`
	StateRoot  string `json:"stateRoot"`
	TxRoot     string `json:"transactionsRoot"`
	ExtraData  string `json:"extraData"`
	Signature  string `json:"signature,omitempty"`
}

type Block struct {
	Header       BlockHeader    `json:"header"`
	Transactions []*Transaction `json:"transactions"`
	Hash         string         `json:"hash"`
}

func (b *Block) ComputeHash() string {
	data, _ := json.Marshal(b.Header)
	sum := sha256.Sum256(data)
	return fmt.Sprintf("0x%x", sum)
}

func (b *Block) ToMap() map[string]interface{} {
	txHashes := make([]string, len(b.Transactions))
	for i, tx := range b.Transactions {
		txHashes[i] = tx.Hash
	}
	return map[string]interface{}{
		"number":           fmt.Sprintf("0x%x", b.Header.Number),
		"hash":             b.Hash,
		"parentHash":       b.Header.ParentHash,
		"timestamp":        fmt.Sprintf("0x%x", b.Header.Timestamp),
		"gasLimit":         fmt.Sprintf("0x%x", b.Header.GasLimit),
		"gasUsed":          fmt.Sprintf("0x%x", b.Header.GasUsed),
		"miner":            b.Header.Validator,
		"stateRoot":        b.Header.StateRoot,
		"transactionsRoot": b.Header.TxRoot,
		"extraData":        b.Header.ExtraData,
		"transactions":     txHashes,
		"difficulty":       "0x0",
		"totalDifficulty":  "0x0",
		"size":             "0x200",
		"nonce":            "0x0000000000000000",
	}
}
