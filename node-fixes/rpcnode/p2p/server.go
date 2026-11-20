package p2p

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"sync"
	"time"

	gysp2p "github.com/gydschain/node-common/p2p"
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
	identity  *gysp2p.Identity
	enode     string
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
	dataDir := os.Getenv("GYDS_DATA_DIR")
	if dataDir == "" {
		dataDir = "./data"
	}
	identity, err := gysp2p.LoadOrCreateIdentity(filepath.Join(dataDir, "node.key"))
	if err != nil {
		return err
	}
	host := os.Getenv("GYDS_P2P_ADVERTISE_HOST")
	if host == "" {
		host = "127.0.0.1"
	}
	s.enode, err = identity.EnodeURL(host, s.port)
	if err != nil {
		return err
	}
	s.identity = identity
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
	endpoint, err := gysp2p.ParsePeerAddress(addr)
	if err != nil {
		return err
	}
	conn, err := net.DialTimeout("tcp", endpoint, 5*time.Second)
	if err != nil {
		return err
	}
	go s.handleConn(conn)
	return nil
}

func (s *Server) EnodeURL() string { return s.enode }

func (s *Server) PeerCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.peers)
}

func (s *Server) handleConn(conn net.Conn) {
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(10 * time.Second))
	remote, err := s.identity.ExchangeHello(conn, uint64(s.chainID), s.getHeight(), "rpcnode")
	if err != nil {
		return
	}
	_ = conn.SetDeadline(time.Time{})
	peerID := remote.NodeID
	s.mu.Lock()
	s.peers[peerID] = &Peer{
		ID:        peerID,
		Addr:      conn.RemoteAddr().String(),
		ChainID:   s.chainID,
		Height:    remote.Height,
		ConnectAt: time.Now(),
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
