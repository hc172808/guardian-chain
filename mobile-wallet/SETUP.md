# GYDS Wallet — Mobile App Setup Guide

**Source repo:** https://github.com/hc172808/your-digital-wallet

The wallet app is a Vite + React + TypeScript PWA **already configured for GYDS chain 198282**
with the same RPC endpoints (`rpc.netlifegy.com`), branding, and package ID `io.netlifegy.gyds`.
It can be shipped as:

| Platform | Method | Output |
|----------|--------|--------|
| Android  | Capacitor + Android Studio | Native APK / AAB (Play Store) |
| Android  | Bubblewrap TWA | Lightweight APK wrapping the hosted PWA |
| Android  | PWABuilder | APK without local toolchain |
| iOS      | Capacitor + Xcode | Native IPA (App Store) |
| iOS      | PWABuilder | IPA package |

---

## 1 — Prerequisites

```bash
# Node.js 20+
node --version

# bun (fast package manager used by the wallet repo)
curl -fsSL https://bun.sh/install | bash

# Android: Java 17+, Android Studio (Capacitor), or Bubblewrap CLI
java --version
npx @bubblewrap/cli --version

# iOS: macOS only — Xcode 15+
xcode-select --version
```

---

## 2 — Clone & configure the wallet

```bash
# Clone the wallet repo alongside this dashboard (or anywhere)
git clone https://github.com/hc172808/your-digital-wallet.git gyds-wallet
cd gyds-wallet

# Install dependencies
bun install

# Copy and edit the environment file
cp .env .env.local
```

Edit `.env.local` — the defaults already work for GYDS mainnet:

```env
VITE_RPC_URL=https://rpc.netlifegy.com
VITE_RPC_FALLBACKS=https://rpc2.netlifegy.com,https://rpc3.netlifegy.com
VITE_CHAIN_ID=198282
VITE_CHAIN_ID_HEX=0x3068a
VITE_NATIVE_SYMBOL=GYDS
VITE_NETWORK_NAME=GYDS Network
VITE_BLOCK_EXPLORER=https://explorer.netlifegy.com

# Point the wallet to YOUR deployed ChainCore dashboard API
VITE_API_BASE=https://netlifegy.com
VITE_DASHBOARD_URL=https://netlifegy.com
```

---

## 3 — Build the web app

```bash
cd gyds-wallet
bun run build
# Output: dist/  (ready to deploy or wrap with Capacitor)
```

---

## 4 — Android: Capacitor (Full Native App)

### 4a — Install Capacitor & add Android platform

```bash
cd gyds-wallet/mobile
bun install

# Add the Android project (creates ./android/)
npx cap add android
npx cap copy
npx cap sync
```

### 4b — Open in Android Studio

```bash
npx cap open android
```

In Android Studio:
1. Wait for Gradle sync to complete
2. **Build → Generate Signed Bundle / APK**
3. Choose **Android App Bundle (AAB)** for Play Store, or **APK** for sideloading
4. Create or use existing keystore → sign → build

### 4c — Update domain in Capacitor config

`mobile/capacitor.config.ts` — already correct, but if you want live updates from
your server (no rebuild for content changes), uncomment the server block:

```typescript
server: {
  url: "https://netlifegy.com",  // your deployed domain
  cleartext: false,
},
```

---

## 5 — Android: Bubblewrap TWA (Smallest APK)

Requires the PWA deployed at a public HTTPS URL with a valid `manifest.webmanifest`.

```bash
# Install Bubblewrap CLI
npm i -g @bubblewrap/cli

# Update the pre-filled manifest with your domain
cd gyds-wallet/mobile/bubblewrap
# Edit twa-manifest.json: replace "YOUR-DOMAIN" with "netlifegy.com"
sed -i 's/YOUR-DOMAIN/netlifegy.com/g' twa-manifest.json

# Build the APK
bubblewrap update
bubblewrap build
# Output: app-release-signed.apk
```

