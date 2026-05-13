// Package network implements WireGuard VPN integration for node communication
package network

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"sync"
	"time"
)

// WireGuardConfig holds WireGuard configuration
type WireGuardConfig struct {
	PrivateKey    [32]byte
	ListenPort    int
	AllowedPeers  []WireGuardPeer
	InterfaceName string
	MTU           int
}

// WireGuardPeer represents a WireGuard peer
type WireGuardPeer struct {
	PublicKey           [32]byte
	AllowedIPs          []net.IPNet
	Endpoint            *net.UDPAddr
	PersistentKeepalive time.Duration
	LastHandshake       time.Time
	BytesSent           uint64
	BytesReceived       uint64
	IsOnline            bool
}

// WireGuardManager manages WireGuard connections
type WireGuardManager struct {
	config      WireGuardConfig
	peers       map[string]*WireGuardPeer
	publicKey   [32]byte
	conn        *net.UDPConn
	isRunning   bool
	mu          sync.RWMutex
	onPeerEvent func(event string, peer *WireGuardPeer)
}

// NewWireGuardManager creates a new WireGuard manager
func NewWireGuardManager(config WireGuardConfig) (*WireGuardManager, error) {
	wg := &WireGuardManager{
		config: config,
		peers:  make(map[string]*WireGuardPeer),
	}

	// Generate public key from private key
	wg.publicKey = derivePublicKey(config.PrivateKey)

	return wg, nil
}

// GenerateKeyPair generates a new WireGuard key pair
func GenerateKeyPair() ([32]byte, [32]byte, error) {
	var privateKey [32]byte
	_, err := rand.Read(privateKey[:])
	if err != nil {
		return [32]byte{}, [32]byte{}, err
	}

	// Clamp private key for Curve25519
	privateKey[0] &= 248
	privateKey[31] &= 127
	privateKey[31] |= 64

	publicKey := derivePublicKey(privateKey)
	return privateKey, publicKey, nil
}

// derivePublicKey derives public key from private key
func derivePublicKey(privateKey [32]byte) [32]byte {
	// Simplified - in production use proper X25519
	var publicKey [32]byte
	for i := 0; i < 32; i++ {
		publicKey[i] = privateKey[i] ^ byte(i*7+23)
	}
	return publicKey
}

// EncodeKey encodes a key to base64
func EncodeKey(key [32]byte) string {
	return base64.StdEncoding.EncodeToString(key[:])
}

// DecodeKey decodes a base64 key
func DecodeKey(s string) ([32]byte, error) {
	var key [32]byte
	decoded, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		return key, err
	}
	if len(decoded) != 32 {
		return key, errors.New("invalid key length")
	}
	copy(key[:], decoded)
	return key, nil
}

// Start starts the WireGuard manager
func (wg *WireGuardManager) Start() error {
	wg.mu.Lock()
	defer wg.mu.Unlock()

	if wg.isRunning {
		return errors.New("already running")
	}

	// Create UDP listener
	addr := &net.UDPAddr{Port: wg.config.ListenPort}
	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		return fmt.Errorf("failed to listen: %w", err)
	}
	wg.conn = conn
	wg.isRunning = true

	// Start packet handler
	go wg.handlePackets()

	// Start keepalive routine
	go wg.keepaliveLoop()

	return nil
}

// Stop stops the WireGuard manager
func (wg *WireGuardManager) Stop() error {
	wg.mu.Lock()
	defer wg.mu.Unlock()

	if !wg.isRunning {
		return nil
	}

	wg.isRunning = false
	if wg.conn != nil {
		wg.conn.Close()
	}
	return nil
}

// AddPeer adds a new peer
func (wg *WireGuardManager) AddPeer(publicKey [32]byte, endpoint *net.UDPAddr, allowedIPs []net.IPNet) error {
	wg.mu.Lock()
	defer wg.mu.Unlock()

	keyStr := EncodeKey(publicKey)
	if _, exists := wg.peers[keyStr]; exists {
		return errors.New("peer already exists")
	}

	peer := &WireGuardPeer{
		PublicKey:           publicKey,
		Endpoint:            endpoint,
		AllowedIPs:          allowedIPs,
		PersistentKeepalive: 25 * time.Second,
		IsOnline:            false,
	}

	wg.peers[keyStr] = peer

	if wg.onPeerEvent != nil {
		wg.onPeerEvent("added", peer)
	}

	return nil
}

// RemovePeer removes a peer
func (wg *WireGuardManager) RemovePeer(publicKey [32]byte) error {
	wg.mu.Lock()
	defer wg.mu.Unlock()

	keyStr := EncodeKey(publicKey)
	peer, exists := wg.peers[keyStr]
	if !exists {
		return errors.New("peer not found")
	}

	delete(wg.peers, keyStr)

	if wg.onPeerEvent != nil {
		wg.onPeerEvent("removed", peer)
	}

	return nil
}

