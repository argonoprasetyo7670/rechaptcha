/**
 * recaptcha.js
 * reCAPTCHA Enterprise Token Generator — Persistent Browser Mode
 *
 * Browser dibuat SEKALI saat request pertama, lalu di-reuse untuk semua
 * request berikutnya. Ditutup hanya saat server restart.
 * Session fresh (random partition) setiap server restart.
 */

const { BrowserWindow, BrowserView, app } = require('electron');

const CONFIG = {
    SITEKEY: '6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV',
    ACTION: 'VIDEO_GENERATION',
    LABS_URL: 'https://labs.google/fx/tools/flow',
    INIT_TIMEOUT_MS: 90000,
    TOKEN_TIMEOUT_MS: 30000,
};

// ─── Persistent state ─────────────────────────────────────────────────────────
let _state = null; // { win, view } — singleton, hanya dibuat sekali

async function ensureBrowser() {
    if (_state && !_state.win.isDestroyed()) return _state;

    console.log('[RECAPTCHA] 🚀 Initializing browser (sekali untuk selamanya)...');

    const win = new BrowserWindow({
        show: false,
        width: 1280,
        height: 800,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    win.on('closed', () => {
        console.log('[RECAPTCHA] ⚠️  Browser closed, resetting state...');
        _state = null;
    });

    // Partition random per server run → fresh session tiap restart
    const partition = `persist:rc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const view = new BrowserView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: false,
            javascript: true,
            partition,
        },
    });

    win.setBrowserView(view);
    view.setBounds({ x: 0, y: 0, width: 1280, height: 800 });

    console.log('[RECAPTCHA] Loading labs.google...');

    await view.webContents.loadURL(CONFIG.LABS_URL);
    await delay(1000);

    console.log('[RECAPTCHA] Waiting for grecaptcha.enterprise...');
    await waitForRecaptcha(view.webContents, CONFIG.INIT_TIMEOUT_MS);

    // ── Brave-like Fingerprint Randomization (inject setelah page ready) ──────
    await injectFingerprintSpoofing(view.webContents);
    // ─────────────────────────────────────────────────────────────────────────

    _state = { win, view };
    console.log('[RECAPTCHA] ✅ Browser ready! Di-reuse untuk semua request berikutnya.');
    return _state;
}

function destroyBrowser() {
    if (_state) {
        try { if (!_state.win.isDestroyed()) _state.win.destroy(); } catch (_) { }
        _state = null;
        console.log('[RECAPTCHA] Browser destroyed (server shutdown).');
    }
}

app.on('before-quit', destroyBrowser);

// ─── Token Generator ──────────────────────────────────────────────────────────

async function generateRecaptchaTokens(count = 1) {
    let state;
    try {
        state = await ensureBrowser();
    } catch (err) {
        console.error('[RECAPTCHA] ❌ Failed to init browser:', err.message);
        _state = null;
        throw err;
    }

    const { view } = state;

    // Cek grecaptcha masih ada (jaga-jaga kalau halaman reload sendiri)
    const isReady = await view.webContents.executeJavaScript(
        `typeof grecaptcha !== 'undefined' && typeof grecaptcha.enterprise !== 'undefined'`
    ).catch(() => false);

    if (!isReady) {
        console.warn('[RECAPTCHA] ⚠️  grecaptcha hilang, reload halaman...');
        await view.webContents.loadURL(CONFIG.LABS_URL);
        await delay(1000);
        await waitForRecaptcha(view.webContents, CONFIG.INIT_TIMEOUT_MS);
    }

    console.log(`[RECAPTCHA] Executing ${count} token(s) in parallel (browser reused)...`);

    try {
        const tokens = await view.webContents.executeJavaScript(`
            (function() {
                const sitekey = '${CONFIG.SITEKEY}';
                const action  = '${CONFIG.ACTION}';
                const n       = ${count};
                return new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('reCAPTCHA timeout')), ${CONFIG.TOKEN_TIMEOUT_MS});
                    grecaptcha.enterprise.ready(() => {
                        const jobs = Array.from({ length: n }, () =>
                            grecaptcha.enterprise.execute(sitekey, { action })
                        );
                        Promise.all(jobs)
                            .then(t => { clearTimeout(timeout); resolve(t); })
                            .catch(e => { clearTimeout(timeout); reject(e); });
                    });
                });
            })()
        `);

        console.log(`[RECAPTCHA] ✅ ${tokens.length} token(s) generated (browser persisted).`);
        return tokens;

    } catch (err) {
        console.error('[RECAPTCHA] ❌ Token generation failed, resetting:', err.message);
        _state = null;
        try { if (!state.win.isDestroyed()) state.win.destroy(); } catch (_) { }
        throw err;
    }
}

async function generateRecaptchaToken() {
    const tokens = await generateRecaptchaTokens(1);
    return tokens[0];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Inject fingerprint randomization ala Brave Browser via Electron CDP.
 * Noise di-generate SEKALI per session → konsisten dalam 1 session, unik antar session.
 */
async function injectFingerprintSpoofing(webContents) {
    try {
        const n = {
            r: (Math.random() * 4 - 2).toFixed(4),
            g: (Math.random() * 4 - 2).toFixed(4),
            b: (Math.random() * 4 - 2).toFixed(4),
            audio: (Math.random() * 0.0001).toFixed(6),
        };
        const hw = [2, 4, 6, 8, 10, 12, 16][Math.floor(Math.random() * 7)];
        const mem = [2, 4, 8][Math.floor(Math.random() * 3)];
        const sw = [1280, 1366, 1440, 1536, 1600, 1920][Math.floor(Math.random() * 6)];
        const sh = [720, 768, 864, 900, 1024, 1080][Math.floor(Math.random() * 6)];
        const cd = [24, 30, 32][Math.floor(Math.random() * 3)];

        try { webContents.debugger.attach('1.3'); } catch (_) { }
        await webContents.debugger.sendCommand('Page.enable');
        await webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
            source: `(function() {
                const _n = { r: ${n.r}, g: ${n.g}, b: ${n.b}, audio: ${n.audio} };

                // 1. Canvas noise
                const _origURL  = HTMLCanvasElement.prototype.toDataURL;
                const _origGID  = CanvasRenderingContext2D.prototype.getImageData;
                function _noise(data) {
                    for (let i = 0; i < data.length; i += 4) {
                        data[i]   = Math.min(255, Math.max(0, data[i]   + _n.r));
                        data[i+1] = Math.min(255, Math.max(0, data[i+1] + _n.g));
                        data[i+2] = Math.min(255, Math.max(0, data[i+2] + _n.b));
                    }
                }
                HTMLCanvasElement.prototype.toDataURL = function(t, ...a) {
                    const ctx = this.getContext('2d');
                    if (ctx) { const d = _origGID.call(ctx,0,0,this.width,this.height); _noise(d.data); ctx.putImageData(d,0,0); }
                    return _origURL.call(this, t, ...a);
                };
                CanvasRenderingContext2D.prototype.getImageData = function(x,y,w,h) {
                    const d = _origGID.call(this,x,y,w,h); _noise(d.data); return d;
                };

                // 2. WebGL noise
                const _origGP = WebGLRenderingContext.prototype.getParameter;
                WebGLRenderingContext.prototype.getParameter = function(p) {
                    const v = _origGP.call(this, p);
                    return (typeof v === 'number') ? v + _n.r * 0.001 : v;
                };

                // 3. AudioContext noise
                const _origCB = AudioContext.prototype.createBuffer;
                AudioContext.prototype.createBuffer = function(ch, len, rate) {
                    const buf = _origCB.call(this, ch, len, rate);
                    for (let c = 0; c < ch; c++) {
                        const data = buf.getChannelData(c);
                        for (let i = 0; i < data.length; i++) data[i] += _n.audio;
                    }
                    return buf;
                };

                // 4. Navigator
                try {
                    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => ${hw} });
                    Object.defineProperty(navigator, 'deviceMemory',        { get: () => ${mem} });
                } catch(_) {}

                // 5. Screen
                try {
                    Object.defineProperty(screen, 'width',      { get: () => ${sw} });
                    Object.defineProperty(screen, 'height',     { get: () => ${sh} });
                    Object.defineProperty(screen, 'colorDepth', { get: () => ${cd} });
                    Object.defineProperty(screen, 'pixelDepth', { get: () => ${cd} });
                } catch(_) {}

                // 6. WebRTC IP leak block
                if (window.RTCPeerConnection) {
                    const _origRTC = window.RTCPeerConnection;
                    window.RTCPeerConnection = function(cfg, ...a) {
                        if (cfg && cfg.iceServers) cfg.iceServers = [];
                        return new _origRTC(cfg, ...a);
                    };
                    window.RTCPeerConnection.prototype = _origRTC.prototype;
                }
            })();`
        });
        console.log('[RECAPTCHA] 🛡️  Fingerprint spoofing aktif (canvas/webgl/audio/nav/screen/webrtc)');
    } catch (err) {
        console.warn('[RECAPTCHA] ⚠️  Fingerprint spoofing gagal (non-fatal):', err.message);
    }
}

function waitForRecaptcha(webContents, timeoutMs) {

    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const check = async () => {
            if (Date.now() - startTime > timeoutMs)
                return reject(new Error(`Timeout: grecaptcha tidak tersedia setelah ${timeoutMs}ms`));
            try {
                const ready = await webContents.executeJavaScript(
                    `typeof grecaptcha !== 'undefined' && typeof grecaptcha.enterprise !== 'undefined'`
                );
                if (ready) resolve();
                else setTimeout(check, 500);
            } catch { setTimeout(check, 500); }
        };
        check();
    });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { generateRecaptchaToken, generateRecaptchaTokens, destroyBrowser };
