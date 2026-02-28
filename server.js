/**
 * server.js — reCAPTCHA Token REST API Service
 * Jalankan: npx electron server.js
 *
 * Endpoints:
 *   GET  /health              → status server (no auth)
 *   GET  /token               → generate 1 token
 *   GET  /tokens?count=N      → generate N token (max 30)
 *   GET  /keys                → list API keys (admin only)
 *   POST /keys                → tambah API key baru (admin only)
 *   DELETE /keys/:key         → hapus API key (admin only)
 */

const path = require('path');
const os = require('os');
const http = require('http');
const fs = require('fs');
const { app } = require('electron');
const { generateRecaptchaTokens, destroyBrowser } = require('./recaptcha');
const { generateRecaptchaTokensImg, destroyBrowserImg } = require('./recaptcha-image');

// Fresh userData tiap run
const freshUserData = path.join(os.tmpdir(), `electron-srv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
app.setPath('userData', freshUserData);

const PORT = process.env.PORT || 3000;
const KEYS_FILE = path.join(__dirname, 'keys.json');
const MAX_TOKENS_PER_REQUEST = 30;
const MAX_TOKENS_BEFORE_RESTART = 2;

let tokenServedImg = 0;
let lastTokenTimeImg = 0;
const MIN_COOLDOWN_MS = 3000;

let tokenServed = 0;
let lastTokenTime = 0;

// ─── API Key Store ────────────────────────────────────────────────────────────

function loadKeys() {
    try {
        return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    } catch {
        return { keys: {} };
    }
}

function saveKeys(data) {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getKey(apiKey) {
    const data = loadKeys();
    return data.keys[apiKey] || null;
}

// ─── Rate Limiter (in-memory, per API key, per minute) ────────────────────────

const rateLimitMap = new Map(); // apiKey → { count, resetAt }

function checkRateLimit(apiKey, limitPerMinute) {
    const now = Date.now();
    let entry = rateLimitMap.get(apiKey);

    if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + 60_000 };
    }

    if (entry.count >= limitPerMinute) {
        return { allowed: false, remaining: 0, resetIn: Math.ceil((entry.resetAt - now) / 1000) };
    }

    entry.count++;
    rateLimitMap.set(apiKey, entry);
    return { allowed: true, remaining: limitPerMinute - entry.count, resetIn: Math.ceil((entry.resetAt - now) / 1000) };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function send(res, status, body) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'X-API-Key, Content-Type',
    });
    res.end(JSON.stringify(body, null, 2));
}

function parseBody(req) {
    return new Promise((resolve) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(data)); } catch { resolve({}); }
        });
    });
}

function authMiddleware(req) {
    const apiKey = req.headers['x-api-key'] || new URL(req.url, 'http://localhost').searchParams.get('apikey');
    if (!apiKey) return { ok: false, reason: 'Missing API key. Use X-API-Key header or ?apikey= query param.' };

    const keyData = getKey(apiKey);
    if (!keyData) return { ok: false, reason: 'Invalid API key.' };

    return { ok: true, apiKey, keyData };
}

function generateApiKey() {
    return 'sk-' + [...Array(32)].map(() => Math.random().toString(36)[2]).join('');
}

// ─── Request Handler ──────────────────────────────────────────────────────────

async function handleRequest(req, res) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;
    const method = req.method;

    console.log(`[API] ${method} ${pathname}`);

    // CORS preflight
    if (method === 'OPTIONS') return send(res, 204, {});

    // ── GET /health ─────────────────────────────────────────────────────────
    if (method === 'GET' && pathname === '/health') {
        return send(res, 200, {
            success: true,
            status: 'ok',
            service: 'reCAPTCHA Token API',
            timestamp: new Date().toISOString(),
        });
    }

    // ── GET /free-token (no auth) ───────────────────────────────────────────
    if (method === 'GET' && pathname === '/free-token') {
        const elapsed = Date.now() - lastTokenTime;
        if (lastTokenTime > 0 && elapsed < MIN_COOLDOWN_MS) {
            const waitMs = MIN_COOLDOWN_MS - elapsed;
            console.log(`[API] ⏳ Cooldown ${waitMs}ms...`);
            await new Promise(r => setTimeout(r, waitMs));
        }
        lastTokenTime = Date.now();

        try {
            console.log(`[API] 🆓 Generating FREE token (${tokenServed + 1}/${MAX_TOKENS_BEFORE_RESTART})...`);
            const [token] = await generateRecaptchaTokens(1);
            tokenServed++;
            send(res, 200, {
                success: true,
                token,
                action: 'VIDEO_GENERATION',
                generatedAt: new Date().toISOString(),
                session: { served: tokenServed, maxBeforeRestart: MAX_TOKENS_BEFORE_RESTART },
            });

            if (tokenServed >= MAX_TOKENS_BEFORE_RESTART) {
                console.log(`[API] 🔄 Served ${tokenServed} tokens, exiting for fresh restart...`);
                destroyBrowser();
                setTimeout(() => process.exit(0), 500);
            }
            return;
        } catch (err) {
            console.error('[API] Free token generation failed:', err.message);
            return send(res, 500, { success: false, error: err.message });
        }
    }

    // ── GET /free-image-token (no auth) ─────────────────────────────────────
    if (method === 'GET' && pathname === '/free-image-token') {
        const elapsed = Date.now() - lastTokenTimeImg;
        if (lastTokenTimeImg > 0 && elapsed < MIN_COOLDOWN_MS) {
            const waitMs = MIN_COOLDOWN_MS - elapsed;
            console.log(`[API] ⏳ Image cooldown ${waitMs}ms...`);
            await new Promise(r => setTimeout(r, waitMs));
        }
        lastTokenTimeImg = Date.now();

        try {
            console.log(`[API] 🆓 Generating FREE image token (${tokenServedImg + 1}/${MAX_TOKENS_BEFORE_RESTART})...`);
            const [token] = await generateRecaptchaTokensImg(1);
            tokenServedImg++;
            send(res, 200, {
                success: true,
                token,
                action: 'IMAGE_GENERATION',
                generatedAt: new Date().toISOString(),
                session: { served: tokenServedImg, maxBeforeRestart: MAX_TOKENS_BEFORE_RESTART },
            });

            if (tokenServedImg >= MAX_TOKENS_BEFORE_RESTART) {
                console.log(`[API] 🔄 Served ${tokenServedImg} image tokens, exiting for fresh restart...`);
                destroyBrowser();
                destroyBrowserImg();
                setTimeout(() => process.exit(0), 500);
            }
            return;
        } catch (err) {
            console.error('[API] Free image token generation failed:', err.message);
            return send(res, 500, { success: false, error: err.message });
        }
    }

    // ── GET /token ──────────────────────────────────────────────────────────
    if (method === 'GET' && pathname === '/token') {
        const auth = authMiddleware(req);
        if (!auth.ok) return send(res, 401, { success: false, error: auth.reason });

        const rl = checkRateLimit(auth.apiKey, auth.keyData.limitPerMinute);
        if (!rl.allowed) return send(res, 429, {
            success: false,
            error: `Rate limit exceeded. Resets in ${rl.resetIn}s.`,
        });

        // Cooldown antar request
        const elapsed = Date.now() - lastTokenTime;
        if (lastTokenTime > 0 && elapsed < MIN_COOLDOWN_MS) {
            const waitMs = MIN_COOLDOWN_MS - elapsed;
            console.log(`[API] ⏳ Cooldown ${waitMs}ms...`);
            await new Promise(r => setTimeout(r, waitMs));
        }
        lastTokenTime = Date.now();

        try {
            console.log(`[API] Generating token for key "${auth.keyData.name}" (${tokenServed + 1}/${MAX_TOKENS_BEFORE_RESTART})...`);
            const [token] = await generateRecaptchaTokens(1);
            tokenServed++;
            send(res, 200, {
                success: true,
                token,
                generatedAt: new Date().toISOString(),
                rateLimit: { remaining: rl.remaining, resetIn: rl.resetIn },
                session: { served: tokenServed, maxBeforeRestart: MAX_TOKENS_BEFORE_RESTART },
            });

            // Hybrid restart: setelah N token, exit agar wrapper script restart
            if (tokenServed >= MAX_TOKENS_BEFORE_RESTART) {
                console.log(`[API] 🔄 Served ${tokenServed} tokens, exiting for fresh restart...`);
                destroyBrowser();
                setTimeout(() => process.exit(0), 500);
            }
            return;
        } catch (err) {
            console.error('[API] Token generation failed:', err.message);
            return send(res, 500, { success: false, error: err.message });
        }
    }

    // ── GET /image-token ────────────────────────────────────────────────────
    if (method === 'GET' && pathname === '/image-token') {
        const auth = authMiddleware(req);
        if (!auth.ok) return send(res, 401, { success: false, error: auth.reason });

        const rl = checkRateLimit(auth.apiKey, auth.keyData.limitPerMinute);
        if (!rl.allowed) return send(res, 429, {
            success: false,
            error: `Rate limit exceeded. Resets in ${rl.resetIn}s.`,
        });

        // Cooldown antar request
        const elapsed = Date.now() - lastTokenTimeImg;
        if (lastTokenTimeImg > 0 && elapsed < MIN_COOLDOWN_MS) {
            const waitMs = MIN_COOLDOWN_MS - elapsed;
            console.log(`[API] ⏳ Image cooldown ${waitMs}ms...`);
            await new Promise(r => setTimeout(r, waitMs));
        }
        lastTokenTimeImg = Date.now();

        try {
            console.log(`[API] Generating image token for key "${auth.keyData.name}" (${tokenServedImg + 1}/${MAX_TOKENS_BEFORE_RESTART})...`);
            const [token] = await generateRecaptchaTokensImg(1);
            tokenServedImg++;
            send(res, 200, {
                success: true,
                token,
                action: 'IMAGE_GENERATION',
                generatedAt: new Date().toISOString(),
                rateLimit: { remaining: rl.remaining, resetIn: rl.resetIn },
                session: { served: tokenServedImg, maxBeforeRestart: MAX_TOKENS_BEFORE_RESTART },
            });

            if (tokenServedImg >= MAX_TOKENS_BEFORE_RESTART) {
                console.log(`[API] 🔄 Served ${tokenServedImg} image tokens, exiting for fresh restart...`);
                destroyBrowser();
                destroyBrowserImg();
                setTimeout(() => process.exit(0), 500);
            }
            return;
        } catch (err) {
            console.error('[API] Image token generation failed:', err.message);
            return send(res, 500, { success: false, error: err.message });
        }
    }

    // ── GET /image-tokens?count=N ───────────────────────────────────────────
    if (method === 'GET' && pathname === '/image-tokens') {
        const auth = authMiddleware(req);
        if (!auth.ok) return send(res, 401, { success: false, error: auth.reason });

        const count = Math.min(MAX_TOKENS_PER_REQUEST, Math.max(1, parseInt(url.searchParams.get('count')) || 1));

        const rl = checkRateLimit(auth.apiKey, auth.keyData.limitPerMinute);
        if (!rl.allowed) return send(res, 429, {
            success: false,
            error: `Rate limit exceeded. Resets in ${rl.resetIn}s.`,
        });

        // Cooldown antar request
        const elapsed = Date.now() - lastTokenTimeImg;
        if (lastTokenTimeImg > 0 && elapsed < MIN_COOLDOWN_MS) {
            const waitMs = MIN_COOLDOWN_MS - elapsed;
            console.log(`[API] ⏳ Image cooldown ${waitMs}ms...`);
            await new Promise(r => setTimeout(r, waitMs));
        }
        lastTokenTimeImg = Date.now();

        try {
            console.log(`[API] Generating ${count} image token(s) for key "${auth.keyData.name}" (${tokenServedImg + count}/${MAX_TOKENS_BEFORE_RESTART})...`);
            const tokens = await generateRecaptchaTokensImg(count);
            tokenServedImg += count;
            send(res, 200, {
                success: true,
                tokens,
                count: tokens.length,
                action: 'IMAGE_GENERATION',
                generatedAt: new Date().toISOString(),
                rateLimit: { remaining: rl.remaining, resetIn: rl.resetIn },
                session: { served: tokenServedImg, maxBeforeRestart: MAX_TOKENS_BEFORE_RESTART },
            });

            if (tokenServedImg >= MAX_TOKENS_BEFORE_RESTART) {
                console.log(`[API] 🔄 Served ${tokenServedImg} image tokens, exiting for fresh restart...`);
                destroyBrowser();
                destroyBrowserImg();
                setTimeout(() => process.exit(0), 500);
            }
            return;
        } catch (err) {
            console.error('[API] Image token generation failed:', err.message);
            return send(res, 500, { success: false, error: err.message });
        }
    }

    // ── GET /tokens?count=N ─────────────────────────────────────────────────
    if (method === 'GET' && pathname === '/tokens') {
        const auth = authMiddleware(req);
        if (!auth.ok) return send(res, 401, { success: false, error: auth.reason });

        const count = Math.min(MAX_TOKENS_PER_REQUEST, Math.max(1, parseInt(url.searchParams.get('count')) || 1));

        const rl = checkRateLimit(auth.apiKey, auth.keyData.limitPerMinute);
        if (!rl.allowed) return send(res, 429, {
            success: false,
            error: `Rate limit exceeded. Resets in ${rl.resetIn}s.`,
        });

        // Cooldown antar request
        const elapsed = Date.now() - lastTokenTime;
        if (lastTokenTime > 0 && elapsed < MIN_COOLDOWN_MS) {
            const waitMs = MIN_COOLDOWN_MS - elapsed;
            console.log(`[API] ⏳ Cooldown ${waitMs}ms...`);
            await new Promise(r => setTimeout(r, waitMs));
        }
        lastTokenTime = Date.now();

        try {
            console.log(`[API] Generating ${count} token(s) for key "${auth.keyData.name}" (${tokenServed + count}/${MAX_TOKENS_BEFORE_RESTART})...`);
            const tokens = await generateRecaptchaTokens(count);
            tokenServed += count;
            send(res, 200, {
                success: true,
                tokens,
                count: tokens.length,
                generatedAt: new Date().toISOString(),
                rateLimit: { remaining: rl.remaining, resetIn: rl.resetIn },
                session: { served: tokenServed, maxBeforeRestart: MAX_TOKENS_BEFORE_RESTART },
            });

            // Hybrid restart: setelah N token, exit agar wrapper script restart
            if (tokenServed >= MAX_TOKENS_BEFORE_RESTART) {
                console.log(`[API] 🔄 Served ${tokenServed} tokens, exiting for fresh restart...`);
                destroyBrowser();
                setTimeout(() => process.exit(0), 500);
            }
            return;
        } catch (err) {
            console.error('[API] Token generation failed:', err.message);
            return send(res, 500, { success: false, error: err.message });
        }
    }

    // ── GET /keys (admin) ───────────────────────────────────────────────────
    if (method === 'GET' && pathname === '/keys') {
        const auth = authMiddleware(req);
        if (!auth.ok) return send(res, 401, { success: false, error: auth.reason });
        if (!auth.keyData.isAdmin) return send(res, 403, { success: false, error: 'Admin only.' });

        const data = loadKeys();
        const list = Object.entries(data.keys).map(([k, v]) => ({ key: k, ...v }));
        return send(res, 200, { success: true, count: list.length, keys: list });
    }

    // ── POST /keys (admin) — tambah key baru ────────────────────────────────
    if (method === 'POST' && pathname === '/keys') {
        const auth = authMiddleware(req);
        if (!auth.ok) return send(res, 401, { success: false, error: auth.reason });
        if (!auth.keyData.isAdmin) return send(res, 403, { success: false, error: 'Admin only.' });

        const body = await parseBody(req);
        const newKey = generateApiKey();
        const data = loadKeys();

        data.keys[newKey] = {
            name: body.name || 'unnamed',
            isAdmin: body.isAdmin || false,
            limitPerMinute: body.limitPerMinute || 100,
            createdAt: new Date().toISOString().split('T')[0],
        };

        saveKeys(data);
        console.log(`[API] New key created: ${newKey} (${data.keys[newKey].name})`);
        return send(res, 201, { success: true, key: newKey, ...data.keys[newKey] });
    }

    // ── DELETE /keys/:key (admin) ────────────────────────────────────────────
    if (method === 'DELETE' && pathname.startsWith('/keys/')) {
        const auth = authMiddleware(req);
        if (!auth.ok) return send(res, 401, { success: false, error: auth.reason });
        if (!auth.keyData.isAdmin) return send(res, 403, { success: false, error: 'Admin only.' });

        const targetKey = pathname.replace('/keys/', '');
        const data = loadKeys();

        if (!data.keys[targetKey]) return send(res, 404, { success: false, error: 'Key not found.' });
        if (targetKey === auth.apiKey) return send(res, 400, { success: false, error: 'Cannot delete your own key.' });

        const deleted = data.keys[targetKey];
        delete data.keys[targetKey];
        saveKeys(data);

        console.log(`[API] Key deleted: ${targetKey} (${deleted.name})`);
        return send(res, 200, { success: true, deleted: { key: targetKey, ...deleted } });
    }

    // 404
    return send(res, 404, {
        success: false,
        error: 'Endpoint not found.',
        endpoints: [
            'GET /health',
            'GET /free-token        (no auth)',
            'GET /free-image-token  (no auth)',
            'GET /token', 'GET /tokens?count=N',
            'GET /image-token', 'GET /image-tokens?count=N',
            'GET /keys', 'POST /keys', 'DELETE /keys/:key',
        ],
    });
}

// ─── Start Server ─────────────────────────────────────────────────────────────

app.on('window-all-closed', () => { });

app.whenReady().then(() => {
    const server = http.createServer(handleRequest);

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`\n🚀 reCAPTCHA Token API running at http://0.0.0.0:${PORT}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📌 Endpoints:`);
        console.log(`   GET  /health`);
        console.log(`   GET  /free-token          (VIDEO - no auth)`);
        console.log(`   GET  /free-image-token    (IMAGE - no auth)`);
        console.log(`   GET  /token               (VIDEO_GENERATION)`);
        console.log(`   GET  /tokens?count=N      (VIDEO_GENERATION)`);
        console.log(`   GET  /image-token         (IMAGE_GENERATION)`);
        console.log(`   GET  /image-tokens?count=N (IMAGE_GENERATION)`);
        console.log(`   GET  /keys                (admin only)`);
        console.log(`   POST /keys                (admin only)`);
        console.log(`   DELETE /keys/:key         (admin only)`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`🔑 Default admin key: sk-admin-change-me`);
        console.log(`   Edit keys.json untuk ganti API keys!\n`);
    });

    app.on('before-quit', () => {
        destroyBrowser();
        destroyBrowserImg();
        server.close();
    });
});
