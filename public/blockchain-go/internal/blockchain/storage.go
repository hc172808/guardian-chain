// Package blockchain - Block persistence layer
// Handles serialization and storage of blocks, transactions, and chain metadata
// using the underlying storage.Database interface.
package blockchain

import (
        "encoding/binary"
        "encoding/json"
        "errors"
        "fmt"
        "math/big"
)

// Storage key prefixes - keep short to minimize disk usage
var (
        keyPrefixBlock        = []byte("b:")  // b:<height>          -> block hash
        keyPrefixBlockByHash  = []byte("bh:") // bh:<hash>           -> serialized block
        keyPrefixHeightByHash = []byte("hh:") // hh:<hash>           -> height (uint64)
        keyHeadBlock          = []byte("head")
        keyChainConfig        = []byte("config")
        keyPrefixTxLookup     = []byte("tx:") // tx:<txhash>         -> {block_hash, index}
        keyPrefixReceipts     = []byte("r:")  // r:<height>          -> receipts json
)

// blockJSON is the on-disk representation of a Block.
// We use JSON for forward-compatibility and easy debugging.
// In production this should be replaced with RLP/protobuf for efficiency.
type blockJSON struct {
        Header       blockHeaderJSON       `json:"header"`
        Transactions []transactionJSON     `json:"txs"`
        Validators   []validatorVoteJSON   `json:"validators"`
        MiningShares []miningShareJSON     `json:"mining_shares"`
}

type blockHeaderJSON struct {
        Version       uint32 `json:"version"`
        Height        uint64 `json:"height"`
        Timestamp     uint64 `json:"timestamp"`
        PrevHash      string `json:"prev_hash"`
        StateRoot     string `json:"state_root"`
        TxRoot        string `json:"tx_root"`
        ReceiptsRoot  string `json:"receipts_root"`
        ValidatorRoot string `json:"validator_root"`
        MiningRoot    string `json:"mining_root"`
        ProposerAddr  string `json:"proposer"`
        Difficulty    string `json:"difficulty"`
        Nonce         uint64 `json:"nonce"`
        GasLimit      uint64 `json:"gas_limit"`
        GasUsed       uint64 `json:"gas_used"`
        ExtraData     []byte `json:"extra"`
}

type transactionJSON struct {
        Version     uint8  `json:"v"`
        TxType      uint8  `json:"t"`
        Nonce       uint64 `json:"n"`
        From        string `json:"from"`
        To          string `json:"to"`
        Value       string `json:"value"`
        CoinType    uint8  `json:"coin"`
        GasLimit    uint64 `json:"gas_limit"`
        GasPrice    uint64 `json:"gas_price"`
        Data        []byte `json:"data"`
        Signature   string `json:"sig"`
        Hash        string `json:"hash"`
        FeePayer    string `json:"fee_payer,omitempty"`
        FeePayerSig string `json:"fee_payer_sig,omitempty"`
}

type validatorVoteJSON struct {
        ValidatorAddr string `json:"validator"`
        BlockHash     string `json:"block_hash"`
        Signature     string `json:"sig"`
        Timestamp     uint64 `json:"ts"`
}

type miningShareJSON struct {
        MinerAddr  string `json:"miner"`
        ShareHash  string `json:"share_hash"`
        Difficulty string `json:"difficulty"`
        Nonce      uint64 `json:"nonce"`
        Timestamp  uint64 `json:"ts"`
        HumanScore uint8  `json:"human_score"`
        SessionID  string `json:"session_id"`
        PoolID     string `json:"pool_id"`
}

type txLookupEntry struct {
        BlockHash string `json:"block_hash"`
        Index     uint32 `json:"index"`
}

// --- Key builders ---

func blockHeightKey(height uint64) []byte {
        buf := make([]byte, len(keyPrefixBlock)+8)
        copy(buf, keyPrefixBlock)
        binary.BigEndian.PutUint64(buf[len(keyPrefixBlock):], height)
        return buf
}

func blockHashKey(hash [32]byte) []byte {
        buf := make([]byte, len(keyPrefixBlockByHash)+32)
        copy(buf, keyPrefixBlockByHash)
        copy(buf[len(keyPrefixBlockByHash):], hash[:])
        return buf
}

func heightByHashKey(hash [32]byte) []byte {
        buf := make([]byte, len(keyPrefixHeightByHash)+32)
        copy(buf, keyPrefixHeightByHash)
        copy(buf[len(keyPrefixHeightByHash):], hash[:])
        return buf
}

func txLookupKey(hash [32]byte) []byte {
        buf := make([]byte, len(keyPrefixTxLookup)+32)
        copy(buf, keyPrefixTxLookup)
        copy(buf[len(keyPrefixTxLookup):], hash[:])
        return buf
}