Required: Add a Digital Asset Links file to your server so Android trusts the TWA:

```bash
# On your server, create this file:
# https://netlifegy.com/.well-known/assetlinks.json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "io.netlifegy.gyds.twa",
    "sha256_cert_fingerprints": ["YOUR_KEYSTORE_SHA256_FINGERPRINT"]
  }
}]
```

Get your fingerprint: `keytool -list -v -keystore android.keystore`

---

## 6 — iOS: Capacitor + Xcode (macOS only)

```bash
cd gyds-wallet/mobile
npx cap add ios
npx cap copy
npx cap sync
npx cap open ios
```

In Xcode:
1. Set your **Team** (Apple Developer account) in Signing & Capabilities
2. Change **Bundle Identifier** to `io.netlifegy.gyds`
3. **Product → Archive** → Distribute → App Store Connect or Ad Hoc

---

## 7 — iOS & Android: PWABuilder (No local toolchain needed)

The easiest path if you don't have Android Studio or Xcode:

1. Deploy the wallet to your server: `bun run build` → upload `dist/` to nginx
2. Visit **https://www.pwabuilder.com**
3. Enter your URL: `https://netlifegy.com`
4. Click **Start** → **Package for Stores**
5. Select **Android** or **iOS**
6. Upload `mobile/pwabuilder.json` for pre-filled settings
7. Download the signed package

---

## 8 — Wallet Features (already built)

| Feature | Status |
|---------|--------|
| Send / Receive GYDS | ✅ |
| Token Swap (DEX) | ✅ |
| Transaction History | ✅ |
| NFT Gallery | ✅ |
| Price Alerts (background SW) | ✅ |
| WalletConnect v2 | ✅ |
| DApp Browser Connector | ✅ |
| Hardware Wallet (Ledger) | ✅ |
| Multi-Account | ✅ |
| Earn / Staking | ✅ |
| Perpetuals | ✅ |
| Prediction Markets | ✅ |
| Buy GYDS | ✅ |
| Connected Apps | ✅ |
| Admin Panel | ✅ |
| Session Lock / PIN | ✅ |
| QR Scanner | ✅ |
| Import / Export Wallet | ✅ |
| Meme Rush / Alpha Tokens | ✅ |
| Network Config (admin) | ✅ |
| Push Notifications (SW) | ✅ |
| PWA (installable) | ✅ |

---

## 9 — Linking the wallet to ChainCore backend

The wallet is self-contained (reads chain state directly via RPC). To also use
the ChainCore dashboard API (for trust data, user auth, faucet, etc.) add to
`.env.local`:

```env
VITE_API_BASE=https://netlifegy.com
```

Then in the wallet code call `${import.meta.env.VITE_API_BASE}/api/...` routes.

---

## 10 — Publishing to app stores

### Google Play Store
1. Build a signed AAB with Capacitor or an APK with Bubblewrap
2. Create an app at https://play.google.com/console
3. Upload the AAB / APK
4. Fill in store listing, screenshots, privacy policy
5. Submit for review (usually 1–3 business days)

### Apple App Store
1. Build the IPA with Xcode or PWABuilder
2. Upload via **Xcode → Distribute** or **Transporter** app
3. Create an app at https://appstoreconnect.apple.com
4. Fill in metadata, screenshots
5. Submit for review (usually 1–7 days)

**App Store URLs (once published):**
- Android: `https://play.google.com/store/apps/details?id=io.netlifegy.gyds`
- iOS: `https://apps.apple.com/app/gyds-wallet/idYOUR_APP_ID`

---

## App Identity

| Field | Value |
|-------|-------|
| App Name | GYDS Wallet |
| Package ID (Android) | `io.netlifegy.gyds` |
| TWA Package ID | `io.netlifegy.gyds.twa` |
| Bundle ID (iOS) | `io.netlifegy.gyds` |
| Chain ID | 198282 |
| Theme | `#0f1318` (dark) |
| Repo | https://github.com/hc172808/your-digital-wallet |
