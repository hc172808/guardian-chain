"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.totp = void 0;
const crypto_1 = require("crypto");
const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(buf) {
    let bits = 0, value = 0, output = "";
    for (let i = 0; i < buf.length; i++) {
        value = (value << 8) | buf[i];
        bits += 8;
        while (bits >= 5) {
            output += BASE32_CHARS[(value >>> (bits - 5)) & 0x1f];
            bits -= 5;
        }
    }
    if (bits > 0)
        output += BASE32_CHARS[(value << (5 - bits)) & 0x1f];
    return output;
}
function base32Decode(input) {
    const cleaned = input.toUpperCase().replace(/=+$/, "");
    let bits = 0, value = 0;
    const output = [];
    for (const ch of cleaned) {
        const idx = BASE32_CHARS.indexOf(ch);
        if (idx < 0)
            continue;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            output.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Buffer.from(output);
}
function hotp(secret, counter) {
    const key = base32Decode(secret);
    const buf = Buffer.alloc(8);
    let c = counter;
    for (let i = 7; i >= 0; i--) {
        buf[i] = Number(c & 0xffn);
        c >>= 8n;
    }
    const hmac = (0, crypto_1.createHmac)("sha1", key).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = ((hmac[offset] & 0x7f) << 24) |
        (hmac[offset + 1] << 16) |
        (hmac[offset + 2] << 8) |
        hmac[offset + 3];
    return String(code % 1000000).padStart(6, "0");
}
function timeStep() {
    return BigInt(Math.floor(Date.now() / 30000));
}
exports.totp = {
    generateSecret() {
        return base32Encode((0, crypto_1.randomBytes)(20));
    },
    generate(secret) {
        return hotp(secret, timeStep());
    },
    verify({ token, secret }) {
        const step = timeStep();
        for (const delta of [-1n, 0n, 1n]) {
            if (hotp(secret, step + delta) === token.replace(/\s/g, ""))
                return true;
        }
        return false;
    },
    keyuri(label, issuer, secret) {
        const enc = (s) => encodeURIComponent(s);
        return `otpauth://totp/${enc(issuer)}:${enc(label)}?secret=${secret}&issuer=${enc(issuer)}&algorithm=SHA1&digits=6&period=30`;
    },
};
