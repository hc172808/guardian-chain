package p2p

import (
	"encoding/json"
	"fmt"
	"net"
	"sync"
	"time"
)

type Peer struct {
	ID        string
	Addr      string
	ChainID   int64
	Height    uint64
	ConnectAt time.Time
}

type Server struct {
	port     int
	chainID  int64
	getHeight func() uint64
	peers    map[string]*Peer
	mu       sync.RWMutex
	listener net.Listener
}

func NewServer(port int, chainID int64, getHeight func() uint64) *Server {
	return &Server{
		port:      port,
		chainID:   chainID,
		getHeight: getHeight,
		peers:     make(map[string]*Peer),
	}
}

func (s *Server) Start() error {
	ln, err := net.Listen("tcp", fmt.Sprintf("0.0.0.0:%d", s.port))
	if err != nil {
		return err
	}
	s.listener = ln

	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go s.handleConn(conn)
		}
	}()

	return nil
}

func (s *Server) handleConn(conn net.Conn) {
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(30 * time.Second))

	// Simple handshake: send chain info
	handshake := map[string]interface{}{
		"chainId": s.chainID,
		"height":  s.getHeight(),
		"node":    "GYDSchain/validator-node/v1.0.0",
		"mode":    "validator",
	}
	data, _ := json.Marshal(handshake)
	conn.Write(append(data, '\n'))

	// Register as peer
	peerID := conn.RemoteAddr().String()
	s.mu.Lock()
	s.peers[peerID] = &Peer{
		ID:        peerID,
		Addr:      peerID,
		ChainID:   s.chainID,
		Height:    s.getHeight(),
		ConnectAt: time.Now(),
	}
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.peers, peerID)
		s.mu.Unlock()
	}()

	// Keep connection alive briefly
	time.Sleep(5 * time.Second)
}

func (s *Server) PeerCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.peers)
}

func (s *Server) Peers() []*Peer {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]*Peer, 0, len(s.peers))
	for _, p := range s.peers {
		result = append(result, p)
	}
	return result
}

func (s *Server) Stop() {
	if s.listener != nil {
		s.listener.Close()
	}
}
