package p2p

import (
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestIdentityPersistsAcrossLoads(t *testing.T) {
	keyPath := filepath.Join(t.TempDir(), "node.key")
	first, err := LoadOrCreateIdentity(keyPath)
	if err != nil {
		t.Fatal(err)
	}
	second, err := LoadOrCreateIdentity(keyPath)
	if err != nil {
		t.Fatal(err)
	}
	if first.NodeID() != second.NodeID() {
		t.Fatalf("node ID changed across loads: %q != %q", first.NodeID(), second.NodeID())
	}
	info, err := os.Stat(keyPath)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm()&0o077 != 0 {
		t.Fatalf("node key permissions are too broad: %o", info.Mode().Perm())
	}
}

func TestEnodeURLAndPeerAddressParsing(t *testing.T) {
	identity, err := LoadOrCreateIdentity(filepath.Join(t.TempDir(), "node.key"))
	if err != nil {
		t.Fatal(err)
	}
	uri, err := identity.EnodeURL("node.example.test", 30300)
	if err != nil {
		t.Fatal(err)
	}
	address, err := ParsePeerAddress(uri)
	if err != nil {
		t.Fatal(err)
	}
	if address != "node.example.test:30300" {
		t.Fatalf("unexpected TCP address %q", address)
	}
	if _, err := ParsePeerAddress("127.0.0.1:70000"); err == nil {
		t.Fatal("expected out-of-range port to be rejected")
	}
}

func TestHandshakeAuthenticatesPeerAndChain(t *testing.T) {
	serverIdentity, err := LoadOrCreateIdentity(filepath.Join(t.TempDir(), "server.key"))
	if err != nil {
		t.Fatal(err)
	}
	clientIdentity, err := LoadOrCreateIdentity(filepath.Join(t.TempDir(), "client.key"))
	if err != nil {
		t.Fatal(err)
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()

	serverResult := make(chan error, 1)
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			serverResult <- err
			return
		}
		defer conn.Close()
		remote, err := serverIdentity.ExchangeHello(conn, 198282, 4, "genesis")
		if err == nil && remote.NodeID != clientIdentity.NodeID() {
			serverResult <- errUnexpectedPeer
			return
		}
		serverResult <- err
	}()

	conn, err := net.Dial("tcp", listener.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	remote, clientErr := clientIdentity.ExchangeHello(conn, 198282, 5, "fullnode")
	_ = conn.Close()
	if clientErr != nil {
		t.Fatal(clientErr)
	}
	if remote.NodeID != serverIdentity.NodeID() {
		t.Fatalf("authenticated peer %q, want %q", remote.NodeID, serverIdentity.NodeID())
	}
	if err := <-serverResult; err != nil {
		t.Fatal(err)
	}
}

func TestListenerBindsTCPAndAdvertisesConfiguredHost(t *testing.T) {
	reservation, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := reservation.Addr().(*net.TCPAddr).Port
	if err := reservation.Close(); err != nil {
		t.Fatal(err)
	}

	server := NewListener(port, 198282, "lite", t.TempDir(), "node.example.test", func() uint64 {
		return 12
	})
	if err := server.Start(); err != nil {
		t.Fatal(err)
	}
	defer server.Stop()

	if got, want := server.EnodeURL(), "@node.example.test:"+strconv.Itoa(port); !strings.Contains(got, want) {
		t.Fatalf("enode %q does not advertise configured host %q", got, want)
	}

	conn, err := net.DialTimeout("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)), time.Second)
	if err != nil {
		t.Fatalf("P2P TCP listener is not reachable locally: %v", err)
	}
	_ = conn.Close()
}

var errUnexpectedPeer = &unexpectedPeerError{}

type unexpectedPeerError struct{}

func (*unexpectedPeerError) Error() string { return "server authenticated the wrong peer" }
