FROM golang:1.22-alpine AS builder
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /gyds-validatornode .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /gyds-validatornode /usr/local/bin/gyds-validatornode
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8543 30302
ENV GYDS_DATA_DIR=/data \
    GYDS_RPC_PORT=8543 \
    GYDS_P2P_PORT=30302 \
    GYDS_BLOCK_TIME=120 \
    GYDS_LOG_FORMAT=json \
    GYDS_LOG_LEVEL=info
ENTRYPOINT ["gyds-validatornode", "start"]
