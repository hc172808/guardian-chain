package main

import (
        "encoding/json"
        "fmt"
        "html/template"
        "net"
        "net/http"
        "os"
        "os/exec"
        "path/filepath"
        "runtime"
        "strings"
        "time"
)

const setupHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GYDS Lite Node Setup</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0e1a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{background:#111827;border:1px solid #1f2937;border-radius:16px;width:100%;max-width:640px;overflow:hidden;box-shadow:0 25px 50px rgba(0,0,0,.5)}
.header{background:linear-gradient(135deg,#0d9488 0%,#0891b2 100%);padding:28px 32px}
.header h1{font-size:22px;font-weight:700;color:#fff;margin-bottom:4px}
.header p{font-size:13px;color:rgba(255,255,255,.75)}
.badge{display:inline-block;background:rgba(255,255,255,.2);color:#fff;font-size:11px;font-weight:600;padding:2px 10px;border-radius:20px;margin-top:8px}
.progress{background:#1f2937;padding:16px 32px;display:flex;gap:0;align-items:center}
.step-dot{width:28px;height:28px;border-radius:50%;background:#1f2937;border:2px solid #374151;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#6b7280;flex-shrink:0;transition:all .3s}
.step-dot.active{background:#0d9488;border-color:#0d9488;color:#fff}
.step-dot.done{background:#059669;border-color:#059669;color:#fff}
.step-line{flex:1;height:2px;background:#374151;margin:0 4px}
.step-line.done{background:#059669}
.body{padding:28px 32px}
.step{display:none}.step.active{display:block}
.step-title{font-size:17px;font-weight:700;margin-bottom:4px;color:#f9fafb}
.step-desc{font-size:13px;color:#9ca3af;margin-bottom:20px;line-height:1.5}
.field{margin-bottom:16px}
.field label{display:block;font-size:12px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}
.field .hint{font-size:11px;color:#6b7280;margin-top:4px;line-height:1.4}
.field input,.field select,.field textarea{width:100%;padding:10px 14px;background:#0f172a;border:1px solid #1f2937;border-radius:8px;color:#e2e8f0;font-size:14px;outline:none;transition:border-color .2s}
.field input:focus,.field select:focus,.field textarea:focus{border-color:#0d9488}
.field textarea{resize:vertical;min-height:80px;font-family:monospace;font-size:12px}
.field select option{background:#0f172a}
.toggle-row{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#0f172a;border:1px solid #1f2937;border-radius:8px}
.toggle-row span{font-size:13px;color:#d1d5db}
.toggle{position:relative;display:inline-block;width:44px;height:24px}
.toggle input{opacity:0;width:0;height:0}
.slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#374151;border-radius:24px;transition:.3s}
.slider:before{position:absolute;content:"";height:18px;width:18px;left:3px;bottom:3px;background:#9ca3af;border-radius:50%;transition:.3s}
input:checked+.slider{background:#0d9488}
input:checked+.slider:before{transform:translateX(20px);background:#fff}
.info-box{background:#0f2a2a;border:1px solid #0d9488;border-radius:8px;padding:14px;margin-bottom:16px}
.info-box p{font-size:12px;color:#5eead4;line-height:1.5}
.info-box strong{color:#2dd4bf}
.footer{display:flex;justify-content:space-between;align-items:center;margin-top:24px;gap:12px}
.btn{padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;border:none;transition:all .2s}
.btn-primary{background:#0d9488;color:#fff}.btn-primary:hover{background:#0f766e}
.btn-secondary{background:#1f2937;color:#9ca3af;border:1px solid #374151}.btn-secondary:hover{background:#374151;color:#e2e8f0}
.btn:disabled{opacity:.5;cursor:not-allowed}
.review-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.review-item{background:#0f172a;border:1px solid #1f2937;border-radius:8px;padding:12px}
.review-item .key{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
.review-item .val{font-size:13px;color:#e2e8f0;word-break:break-all}
.env-box{background:#0f172a;border:1px solid #1f2937;border-radius:8px;padding:16px;margin-top:16px}
.env-box pre{font-family:monospace;font-size:12px;color:#86efac;line-height:1.8;white-space:pre-wrap;word-break:break-all}
.success-icon{text-align:center;padding:16px 0;font-size:48px}
.cmd-box{background:#0f172a;border:1px solid #374151;border-radius:8px;padding:12px 16px;margin-top:10px;font-family:monospace;font-size:12px;color:#7dd3fc;cursor:pointer;position:relative}
.cmd-box:hover{border-color:#0d9488}
.copy-hint{position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:10px;color:#4b5563}
.tag{display:inline-block;background:#0d9488;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;margin-left:6px;vertical-align:middle}
.tag.optional{background:#374151;color:#9ca3af}
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <h1>⚡ GYDS Lite Node Setup</h1>
    <p>Header-only sync node for the GYDS Chain — no block production, minimal resources</p>
    <span class="badge">Chain ID: 13370 · netlifegy.com</span>
  </div>
  <div class="progress" id="progress">
    <div class="step-dot active" id="dot-1">1</div>
    <div class="step-line" id="line-1"></div>
    <div class="step-dot" id="dot-2">2</div>
    <div class="step-line" id="line-2"></div>
    <div class="step-dot" id="dot-3">3</div>
    <div class="step-line" id="line-3"></div>
    <div class="step-dot" id="dot-4">4</div>
    <div class="step-line" id="line-4"></div>
    <div class="step-dot" id="dot-5">5</div>
  </div>
  <div class="body">

    <!-- Step 1: Welcome -->
    <div class="step active" id="step-1">
      <div class="step-title">Welcome to GYDS Lite Node</div>
      <div class="step-desc">This wizard will configure your lite node in minutes. A lite node only syncs block headers — it uses very little disk space and CPU.</div>
      <div class="info-box">
        <p>✅ <strong>What a Lite Node does:</strong> Syncs block headers from full nodes, enables SPV (Simple Payment Verification), and verifies the validator chain — without storing full block data.</p>
        <br><p>🚫 <strong>Does NOT:</strong> Produce blocks, mine, stake, or store transactions. It has minimal hardware requirements.</p>
      </div>
      <div class="review-grid">
        <div class="review-item"><div class="key">Node Type</div><div class="val">Lite (Header Sync)</div></div>
        <div class="review-item"><div class="key">Chain ID</div><div class="val">13370</div></div>
        <div class="review-item"><div class="key">Block Time</div><div class="val">5 seconds</div></div>
        <div class="review-item"><div class="key">Disk Usage</div><div class="val">~50 MB (headers only)</div></div>
        <div class="review-item"><div class="key">CPU Usage</div><div class="val">Very low (~1–2%)</div></div>
        <div class="review-item"><div class="key">RAM Usage</div><div class="val">~64 MB minimum</div></div>
      </div>
      <div class="footer"><span></span><button class="btn btn-primary" onclick="go(2)">Start Setup →</button></div>
    </div>

    <!-- Step 2: Network -->
    <div class="step" id="step-2">
      <div class="step-title">Network Settings</div>
      <div class="step-desc">Configure which full nodes to sync from, and which ports this node will use locally.</div>
      <div class="field">
        <label>RPC Endpoints to sync from <span class="tag">Required</span></label>
        <textarea id="rpc_endpoints" placeholder="http://rpc.netlifegy.com:8545&#10;http://fullnode2.netlifegy.com:8545">http://rpc.netlifegy.com:8545</textarea>
        <div class="hint">One URL per line. These are the full nodes your lite node will pull headers from.</div>
      </div>
      <div class="field">
        <label>Local RPC Port <span class="tag optional">Optional</span></label>
        <input type="number" id="rpc_port" value="8555" min="1024" max="65535">
        <div class="hint">The HTTP port this node listens on locally for status and SPV queries. Default: 8555</div>
      </div>
      <div class="field">
        <label>P2P Port <span class="tag optional">Optional</span></label>
        <input type="number" id="p2p_port" value="30305" min="1024" max="65535">
        <div class="hint">Peer-to-peer port. Set to 0 to disable P2P. Default: 30305</div>
      </div>
      <div class="footer">
        <button class="btn btn-secondary" onclick="go(1)">← Back</button>
        <button class="btn btn-primary" onclick="go(3)">Next →</button>
      </div>
    </div>

    <!-- Step 3: Sync Settings -->
    <div class="step" id="step-3">
      <div class="step-title">Sync Settings</div>
      <div class="step-desc">Control how often headers are synced and whether to enable Simple Payment Verification.</div>
      <div class="field">
        <label>Sync Interval</label>
        <select id="sync_interval">
          <option value="5s" selected>5 seconds (recommended)</option>
          <option value="10s">10 seconds</option>
          <option value="30s">30 seconds (low-bandwidth)</option>
          <option value="60s">60 seconds (minimal)</option>
        </select>
        <div class="hint">How often to poll full nodes for new headers. 5s matches the chain block time.</div>
      </div>
      <div class="field">
        <label>Enable SPV (Simple Payment Verification)</label>
        <div class="toggle-row">
          <span>Allow SPV proof verification for transactions</span>
          <label class="toggle"><input type="checkbox" id="spv_enabled" checked><span class="slider"></span></label>
        </div>
        <div class="hint">Lets wallets and apps verify transaction inclusion without downloading full blocks.</div>
      </div>
      <div class="field">
        <label>Known Validator Addresses <span class="tag optional">Optional</span></label>
        <textarea id="validators" placeholder="0xabc123...&#10;0xdef456..."></textarea>
        <div class="hint">Comma or newline separated. Leave blank to accept any validator in the chain. Known validators improve security.</div>
      </div>
      <div class="footer">
        <button class="btn btn-secondary" onclick="go(2)">← Back</button>
        <button class="btn btn-primary" onclick="go(4)">Next →</button>
      </div>
    </div>

    <!-- Step 4: Storage & Logging -->
    <div class="step" id="step-4">
      <div class="step-title">Storage &amp; Logging</div>
      <div class="step-desc">Choose where your lite node stores headers and how verbose the logs should be.</div>
      <div class="field">
        <label>Data Directory</label>
        <input type="text" id="data_dir" value="" placeholder="~/.gyds-litenode">
        <div class="hint">Where headers and state are stored. Default: ~/.gyds-litenode</div>
      </div>
      <div class="field">
        <label>Log Level</label>
        <select id="log_level">
          <option value="info" selected>info (recommended)</option>
          <option value="debug">debug (verbose)</option>
          <option value="warn">warn (quiet)</option>
          <option value="error">error (errors only)</option>
        </select>
      </div>
      <div class="footer">
        <button class="btn btn-secondary" onclick="go(3)">← Back</button>
        <button class="btn btn-primary" onclick="go(5)">Review →</button>
      </div>
    </div>

    <!-- Step 5: Review & Save -->
    <div class="step" id="step-5">
      <div class="step-title">Review &amp; Save Configuration</div>
      <div class="step-desc">Check your settings below. Click "Save &amp; Apply" to write the config file.</div>
      <div id="review-content"></div>
      <div class="env-box"><pre id="env-preview"></pre></div>
      <div class="footer">
        <button class="btn btn-secondary" onclick="go(4)">← Back</button>
        <button class="btn btn-primary" id="save-btn" onclick="saveConfig()">💾 Save &amp; Apply</button>
      </div>
    </div>

    <!-- Step 6: Done -->
    <div class="step" id="step-6">
      <div class="success-icon">✅</div>
      <div class="step-title" style="text-align:center">Configuration Saved!</div>
      <div class="step-desc" style="text-align:center;margin-bottom:20px">Your lite node config has been written. Use the commands below to start your node.</div>
      <div id="done-content"></div>
      <div class="footer" style="justify-content:center;margin-top:24px">
        <button class="btn btn-primary" onclick="window.location.reload()">🔄 Reconfigure</button>
      </div>
    </div>

  </div>
</div>
<script>
let cur=1;
function go(n){
  if(n===5) buildReview();
  document.getElementById('step-'+cur).classList.remove('active');
  document.getElementById('dot-'+cur).classList.remove('active');
  if(cur<n) document.getElementById('dot-'+cur).classList.add('done');
  if(n<=5){
    for(let i=1;i<=4;i++){
      const l=document.getElementById('line-'+i);
      l.classList.toggle('done',i<n);
    }
  }
  cur=n;
  const d=document.getElementById('dot-'+cur);
  if(d){d.classList.remove('done');d.classList.add('active');}
  const s=document.getElementById('step-'+cur);
  if(s) s.classList.add('active');
}
function gv(id){return(document.getElementById(id)||{}).value||'';}
function gc(id){return document.getElementById(id)?.checked;}
function buildReview(){
  const eps=gv('rpc_endpoints').split('\n').filter(x=>x.trim()).join(',');
  const env=[
    'LITE_RPC_ENDPOINTS='+eps,
    'LITE_RPC_PORT='+gv('rpc_port'),
    'LITE_P2P_PORT='+gv('p2p_port'),
    'LITE_SYNC_INTERVAL='+gv('sync_interval'),
    'LITE_SPV='+(gc('spv_enabled')?'true':'false'),
    gv('validators').trim()?'LITE_VALIDATORS='+gv('validators').split(/[\n,]+/).filter(x=>x.trim()).join(','):'# LITE_VALIDATORS= (all validators accepted)',
    'LITE_DATADIR='+(gv('data_dir')||'~/.gyds-litenode'),
    'LITE_LOG_LEVEL='+gv('log_level'),
  ].join('\n');
  document.getElementById('env-preview').textContent=env;
  const vals=[
    ['RPC Endpoints',eps||'(none)'],['Local RPC Port',gv('rpc_port')],['P2P Port',gv('p2p_port')],
    ['Sync Interval',gv('sync_interval')],['SPV Enabled',gc('spv_enabled')?'Yes':'No'],
    ['Data Dir',gv('data_dir')||'~/.gyds-litenode'],['Log Level',gv('log_level')],
  ];
  document.getElementById('review-content').innerHTML='<div class="review-grid">'+vals.map(([k,v])=>'<div class="review-item"><div class="key">'+k+'</div><div class="val">'+v+'</div></div>').join('')+'</div>';
}
async function saveConfig(){
  const btn=document.getElementById('save-btn');
  btn.disabled=true; btn.textContent='Saving...';
  const eps=gv('rpc_endpoints').split('\n').filter(x=>x.trim());
  const validators=gv('validators').split(/[\n,]+/).filter(x=>x.trim());
  const body={
    rpc_endpoints:eps, rpc_port:parseInt(gv('rpc_port'))||8555,
    p2p_port:parseInt(gv('p2p_port'))||30305, sync_interval:gv('sync_interval'),
    spv_enabled:gc('spv_enabled'), validators:validators,
    data_dir:gv('data_dir')||'~/.gyds-litenode', log_level:gv('log_level'),
  };
  const r=await fetch('/api/configure',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await r.json();
  if(!r.ok){alert('Error: '+data.error); btn.disabled=false; btn.textContent='Save & Apply'; return;}
  document.getElementById('done-content').innerHTML=
    '<div class="info-box"><p>Config written to: <strong>'+data.config_file+'</strong></p></div>'+
    '<p style="font-size:13px;color:#9ca3af;margin:12px 0 6px">Start your node:</p>'+
    '<div class="cmd-box" onclick="cp(this)"><span class="copy-hint">click to copy</span>'+data.start_cmd+'</div>'+
    (data.service_cmd?'<p style="font-size:13px;color:#9ca3af;margin:12px 0 6px">Or as a service:</p><div class="cmd-box" onclick="cp(this)"><span class="copy-hint">click to copy</span>'+data.service_cmd+'</div>':'');
  document.getElementById('step-5').classList.remove('active');
  document.getElementById('step-6').classList.add('active');
}
function cp(el){const t=el.querySelector('span.copy-hint');const txt=el.textContent.replace('click to copy','').trim();navigator.clipboard.writeText(txt).then(()=>{if(t){const orig=t.textContent;t.textContent='copied!';setTimeout(()=>t.textContent=orig,1500);}});}
</script>
</body>
</html>`

// SetupServer holds state for the wizard HTTP server
type SetupServer struct {
        port    int
        dataDir string
        version string
}

// startSetupWizard launches the embedded setup web server
func startSetupWizard(wizardPort int, nodeVersion string) {
        home, _ := os.UserHomeDir()
        defaultDataDir := filepath.Join(home, ".gyds-litenode")

        srv := &SetupServer{port: wizardPort, dataDir: defaultDataDir, version: nodeVersion}

        mux := http.NewServeMux()
        mux.HandleFunc("/", srv.handleIndex)
        mux.HandleFunc("/api/configure", srv.handleConfigure)

        // Detect local IP for helpful display
        localIP := getLocalIP()
        url := fmt.Sprintf("http://localhost:%d", wizardPort)
        localURL := fmt.Sprintf("http://%s:%d", localIP, wizardPort)

        fmt.Printf("\n")
        fmt.Printf("╔══════════════════════════════════════════════════════════════╗\n")
        fmt.Printf("║   GYDS Lite Node — Web Setup Wizard                         ║\n")
        fmt.Printf("╠══════════════════════════════════════════════════════════════╣\n")
        fmt.Printf("║                                                              ║\n")
        fmt.Printf("║  Open this URL in your browser to configure the node:       ║\n")
        fmt.Printf("║                                                              ║\n")
        fmt.Printf("║  ➜  %-55s ║\n", url)
        fmt.Printf("║  ➜  %-55s ║\n", localURL+" (network)")
        fmt.Printf("║                                                              ║\n")
        fmt.Printf("║  Press Ctrl+C to stop the wizard server.                    ║\n")
        fmt.Printf("╚══════════════════════════════════════════════════════════════╝\n\n")

        // Try to auto-open browser on Linux/macOS
        go tryOpenBrowser(url)

        server := &http.Server{Addr: fmt.Sprintf(":%d", wizardPort), Handler: mux}
        if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
                fmt.Fprintf(os.Stderr, "Setup server error: %v\n", err)
                os.Exit(1)
        }
}

func (s *SetupServer) handleIndex(w http.ResponseWriter, r *http.Request) {
        tmpl, _ := template.New("setup").Parse(setupHTML)
        w.Header().Set("Content-Type", "text/html; charset=utf-8")
        tmpl.Execute(w, nil)
}

type liteSetupRequest struct {
        RPCEndpoints []string `json:"rpc_endpoints"`
        RPCPort      int      `json:"rpc_port"`
        P2PPort      int      `json:"p2p_port"`
        SyncInterval string   `json:"sync_interval"`
        SPVEnabled   bool     `json:"spv_enabled"`
        Validators   []string `json:"validators"`
        DataDir      string   `json:"data_dir"`
        LogLevel     string   `json:"log_level"`
}

func (s *SetupServer) handleConfigure(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        if r.Method != http.MethodPost {
                w.WriteHeader(405)
                json.NewEncoder(w).Encode(map[string]string{"error": "method not allowed"})
                return
        }

        var req liteSetupRequest
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                w.WriteHeader(400)
                json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
                return
        }

        // Defaults
        if len(req.RPCEndpoints) == 0 {
                req.RPCEndpoints = []string{"http://localhost:8545"}
        }
        if req.RPCPort == 0 {
                req.RPCPort = 8555
        }
        if req.SyncInterval == "" {
                req.SyncInterval = "5s"
        }
        if req.LogLevel == "" {
                req.LogLevel = "info"
        }
        dataDir := req.DataDir
        if dataDir == "" {
                dataDir = s.dataDir
        }
        // Expand ~ manually
        if strings.HasPrefix(dataDir, "~") {
                home, _ := os.UserHomeDir()
                dataDir = strings.Replace(dataDir, "~", home, 1)
        }

        // Build env file content
        lines := []string{
                "# GYDS Lite Node Configuration",
                "# Generated by setup wizard on " + time.Now().Format("2006-01-02 15:04:05"),
                "",
                "LITE_RPC_ENDPOINTS=" + strings.Join(req.RPCEndpoints, ","),
                fmt.Sprintf("LITE_RPC_PORT=%d", req.RPCPort),
                fmt.Sprintf("LITE_P2P_PORT=%d", req.P2PPort),
                "LITE_SYNC_INTERVAL=" + req.SyncInterval,
                fmt.Sprintf("LITE_SPV=%v", req.SPVEnabled),
                "LITE_DATADIR=" + dataDir,
                "LITE_LOG_LEVEL=" + req.LogLevel,
        }
        if len(req.Validators) > 0 {
                lines = append(lines, "LITE_VALIDATORS="+strings.Join(req.Validators, ","))
        }
        envContent := strings.Join(lines, "\n") + "\n"

        // Write config directory and env file
        configDir := filepath.Join(dataDir, "config")
        if err := os.MkdirAll(configDir, 0700); err != nil {
                w.WriteHeader(500)
                json.NewEncoder(w).Encode(map[string]string{"error": "cannot create config dir: " + err.Error()})
                return
        }

        configFile := filepath.Join(configDir, "node.env")
        if err := os.WriteFile(configFile, []byte(envContent), 0600); err != nil {
                w.WriteHeader(500)
                json.NewEncoder(w).Encode(map[string]string{"error": "cannot write config: " + err.Error()})
                return
        }

        // Also write a start.sh helper
        exePath, _ := os.Executable()
        if exePath == "" {
                exePath = "gyds-litenode"
        }
        startScript := fmt.Sprintf(`#!/usr/bin/env bash
set -a; source "%s"; set +a
exec "%s" start
`, configFile, exePath)

        startScriptPath := filepath.Join(dataDir, "start.sh")
        _ = os.WriteFile(startScriptPath, []byte(startScript), 0755)

        startCmd := fmt.Sprintf("set -a && source %s && set +a && %s start", configFile, exePath)
        serviceCmd := ""
        if _, err := os.Stat("/run/systemd"); err == nil {
                serviceCmd = "systemctl --user start gyds-litenode   # (if service was installed by installer)"
        }

        json.NewEncoder(w).Encode(map[string]interface{}{
                "ok":          true,
                "config_file": configFile,
                "start_cmd":   startCmd,
                "service_cmd": serviceCmd,
                "env":         envContent,
        })
}

func getLocalIP() string {
        conn, err := net.Dial("udp", "8.8.8.8:80")
        if err != nil {
                return "localhost"
        }
        defer conn.Close()
        return conn.LocalAddr().(*net.UDPAddr).IP.String()
}

func tryOpenBrowser(url string) {
        time.Sleep(800 * time.Millisecond)
        switch runtime.GOOS {
        case "linux":
                _ = exec.Command("xdg-open", url).Start()
        case "darwin":
                _ = exec.Command("open", url).Start()
        case "windows":
                _ = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
        }
}
