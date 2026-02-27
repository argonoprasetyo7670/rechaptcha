# Deploy di Windows RDP

## Prasyarat
- Windows RDP yang sudah aktif (bisa connect via Remote Desktop)
- Koneksi internet

---

## Step 1: Install Node.js

1. Buka browser di RDP, pergi ke: https://nodejs.org
2. Download **LTS version** (Windows Installer .msi)
3. Jalankan installer, klik Next-Next sampai selesai
4. Buka **Command Prompt** atau **PowerShell**, verifikasi:
   ```powershell
   node --version
   npm --version
   ```

---

## Step 2: Install Git

1. Download Git dari: https://git-scm.com/download/win
2. Install dengan setting default (Next-Next)
3. Verifikasi:
   ```powershell
   git --version
   ```

---

## Step 3: Clone Project

```powershell
cd C:\Users\%USERNAME%\Desktop
git clone https://github.com/argonoprasetyo7670/rechaptcha.git
cd rechaptcha
npm install
```

---

## Step 4: Set Bearer Token

Buat file `.env` di folder project:
```powershell
echo BEARER_TOKEN=ya29.xxxxx_token_kamu_disini > .env
```

Atau buat manual: buat file bernama `.env` (tanpa nama, hanya extension) di folder `rechaptcha/` dengan isi:
```
BEARER_TOKEN=ya29.xxxxx_token_kamu_disini
```

---

## Step 5: Jalankan Server

**Gunakan `start.bat` (recommended)** — server auto-restart setiap 5 token untuk fresh session:
```powershell
cd C:\Users\%USERNAME%\Desktop\rechaptcha
start.bat
```

Atau cara lama (tanpa auto-restart):
```powershell
npm run server
```

Kalau sukses, akan muncul:
```
🚀 reCAPTCHA Token API running at http://localhost:3000
```

> **Note:** Dengan `start.bat`, server otomatis restart setiap 5 token untuk menghindari reCAPTCHA detection.

---

## Step 6: Test

Buka browser di RDP atau Command Prompt baru:
```powershell
curl http://localhost:3000/health
```

Atau buka: `http://localhost:3000/health` di browser.

---

## Step 7: Akses dari Luar (Opsional)

Kalau mau akses API dari luar RDP:

### Buka Port di Windows Firewall
```powershell
netsh advfirewall firewall add rule name="Recaptcha API" dir=in action=allow protocol=TCP localport=3000
```

### Akses dari device lain
```
http://IP_RDP_KAMU:3000/token
```

---

## Auto-Start Setelah Reboot (Opsional)

### Cara 1: Startup Folder (Simple)

1. Tekan `Win + R`, ketik `shell:startup`, Enter
2. Buat file `start-recaptcha.bat` di folder yang terbuka:
   ```bat
   @echo off
   cd /d C:\Users\%USERNAME%\Desktop\rechaptcha
   npm run server
   ```

### Cara 2: Task Scheduler (Lebih Reliable)

1. Buka **Task Scheduler** (cari di Start Menu)
2. Klik **Create Basic Task**
3. Name: `Recaptcha Server`
4. Trigger: **When the computer starts**
5. Action: **Start a program**
   - Program: `cmd.exe`
   - Arguments: `/c cd /d C:\Users\%USERNAME%\Desktop\rechaptcha && npm run server`
6. Centang **Open Properties** → checklist **Run whether user is logged on or not**

---

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| `electron: not found` | Jalankan `npm install` ulang |
| Port 3000 sudah dipakai | Jalankan dengan `set PORT=8080 && npm run server` |
| Token generation gagal | Pastikan ada internet dan tidak di-block firewall corporate |
| Server mati saat disconnect RDP | Pakai Task Scheduler (Cara 2 di atas), atau **Disconnect** RDP jangan **Sign Out** |
