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

// NodeType defines node type
type NodeType int

const (
	FullNode NodeType = iota
	LiteNode
)

// Config holds P2P settings
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

// MessageType defines P2P message types
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

// MessageHandler is a callback for messages
type MessageHandler func(*Message) error

// P2PNetwork manages P2P connections
type P2PNetwork struct {
	config     Config
	nodeID     string
	peers      map[string]*Peer
	messagesCh chan *Message
	handlers   map[MessageType]MessageHandler
	listener   net.Listener
	mu         sync.RWMutex
	ctx        context.Context
	cancel     context.CancelFunc
}

// NewP2PNetwork creates a P2P network instance
func NewP2PNetwork(cfg Config) *P2PNetwork {
	ctx, cancel := context.WithCancel(context.Background())
	return &P2PNetwork{
		config:     cfg,
		nodeID:     generateNodeID(),
		peers:      make(map[string]*Peer),
		messagesCh: make(chan *Message, 1000),
		handlers:   make(map[MessageType]MessageHandler),
		ctx:        ctx,
		cancel:     cancel,
	}
}

// Start runs the P2P network
func (n *P2PNetwork) Start() error {
	addr := fmt.Sprintf("0.0.0.0:%d", n.config.Port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	n.listener = listener

	go n.acceptConnections()
	go n.processMessages()
	go n.connectBootstrap()
	go n.peerDiscoveryLoop()

	return nil
}

// Stop gracefully stops the P2P network
func (n *P2PNetwork) Stop() {
	n.cancel()
	if n.listener != nil {
		n.listener.Close()
	}

	n.mu.Lock()
	for _, p := range n.peers {
		p.conn.Close()
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

// handleConnection performs handshake and starts peer listener
func (n *P2PNetwork) handleConnection(conn net.Conn) {
	peer, err := n.handshake(conn)
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

	go n.listenPeer(peer)
}

// handshake exchanges IDs
func (n *P2PNetwork) handshake(conn net.Conn) (*Peer, error) {
	peer := &Peer{
		ID:        generateNodeID(),
		Address:   conn.RemoteAddr().String(),
		Connected: time.Now(),
		LastSeen:  time.Now(),
		conn:      conn,
	}
	return peer, nil
}

// listenPeer reads messages from a peer
func (n *P2PNetwork) listenPeer(p *Peer) {
	defer n.removePeer(p.ID)

	buffer := make([]byte, 1024*1024)
	for {
		select {
		case <-n.ctx.Done():
			return
		default:
			p.conn.SetReadDeadline(time.Now().Add(time.Minute))
			nBytes, err := p.conn.Read(buffer)
			if err != nil {
				return
			}
			p.BytesRecv += uint64(nBytes)
			p.LastSeen = time.Now()

			msg, err := parseMessage(buffer[:nBytes])
			if err != nil {
				continue
			}
			msg.From = p.ID
			n.messagesCh <- msg
		}
	}
}

// processMessages dispatches messages to handlers
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

// RegisterHandler registers a message callback
func (n *P2PNetwork) RegisterHandler(msgType MessageType, handler MessageHandler) {
	n.handlers[msgType] = handler
}

// BroadcastBlock announces a new block
func (n *P2PNetwork) BroadcastBlock(hash []byte) {
	msg := &Message{
		Type:    MsgBlockAnnounce,
		Payload: hash,
	}
	n.broadcast(msg)
}

// BroadcastTx announces a new transaction
func (n *P2PNetwork) BroadcastTx(hash []byte) {
	msg := &Message{
		Type:    MsgTxAnnounce,
		Payload: hash,
	}
	n.broadcast(msg)
}

// broadcast sends a message to all peers
func (n *P2PNetwork) broadcast(msg *Message) {
	n.mu.RLock()
	defer n.mu.RUnlock()
	for _, p := range n.peers {
		go n.sendPeer(p, msg)
	}
}

// sendPeer sends a message to a specific peer
func (n *P2PNetwork) sendPeer(p *Peer, msg *Message) {
	if p.conn != nil {
		data := append([]byte{byte(msg.Type)}, msg.Payload...)
		p.conn.Write(data)
		p.BytesSent += uint64(len(data))
	}
}

// connectBootstrap connects to bootstrap nodes
func (n *P2PNetwork) connectBootstrap() {
	for _, addr := range n.config.BootstrapNodes {
		go n.connectPeer(addr)
	}
}

// connectPeer initiates a TCP connection
func (n *P2PNetwork) connectPeer(addr string) error {
	conn, err := net.DialTimeout("tcp", addr, 10*time.Second)
	if err != nil {
		return err
	}
	peer, err := n.handshake(conn)
	if err != nil {
		conn.Close()
		return err
	}
	n.mu.Lock()
	n.peers[peer.ID] = peer
	n.mu.Unlock()
	go n.listenPeer(peer)
	return nil
}

// peerDiscoveryLoop periodically requests peers
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

// discoverPeers requests peers from network
func (n *P2PNetwork) discoverPeers() {
	n.mu.RLock()
	if len(n.peers) >= n.config.MaxPeers {
		n.mu.RUnlock()
		return
	}
	n.mu.RUnlock()
	n.broadcast(&Message{Type: MsgPeerDiscovery})
}

// removePeer removes a peer
func (n *P2PNetwork) removePeer(id string) {
	n.mu.Lock()
	defer n.mu.Unlock()
	if p, ok := n.peers[id]; ok && p.conn != nil {
		p.conn.Close()
	}
	delete(n.peers, id)
}

// GetPeers returns all connected peers
func (n *P2PNetwork) GetPeers() []*Peer {
	n.mu.RLock()
	defer n.mu.RUnlock()
	result := []*Peer{}
	for _, p := range n.peers {
		result = append(result, p)
	}
	return result
}

// GetPeerCount returns the peer count
func (n *P2PNetwork) GetPeerCount() int {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return len(n.peers)
}

// ================= Helper Functions =================

func generateNodeID() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func parseMessage(data []byte) (*Message, error) {
	if len(data) < 1 {
		return nil, errors.New("empty message")
	}
	return &Message{
		Type:    MessageType(data[0]),
		Payload: data[1:],
	}, nil
}
