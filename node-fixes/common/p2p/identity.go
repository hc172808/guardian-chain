package p2p

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Identity is the persistent GYDS peer identity used by the custom GYDS
// handshake. Its enode URI is GYDS-specific; it is not Ethereum DevP2P.
type Identity struct {
	privateKey ed25519.PrivateKey
	nodeID     string
}

// LoadOrCreateIdentity stores a private Ed25519 seed at keyPath. Existing
// 32-byte hex keys, including the legacy bootnode key format, are preserved.
func LoadOrCreateIdentity(keyPath string) (*Identity, error) {
	read := func() (*Identity, error) {
		data, err := os.ReadFile(keyPath)
		if err != nil {
			return nil, err
		}
		seed, err := hex.DecodeString(strings.TrimSpace(string(data)))
		if err != nil || len(seed) != ed25519.SeedSize {
			return nil, fmt.Errorf("invalid GYDS node key at %s: expected a 32-byte hex seed", keyPath)
		}
		privateKey := ed25519.NewKeyFromSeed(seed)
		publicKey := privateKey.Public().(ed25519.PublicKey)
		return &Identity{privateKey: privateKey, nodeID: hex.EncodeToString(publicKey)}, nil
	}

	if identity, err := read(); err == nil {
		return identity, nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}

	if err := os.MkdirAll(filepath.Dir(keyPath), 0o700); err != nil {
		return nil, fmt.Errorf("create node key directory: %w", err)
	}
	seed := make([]byte, ed25519.SeedSize)
	if _, err := rand.Read(seed); err != nil {
		return nil, fmt.Errorf("generate node identity: %w", err)
	}
	file, err := os.OpenFile(keyPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if errors.Is(err, os.ErrExist) {
		return read()
	}
	if err != nil {
		return nil, fmt.Errorf("create node key: %w", err)
	}
	_, writeErr := fmt.Fprintf(file, "%s\n", hex.EncodeToString(seed))
	closeErr := file.Close()
	if writeErr != nil {
		return nil, fmt.Errorf("write node key: %w", writeErr)
	}
	if closeErr != nil {
		return nil, fmt.Errorf("close node key: %w", closeErr)
	}
	return read()
}

func (i *Identity) NodeID() string {
	if i == nil {
		return ""
	}
	return i.nodeID
}

func (i *Identity) EnodeURL(host string, port int) (string, error) {
	if i == nil || i.nodeID == "" {
		return "", errors.New("node identity is not initialized")
	}
	host = strings.TrimSpace(host)
	if host == "" || strings.ContainsAny(host, " /@?#") || port < 1 || port > 65535 {
		return "", errors.New("invalid advertised P2P host or port")
	}
	u := url.URL{
		Scheme: "enode",
		User:   url.User(i.nodeID),
		Host:   net.JoinHostPort(host, strconv.Itoa(port)),
	}
	return u.String(), nil
}

// ParsePeerAddress accepts a GYDS enode URI, legacy nodeID@host:port, or
// host:port and returns the TCP endpoint to dial.
func ParsePeerAddress(address string) (string, error) {
	address = strings.TrimSpace(address)
	if strings.HasPrefix(address, "enode://") {
		u, err := url.Parse(address)
		if err != nil || u.Scheme != "enode" || u.User == nil || u.User.Username() == "" {
			return "", errors.New("invalid GYDS enode URI")
		}
		address = net.JoinHostPort(u.Hostname(), u.Port())
	} else if at := strings.LastIndex(address, "@"); at >= 0 {
		address = address[at+1:]
	}

	host, portText, err := net.SplitHostPort(address)
	if err != nil || strings.TrimSpace(host) == "" {
		return "", errors.New("peer address must include a host and port")
	}
	port, err := strconv.Atoi(portText)
	if err != nil || port < 1 || port > 65535 {
		return "", errors.New("peer address has an invalid port")
	}
	return net.JoinHostPort(host, strconv.Itoa(port)), nil
}

type Hello struct {
	Type      string `json:"type"`
	NodeID    string `json:"nodeId"`
	ChainID   uint64 `json:"chainId"`
	Height    uint64 `json:"height"`
	Role      string `json:"role"`
	Version   string `json:"version"`
	Nonce     string `json:"nonce"`
	Signature string `json:"signature"`
}

func (i *Identity) ExchangeHello(conn net.Conn, chainID, height uint64, role string) (Hello, error) {
	if i == nil {
		return Hello{}, errors.New("node identity is not initialized")
	}
	nonce := make([]byte, 32)
	if _, err := rand.Read(nonce); err != nil {
		return Hello{}, fmt.Errorf("create peer handshake nonce: %w", err)
	}
	local := Hello{
		Type: "hello", NodeID: i.nodeID, ChainID: chainID, Height: height,
		Role: role, Version: "1.0.0", Nonce: hex.EncodeToString(nonce),
	}
	local.Signature = hex.EncodeToString(ed25519.Sign(i.privateKey, helloPayload(local)))
	if err := json.NewEncoder(conn).Encode(local); err != nil {
		return Hello{}, fmt.Errorf("send peer handshake: %w", err)
	}

	var remote Hello
	if err := json.NewDecoder(conn).Decode(&remote); err != nil {
		return Hello{}, fmt.Errorf("read peer handshake: %w", err)
	}
	publicKey, err := hex.DecodeString(remote.NodeID)
	if err != nil || len(publicKey) != ed25519.PublicKeySize || remote.Type != "hello" {
		return Hello{}, errors.New("peer sent an invalid GYDS identity")
	}
	signature, err := hex.DecodeString(remote.Signature)
	if err != nil || !ed25519.Verify(ed25519.PublicKey(publicKey), helloPayload(remote), signature) {
		return Hello{}, errors.New("peer identity signature is invalid")
	}
	if remote.ChainID != chainID {
		return Hello{}, fmt.Errorf("peer chain ID %d does not match %d", remote.ChainID, chainID)
	}
	if remote.NodeID == i.nodeID {
		return Hello{}, errors.New("refusing a connection to this node's own identity")
	}
	return remote, nil
}

func helloPayload(hello Hello) []byte {
	return []byte(fmt.Sprintf("GYDS-P2P-v1\n%s\n%s\n%d\n%d\n%s\n%s",
		hello.NodeID, hello.Nonce, hello.ChainID, hello.Height, hello.Role, hello.Version))
}

// Listener provides the same authenticated GYDS TCP handshake for client-only
// roles that need a P2P endpoint, such as the lite node.
type Listener struct {
	port          int
	chainID       uint64
	role          string
	dataDir       string
	advertiseHost string
	height        func() uint64
	identity      *Identity
	listener      net.Listener
	peers         map[string]net.Conn
	mu            sync.RWMutex
}

func NewListener(port int, chainID uint64, role, dataDir, advertiseHost string, height func() uint64) *Listener {
	return &Listener{
		port: port, chainID: chainID, role: role, dataDir: dataDir,
		advertiseHost: advertiseHost, height: height, peers: make(map[string]net.Conn),
	}
}

func (s *Listener) Start() error {
	if s.port < 1 || s.port > 65535 {
		return errors.New("P2P port must be between 1 and 65535")
	}
	identity, err := LoadOrCreateIdentity(filepath.Join(s.dataDir, "node.key"))
	if err != nil {
		return err
	}
	host := s.advertiseHost
	if host == "" {
		host = "127.0.0.1"
	}
	if _, err := identity.EnodeURL(host, s.port); err != nil {
		return err
	}
	ln, err := net.Listen("tcp", net.JoinHostPort("0.0.0.0", strconv.Itoa(s.port)))
	if err != nil {
		return err
	}
	s.identity, s.listener = identity, ln
	go s.accept()
	return nil
}

func (s *Listener) EnodeURL() string {
	if s.identity == nil {
		return ""
	}
	u, _ := s.identity.EnodeURL(s.advertiseHost, s.port)
	if s.advertiseHost == "" {
		u, _ = s.identity.EnodeURL("127.0.0.1", s.port)
	}
	return u
}

func (s *Listener) PeerCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.peers)
}

func (s *Listener) Stop() error {
	if s.listener == nil {
		return nil
	}
	err := s.listener.Close()
	s.mu.Lock()
	for id, conn := range s.peers {
		_ = conn.Close()
		delete(s.peers, id)
	}
	s.mu.Unlock()
	return err
}

func (s *Listener) accept() {
	for {
		conn, err := s.listener.Accept()
		if err != nil {
			return
		}
		go s.handle(conn)
	}
}

func (s *Listener) handle(conn net.Conn) {
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(10 * time.Second))
	height := uint64(0)
	if s.height != nil {
		height = s.height()
	}
	remote, err := s.identity.ExchangeHello(conn, s.chainID, height, s.role)
	if err != nil {
		return
	}
	_ = conn.SetDeadline(time.Time{})
	s.mu.Lock()
	s.peers[remote.NodeID] = conn
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		delete(s.peers, remote.NodeID)
		s.mu.Unlock()
	}()
	_, _ = io.Copy(io.Discard, conn)
}
