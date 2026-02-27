# reCAPTCHA Token API Service

Generate reCAPTCHA Enterprise tokens via REST API, untuk dipakai aplikasi lain tanpa perlu setup browser sendiri.

## Quick Start

**1. Jalankan server** (butuh Electron):
```bash
npm run server
```

**2. Request token dari app lain:**
```bash
curl -H "X-API-Key: sk-admin-change-me" http://localhost:3000/token
```

---

## Endpoints

### `GET /health`
Status server. No auth required.

```bash
curl http://localhost:3000/health
```
```json
{ "success": true, "status": "ok", "service": "reCAPTCHA Token API" }
```

---

### `GET /token`
Generate **1 token**.

| Header | Required | Description |
|--------|----------|-------------|
| `X-API-Key` | ✅ | API key dari `keys.json` |

```bash
curl -H "X-API-Key: sk-admin-change-me" http://localhost:3000/token
```
```json
{
  "success": true,
  "token": "03AFcWeA...",
  "generatedAt": "2026-02-27T07:00:00Z",
  "rateLimit": { "remaining": 99, "resetIn": 45 }
}
```

---

### `GET /tokens?count=N`
Generate **N token sekaligus** (max 30).

```bash
curl -H "X-API-Key: sk-admin-change-me" "http://localhost:3000/tokens?count=5"
```
```json
{
  "success": true,
  "tokens": ["03AFcWeA...", "03AFcWeB...", "..."],
  "count": 5,
  "generatedAt": "2026-02-27T07:00:00Z"
}
```

---

### `GET /keys` *(admin only)*
List semua API keys.

```bash
curl -H "X-API-Key: sk-admin-change-me" http://localhost:3000/keys
```

---

### `POST /keys` *(admin only)*
Buat API key baru.

```bash
curl -X POST http://localhost:3000/keys \
  -H "X-API-Key: sk-admin-change-me" \
  -H "Content-Type: application/json" \
  -d '{"name": "client-app", "limitPerMinute": 50}'
```
```json
{ "success": true, "key": "sk-xxxxxxxxxxxxxxxx", "name": "client-app" }
```

---

### `DELETE /keys/:key` *(admin only)*
Hapus API key.

```bash
curl -X DELETE http://localhost:3000/keys/sk-app1-change-me \
  -H "X-API-Key: sk-admin-change-me"
```

---

## Error Responses

| Code | Reason |
|------|--------|
| `401` | API key tidak ada / invalid |
| `403` | Key tidak punya akses admin |
| `429` | Rate limit tercapai |
| `500` | Gagal generate token |

```json
{ "success": false, "error": "Invalid API key." }
```

---

## Konfigurasi

### `keys.json` — API Key Store
```json
{
  "keys": {
    "sk-admin-change-me": {
      "name": "admin",
      "isAdmin": true,
      "limitPerMinute": 9999
    },
    "sk-app1-change-me": {
      "name": "app-1",
      "isAdmin": false,
      "limitPerMinute": 100
    }
  }
}
```

> ⚠️ **Ganti key defaults sebelum deploy ke production!**

### Port
Default: `3000`. Override dengan environment variable:
```bash
PORT=8080 npm run server
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run server` | Jalankan token API server (Electron) |
| `node generate.js` | Generate video (butuh server jalan) |
| `node generate.js --total N` | Generate N video paralel |

### `generate.js` Config
Edit bagian ini di `generate.js`:
```javascript
const TOKEN_API_URL = 'http://localhost:3000';  // URL server
const TOKEN_API_KEY = 'sk-admin-change-me';      // API key
const BEARER_TOKEN  = 'ya29.xxx...';             // Google Bearer token
```

### `generate.js` Options
```
-m, --mode    t2v | i2v | i2v-fl | r2v   (default: t2v)
-p, --prompt  Prompt teks
-a, --aspect  portrait | landscape | square
-n, --total   Jumlah video paralel
```
