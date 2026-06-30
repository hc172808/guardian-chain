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

type Log struct {
	Address string   `json:"address"`
	Topics  []string `json:"topics"`
	Data    string   `json:"data"`
}

func NewTransaction(from, to, value string, nonce uint64) *Transaction {
	data := fmt.Sprintf("%s%s%s%d%d", from, to, value, nonce, time.Now().UnixNano())
	sum := sha256.Sum256([]byte(data))
	return &Transaction{
		Hash:     fmt.Sprintf("0x%x", sum),
		From:     from,
		To:       to,
		Value:    value,
		Gas:      21000,
		GasPrice: "0x3b9aca00",
		Nonce:    nonce,
		Data:     "0x",
		V:        "0x1",
		R:        fmt.Sprintf("0x%x", sum[:16]),
		S:        fmt.Sprintf("0x%x", sum[16:]),
	}
}
