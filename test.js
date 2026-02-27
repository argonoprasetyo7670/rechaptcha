/**
 * test.js — Test script untuk verify token generation
 * Panggil HTTP endpoint yang dijalankan oleh main.js
 *
 * Cara pakai:
 *   1. Jalankan dulu:  npx electron main.js
 *   2. Di terminal lain: node test.js
 */

const http = require('http');

function requestToken() {
    return new Promise((resolve, reject) => {
        const req = http.get('http://localhost:3000/token', (res) => {
            let data = '';
            res.on('data', chunk => (data += chunk));
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    reject(new Error('Invalid JSON response'));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(60000, () => {
            req.destroy();
            reject(new Error('Request timeout (60s)'));
        });
    });
}

async function main() {
    console.log('Meminta reCAPTCHA token dari server...\n');

    try {
        const result = await requestToken();

        if (result.success) {
            console.log('✅ Token berhasil digenerate!');
            console.log('Token (50 char pertama):', result.token.substring(0, 50) + '...');
            console.log('Panjang token:', result.token.length, 'karakter');
        } else {
            console.error('❌ Gagal generate token:', result.error);
        }
    } catch (err) {
        console.error('❌ Error:', err.message);
        console.log('\nPastikan server sudah berjalan: npx electron main.js');
    }
}

main();
