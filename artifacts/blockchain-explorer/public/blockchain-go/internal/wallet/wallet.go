// Package wallet implements wallet functionality
package wallet

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"math/big"
	"os"
	"path/filepath"
)

// Wallet represents a blockchain wallet
type Wallet struct {
	privateKey *ecdsa.PrivateKey
	publicKey  *ecdsa.PublicKey
	address    string
}

// CreateNew creates a new wallet
func CreateNew(dataDir string) (*Wallet, error) {
	// Generate new key pair
	privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}

	wallet := &Wallet{
		privateKey: privateKey,
		publicKey:  &privateKey.PublicKey,
	}
	wallet.address = wallet.deriveAddress()

	// Save to file
	keyPath := filepath.Join(dataDir, "wallet.key")
	if err := wallet.saveToFile(keyPath); err != nil {
		return nil, err
	}

	return wallet, nil
}

// Load loads a wallet from file
func Load(path string) (*Wallet, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	// Parse private key
	privateKey, err := parsePrivateKey(data)
	if err != nil {
		return nil, err
	}

	wallet := &Wallet{
		privateKey: privateKey,
		publicKey:  &privateKey.PublicKey,
	}
	wallet.address = wallet.deriveAddress()

	return wallet, nil
}

// Address returns the wallet address
func (w *Wallet) Address() string {
	return w.address
}

// deriveAddress derives the address from public key
func (w *Wallet) deriveAddress() string {
	pubKeyBytes := elliptic.Marshal(w.publicKey.Curve, w.publicKey.X, w.publicKey.Y)
	hash := sha256.Sum256(pubKeyBytes)
	return "0x" + hex.EncodeToString(hash[:20])
}

// Sign signs data with the private key
func (w *Wallet) Sign(data []byte) ([]byte, error) {
	hash := sha256.Sum256(data)
	r, s, err := ecdsa.Sign(rand.Reader, w.privateKey, hash[:])
	if err != nil {
		return nil, err
	}

	// Encode r and s
	signature := make([]byte, 64)
	rBytes := r.Bytes()
	sBytes := s.Bytes()
	copy(signature[32-len(rBytes):32], rBytes)
	copy(signature[64-len(sBytes):64], sBytes)

	return signature, nil
}

// CreateTransaction creates a signed transaction
func (w *Wallet) CreateTransaction(to string, amount string) (interface{}, error) {
	if len(to) < 42 {
		return nil, errors.New("invalid recipient address")
	}

	// Parse amount
	value, ok := new(big.Int).SetString(amount, 10)
	if !ok {
		return nil, errors.New("invalid amount")
	}

	// Create transaction
	tx := map[string]interface{}{
		"from":     w.address,
		"to":       to,
		"value":    value.String(),
		"nonce":    0, // Would be fetched from network
		"gasLimit": 21000,
		"gasPrice": "1000000000",
	}

	// Serialize for signing
	txData := serializeTx(tx)
	
	// Sign
	signature, err := w.Sign(txData)
	if err != nil {
		return nil, err
	}

	tx["signature"] = hex.EncodeToString(signature)
	return tx, nil
}

// saveToFile saves the wallet to a file
func (w *Wallet) saveToFile(path string) error {
	keyBytes := w.privateKey.D.Bytes()
	return os.WriteFile(path, keyBytes, 0600)
}

// parsePrivateKey parses a private key from bytes
func parsePrivateKey(data []byte) (*ecdsa.PrivateKey, error) {
	d := new(big.Int).SetBytes(data)
	
	privateKey := new(ecdsa.PrivateKey)
	privateKey.D = d
	privateKey.PublicKey.Curve = elliptic.P256()
	privateKey.PublicKey.X, privateKey.PublicKey.Y = privateKey.PublicKey.Curve.ScalarBaseMult(d.Bytes())

	return privateKey, nil
}

// serializeTx serializes a transaction for signing
func serializeTx(tx map[string]interface{}) []byte {
	// Simple serialization for demo
	data := tx["from"].(string) + tx["to"].(string) + tx["value"].(string)
	return []byte(data)
}
