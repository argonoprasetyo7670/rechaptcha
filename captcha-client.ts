// =====================================================
// CAPTCHA PROVIDER — Round Robin Multi-Server
// API key never exposed to browser (server-side only)
// =====================================================

const TOKEN_API_KEY = process.env.CAPTCHA_API_KEY || 'sk-admin-change-me';

// Daftar server captcha (isi dengan URL ngrok masing-masing RDP)
const CAPTCHA_SERVERS: string[] = (
    process.env.CAPTCHA_SERVERS || 'https://server1.ngrok-free.dev,https://server2.ngrok-free.dev'
).split(',').map(s => s.trim()).filter(Boolean);

const CAPTCHA_TIMEOUT_MS = 120_000; // 120 detik — cukup untuk cold start

let currentServerIndex = 0;

function getNextServer(): string {
    const server = CAPTCHA_SERVERS[currentServerIndex];
    currentServerIndex = (currentServerIndex + 1) % CAPTCHA_SERVERS.length;
    return server;
}

export async function getCaptchaToken(): Promise<string | null> {
    const maxRetries = CAPTCHA_SERVERS.length; // Coba semua server sebelum menyerah

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const server = getNextServer();
        const serverLabel = `[${attempt + 1}/${maxRetries}] ${server}`;

        try {
            console.log(`[Captcha] 🔄 Trying ${serverLabel}`);

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
                console.warn(`[Captcha] ⚠️ ${serverLabel} returned ${response.status}: ${errorBody}`);
                continue; // Coba server berikutnya
            }

            const data = await response.json();
            const token = data.token || data.captchaToken || data.recaptchaToken || data.data?.token;

            if (!token || token.length < 20) {
                console.warn(`[Captcha] ⚠️ Invalid token from ${serverLabel}:`, JSON.stringify(data));
                continue; // Coba server berikutnya
            }

            console.log(`[Captcha] ✅ Token acquired from ${server}`);
            return token as string;
        } catch (error) {
            if ((error as Error)?.name === 'AbortError') {
                console.warn(`[Captcha] ⚠️ Timeout on ${serverLabel} after ${CAPTCHA_TIMEOUT_MS / 1000}s`);
            } else {
                console.warn(`[Captcha] ⚠️ Failed on ${serverLabel}:`, error);
            }
            continue; // Coba server berikutnya
        }
    }

    console.error('[Captcha] ❌ All servers failed');
    return null;
}
