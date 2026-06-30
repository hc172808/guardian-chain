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
	port      int
	chainID   int64
	getHeight func() uint64
	peers     map[string]*Peer
	mu        sync.RWMutex
	listener  net.Listener
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

func (s *Server) ConnectTo(addr string) error {
	conn, err := net.DialTimeout("tcp", addr, 5*time.Second)
	if err != nil {
		return err
	}
	go s.handleConn(conn)
	return nil
}

func (s *Server) PeerCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.peers)
}

func (s *Server) handleConn(conn net.Conn) {
	defer conn.Close()
	hello := map[string]interface{}{
		"type":    "hello",
		"chainId": s.chainID,
		"height":  s.getHeight(),
		"version": "1.0.0",
		"role":    "genesis-bootstrap",
	}
	enc := json.NewEncoder(conn)
	if err := enc.Encode(hello); err != nil {
		return
	}
	peerID := conn.RemoteAddr().String()
	s.mu.Lock()
	s.peers[peerID] = &Peer{
		ID: peerID, Addr: conn.RemoteAddr().String(),
		ChainID: s.chainID, ConnectAt: time.Now(),
	}
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		delete(s.peers, peerID)
		s.mu.Unlock()
	}()
	dec := json.NewDecoder(conn)
	for {
		var msg map[string]interface{}
		if err := dec.Decode(&msg); err != nil {
			return
		}
	}
}
