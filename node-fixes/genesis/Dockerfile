FROM golang:1.22-alpine AS builder
WORKDIR /build

RUN apk add --no-cache git gcc musl-dev

# ── Copy genesis-specific source files first ─────────────────────────────────
COPY go.mod go.sum* ./
COPY main.go ./
COPY config/ config/

# ── Copy shared packages from the fullnode repo ───────────────────────────────
# These packages are identical to fullnode except for module import paths.
# The setup.sh script populates core/, consensus/, p2p/, rpc/ from fullnode.
COPY core/ core/
COPY consensus/ consensus/
COPY p2p/ p2p/
COPY rpc/ rpc/

# Download deps and build
RUN go mod download
RUN go build -ldflags="-s -w -X main.version=1.0.0" -o gyds-genesis .

# ── Runtime image ─────────────────────────────────────────────────────────────
FROM alpine:3.20
RUN apk add --no-cache ca-certificates curl

COPY --from=builder /build/gyds-genesis /usr/local/bin/gyds-genesis

ENV GYDS_CHAIN_ID=198282 \
    GYDS_NODE_MODE=genesis \
    GYDS_RPC_PORT=8544 \
    GYDS_RPC_HOST=0.0.0.0 \
    GYDS_P2P_PORT=30300 \
    GYDS_DATA_DIR=/var/lib/gyds-genesis \
    GYDS_LOG_LEVEL=info \
    GYDS_LOG_FORMAT=json \
    GYDS_ARCHIVE_MODE=true \
    GYDS_BLOCK_TIME=5

EXPOSE 8544 8545 30300

VOLUME ["/var/lib/gyds-genesis"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -sf http://localhost:8544/health | grep -q "ok" || exit 1

CMD ["gyds-genesis", "start"]
