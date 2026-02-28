// =====================================================
// CAPTCHA PROVIDER — Round Robin Multi-Server
// API key never exposed to browser (server-side only)
// =====================================================

const TOKEN_API_KEY = process.env.CAPTCHA_API_KEY || 'sk-admin-change-me';
const CAPTCHA_TIMEOUT_MS = 120_000; // 120s

// 5 ngrok servers — isi URL ngrok masing-masing RDP
const CAPTCHA_SERVERS: string[] = (
    process.env.CAPTCHA_SERVERS ||
    [
        'https://prosecrecy-unsubjectively-makenzie.ngrok-free.dev',
    ].join(',')
).split(',').map(s => s.trim()).filter(Boolean);

let currentServerIndex = 0;

function getNextServer(): string {
    const server = CAPTCHA_SERVERS[currentServerIndex];
    currentServerIndex = (currentServerIndex + 1) % CAPTCHA_SERVERS.length;
    return server;
}

export async function getCaptchaToken(): Promise<string | null> {
    const maxAttempts = CAPTCHA_SERVERS.length; // Coba semua server

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const server = getNextServer();
        try {
            console.log(`[Captcha] 🔄 Attempt ${attempt}/${maxAttempts} → ${server}`);

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), CAPTCHA_TIMEOUT_MS);

            const response = await fetch(`${server}/token`, {
                method: 'GET',
                headers: {
                    'X-API-Key': TOKEN_API_KEY,
                    'ngrok-skip-browser-warning': 'true',
                },
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (!response.ok) {
                const errorBody = await response.text().catch(() => '');
                console.warn(`[Captcha] ⚠️ ${server} returned ${response.status}: ${errorBody}`);
                continue; // Coba server berikutnya
            }

            const data = await response.json();
            const token = data.token || data.captchaToken || data.recaptchaToken || data.data?.token;

            if (!token || token.length < 20) {
                console.warn('[Captcha] ⚠️ Invalid token from', server, JSON.stringify(data));
                continue;
            }

            console.log(`[Captcha] ✅ Token acquired from ${server}`);
            return token as string;
        } catch (error) {
            if ((error as Error)?.name === 'AbortError') {
                console.warn(`[Captcha] ⚠️ Timeout on ${server} (${CAPTCHA_TIMEOUT_MS / 1000}s)`);
            } else {
                console.warn(`[Captcha] ⚠️ Failed on ${server}:`, error);
            }
            continue; // Coba server berikutnya
        }
    }

    console.error('[Captcha] ❌ All servers failed');
    return null;
}

export async function getImageCaptchaToken(): Promise<string | null> {
    const maxAttempts = CAPTCHA_SERVERS.length;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const server = getNextServer();
        try {
            console.log(`[ImageCaptcha] 🔄 Attempt ${attempt}/${maxAttempts} → ${server}`);

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), CAPTCHA_TIMEOUT_MS);

            const response = await fetch(`${server}/image-token`, {
                method: 'GET',
                headers: {
                    'X-API-Key': TOKEN_API_KEY,
                    'ngrok-skip-browser-warning': 'true',
                },
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (!response.ok) {
                const errorBody = await response.text().catch(() => '');
                console.warn(`[ImageCaptcha] ⚠️ ${server} returned ${response.status}: ${errorBody}`);
                continue;
            }

            const data = await response.json();
            const token = data.token || data.captchaToken || data.recaptchaToken || data.data?.token;

            if (!token || token.length < 20) {
                console.warn('[ImageCaptcha] ⚠️ Invalid token from', server, JSON.stringify(data));
                continue;
            }

            console.log(`[ImageCaptcha] ✅ Token acquired from ${server}`);
            return token as string;
        } catch (error) {
            if ((error as Error)?.name === 'AbortError') {
                console.warn(`[ImageCaptcha] ⚠️ Timeout on ${server} (${CAPTCHA_TIMEOUT_MS / 1000}s)`);
            } else {
                console.warn(`[ImageCaptcha] ⚠️ Failed on ${server}:`, error);
            }
            continue;
        }
    }

    console.error('[ImageCaptcha] ❌ All servers failed');
    return null;
}