// GetPeer retrieves peer info
func (wg *WireGuardManager) GetPeer(publicKey [32]byte) (*WireGuardPeer, bool) {
	wg.mu.RLock()
	defer wg.mu.RUnlock()

	keyStr := EncodeKey(publicKey)
	peer, exists := wg.peers[keyStr]
	return peer, exists
}

// GetAllPeers returns all peers
func (wg *WireGuardManager) GetAllPeers() []*WireGuardPeer {
	wg.mu.RLock()
	defer wg.mu.RUnlock()

	peers := make([]*WireGuardPeer, 0, len(wg.peers))
	for _, peer := range wg.peers {
		peers = append(peers, peer)
	}
	return peers
}

// GetPublicKey returns the public key
func (wg *WireGuardManager) GetPublicKey() [32]byte {
	return wg.publicKey
}

// GetOnlinePeers returns count of online peers
func (wg *WireGuardManager) GetOnlinePeers() int {
	wg.mu.RLock()
	defer wg.mu.RUnlock()

	count := 0
	for _, peer := range wg.peers {
		if peer.IsOnline {
			count++
		}
	}
	return count
}

// handlePackets handles incoming UDP packets
func (wg *WireGuardManager) handlePackets() {
	buf := make([]byte, 65535)

	for wg.isRunning {
		n, addr, err := wg.conn.ReadFromUDP(buf)
		if err != nil {
			if wg.isRunning {
				continue
			}
			return
		}

		wg.processPacket(buf[:n], addr)
	}
}

// processPacket processes an incoming packet
func (wg *WireGuardManager) processPacket(data []byte, addr *net.UDPAddr) {
	// Simplified packet handling
	// In production, implement full WireGuard protocol

	wg.mu.Lock()
	defer wg.mu.Unlock()

	// Find peer by endpoint
	for _, peer := range wg.peers {
		if peer.Endpoint != nil && peer.Endpoint.String() == addr.String() {
			peer.LastHandshake = time.Now()
			peer.BytesReceived += uint64(len(data))
			peer.IsOnline = true

			if wg.onPeerEvent != nil {
				wg.onPeerEvent("data", peer)
			}
			break
		}
	}
}

// keepaliveLoop sends periodic keepalives
func (wg *WireGuardManager) keepaliveLoop() {
	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()

	for wg.isRunning {
		<-ticker.C
		wg.sendKeepalives()
		wg.checkPeerTimeouts()
	}
}

// sendKeepalives sends keepalive packets to all peers
func (wg *WireGuardManager) sendKeepalives() {
	wg.mu.RLock()
	defer wg.mu.RUnlock()

	keepalive := []byte{0x04} // WireGuard keepalive message type

	for _, peer := range wg.peers {
		if peer.Endpoint != nil && peer.PersistentKeepalive > 0 {
			wg.conn.WriteToUDP(keepalive, peer.Endpoint)
			peer.BytesSent += 1
		}
	}
}

// checkPeerTimeouts marks peers as offline if no recent activity
func (wg *WireGuardManager) checkPeerTimeouts() {
	wg.mu.Lock()
	defer wg.mu.Unlock()

	timeout := 3 * time.Minute

	for _, peer := range wg.peers {
		if peer.IsOnline && time.Since(peer.LastHandshake) > timeout {
			peer.IsOnline = false
			if wg.onPeerEvent != nil {
				wg.onPeerEvent("offline", peer)
			}
		}
	}
}

// SetPeerEventHandler sets the callback for peer events
func (wg *WireGuardManager) SetPeerEventHandler(handler func(event string, peer *WireGuardPeer)) {
	wg.onPeerEvent = handler
}

// GenerateConfig generates a WireGuard config file content
func (wg *WireGuardManager) GenerateConfig() string {
	config := fmt.Sprintf(`[Interface]
PrivateKey = %s
ListenPort = %d

`, EncodeKey(wg.config.PrivateKey), wg.config.ListenPort)

	wg.mu.RLock()
	defer wg.mu.RUnlock()

	for _, peer := range wg.peers {
		config += fmt.Sprintf(`[Peer]
PublicKey = %s
`, EncodeKey(peer.PublicKey))

		if len(peer.AllowedIPs) > 0 {
			config += "AllowedIPs = "
			for i, ip := range peer.AllowedIPs {
				if i > 0 {
					config += ", "
				}
				config += ip.String()
			}
			config += "\n"
		}

		if peer.Endpoint != nil {
			config += fmt.Sprintf("Endpoint = %s\n", peer.Endpoint.String())
		}

		if peer.PersistentKeepalive > 0 {
			config += fmt.Sprintf("PersistentKeepalive = %d\n", int(peer.PersistentKeepalive.Seconds()))
		}

		config += "\n"
	}

	return config
}
