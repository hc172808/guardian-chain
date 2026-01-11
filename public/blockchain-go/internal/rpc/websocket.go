// Package rpc implements WebSocket subscriptions for real-time updates
package rpc

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"golang.org/x/net/websocket"
)

// WebSocketClient represents a connected WebSocket client
type WebSocketClient struct {
	ID            string
	Conn          *websocket.Conn
	Subscriptions map[string]bool
	Send          chan []byte
	Close         chan struct{}
}

// WebSocketHub manages all WebSocket connections
type WebSocketHub struct {
	clients    map[string]*WebSocketClient
	register   chan *WebSocketClient
	unregister chan *WebSocketClient
	broadcast  chan *WebSocketMessage
	mu         sync.RWMutex
}

// WebSocketMessage represents a message to broadcast
type WebSocketMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

// SubscriptionRequest represents a subscription request
type SubscriptionRequest struct {
	JSONRPC string   `json:"jsonrpc"`
	Method  string   `json:"method"`
	Params  []string `json:"params"`
	ID      int64    `json:"id"`
}

// NewWebSocketHub creates a new WebSocket hub
func NewWebSocketHub() *WebSocketHub {
	return &WebSocketHub{
		clients:    make(map[string]*WebSocketClient),
		register:   make(chan *WebSocketClient),
		unregister: make(chan *WebSocketClient),
		broadcast:  make(chan *WebSocketMessage, 256),
	}
}

// Run starts the WebSocket hub
func (h *WebSocketHub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client.ID] = client
			h.mu.Unlock()

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client.ID]; ok {
				delete(h.clients, client.ID)
				close(client.Send)
			}
			h.mu.Unlock()

		case message := <-h.broadcast:
			h.mu.RLock()
			for _, client := range h.clients {
				if client.Subscriptions[message.Type] || client.Subscriptions["*"] {
					select {
					case client.Send <- mustMarshal(message):
					default:
						// Client buffer full, skip
					}
				}
			}
			h.mu.RUnlock()
		}
	}
}

// BroadcastNewBlock broadcasts a new block to all subscribed clients
func (h *WebSocketHub) BroadcastNewBlock(block interface{}) {
	h.broadcast <- &WebSocketMessage{
		Type: "newBlock",
		Data: block,
	}
}

// BroadcastNewTransaction broadcasts a new confirmed transaction
func (h *WebSocketHub) BroadcastNewTransaction(tx interface{}) {
	h.broadcast <- &WebSocketMessage{
		Type: "newTransaction",
		Data: tx,
	}
}

// BroadcastPendingTransaction broadcasts a pending transaction
func (h *WebSocketHub) BroadcastPendingTransaction(tx interface{}) {
	h.broadcast <- &WebSocketMessage{
		Type: "pendingTransaction",
		Data: tx,
	}
}

// BroadcastStatus broadcasts node status update
func (h *WebSocketHub) BroadcastStatus(status interface{}) {
	h.broadcast <- &WebSocketMessage{
		Type: "status",
		Data: status,
	}
}

// handleWebSocket handles WebSocket connections
func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	wsServer := websocket.Server{
		Handler: func(ws *websocket.Conn) {
			s.handleWSConnection(ws)
		},
		Handshake: func(config *websocket.Config, r *http.Request) error {
			// Allow all origins for now
			return nil
		},
	}
	wsServer.ServeHTTP(w, r)
}

// handleWSConnection handles an individual WebSocket connection
func (s *Server) handleWSConnection(ws *websocket.Conn) {
	client := &WebSocketClient{
		ID:            generateClientID(),
		Conn:          ws,
		Subscriptions: make(map[string]bool),
		Send:          make(chan []byte, 256),
		Close:         make(chan struct{}),
	}

	// Register the client
	if s.wsHub != nil {
		s.wsHub.register <- client
	}

	// Start goroutines for reading and writing
	go client.writePump()
	client.readPump(s)

	// Clean up on disconnect
	if s.wsHub != nil {
		s.wsHub.unregister <- client
	}
}

// readPump reads messages from the WebSocket connection
func (c *WebSocketClient) readPump(s *Server) {
	defer func() {
		c.Conn.Close()
	}()

	for {
		var message []byte
		err := websocket.Message.Receive(c.Conn, &message)
		if err != nil {
			break
		}

		var req SubscriptionRequest
		if err := json.Unmarshal(message, &req); err != nil {
			continue
		}

		switch req.Method {
		case "subscribe":
			for _, event := range req.Params {
				c.Subscriptions[event] = true
			}
			c.sendResponse(req.ID, map[string]bool{"subscribed": true})

		case "unsubscribe":
			for _, event := range req.Params {
				delete(c.Subscriptions, event)
			}
			c.sendResponse(req.ID, map[string]bool{"unsubscribed": true})

		case "ping":
			c.sendResponse(req.ID, map[string]string{"pong": time.Now().Format(time.RFC3339)})
		}
	}
}

// writePump sends messages to the WebSocket connection
func (c *WebSocketClient) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			if !ok {
				return
			}
			if err := websocket.Message.Send(c.Conn, string(message)); err != nil {
				return
			}

		case <-ticker.C:
			// Send ping to keep connection alive
			ping := mustMarshal(&WebSocketMessage{
				Type: "ping",
				Data: time.Now().Unix(),
			})
			if err := websocket.Message.Send(c.Conn, string(ping)); err != nil {
				return
			}

		case <-c.Close:
			return
		}
	}
}

// sendResponse sends a JSON-RPC response
func (c *WebSocketClient) sendResponse(id int64, result interface{}) {
	response := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      id,
		"result":  result,
	}
	data, _ := json.Marshal(response)
	select {
	case c.Send <- data:
	default:
	}
}

// Helper functions
func mustMarshal(v interface{}) []byte {
	data, _ := json.Marshal(v)
	return data
}

func generateClientID() string {
	return time.Now().Format("20060102150405.000000")
}
