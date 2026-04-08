package network

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"sync"
	"time"
)

// NodeType represents node type
type NodeType int

const (
	FullNode NodeType = iota
	LiteNode
)

// Config holds P2P network configuration
type Config struct {
	Port           int
	MaxPeers       int
	NodeType       NodeType
	EnableRelay    bool
	EnableRPCProxy bool
	BootstrapNodes []string
}

// Peer represents a connected peer
type Peer struct {
	ID        string
	Address   string
	NodeType  NodeType
	Connected time.Time
	LastSeen  time.Time
	Latency   time.Duration
	BytesSent uint64
	BytesRecv uint64
	conn      net.Conn
}

// MessageType defines message types
type MessageType int

const (
	MsgPing MessageType = iota
	MsgPong
	MsgBlockAnnounce
	MsgBlockRequest
	MsgBlockResponse
	MsgTxAnnounce
	MsgTxRequest
	MsgTxResponse
	MsgValidatorVote
	MsgMiningShare
	MsgPeerDiscovery
)

// Message represents a P2P message
type Message struct {
	Type    MessageType
	Payload []byte
	From    string
	To      string
}

// MessageHandler function type
type MessageHandler func(*Message) error

// P2PNetwork manages P2P connections
type P2PNetwork struct {
	config     Config
	nodeID     string
	peers      map[string]*Peer
	listener   net.Listener
	messagesCh chan *Message
	handlers   map[MessageType]MessageHandler
	mu         sync.RWMutex
	ctx        context.Context
	cancel     context.CancelFunc
}

// NewP2PNetwork creates a new P2P network
func NewP2PNetwork(config Config) *P2PNetwork {
	ctx, cancel := context.WithCancel(context.Background())
	return &P2PNetwork{
		config:     config,
		nodeID:     generateNodeID(),
		peers:      make(map[string]*Peer),
		messagesCh: make(chan *Message, 1000),
		handlers:   make(map[MessageType]MessageHandler),
		ctx:        ctx,
		cancel:     cancel,
	}
}