// --- Public storage API on Blockchain ---

// SaveBlock persists a block to the database using a batch write.
// Updates the head pointer atomically with the block data.
func (bc *Blockchain) SaveBlock(block *Block) error {
        return bc.saveBlock(block)
}

// LoadBlockByHeight retrieves a block by its height.
func (bc *Blockchain) LoadBlockByHeight(height uint64) (*Block, error) {
        return bc.loadBlockByHeight(height)
}

// LoadBlockByHash retrieves a block by its hash.
func (bc *Blockchain) LoadBlockByHash(hash [32]byte) (*Block, error) {
        data, err := bc.db.Get(blockHashKey(hash))
        if err != nil {
                return nil, fmt.Errorf("block not found: %w", err)
        }
        return decodeBlock(data)
}

// LoadHeadBlock returns the latest persisted block.
func (bc *Blockchain) LoadHeadBlock() (*Block, error) {
        return bc.loadCurrentBlock()
}

// GetTransactionByHash looks up a transaction across all stored blocks.
func (bc *Blockchain) GetTransactionByHash(hash [32]byte) (*Transaction, *Block, error) {
        data, err := bc.db.Get(txLookupKey(hash))
        if err != nil {
                return nil, nil, errors.New("transaction not found")
        }
        var entry txLookupEntry
        if err := json.Unmarshal(data, &entry); err != nil {
                return nil, nil, fmt.Errorf("corrupt tx lookup: %w", err)
        }
        var blockHash [32]byte
        if _, err := hexDecodeInto(entry.BlockHash, blockHash[:]); err != nil {
                return nil, nil, err
        }
        block, err := bc.LoadBlockByHash(blockHash)
        if err != nil {
                return nil, nil, err
        }
        if int(entry.Index) >= len(block.Transactions) {
                return nil, nil, errors.New("tx index out of range")
        }
        return &block.Transactions[entry.Index], block, nil
}

// --- Internal save/load implementations (override stubs in blockchain.go) ---

// loadCurrentBlock loads the most recent block from disk.
func (bc *Blockchain) loadCurrentBlockImpl() (*Block, error) {
        headData, err := bc.db.Get(keyHeadBlock)
        if err != nil {
                return nil, errors.New("no head block")
        }
        if len(headData) != 32 {
                return nil, errors.New("invalid head block hash")
        }
        var hash [32]byte
        copy(hash[:], headData)
        return bc.LoadBlockByHash(hash)
}

// loadBlockByHeightImpl loads a block at the given height.
func (bc *Blockchain) loadBlockByHeightImpl(height uint64) (*Block, error) {
        hashBytes, err := bc.db.Get(blockHeightKey(height))
        if err != nil {
                return nil, fmt.Errorf("block at height %d not found", height)
        }
        if len(hashBytes) != 32 {
                return nil, errors.New("invalid block hash mapping")
        }
        var hash [32]byte
        copy(hash[:], hashBytes)
        return bc.LoadBlockByHash(hash)
}

// saveBlockImpl persists a block to disk and updates the head pointer.
func (bc *Blockchain) saveBlockImpl(block *Block) error {
        if block == nil {
                return errors.New("cannot save nil block")
        }

        // Commit state and compute the real state root before saving
        if err := bc.stateDB.Commit(); err != nil {
                return fmt.Errorf("state commit: %w", err)
        }
        stateRoot, err := bc.stateDB.ComputeStateRoot()
        if err == nil {
                block.Header.StateRoot = stateRoot
        }

        encoded, err := encodeBlock(block)
        if err != nil {
                return fmt.Errorf("encode block: %w", err)
        }

        hash := block.Hash()
        height := block.Header.Height

        heightBuf := make([]byte, 8)
        binary.BigEndian.PutUint64(heightBuf, height)

        batch := bc.db.NewBatch()

        // Block body keyed by hash
        if err := batch.Put(blockHashKey(hash), encoded); err != nil {
                return err
        }
        // Height -> hash pointer
        if err := batch.Put(blockHeightKey(height), hash[:]); err != nil {
                return err
        }
        // Hash -> height reverse lookup
        if err := batch.Put(heightByHashKey(hash), heightBuf); err != nil {
                return err
        }

        // Transaction lookup index
        for i, tx := range block.Transactions {
                entry := txLookupEntry{
                        BlockHash: hexEncode(hash[:]),
                        Index:     uint32(i),
                }
                entryBytes, err := json.Marshal(entry)
                if err != nil {
                        return err
                }
                if err := batch.Put(txLookupKey(tx.Hash), entryBytes); err != nil {
                        return err
                }
        }

        // Update head pointer
        if err := batch.Put(keyHeadBlock, hash[:]); err != nil {
                return err
        }

        return batch.Write()
}

