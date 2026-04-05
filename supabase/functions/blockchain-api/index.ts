import { corsHeaders } from '@supabase/supabase-js/cors'

const RPC_ENDPOINT = Deno.env.get('GYDS_RPC_ENDPOINT') || 'http://rpc.netlifegy.com:8545'
const INDEXER_DB = Deno.env.get('GYDS_INDEXER_DB_URL')

// JSON-RPC helper
async function rpcCall(method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(RPC_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error))
  return json.result
}

// PostgreSQL query helper (uses indexer DB)
async function dbQuery(query: string, params: unknown[] = []): Promise<unknown[]> {
  if (!INDEXER_DB) throw new Error('GYDS_INDEXER_DB_URL not configured')

  // Use dynamic import for postgres
  const { default: postgres } = await import('https://deno.land/x/postgresjs@v3.4.4/mod.js')
  const sql = postgres(INDEXER_DB, { max: 1 })
  try {
    const result = await sql.unsafe(query, params)
    return result
  } finally {
    await sql.end()
  }
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/blockchain-api\/?/, '/')

  try {
    // ── Wallet Endpoints ──
    if (path === '/wallet/create' && req.method === 'POST') {
      // Create wallet via RPC
      const result = await rpcCall('personal_newAccount', [''])
      return jsonResponse({ address: result })
    }

    if (path.startsWith('/wallet/') && req.method === 'GET') {
      const address = path.split('/wallet/')[1]
      if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return errorResponse('Invalid address format. Use 0x + 40 hex chars.')
      }
      const balance = await rpcCall('eth_getBalance', [address, 'latest'])
      const txCount = await rpcCall('eth_getTransactionCount', [address, 'latest'])
      return jsonResponse({
        address,
        balance,
        transactionCount: txCount,
      })
    }

    // ── Transaction Endpoints ──
    if (path === '/tx/send' && req.method === 'POST') {
      const body = await req.json()
      const { from, to, value, privateKey } = body
      if (!from || !to || !value) {
        return errorResponse('Missing required fields: from, to, value')
      }
      // Sign and send via RPC
      const txHash = await rpcCall('eth_sendTransaction', [{
        from,
        to,
        value,
        gas: '0x5208', // 21000
      }])
      return jsonResponse({ txHash })
    }

    if (path.startsWith('/tx/') && req.method === 'GET') {
      const hash = path.split('/tx/')[1]
      if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
        return errorResponse('Invalid transaction hash')
      }
      const [tx, receipt] = await Promise.all([
        rpcCall('eth_getTransactionByHash', [hash]),
        rpcCall('eth_getTransactionReceipt', [hash]),
      ])
      return jsonResponse({ transaction: tx, receipt })
    }

    // ── Block Endpoints ──
    if (path === '/blocks' && req.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '20')

      // Try indexer DB first, fallback to RPC
      try {
        if (INDEXER_DB) {
          const blocks = await dbQuery(
            'SELECT * FROM blocks ORDER BY height DESC LIMIT $1',
            [Math.min(limit, 100)]
          )
          return jsonResponse({ blocks, count: (blocks as unknown[]).length, source: 'indexer' })
        }
      } catch {
        // Fall through to RPC
      }

      // RPC fallback — get latest block number, then fetch blocks
      const latestHex = await rpcCall('eth_blockNumber') as string
      const latest = parseInt(latestHex, 16)
      const blocks = []
      for (let i = latest; i > Math.max(0, latest - limit); i--) {
        const block = await rpcCall('eth_getBlockByNumber', [`0x${i.toString(16)}`, false])
        if (block) blocks.push(block)
      }
      return jsonResponse({ blocks, count: blocks.length, source: 'rpc' })
    }

    if (path.startsWith('/block/') && req.method === 'GET') {
      const id = path.split('/block/')[1]
      let block
      if (id.startsWith('0x') && id.length === 66) {
        block = await rpcCall('eth_getBlockByHash', [id, true])
      } else {
        const num = parseInt(id)
        block = await rpcCall('eth_getBlockByNumber', [`0x${num.toString(16)}`, true])
      }
      if (!block) return errorResponse('Block not found', 404)
      return jsonResponse({ block })
    }

    // ── Transactions from Indexer ──
    if (path === '/transactions' && req.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '20')
      try {
        if (INDEXER_DB) {
          const txs = await dbQuery(
            'SELECT * FROM transactions ORDER BY block_height DESC, timestamp DESC LIMIT $1',
            [Math.min(limit, 100)]
          )
          return jsonResponse({ transactions: txs, count: (txs as unknown[]).length, source: 'indexer' })
        }
      } catch {
        // If no indexer DB, return empty
      }
      return jsonResponse({ transactions: [], count: 0, source: 'none' })
    }

    // ── Network Stats ──
    if (path === '/network/stats' && req.method === 'GET') {
      const [blockNum, gasPrice, peerCount, chainId] = await Promise.all([
        rpcCall('eth_blockNumber'),
        rpcCall('eth_gasPrice'),
        rpcCall('net_peerCount').catch(() => '0x0'),
        rpcCall('eth_chainId'),
      ])
      return jsonResponse({
        blockHeight: parseInt(blockNum as string, 16),
        gasPrice: blockNum,
        peerCount: parseInt(peerCount as string, 16),
        chainId: parseInt(chainId as string, 16),
      })
    }

    // ── Health ──
    if (path === '/health' && req.method === 'GET') {
      let rpcOk = false
      let dbOk = false
      try {
        await rpcCall('eth_chainId')
        rpcOk = true
      } catch {}
      try {
        if (INDEXER_DB) {
          await dbQuery('SELECT 1')
          dbOk = true
        }
      } catch {}
      return jsonResponse({ rpc: rpcOk ? 'ok' : 'down', indexerDb: dbOk ? 'ok' : 'down' })
    }

    return errorResponse('Not found', 404)
  } catch (err) {
    console.error('blockchain-api error:', err)
    return errorResponse(err.message || 'Internal error', 500)
  }
})
