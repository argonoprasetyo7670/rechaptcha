/**
 * recaptcha-image.js
 * reCAPTCHA Enterprise Token Generator — Anti-Detection Mode
 * ACTION: IMAGE_GENERATION
 *
 * Fitur anti-detection:
 *  1. Random User-Agent per session
 *  2. Fingerprint spoofing inject SEBELUM page load
 *  3. Simulasi interaksi user (mouse, scroll, click) sebelum execute
 *  4. Human-like delay random
 *  5. Session fresh tiap server restart
 */

const { BrowserWindow, BrowserView, app } = require('electron');

const CONFIG = {
    SITEKEY: '6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV',
    ACTION: 'IMAGE_GENERATION',
    LABS_URL: 'https://labs.google/fx/tools/flow',
    INIT_TIMEOUT_MS: 90000,
    TOKEN_TIMEOUT_MS: 30000,
};

// ─── Random User-Agents (real Chrome on Windows) ──────────────────────────────
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
];

function getRandomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ─── Persistent state ─────────────────────────────────────────────────────────
let _stateImg = null;

async function ensureBrowserImg() {
    if (_stateImg && !_stateImg.win.isDestroyed()) return _stateImg;

    const ua = getRandomUA();
    console.log('[RECAPTCHA-IMG] 🚀 Initializing browser...');
    console.log(`[RECAPTCHA-IMG] 🌐 User-Agent: ${ua.substring(0, 60)}...`);

    const win = new BrowserWindow({
        show: false,
        width: 1280,
        height: 800,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    win.on('closed', () => {
        console.log('[RECAPTCHA-IMG] ⚠️  Browser closed, resetting state...');
        _stateImg = null;
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

    // Set random User-Agent SEBELUM load
    view.webContents.setUserAgent(ua);

    win.setBrowserView(view);
    view.setBounds({ x: 0, y: 0, width: 1280, height: 800 });

    // ── Inject fingerprint spoofing SEBELUM page load ──────────────────────
    await injectFingerprintSpoofing(view.webContents);

    console.log('[RECAPTCHA-IMG] Loading labs.google...');
    await view.webContents.loadURL(CONFIG.LABS_URL);

    // Tunggu page settle (seperti user baru buka tab)
    const settleDelay = 2000 + Math.random() * 3000;
    console.log(`[RECAPTCHA-IMG] ⏳ Page settle ${Math.round(settleDelay)}ms...`);
    await delay(settleDelay);

    console.log('[RECAPTCHA-IMG] Waiting for grecaptcha.enterprise...');
    await waitForRecaptcha(view.webContents, CONFIG.INIT_TIMEOUT_MS);

    // Simulasi user browsing setelah page ready
    await simulateUserInteraction(view.webContents);

    _stateImg = { win, view };
    console.log('[RECAPTCHA-IMG] ✅ Browser ready!');
    return _stateImg;
}

function destroyBrowserImg() {
    if (_stateImg) {
        try { if (!_stateImg.win.isDestroyed()) _stateImg.win.destroy(); } catch (_) { }
        _stateImg = null;
        console.log('[RECAPTCHA-IMG] Browser destroyed.');
    }
}

app.on('before-quit', destroyBrowserImg);

// ─── User Interaction Simulation ──────────────────────────────────────────────

async function simulateUserInteraction(webContents) {
    try {
        console.log('[RECAPTCHA-IMG] 🖱️  Simulating user interaction...');

        // 1. Simulasi mouse movements (random positions)
        for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) {
            const x = 100 + Math.floor(Math.random() * 1000);
            const y = 100 + Math.floor(Math.random() * 600);
            webContents.sendInputEvent({ type: 'mouseMove', x, y });
            await delay(100 + Math.random() * 300);
        }

        // 2. Simulasi scroll
        const scrollAmount = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < scrollAmount; i++) {
            webContents.sendInputEvent({
                type: 'mouseWheel',
                x: 640,
                y: 400,
                deltaX: 0,
                deltaY: -(50 + Math.floor(Math.random() * 150)),
            });
            await delay(200 + Math.random() * 500);
        }

        // 3. Scroll back up
        await delay(300 + Math.random() * 500);
        webContents.sendInputEvent({
            type: 'mouseWheel',
            x: 640,
            y: 400,
            deltaX: 0,
            deltaY: 100 + Math.floor(Math.random() * 200),
        });

        // 4. Random mouse move lagi
        for (let i = 0; i < 2; i++) {
            const x = 200 + Math.floor(Math.random() * 800);
            const y = 150 + Math.floor(Math.random() * 500);
            webContents.sendInputEvent({ type: 'mouseMove', x, y });
            await delay(150 + Math.random() * 400);
        }

        console.log('[RECAPTCHA-IMG] 🖱️  User interaction done.');
    } catch (err) {
        console.warn('[RECAPTCHA-IMG] ⚠️  Interaction simulation failed (non-fatal):', err.message);
    }
}

// ─── Token Generator ──────────────────────────────────────────────────────────

async function generateRecaptchaTokensImg(count = 1) {
    let state;
    try {
        state = await ensureBrowserImg();
    } catch (err) {
        console.error('[RECAPTCHA-IMG] ❌ Failed to init browser:', err.message);
        _stateImg = null;
        throw err;
    }

    const { view } = state;

    // Cek grecaptcha masih ada
    const isReady = await view.webContents.executeJavaScript(
        `typeof grecaptcha !== 'undefined' && typeof grecaptcha.enterprise !== 'undefined'`
    ).catch(() => false);

    if (!isReady) {
        console.warn('[RECAPTCHA-IMG] ⚠️  grecaptcha hilang, reload halaman...');
        await view.webContents.loadURL(CONFIG.LABS_URL);
        await delay(2000 + Math.random() * 2000);
        await waitForRecaptcha(view.webContents, CONFIG.INIT_TIMEOUT_MS);
        await simulateUserInteraction(view.webContents);
    }

    // Simulasi interaksi sebelum tiap execute (seperti user klik tombol)
    await simulatePreExecuteAction(view.webContents);

    console.log(`[RECAPTCHA-IMG] Executing ${count} token(s)...`);

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

        console.log(`[RECAPTCHA-IMG] ✅ ${tokens.length} token(s) generated.`);
        return tokens;

    } catch (err) {
        console.error('[RECAPTCHA-IMG] ❌ Token generation failed, resetting:', err.message);
        _stateImg = null;
        try { if (!state.win.isDestroyed()) state.win.destroy(); } catch (_) { }
        throw err;
    }
}

async function generateRecaptchaTokenImg() {
    const tokens = await generateRecaptchaTokensImg(1);
    return tokens[0];
}

// ─── Pre-Execute Simulation ───────────────────────────────────────────────────

async function simulatePreExecuteAction(webContents) {
    try {
        // Mouse move ke area tombol generate (seperti user mau klik)
        const targetX = 500 + Math.floor(Math.random() * 300);
        const targetY = 400 + Math.floor(Math.random() * 200);

        // Move mouse gradually (tidak teleport)
        let curX = 200 + Math.floor(Math.random() * 200);
        let curY = 200 + Math.floor(Math.random() * 200);
        const steps = 5 + Math.floor(Math.random() * 5);

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            // Easing (ease-out) untuk gerakan natural
            const ease = 1 - Math.pow(1 - t, 2);
            const x = Math.round(curX + (targetX - curX) * ease);
            const y = Math.round(curY + (targetY - curY) * ease);
            webContents.sendInputEvent({ type: 'mouseMove', x, y });
            await delay(30 + Math.random() * 60);
        }

        // Human-like pause sebelum "click"
        await delay(500 + Math.random() * 2000);

        console.log('[RECAPTCHA-IMG] 🎯 Pre-execute interaction done.');
    } catch (err) {
        // Non-fatal
    }
}

// ─── Fingerprint Spoofing ─────────────────────────────────────────────────────

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

                // 7. Hide automation indicators
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
                delete navigator.__proto__.webdriver;

                // 8. Fake plugins
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [
                        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
                        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                        { name: 'Native Client', filename: 'internal-nacl-plugin' },
                    ]
                });

                // 9. Fake languages
                Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            })();`
        });
        console.log('[RECAPTCHA-IMG] 🛡️  Fingerprint spoofing injected (BEFORE page load)');
    } catch (err) {
        console.warn('[RECAPTCHA-IMG] ⚠️  Fingerprint spoofing gagal (non-fatal):', err.message);
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

module.exports = { generateRecaptchaTokenImg, generateRecaptchaTokensImg, destroyBrowserImg };
