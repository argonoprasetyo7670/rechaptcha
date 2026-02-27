// Popup Script - Simple reCAPTCHA Token Generator

const generateBtn = document.getElementById('generateBtn');
const btnText = document.getElementById('btnText');
const result = document.getElementById('result');
const resultIcon = document.getElementById('resultIcon');
const resultTitle = document.getElementById('resultTitle');
const resultContent = document.getElementById('resultContent');

let currentToken = null;

// Generate button click
generateBtn.addEventListener('click', async () => {
    // Show loading state
    generateBtn.disabled = true;
    generateBtn.classList.add('loading');
    btnText.innerHTML = '<div class="spinner"></div>';
    result.className = 'result';

    try {
        // Send message to background script
        const response = await chrome.runtime.sendMessage({ type: 'GENERATE_TOKEN' });

        if (response.success && response.token) {
            showSuccess(response.token);
        } else {
            showError(response.error || 'Failed to generate token');
        }
    } catch (error) {
        showError(error.message || 'Extension error');
    }

    // Reset button
    generateBtn.disabled = false;
    generateBtn.classList.remove('loading');
    btnText.textContent = 'Generate Token';
});

function showSuccess(token) {
    currentToken = token;
    result.className = 'result show success';
    resultIcon.textContent = '✅';
    resultTitle.textContent = 'Token Generated!';
    resultContent.innerHTML = `
        <div class="token-box">${token}</div>
        <button class="btn-copy" id="copyBtn">📋 Copy Token</button>
    `;

    // Add copy functionality
    document.getElementById('copyBtn').addEventListener('click', copyToken);
}

function showError(message) {
    currentToken = null;
    result.className = 'result show error';
    resultIcon.textContent = '❌';
    resultTitle.textContent = 'Error';
    resultContent.innerHTML = `<p class="error-msg">${message}</p>`;
}

async function copyToken() {
    if (!currentToken) return;

    const copyBtn = document.getElementById('copyBtn');

    try {
        await navigator.clipboard.writeText(currentToken);
        copyBtn.textContent = '✅ Copied!';
        copyBtn.style.background = 'rgba(16, 185, 129, 0.4)';
    } catch (e) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = currentToken;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        copyBtn.textContent = '✅ Copied!';
        copyBtn.style.background = 'rgba(16, 185, 129, 0.4)';
    }

    setTimeout(() => {
        copyBtn.textContent = '📋 Copy Token';
        copyBtn.style.background = '';
    }, 2000);
}