// SaveChainConfig persists the chain configuration.
func (bc *Blockchain) SaveChainConfig() error {
        cfg := map[string]interface{}{
                "chain_id":   bc.config.ChainID,
                "chain_name": bc.config.ChainName,
                "block_time": bc.config.BlockTime,
        }
        data, err := json.Marshal(cfg)
        if err != nil {
                return err
        }
        return bc.db.Put(keyChainConfig, data)
}

// --- Encoding helpers ---

func encodeBlock(b *Block) ([]byte, error) {
        jb := blockJSON{
                Header: blockHeaderJSON{
                        Version:       b.Header.Version,
                        Height:        b.Header.Height,
                        Timestamp:     b.Header.Timestamp,
                        PrevHash:      hexEncode(b.Header.PrevHash[:]),
                        StateRoot:     hexEncode(b.Header.StateRoot[:]),
                        TxRoot:        hexEncode(b.Header.TxRoot[:]),
                        ReceiptsRoot:  hexEncode(b.Header.ReceiptsRoot[:]),
                        ValidatorRoot: hexEncode(b.Header.ValidatorRoot[:]),
                        MiningRoot:    hexEncode(b.Header.MiningRoot[:]),
                        ProposerAddr:  hexEncode(b.Header.ProposerAddr[:]),
                        Difficulty:    bigIntToString(b.Header.Difficulty),
                        Nonce:         b.Header.Nonce,
                        GasLimit:      b.Header.GasLimit,
                        GasUsed:       b.Header.GasUsed,
                        ExtraData:     b.Header.ExtraData,
                },
                Transactions: make([]transactionJSON, len(b.Transactions)),
                Validators:   make([]validatorVoteJSON, len(b.Validators)),
                MiningShares: make([]miningShareJSON, len(b.MiningShares)),
        }

        for i, tx := range b.Transactions {
                jb.Transactions[i] = transactionJSON{
                        Version:     tx.Version,
                        TxType:      uint8(tx.TxType),
                        Nonce:       tx.Nonce,
                        From:        hexEncode(tx.From[:]),
                        To:          hexEncode(tx.To[:]),
                        Value:       bigIntToString(tx.Value),
                        CoinType:    uint8(tx.CoinType),
                        GasLimit:    tx.GasLimit,
                        GasPrice:    tx.GasPrice,
                        Data:        tx.Data,
                        Signature:   hexEncode(tx.Signature[:]),
                        Hash:        hexEncode(tx.Hash[:]),
                        FeePayer:    hexEncode(tx.FeePayer[:]),
                        FeePayerSig: hexEncode(tx.FeePayerSig[:]),
                }
        }

        for i, v := range b.Validators {
                jb.Validators[i] = validatorVoteJSON{
                        ValidatorAddr: hexEncode(v.ValidatorAddr[:]),
                        BlockHash:     hexEncode(v.BlockHash[:]),
                        Signature:     hexEncode(v.Signature[:]),
                        Timestamp:     v.Timestamp,
                }
        }

        for i, m := range b.MiningShares {
                jb.MiningShares[i] = miningShareJSON{
                        MinerAddr:  hexEncode(m.MinerAddr[:]),
                        ShareHash:  hexEncode(m.ShareHash[:]),
                        Difficulty: bigIntToString(m.Difficulty),
                        Nonce:      m.Nonce,
                        Timestamp:  m.Timestamp,
                        HumanScore: m.HumanScore,
                        SessionID:  hexEncode(m.SessionID[:]),
                        PoolID:     hexEncode(m.PoolID[:]),
                }
        }

        return json.Marshal(jb)
}