// Start starts the P2P network
func (n *P2PNetwork) Start() error {
	addr := fmt.Sprintf("0.0.0.0:%d", n.config.Port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	n.listener = listener

	go n.acceptConnections()
	go n.processMessages()
	go n.connectBootstrapNodes()
	go n.peerDiscoveryLoop()

	return nil
}

// Stop stops the P2P network
func (n *P2PNetwork) Stop() {
	n.cancel()
	if n.listener != nil {
		n.listener.Close()
	}

	n.mu.Lock()
	for _, peer := range n.peers {
		peer.conn.Close()
	}
	n.mu.Unlock()
}

// acceptConnections handles incoming connections
func (n *P2PNetwork) acceptConnections() {
	for {
		select {
		case <-n.ctx.Done():
			return
		default:
			conn, err := n.listener.Accept()
			if err != nil {
				continue
			}
			go n.handleConnection(conn)
		}
	}
}

// handleConnection performs handshake and manages peer messages
func (n *P2PNetwork) handleConnection(conn net.Conn) {
	peer, err := n.performHandshake(conn)
	if err != nil {
		conn.Close()
		return
	}

	n.mu.Lock()
	if len(n.peers) >= n.config.MaxPeers {
		n.mu.Unlock()
		conn.Close()
		return
	}
	n.peers[peer.ID] = peer
	n.mu.Unlock()

	go n.handlePeerMessages(peer)
}

// performHandshake exchanges node IDs
func (n *P2PNetwork) performHandshake(conn net.Conn) (*Peer, error) {
	peer := &Peer{
		ID:        generateNodeID(),
		Address:   conn.RemoteAddr().String(),
		NodeType:  FullNode,
		Connected: time.Now(),
		LastSeen:  time.Now(),
		conn:      conn,
	}
	return peer, nil
}

// handlePeerMessages reads messages from a peer
func (n *P2PNetwork) handlePeerMessages(peer *Peer) {
	defer n.removePeer(peer.ID)

	buffer := make([]byte, 1024*1024)

	for {
		select {
		case <-n.ctx.Done():
			return
		default:
			peer.conn.SetReadDeadline(time.Now().Add(time.Minute))
			nBytes, err := peer.conn.Read(buffer)
			if err != nil {
				return
			}
			peer.BytesRecv += uint64(nBytes)
			peer.LastSeen = time.Now()

			msg, err := parseMessage(buffer[:nBytes])
			if err != nil {
				continue
			}
			msg.From = peer.ID
			n.messagesCh <- msg
		}
	}
}

// processMessages dispatches incoming messages to handlers
func (n *P2PNetwork) processMessages() {
	for {
		select {
		case <-n.ctx.Done():
			return
		case msg := <-n.messagesCh:
			if handler, ok := n.handlers[msg.Type]; ok {
				handler(msg)
			}
		}
	}
}

// RegisterHandler registers a message handler
func (n *P2PNetwork) RegisterHandler(msgType MessageType, handler MessageHandler) {
	n.handlers[msgType] = handler
}

// BroadcastBlock sends block to all peers
func (n *P2PNetwork) BroadcastBlock(blockHash []byte) {
	n.broadcast(&Message{
		Type:    MsgBlockAnnounce,
		Payload: blockHash,
	})
}

// BroadcastTx sends transaction to all peers
func (n *P2PNetwork) BroadcastTx(txHash []byte) {
	n.broadcast(&Message{
		Type:    MsgTxAnnounce,
		Payload: txHash,
	})
}

// broadcast sends message to all peers
func (n *P2PNetwork) broadcast(msg *Message) {
	n.mu.RLock()
	defer n.mu.RUnlock()
	for _, peer := range n.peers {
		go n.sendToPeer(peer, msg)
	}
}

// sendToPeer sends message to a single peer
func (n *P2PNetwork) sendToPeer(peer *Peer, msg *Message) error {
	if peer.conn == nil {
		return errors.New("peer connection is nil")
	}
	data := append([]byte{byte(msg.Type)}, msg.Payload...)
	_, err := peer.conn.Write(data)
	if err == nil {
		peer.BytesSent += uint64(len(data))
	}
	return err
}

// connectBootstrapNodes connects to configured bootstrap nodes
func (n *P2PNetwork) connectBootstrapNodes() {
	for _, addr := range n.config.BootstrapNodes {
		go n.connectToPeer(addr)
	}
}

// connectToPeer dials and connects to a peer
func (n *P2PNetwork) connectToPeer(addr string) error {
	conn, err := net.DialTimeout("tcp", addr, 10*time.Second)
	if err != nil {
		return err
	}

	peer, err := n.performHandshake(conn)
	if err != nil {
		conn.Close()
		return err
	}

	n.mu.Lock()
	n.peers[peer.ID] = peer
	n.mu.Unlock()

	go n.handlePeerMessages(peer)
	return nil
}

// peerDiscoveryLoop periodically requests peer lists
func (n *P2PNetwork) peerDiscoveryLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-n.ctx.Done():
			return
		case <-ticker.C:
			n.discoverPeers()
		}
	}
}

// discoverPeers broadcasts discovery messages
func (n *P2PNetwork) discoverPeers() {
	n.mu.RLock()
	if len(n.peers) >= n.config.MaxPeers {
		n.mu.RUnlock()
		return
	}
	n.mu.RUnlock()

	n.broadcast(&Message{Type: MsgPeerDiscovery})
}

// removePeer removes a peer from map
func (n *P2PNetwork) removePeer(id string) {
	n.mu.Lock()
	defer n.mu.Unlock()
	if peer, ok := n.peers[id]; ok && peer.conn != nil {
		peer.conn.Close()
	}
	delete(n.peers, id)
}

// GetPeers returns all connected peers
func (n *P2PNetwork) GetPeers() []*Peer {
	n.mu.RLock()
	defer n.mu.RUnlock()
	list := make([]*Peer, 0, len(n.peers))
	for _, p := range n.peers {
		list = append(list, p)
	}
	return list
}

// GetPeerCount returns connected peer count
func (n *P2PNetwork) GetPeerCount() int {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return len(n.peers)
}

// generateNodeID returns a random 32-byte node ID
func generateNodeID() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// parseMessage deserializes raw data into Message
func parseMessage(data []byte) (*Message, error) {
	if len(data) < 1 {
		return nil, errors.New("empty message")
	}
	return &Message{
		Type:    MessageType(data[0]),
		Payload: data[1:],
	}, nil
}
