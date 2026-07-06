package nodeconfig

// LocalPorts assigns a distinct (P2P, RPC) pair per Role so every node binary
// can run on the same host without collisions. Keep in sync with
// public/docker/docker-compose.localhost.yml.
type Ports struct{ P2P, RPC int }

func LocalPorts(role Role) Ports {
	switch role {
	case RoleGenesis:
		return Ports{P2P: 30300, RPC: 8550}
	case RoleValidator:
		return Ports{P2P: 30301, RPC: 8551}
	case RoleRPC:
		return Ports{P2P: 30302, RPC: 8552}
	case RoleBoost:
		return Ports{P2P: 30303, RPC: 8553}
	case RoleDev:
		return Ports{P2P: 30304, RPC: 8554}
	case RoleLite:
		return Ports{P2P: 30305, RPC: 8555}
	case RoleLocal:
		return Ports{P2P: 30306, RPC: 8556}
	default: // RoleFull
		return Ports{P2P: 30303, RPC: 8545}
	}
}