func decodeBlock(data []byte) (*Block, error) {
        var jb blockJSON
        if err := json.Unmarshal(data, &jb); err != nil {
                return nil, fmt.Errorf("decode block: %w", err)
        }

        block := &Block{
                Header: BlockHeader{
                        Version:    jb.Header.Version,
                        Height:     jb.Header.Height,
                        Timestamp:  jb.Header.Timestamp,
                        Difficulty: stringToBigInt(jb.Header.Difficulty),
                        Nonce:      jb.Header.Nonce,
                        GasLimit:   jb.Header.GasLimit,
                        GasUsed:    jb.Header.GasUsed,
                        ExtraData:  jb.Header.ExtraData,
                },
                Transactions: make([]Transaction, len(jb.Transactions)),
                Validators:   make([]ValidatorVote, len(jb.Validators)),
                MiningShares: make([]MiningShare, len(jb.MiningShares)),
        }

        if _, err := hexDecodeInto(jb.Header.PrevHash, block.Header.PrevHash[:]); err != nil {
                return nil, err
        }
        if _, err := hexDecodeInto(jb.Header.StateRoot, block.Header.StateRoot[:]); err != nil {
                return nil, err
        }
        if _, err := hexDecodeInto(jb.Header.TxRoot, block.Header.TxRoot[:]); err != nil {
                return nil, err
        }
        if _, err := hexDecodeInto(jb.Header.ReceiptsRoot, block.Header.ReceiptsRoot[:]); err != nil {
                return nil, err
        }
        if _, err := hexDecodeInto(jb.Header.ValidatorRoot, block.Header.ValidatorRoot[:]); err != nil {
                return nil, err
        }
        if _, err := hexDecodeInto(jb.Header.MiningRoot, block.Header.MiningRoot[:]); err != nil {
                return nil, err
        }
        if _, err := hexDecodeInto(jb.Header.ProposerAddr, block.Header.ProposerAddr[:]); err != nil {
                return nil, err
        }

        for i, jtx := range jb.Transactions {
                tx := Transaction{
                        Version:  jtx.Version,
                        TxType:   TxType(jtx.TxType),
                        Nonce:    jtx.Nonce,
                        Value:    stringToBigInt(jtx.Value),
                        CoinType: CoinType(jtx.CoinType),
                        GasLimit: jtx.GasLimit,
                        GasPrice: jtx.GasPrice,
                        Data:     jtx.Data,
                }
                hexDecodeInto(jtx.From, tx.From[:])
                hexDecodeInto(jtx.To, tx.To[:])
                hexDecodeInto(jtx.Signature, tx.Signature[:])
                hexDecodeInto(jtx.Hash, tx.Hash[:])
                if jtx.FeePayer != "" {
                        hexDecodeInto(jtx.FeePayer, tx.FeePayer[:])
                }
                if jtx.FeePayerSig != "" {
                        hexDecodeInto(jtx.FeePayerSig, tx.FeePayerSig[:])
                }
                block.Transactions[i] = tx
        }

        for i, jv := range jb.Validators {
                v := ValidatorVote{Timestamp: jv.Timestamp}
                hexDecodeInto(jv.ValidatorAddr, v.ValidatorAddr[:])
                hexDecodeInto(jv.BlockHash, v.BlockHash[:])
                hexDecodeInto(jv.Signature, v.Signature[:])
                block.Validators[i] = v
        }

        for i, jm := range jb.MiningShares {
                m := MiningShare{
                        Difficulty: stringToBigInt(jm.Difficulty),
                        Nonce:      jm.Nonce,
                        Timestamp:  jm.Timestamp,
                        HumanScore: jm.HumanScore,
                }
                hexDecodeInto(jm.MinerAddr, m.MinerAddr[:])
                hexDecodeInto(jm.ShareHash, m.ShareHash[:])
                hexDecodeInto(jm.SessionID, m.SessionID[:])
                hexDecodeInto(jm.PoolID, m.PoolID[:])
                block.MiningShares[i] = m
        }

        return block, nil
}

// --- Small encoding utilities ---

const hexChars = "0123456789abcdef"

func hexEncode(src []byte) string {
        dst := make([]byte, len(src)*2)
        for i, b := range src {
                dst[i*2] = hexChars[b>>4]
                dst[i*2+1] = hexChars[b&0x0f]
        }
        return string(dst)
}

func hexDecodeInto(s string, dst []byte) (int, error) {
        if len(s) != len(dst)*2 {
                // Tolerate empty strings for optional fields (zero-fill).
                if s == "" {
                        return 0, nil
                }
                return 0, fmt.Errorf("hex length mismatch: got %d want %d", len(s), len(dst)*2)
        }
        for i := 0; i < len(dst); i++ {
                hi, err := hexNibble(s[i*2])
                if err != nil {
                        return i, err
                }
                lo, err := hexNibble(s[i*2+1])
                if err != nil {
                        return i, err
                }
                dst[i] = (hi << 4) | lo
        }
        return len(dst), nil
}

func hexNibble(c byte) (byte, error) {
        switch {
        case c >= '0' && c <= '9':
                return c - '0', nil
        case c >= 'a' && c <= 'f':
                return c - 'a' + 10, nil
        case c >= 'A' && c <= 'F':
                return c - 'A' + 10, nil
        }
        return 0, fmt.Errorf("invalid hex char: %c", c)
}

func bigIntToString(b *big.Int) string {
        if b == nil {
                return "0"
        }
        return b.String()
}

func stringToBigInt(s string) *big.Int {
        if s == "" {
                return big.NewInt(0)
        }
        n := new(big.Int)
        n.SetString(s, 10)
        return n
}
