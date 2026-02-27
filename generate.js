const fs = require('fs');
const path = require('path');

// ============================================
// CONFIG - ISI MANUAL DI SINI
// ============================================
const BEARER_TOKEN = process.env.BEARER_TOKEN || 'YOUR_BEARER_TOKEN_HERE';

// --- reCAPTCHA Token API Server ---
const TOKEN_API_URL = 'http://localhost:3000';  // URL server.js yang lagi jalan
const TOKEN_API_KEY = 'sk-admin-change-me';      // API key dari keys.json

// API Endpoints
const API_ENDPOINTS = {
    T2V: 'https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoText',
    I2V: 'https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoStartImage',
    I2V_FL: 'https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoStartAndEndImage',
    R2V: 'https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoReferenceImages',
    UPLOAD: 'https://aisandbox-pa.googleapis.com/v1:uploadUserImage'
};

// ============================================
// TOKEN — via REST API Server
// ============================================

/**
 * Minta 1 reCAPTCHA token dari API server.
 */
async function getToken() {
    const res = await fetch(`${TOKEN_API_URL}/token`, {
        headers: { 'X-API-Key': TOKEN_API_KEY }
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Token API error ${res.status}: ${err.error || res.statusText}`);
    }
    const data = await res.json();
    return data.token;
}

/**
 * Minta N reCAPTCHA token sekaligus dari API server.
 * @param {number} count
 * @returns {Promise<string[]>}
 */
async function getTokens(count) {
    console.log(`\n🔑 Requesting ${count} token(s) from API server (paralel)...`);
    // Panggil /token sebanyak count kali sekaligus (paralel)
    const results = await Promise.all(
        Array.from({ length: count }, () =>
            fetch(`${TOKEN_API_URL}/token`, {
                headers: { 'X-API-Key': TOKEN_API_KEY }
            }).then(async res => {
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(`Token API error ${res.status}: ${err.error || res.statusText}`);
                }
                return (await res.json()).token;
            })
        )
    );
    console.log(`✅ ${results.length} tokens ready!\n`);
    return results;
}


// ============================================
// HELPER FUNCTIONS
// ============================================

function generateSeed() {
    return Math.floor(Math.random() * 100000);
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function generateSessionId() {
    return `;${Date.now()}`;
}

function getHeaders() {
    return {
        'accept': '*/*',
        'accept-encoding': 'gzip, deflate, br, zstd',
        'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
        'authorization': `Bearer ${BEARER_TOKEN}`,
        'content-type': 'text/plain;charset=UTF-8',
        'origin': 'https://labs.google',
        'referer': 'https://labs.google/',
        'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'cross-site',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
        'x-browser-channel': 'stable',
        'x-browser-copyright': 'Copyright 2025 Google LLC. All Rights reserved.',
        'x-browser-validation': 'AUXUCdutEJ+6gl6bYtz7E2kgIT4=',
        'x-browser-year': '2025',
        'x-client-data': 'CJG2yQEIpLbJAQipncoBCIOXywEIkqHLAQiGoM0BCPyZzwEIk6TPARjvos8B'
    };
}

// ============================================
// IMAGE UPLOAD FUNCTION
// ============================================

/**
 * Upload image to get mediaId for I2V
 * @param {string} imagePath - Path to image file
 * @param {string} aspectRatio - IMAGE_ASPECT_RATIO_PORTRAIT | IMAGE_ASPECT_RATIO_LANDSCAPE | IMAGE_ASPECT_RATIO_SQUARE
 * @returns {Promise<{success: boolean, mediaId?: string, error?: string}>}
 */
async function uploadImage(imagePath, aspectRatio = 'IMAGE_ASPECT_RATIO_PORTRAIT') {
    console.log(`\n📤 Uploading image: ${imagePath}`);

    let imageBase64;
    let mimeType = 'image/jpeg';

    try {
        const imageBuffer = fs.readFileSync(imagePath);
        imageBase64 = imageBuffer.toString('base64');

        const ext = path.extname(imagePath).toLowerCase();
        if (ext === '.png') mimeType = 'image/png';
        else if (ext === '.webp') mimeType = 'image/webp';
        else if (ext === '.gif') mimeType = 'image/gif';

        console.log(`   📁 Size: ${(imageBuffer.length / 1024).toFixed(2)} KB`);
        console.log(`   📷 Type: ${mimeType}`);
    } catch (error) {
        console.log(`❌ Gagal baca file: ${error.message}`);
        return { success: false, error: error.message };
    }

    const payload = {
        imageInput: {
            rawImageBytes: imageBase64,
            mimeType: mimeType,
            isUserUploaded: true,
            aspectRatio: aspectRatio
        },
        clientContext: {
            sessionId: generateSessionId(),
            tool: 'ASSET_MANAGER'
        }
    };

    try {
        const response = await fetch(API_ENDPOINTS.UPLOAD, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });

        const responseText = await response.text();
        let responseData;
        try {
            responseData = JSON.parse(responseText);
        } catch {
            responseData = responseText;
        }

        console.log(`📥 Upload Status: ${response.status} ${response.statusText}`);

        const mediaId = responseData.mediaId || responseData.mediaGenerationId?.mediaGenerationId;

        if (response.ok && mediaId) {
            console.log(`✅ Upload berhasil! MediaId: ${mediaId}`);
            if (responseData.width && responseData.height) {
                console.log(`   📐 Dimensions: ${responseData.width}x${responseData.height}`);
            }
            return { success: true, mediaId: mediaId };
        } else {
            console.log('❌ Upload gagal:', JSON.stringify(responseData, null, 2));
            return { success: false, error: responseData.error?.message || 'Upload failed' };
        }

    } catch (error) {
        console.log('❌ Error upload:', error.message);
        return { success: false, error: error.message };
    }
}

// ============================================
// TEXT-TO-VIDEO FUNCTION
// ============================================

async function generateTextToVideo(options = {}) {
    const {
        prompt = 'a cute cat playing',
        aspectRatio = 'VIDEO_ASPECT_RATIO_PORTRAIT',
        videoModelKey = 'veo_3_1_t2v_fast_portrait_ultra_relaxed',
        count = 1,
        prompts = null,
        token = null   // opsional: token pre-generated dari batch runner
    } = options;

    // Pakai token dari luar (batch mode) atau auto-generate
    const recaptchaToken = token || await getToken();

    console.log(`\n🎬 Text-to-Video Generator`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📝 Prompt: ${prompt}`);
    console.log(`📐 Aspect Ratio: ${aspectRatio}`);
    console.log(`🎯 Model: ${videoModelKey}`);
    console.log(`🔢 Count: ${count}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    let requests = [];
    if (Array.isArray(prompts) && prompts.length > 0) {
        requests = prompts.map(p => ({
            aspectRatio: aspectRatio,
            seed: generateSeed(),
            textInput: { prompt: p },
            metadata: { sceneId: generateUUID() },
            videoModelKey: videoModelKey
        }));
    } else {
        for (let i = 0; i < count; i++) {
            requests.push({
                aspectRatio: aspectRatio,
                seed: generateSeed(),
                textInput: { prompt: prompt },
                metadata: { sceneId: generateUUID() },
                videoModelKey: videoModelKey
            });
        }
    }

    const payload = {
        clientContext: {
            recaptchaContext: {
                applicationType: 'RECAPTCHA_APPLICATION_TYPE_WEB',
                token: recaptchaToken
            },
            sessionId: generateSessionId(),
            tool: 'PINHOLE',
            userPaygateTier: 'PAYGATE_TIER_TWO'
        },
        requests: requests
    };

    console.log('\n📤 Sending T2V request...\n');

    try {
        const response = await fetch(API_ENDPOINTS.T2V, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });

        const responseText = await response.text();
        console.log(`📥 Response Status: ${response.status} ${response.statusText}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        let responseData;
        try {
            responseData = JSON.parse(responseText);
            console.log('📄 Response:', JSON.stringify(responseData, null, 2));
        } catch {
            console.log('📄 Response (raw):', responseText);
            responseData = responseText;
        }

        if (response.ok) {
            console.log('\n✅ Request successful!');
            console.log('🎉 Video generation started!');
        } else {
            console.log('\n❌ Request failed!');
            if (responseData.error) {
                console.log(`   Code: ${responseData.error.code}`);
                console.log(`   Message: ${responseData.error.message}`);
            }
        }

        return { success: response.ok, status: response.status, data: responseData };

    } catch (error) {
        console.log('❌ Error:', error.message);
        return { success: false, error: error.message };
    }
}

// ============================================
// IMAGE-TO-VIDEO FUNCTION
// ============================================

async function generateImageToVideo(options = {}) {
    const {
        imagePath = null,
        mediaId = null,
        prompt = 'make the subject move naturally',
        aspectRatio = 'VIDEO_ASPECT_RATIO_PORTRAIT',
        videoModelKey = 'veo_3_1_i2v_s_fast_portrait_ultra_relaxed',
        count = 1,
        token = null
    } = options;

    const recaptchaToken = token || await getToken();

    let finalMediaId = mediaId;

    if (!finalMediaId && imagePath) {
        let imageAspectRatio = 'IMAGE_ASPECT_RATIO_PORTRAIT';
        if (aspectRatio === 'VIDEO_ASPECT_RATIO_LANDSCAPE') imageAspectRatio = 'IMAGE_ASPECT_RATIO_LANDSCAPE';
        else if (aspectRatio === 'VIDEO_ASPECT_RATIO_SQUARE') imageAspectRatio = 'IMAGE_ASPECT_RATIO_SQUARE';

        const uploadResult = await uploadImage(imagePath, imageAspectRatio);
        if (!uploadResult.success) return uploadResult;
        finalMediaId = uploadResult.mediaId;
    }

    if (!finalMediaId) {
        console.log('❌ Butuh imagePath atau mediaId!');
        return { success: false, error: 'Butuh imagePath atau mediaId' };
    }

    console.log(`\n🖼️ Image-to-Video Generator`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🆔 MediaId: ${finalMediaId}`);
    console.log(`📝 Prompt: ${prompt}`);
    console.log(`📐 Aspect Ratio: ${aspectRatio}`);
    console.log(`🎯 Model: ${videoModelKey}`);
    console.log(`🔢 Count: ${count}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const requests = [];
    for (let i = 0; i < count; i++) {
        requests.push({
            aspectRatio: aspectRatio,
            seed: generateSeed(),
            textInput: { prompt: prompt },
            videoModelKey: videoModelKey,
            startImage: { mediaId: finalMediaId },
            metadata: { sceneId: generateUUID() }
        });
    }

    const payload = {
        clientContext: {
            recaptchaContext: {
                token: recaptchaToken,
                applicationType: 'RECAPTCHA_APPLICATION_TYPE_WEB'
            },
            sessionId: generateSessionId(),
            tool: 'PINHOLE',
            userPaygateTier: 'PAYGATE_TIER_TWO'
        },
        requests: requests
    };

    console.log('\n📤 Sending I2V request...\n');

    try {
        const response = await fetch(API_ENDPOINTS.I2V, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });

        const responseText = await response.text();
        console.log(`📥 Response Status: ${response.status} ${response.statusText}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        let responseData;
        try {
            responseData = JSON.parse(responseText);
            console.log('📄 Response:', JSON.stringify(responseData, null, 2));
        } catch {
            console.log('📄 Response (raw):', responseText);
            responseData = responseText;
        }

        if (response.ok) {
            console.log('\n✅ Request successful!');
            console.log('🎉 I2V generation started!');
        } else {
            console.log('\n❌ Request failed!');
            if (responseData.error) {
                console.log(`   Code: ${responseData.error.code}`);
                console.log(`   Message: ${responseData.error.message}`);
            }
        }

        return { success: response.ok, status: response.status, data: responseData };

    } catch (error) {
        console.log('❌ Error:', error.message);
        return { success: false, error: error.message };
    }
}

// ============================================
// IMAGE-TO-VIDEO FIRST/LAST FRAME (I2V-FL) FUNCTION
// ============================================

async function generateI2VFirstLastFrame(options = {}) {
    const {
        startImagePath = null,
        endImagePath = null,
        startMediaId = null,
        endMediaId = null,
        prompt = 'smooth transition between frames',
        aspectRatio = 'VIDEO_ASPECT_RATIO_PORTRAIT',
        videoModelKey = 'veo_3_1_i2v_s_fast_portrait_fl_ultra_relaxed',
        count = 1,
        token = null
    } = options;

    const recaptchaToken = token || await getToken();

    let imageAspectRatio = 'IMAGE_ASPECT_RATIO_PORTRAIT';
    if (aspectRatio === 'VIDEO_ASPECT_RATIO_LANDSCAPE') imageAspectRatio = 'IMAGE_ASPECT_RATIO_LANDSCAPE';
    else if (aspectRatio === 'VIDEO_ASPECT_RATIO_SQUARE') imageAspectRatio = 'IMAGE_ASPECT_RATIO_SQUARE';

    let finalStartMediaId = startMediaId;
    if (!finalStartMediaId && startImagePath) {
        console.log('\n🖼️ Uploading START frame...');
        const uploadResult = await uploadImage(startImagePath, imageAspectRatio);
        if (!uploadResult.success) return uploadResult;
        finalStartMediaId = uploadResult.mediaId;
    }

    let finalEndMediaId = endMediaId;
    if (!finalEndMediaId && endImagePath) {
        console.log('\n🖼️ Uploading END frame...');
        const uploadResult = await uploadImage(endImagePath, imageAspectRatio);
        if (!uploadResult.success) return uploadResult;
        finalEndMediaId = uploadResult.mediaId;
    }

    if (!finalStartMediaId || !finalEndMediaId) {
        console.log('❌ Butuh start dan end image!');
        return { success: false, error: 'Butuh startImagePath/startMediaId dan endImagePath/endMediaId' };
    }

    console.log(`\n🎞️ Image-to-Video First/Last Frame (I2V-FL)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🏁 Start MediaId: ${finalStartMediaId.substring(0, 30)}...`);
    console.log(`🏁 End MediaId: ${finalEndMediaId.substring(0, 30)}...`);
    console.log(`📝 Prompt: ${prompt}`);
    console.log(`📐 Aspect Ratio: ${aspectRatio}`);
    console.log(`🎯 Model: ${videoModelKey}`);
    console.log(`🔢 Count: ${count}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const requests = [];
    for (let i = 0; i < count; i++) {
        requests.push({
            aspectRatio: aspectRatio,
            seed: generateSeed(),
            textInput: { prompt: prompt },
            videoModelKey: videoModelKey,
            startImage: { mediaId: finalStartMediaId },
            endImage: { mediaId: finalEndMediaId },
            metadata: { sceneId: generateUUID() }
        });
    }

    const payload = {
        clientContext: {
            recaptchaContext: {
                token: recaptchaToken,
                applicationType: 'RECAPTCHA_APPLICATION_TYPE_WEB'
            },
            sessionId: generateSessionId(),
            tool: 'PINHOLE',
            userPaygateTier: 'PAYGATE_TIER_TWO'
        },
        requests: requests
    };

    console.log('\n📤 Sending I2V-FL request...\n');

    try {
        const response = await fetch(API_ENDPOINTS.I2V_FL, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });

        const responseText = await response.text();
        console.log(`📥 Response Status: ${response.status} ${response.statusText}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        let responseData;
        try {
            responseData = JSON.parse(responseText);
            console.log('📄 Response:', JSON.stringify(responseData, null, 2));
        } catch {
            console.log('📄 Response (raw):', responseText);
            responseData = responseText;
        }

        if (response.ok) {
            console.log('\n✅ Request successful!');
            console.log('🎉 I2V-FL generation started!');
        } else {
            console.log('\n❌ Request failed!');
            if (responseData.error) {
                console.log(`   Code: ${responseData.error.code}`);
                console.log(`   Message: ${responseData.error.message}`);
            }
        }

        return { success: response.ok, status: response.status, data: responseData };

    } catch (error) {
        console.log('❌ Error:', error.message);
        return { success: false, error: error.message };
    }
}

// ============================================
// REFERENCE-TO-VIDEO (R2V) FUNCTION
// ============================================

async function generateReferenceToVideo(options = {}) {
    const {
        imagePaths = [],
        mediaIds = [],
        prompt = 'create animation from these reference images',
        aspectRatio = 'VIDEO_ASPECT_RATIO_PORTRAIT',
        videoModelKey = 'veo_3_1_r2v_fast_portrait_ultra_relaxed',
        count = 1,
        token = null
    } = options;

    const recaptchaToken = token || await getToken();

    let imageAspectRatio = 'IMAGE_ASPECT_RATIO_PORTRAIT';
    if (aspectRatio === 'VIDEO_ASPECT_RATIO_LANDSCAPE') imageAspectRatio = 'IMAGE_ASPECT_RATIO_LANDSCAPE';
    else if (aspectRatio === 'VIDEO_ASPECT_RATIO_SQUARE') imageAspectRatio = 'IMAGE_ASPECT_RATIO_SQUARE';

    let finalMediaIds = [...mediaIds];

    for (let i = 0; i < imagePaths.length && finalMediaIds.length < 3; i++) {
        console.log(`\n🖼️ Uploading reference image ${finalMediaIds.length + 1}...`);
        const uploadResult = await uploadImage(imagePaths[i], imageAspectRatio);
        if (!uploadResult.success) return uploadResult;
        finalMediaIds.push(uploadResult.mediaId);
    }

    if (finalMediaIds.length === 0) {
        console.log('❌ Butuh minimal 1 gambar referensi!');
        return { success: false, error: 'Butuh imagePaths atau mediaIds (max 3)' };
    }

    if (finalMediaIds.length > 3) {
        console.log('⚠️ Maximum 3 gambar, menggunakan 3 gambar pertama saja');
        finalMediaIds = finalMediaIds.slice(0, 3);
    }

    console.log(`\n🎞️ Reference-to-Video Generator (R2V)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📷 Reference Images: ${finalMediaIds.length}`);
    finalMediaIds.forEach((id, i) => {
        console.log(`   ${i + 1}. ${id.substring(0, 40)}...`);
    });
    console.log(`📝 Prompt: ${prompt}`);
    console.log(`📐 Aspect Ratio: ${aspectRatio}`);
    console.log(`🎯 Model: ${videoModelKey}`);
    console.log(`🔢 Count: ${count}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const referenceImages = finalMediaIds.map(id => ({
        imageUsageType: 'IMAGE_USAGE_TYPE_ASSET',
        mediaId: id
    }));

    const requests = [];
    for (let i = 0; i < count; i++) {
        requests.push({
            aspectRatio: aspectRatio,
            seed: generateSeed(),
            textInput: { prompt: prompt },
            videoModelKey: videoModelKey,
            referenceImages: referenceImages,
            metadata: { sceneId: generateUUID() }
        });
    }

    const payload = {
        clientContext: {
            recaptchaContext: {
                token: recaptchaToken,
                applicationType: 'RECAPTCHA_APPLICATION_TYPE_WEB'
            },
            sessionId: generateSessionId(),
            tool: 'PINHOLE',
            userPaygateTier: 'PAYGATE_TIER_TWO'
        },
        requests: requests
    };

    console.log('\n📤 Sending R2V request...\n');

    try {
        const response = await fetch(API_ENDPOINTS.R2V, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });

        const responseText = await response.text();
        console.log(`📥 Response Status: ${response.status} ${response.statusText}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        let responseData;
        try {
            responseData = JSON.parse(responseText);
            console.log('📄 Response:', JSON.stringify(responseData, null, 2));
        } catch {
            console.log('📄 Response (raw):', responseText);
            responseData = responseText;
        }

        if (response.ok) {
            console.log('\n✅ Request successful!');
            console.log('🎉 R2V generation started!');
        } else {
            console.log('\n❌ Request failed!');
            if (responseData.error) {
                console.log(`   Code: ${responseData.error.code}`);
                console.log(`   Message: ${responseData.error.message}`);
            }
        }

        return { success: response.ok, status: response.status, data: responseData };

    } catch (error) {
        console.log('❌ Error:', error.message);
        return { success: false, error: error.message };
    }
}

// ============================================
// CLI INTERFACE
// ============================================

async function main() {
    const args = process.argv.slice(2);

    let mode = 't2v';
    let prompt = 'a cute cat playing';
    let aspectRatio = 'VIDEO_ASPECT_RATIO_PORTRAIT';
    let count = 1;
    let total = 1;  // jumlah request paralel
    let prompts = null;
    let imagePath = null;
    let mediaId = null;
    let startImagePath = null;
    let endImagePath = null;
    let startMediaId = null;
    let endMediaId = null;
    let refImages = [];

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--mode' || args[i] === '-m') {
            mode = args[++i]?.toLowerCase();
        } else if (args[i] === '--prompt' || args[i] === '-p') {
            prompt = args[++i];
        } else if (args[i] === '--prompts') {
            prompts = args[++i].split(',').map(s => s.trim());
        } else if (args[i] === '--aspect' || args[i] === '-a') {
            const aspect = args[++i]?.toLowerCase();
            if (aspect === 'portrait') aspectRatio = 'VIDEO_ASPECT_RATIO_PORTRAIT';
            else if (aspect === 'landscape') aspectRatio = 'VIDEO_ASPECT_RATIO_LANDSCAPE';
            else if (aspect === 'square') aspectRatio = 'VIDEO_ASPECT_RATIO_SQUARE';
        } else if (args[i] === '--count' || args[i] === '-c') {
            count = Math.min(2, Math.max(1, parseInt(args[++i]) || 1));
        } else if (args[i] === '--total' || args[i] === '-n') {
            total = Math.max(1, parseInt(args[++i]) || 1);
        } else if (args[i] === '--image' || args[i] === '-i') {
            imagePath = args[++i];
        } else if (args[i] === '--media-id') {
            mediaId = args[++i];
        } else if (args[i] === '--start-image') {
            startImagePath = args[++i];
        } else if (args[i] === '--end-image') {
            endImagePath = args[++i];
        } else if (args[i] === '--start-media-id') {
            startMediaId = args[++i];
        } else if (args[i] === '--end-media-id') {
            endMediaId = args[++i];
        } else if (args[i] === '--ref-images') {
            refImages = args[++i].split(',').map(s => s.trim());
        } else if (args[i] === '--help' || args[i] === '-h') {
            console.log(`
🎬 Video Generator (T2V, I2V, I2V-FL & R2V) - Auto reCAPTCHA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
reCAPTCHA token di-generate OTOMATIS sebelum setiap request.
Hanya perlu isi BEARER_TOKEN di bagian CONFIG.

Usage:
  npx electron generate.js [options]

Modes:
  t2v    - Text-to-Video (default)
  i2v    - Image-to-Video (1 gambar)
  i2v-fl - I2V First/Last Frame (start + end frame)
  r2v    - Reference-to-Video (1-3 gambar referensi)

Options:
  -m, --mode <type>       Mode: t2v, i2v, i2v-fl, atau r2v (default: t2v)
  -p, --prompt <text>     Video prompt
  --prompts <a,b,c,d>     Multiple prompts, comma separated (T2V only)
  -a, --aspect <type>     Aspect ratio: portrait, landscape, square (default: portrait)
  -c, --count <num>       Number of videos 1-2 (default: 1)
  -i, --image <path>      Image path for I2V mode
  --media-id <id>         Use existing mediaId for I2V
  --start-image <path>    Start frame image path (I2V-FL)
  --end-image <path>      End frame image path (I2V-FL)
  --start-media-id <id>   Start frame mediaId (I2V-FL, skip upload)
  --end-media-id <id>     End frame mediaId (I2V-FL, skip upload)
  --ref-images <a,b,c>    Comma-separated image paths for R2V (max 3)
  -h, --help              Show this help

Examples:
  npx electron generate.js -m t2v -p "a dancing robot"
  npx electron generate.js -m i2v -i ./photo.jpg -p "make the model walk"
  npx electron generate.js -m i2v-fl --start-image ./start.jpg --end-image ./end.jpg
  npx electron generate.js -m r2v --ref-images "./img1.jpg,./img2.jpg" -p "animate these"
`);
            process.exit(0);
            return;
        } else if (!args[i].startsWith('-')) {
            prompt = args[i];
        }
    }

    // ─── BATCH PARALLEL MODE ─────────────────────────────────────
    if (total > 1) {
        console.log(`
🚀 BATCH MODE: ${total} requests paralel`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        // 1. Minta semua token sekaligus dari API server
        const tokens = await getTokens(total);
        console.log(`🚀 Firing ${total} requests in parallel...
`);

        // 2. Build satu set options dasar
        const baseOptions = {
            prompt, aspectRatio, count, prompts, imagePath, mediaId,
            startImagePath, endImagePath, startMediaId, endMediaId, refImages
        };

        // 3. Fire semua request sekaligus (Promise.all)
        const jobs = tokens.map((token, i) => {
            const jobNum = i + 1;
            const opts = { ...baseOptions, token };
            console.log(`🚀 [${jobNum}/${total}] Firing request...`);

            if (mode === 'r2v') return generateReferenceToVideo({ imagePaths: refImages, ...opts });
            if (mode === 'i2v-fl') return generateI2VFirstLastFrame(opts);
            if (mode === 'i2v') return generateImageToVideo(opts);
            return generateTextToVideo(opts);
        });

        const results = await Promise.all(jobs);
        const ok = results.filter(r => r.success).length;
        console.log(`
🏁 BATCH DONE: ${ok}/${total} berhasil`);

    } else {
        // ─── SINGLE MODE ─────────────────────────────────────────────
        if (mode === 'r2v') {
            await generateReferenceToVideo({ imagePaths: refImages, prompt, aspectRatio, count });
        } else if (mode === 'i2v-fl') {
            await generateI2VFirstLastFrame({ startImagePath, endImagePath, startMediaId, endMediaId, prompt, aspectRatio, count });
        } else if (mode === 'i2v') {
            await generateImageToVideo({ imagePath, mediaId, prompt, aspectRatio, count });
        } else {
            if (!process.argv.slice(2).length) {
                prompts = ['ayam', 'kambing', 'kucing', 'kuda'];
            }
            await generateTextToVideo({ prompt, aspectRatio, count, prompts });
        }
    }

    console.log('\n✅ Done!');
}

// Run langsung sebagai Node script (tidak perlu Electron lagi)
main().catch((err) => {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
});

// Export for use as module
module.exports = { generateTextToVideo, generateImageToVideo, generateI2VFirstLastFrame, generateReferenceToVideo, uploadImage };
