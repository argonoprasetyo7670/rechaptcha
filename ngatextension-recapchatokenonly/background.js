/**
 * Background Service Worker
 * Simple reCAPTCHA Token Generator for Google Flow
 */

const CONFIG = {
    RECAPTCHA_SITEKEY: '6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV',
    RECAPTCHA_ACTION: 'VIDEO_GENERATION',
    LABS_URL: 'https://labs.google/fx/tools/flow'
};

console.log('[NGAT-RECAPTCHA] Background loaded');

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GENERATE_TOKEN') {
        generateToken()
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep channel open for async response
    }
    return false;
});

// Generate reCAPTCHA token
async function generateToken() {
    console.log('[NGAT-RECAPTCHA] Generating token...');

    try {
        // Find labs.google tab
        let tabs = await chrome.tabs.query({ url: 'https://labs.google/*' });
        let createdNewTab = false;
        let tabId;

        if (tabs.length === 0) {
            // Create new tab
            console.log('[NGAT-RECAPTCHA] Creating labs.google tab...');
            const newTab = await chrome.tabs.create({
                url: CONFIG.LABS_URL,
                active: false
            });
            tabId = newTab.id;
            createdNewTab = true;

            // Wait for page load
            await new Promise((resolve) => {
                const listener = (id, info) => {
                    if (id === tabId && info.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);
                        resolve();
                    }
                };
                chrome.tabs.onUpdated.addListener(listener);
                setTimeout(resolve, 30000); // Timeout 30s
            });

            // Extra wait for page scripts to load
            await new Promise(r => setTimeout(r, 3000));
        } else {
            tabId = tabs[0].id;
        }

        // Execute reCAPTCHA in page context
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: executeRecaptcha,
            args: [CONFIG.RECAPTCHA_SITEKEY, CONFIG.RECAPTCHA_ACTION]
        });

        // Close tab if we created it
        if (createdNewTab) {
            try {
                await chrome.tabs.remove(tabId);
            } catch (e) { }
        }

        if (results && results[0] && results[0].result) {
            return results[0].result;
        }

        return { success: false, error: 'No result from script' };

    } catch (error) {
        console.error('[NGAT-RECAPTCHA] Error:', error);
        return { success: false, error: error.message };
    }
}

// Function to execute reCAPTCHA in page context
function executeRecaptcha(sitekey, action) {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            resolve({ success: false, error: 'Timeout - reCAPTCHA not responding' });
        }, 30000);

        const execute = () => {
            if (typeof grecaptcha !== 'undefined' && grecaptcha.enterprise) {
                grecaptcha.enterprise.ready(() => {
                    grecaptcha.enterprise.execute(sitekey, { action })
                        .then(token => {
                            clearTimeout(timeout);
                            resolve({ success: true, token });
                        })
                        .catch(err => {
                            clearTimeout(timeout);
                            resolve({ success: false, error: err.message });
                        });
                });
            } else {
                // Load reCAPTCHA script if not available
                const script = document.createElement('script');
                script.src = `https://www.google.com/recaptcha/enterprise.js?render=${sitekey}`;
                script.onload = () => {
                    setTimeout(() => {
                        if (typeof grecaptcha !== 'undefined' && grecaptcha.enterprise) {
                            grecaptcha.enterprise.ready(() => {
                                grecaptcha.enterprise.execute(sitekey, { action })
                                    .then(token => {
                                        clearTimeout(timeout);
                                        resolve({ success: true, token });
                                    })
                                    .catch(err => {
                                        clearTimeout(timeout);
                                        resolve({ success: false, error: err.message });
                                    });
                            });
                        } else {
                            clearTimeout(timeout);
                            resolve({ success: false, error: 'grecaptcha not available after load' });
                        }
                    }, 2000);
                };
                script.onerror = () => {
                    clearTimeout(timeout);
                    resolve({ success: false, error: 'Failed to load reCAPTCHA script' });
                };
                document.head.appendChild(script);
            }
        };

        setTimeout(execute, 300);
    });
}
