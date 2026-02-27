/**
 * main.js — Electron Main Process
 * Batch token collector: kumpulkan semua request yang datang dalam 150ms,
 * generate semua token sekaligus dari 1 browser session → hemat bandwidth & lebih reliable.
 */

const { app } = require('electron');
const http = require('http');
const { generateRecaptchaTokens } = require('./recaptcha');

const PORT = process.env.PORT || 3000;
const BATCH_WINDOW_MS = 150; // tunggu 150ms untuk kumpulkan request sebelum generate

let server = null;

// ── Batch queue ───────────────────────────────────────────────────────────────
let pendingQueue = [];    // array of { resolve, reject }
let batchTimer = null;
let isGenerating = false; // cegah 2 batch jalan bersamaan

function scheduleBatch() {
    if (batchTimer) return; // sudah ada timer, skip
    batchTimer = setTimeout(processBatch, BATCH_WINDOW_MS);
}

async function processBatch() {
    batchTimer = null;
    if (pendingQueue.length === 0) return;
    if (isGenerating) {
        // Ada batch yang lagi jalan — reschedule
        scheduleBatch();
        return;
    }

    // Ambil semua pending request
    const batch = pendingQueue.splice(0, pendingQueue.length);
    isGenerating = true;

    console.log(`[MAIN] Batch: generating ${batch.length} token(s) from 1 browser...`);
    try {
        const tokens = await generateRecaptchaTokens(batch.length);
        // Distribusikan ke masing-masing waiter
        batch.forEach(({ resolve }, i) => resolve(tokens[i]));
        console.log(`[MAIN] Batch done: ${tokens.length} token(s) delivered.`);
    } catch (err) {
        console.error('[MAIN] Batch error:', err.message);
        batch.forEach(({ reject }) => reject(err));
    } finally {
        isGenerating = false;
        // Kalau ada request baru masuk selama kita generate, proses sekarang
        if (pendingQueue.length > 0) scheduleBatch();
    }
}

function requestToken() {
    return new Promise((resolve, reject) => {
        pendingQueue.push({ resolve, reject });
        scheduleBatch();
    });
}
// ─────────────────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
    console.log('[MAIN] Electron ready. Starting HTTP server...');

    server = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'GET' && req.url === '/token') {
            try {
                const token = await requestToken();
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, token }));
            } catch (err) {
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, error: err.message }));
            }

        } else if (req.method === 'GET' && req.url === '/health') {
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, status: 'ok' }));

        } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found. Use GET /token' }));
        }
    });

    server.listen(PORT, () => {
        console.log(`[MAIN] HTTP server running at http://localhost:${PORT}`);
        console.log(`[MAIN] Batch window: ${BATCH_WINDOW_MS}ms`);
    });
});

app.on('window-all-closed', () => { /* keep alive */ });
app.on('before-quit', () => { if (server) server.close(); });
