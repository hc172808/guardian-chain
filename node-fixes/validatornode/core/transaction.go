package core

import (
	"crypto/sha256"
	"fmt"
	"time"
)

type Transaction struct {
	Hash     string `json:"hash"`
	From     string `json:"from"`
	To       string `json:"to"`
	Value    string `json:"value"`
	Gas      uint64 `json:"gas"`
	GasPrice string `json:"gasPrice"`
	Nonce    uint64 `json:"nonce"`
	Data     string `json:"input"`
	V        string `json:"v"`
	R        string `json:"r"`
	S        string `json:"s"`
}

type Receipt struct {
	TxHash      string `json:"transactionHash"`
	BlockHash   string `json:"blockHash"`
	BlockNumber uint64 `json:"blockNumber"`
	GasUsed     uint64 `json:"gasUsed"`
	Status      string `json:"status"`
	Logs        []Log  `json:"logs"`
}

type Log struct {
	Address string   `json:"address"`
	Topics  []string `json:"topics"`
	Data    string   `json:"data"`
}

func NewTransaction(from, to, value string, gas uint64) *Transaction {
	ts := fmt.Sprintf("%d%s%s", time.Now().UnixNano(), from, to)
	sum := sha256.Sum256([]byte(ts))
	hash := fmt.Sprintf("0x%x", sum)
	return &Transaction{
		Hash:     hash,
		From:     from,
		To:       to,
		Value:    value,
		Gas:      gas,
		GasPrice: "0x4A817C800",
		Nonce:    0,
		Data:     "0x",
		V:        "0x1",
		R:        "0x" + repeat("a", 64),
		S:        "0x" + repeat("b", 64),
	}
}
