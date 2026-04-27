const serverUrlInput = document.getElementById('serverUrl');
const modelSelect = document.getElementById('modelSelect');
const refreshModelsBtn = document.getElementById('refreshModelsBtn');
const languageSelect = document.getElementById('languageSelect');
const customLanguageInput = document.getElementById('customLanguageInput');
const summaryBtn = document.getElementById('summaryBtn');
const newChatBtn = document.getElementById('newChatBtn');
const debugBtn = document.getElementById('debugBtn');
const chatBox = document.getElementById('chatBox');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const debugModal = document.getElementById('debugModal');
const debugTextarea = document.getElementById('debugTextarea');
const closeDebugBtn = document.getElementById('closeDebugBtn');

let conversationHistory = [];
let isContextLoaded = false;
let isGenerating = false;

document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['serverUrl', 'savedModel', 'responseLanguage', 'customLanguage'], async (result) => {
        serverUrlInput.value = result.serverUrl || 'http://127.0.0.1:8080';
        languageSelect.value = result.responseLanguage || (languageSelect.options[0] && languageSelect.options[0].value);
        customLanguageInput.value = result.customLanguage || '';
        updateCustomLanguageVisibility();
        await fetchModels(result.savedModel);
    });
});

serverUrlInput.addEventListener('change', () => {
    chrome.storage.local.set({ serverUrl: serverUrlInput.value.trim() });
    fetchModels();
});
  modelSelect.addEventListener('change', () => {
    chrome.storage.local.set({ savedModel: modelSelect.value });
});
refreshModelsBtn.addEventListener('click', () => fetchModels());
languageSelect.addEventListener('change', () => {
    chrome.storage.local.set({ responseLanguage: languageSelect.value });
    updateCustomLanguageVisibility();
});
customLanguageInput.addEventListener('change', () => {
    chrome.storage.local.set({ customLanguage: customLanguageInput.value.trim() });
});

function updateCustomLanguageVisibility() {
    customLanguageInput.style.display = languageSelect.value === 'Custom' ? 'block' : 'none';
}

function getResponseLanguage() {
    if (languageSelect.value === 'Custom') {
        return customLanguageInput.value.trim();
    }
    return languageSelect.value;
}

async function fetchModels(savedModelToSelect = null) {
    const url = serverUrlInput.value.trim();
    if (!url) return;
    modelSelect.innerHTML = '<option value="">Loading...</option>';
    try {
        const response = await fetch(`${url}/v1/models`);
        if (!response.ok) throw new Error('Server error');
        const data = await response.json();
        modelSelect.innerHTML = '';
        if (data.data && data.data.length > 0) {
            data.data.forEach(model => {
                const option = document.createElement('option');
                option.value = model.id; option.textContent = model.id;
                modelSelect.appendChild(option);
            });
            chrome.storage.local.get(['savedModel'], function(res) {
                const modelToSet = savedModelToSelect || res.savedModel;
                if (modelToSet && Array.from(modelSelect.options).some(o => o.value === modelToSet)) {
                    modelSelect.value = modelToSet;
                } else {
                    chrome.storage.local.set({ savedModel: modelSelect.value });
                }
            });
        } else modelSelect.innerHTML = '<option value="">No models found</option>';
    } catch (e) {
        modelSelect.innerHTML = '<option value="">Server unavailable</option>';
    }
}

async function extractCleanText() {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
        throw new Error("Cannot read system page.");
    }

    let injectionResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: () => {
            let junkSelectors = ['nav', 'header', 'footer', 'aside', 'script', 'style', 'noscript', 'svg', 'form', 'button', 'iframe', 'canvas', 'dialog', '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[role="complementary"]'];
            let junkElements = document.querySelectorAll(junkSelectors.join(','));
            let originalStyles = new Map();

            junkElements.forEach(el => {
                originalStyles.set(el, el.style.display);
                el.style.display = 'none';
            });

            let selection = window.getSelection();

            let savedRanges = [];
            for (let i = 0; i < selection.rangeCount; i++) {
                savedRanges.push(selection.getRangeAt(i));
            }

            selection.removeAllRanges();
            let range = document.createRange();
            range.selectNodeContents(document.body);
            selection.addRange(range);

            let rawText = selection.toString() || document.body.innerText || "";
            selection.removeAllRanges();
            savedRanges.forEach(r => selection.addRange(r));
            junkElements.forEach(el => {
                el.style.display = originalStyles.get(el);
            });

            return rawText.replace(/\n[ \t]*\n+/g, '\n\n').trim();
        }
    });

    let pageText = injectionResults
        .map(res => res.result)
        .filter(t => t && t.trim().length > 50)
        .join('\n\n---[NEXT BLOCK] ---\n\n');

    pageText = pageText.substring(0, 400000);
    
    if (!pageText.trim()) throw new Error("Page text not found.");
    return pageText;
}


function addMessageToUI(role, content) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `msg ${role === 'user' ? 'msg-user' : role === 'assistant' ? 'msg-bot' : 'msg-system'}`;
    
    if (role === 'assistant') {
        msgDiv.innerHTML = marked.parse(content);
    } else {
        msgDiv.innerText = content;
    }
    
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    return msgDiv;
}

async function ensureContextLoaded() {
    if (isContextLoaded) return;
    
    addMessageToUI('system', 'Reading page content...');
    const pageText = await extractCleanText();
    const lang = getResponseLanguage();
    const langInstruction = lang ? `Always respond in ${lang}.` : 'Answer in the same language as the user\'s question.';
    const systemPrompt = `You are a helpful AI assistant. ${langInstruction} Respond using Markdown. Your main task is to help the user work with the text of the current web page.\n\nHere is the page content:\n\n=== BEGIN PAGE CONTENT ===\n${pageText}\n=== END PAGE CONTENT ===\n\nBase your answers on this content. If the answer is not in the text, say so honestly, but you may supplement with your own knowledge.`;

    conversationHistory = [{ role: "system", content: systemPrompt }];
    isContextLoaded = true;
}

async function handleChat(userText, isSummaryRequest = false) {
    if (isGenerating || !userText.trim()) return;
    
    const selectedModel = modelSelect.value;
    const serverUrl = serverUrlInput.value.trim();
    if (!selectedModel || !serverUrl) return alert("Check server URL and model.");

    isGenerating = true;
    sendBtn.disabled = true;
    summaryBtn.disabled = true;
    chatInput.value = '';
    chatInput.style.height = 'auto';
    chatInput.style.overflowY = 'hidden';

    try {
        if (!isSummaryRequest) addMessageToUI('user', userText);

        await ensureContextLoaded();
        conversationHistory.push({ role: "user", content: userText });

        const botMsgDiv = addMessageToUI('assistant', '...');
        
        const response = await fetch(`${serverUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: selectedModel,
                messages: conversationHistory,
                temperature: 0.2,
                stream: true
            })
        });

        if (!response.ok) throw new Error(`Server error: ${response.status}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let fullBotResponse = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                if (line === 'data: [DONE]') break;
                if (line.startsWith('data: ')) {
                    try {
                        const parsed = JSON.parse(line.substring(6));
                        if (parsed.choices && parsed.choices[0].delta.content) {
                            fullBotResponse += parsed.choices[0].delta.content;
                            const isNearBottom = chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight < 50;
                            botMsgDiv.innerHTML = marked.parse(fullBotResponse);
                            if (isNearBottom) {
                                chatBox.scrollTop = chatBox.scrollHeight;
                            }
                        }
                    } catch (e) {}
                }
            }
        }

        conversationHistory.push({ role: "assistant", content: fullBotResponse });

    } catch (error) {
        addMessageToUI('system', `Error: ${error.message}`);
        if (conversationHistory.length > 0 && conversationHistory[conversationHistory.length - 1].role === 'user') {
            conversationHistory.pop();
        }
    } finally {
        isGenerating = false;
        sendBtn.disabled = false;
        summaryBtn.disabled = false;
        chatInput.focus();
    }
}

sendBtn.addEventListener('click', () => handleChat(chatInput.value));

chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
    if (chatInput.scrollHeight > 150) {
        chatInput.style.overflowY = 'auto';
    } else {
        chatInput.style.overflowY = 'hidden';
    }
});

chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleChat(chatInput.value);
    }
});

summaryBtn.addEventListener('click', () => {
    addMessageToUI('user', 'Summarize this page.');
    handleChat("Please read the page content from the system prompt and create a detailed summary. Highlight key points with bullet points.", true);
});

newChatBtn.addEventListener('click', () => {
    conversationHistory = [];
    isContextLoaded = false;
    chatBox.innerHTML = '<div class="msg msg-system">Chat cleared. Context reset. Ask a question or click Summary.</div>';
});

debugBtn.addEventListener('click', () => {
    if (!isContextLoaded || conversationHistory.length === 0) {
        alert("Ask a question or click Summary first to load page content!");
        return;
    }

    const sysPrompt = conversationHistory[0].content;
    debugTextarea.value = `=== STATS ===\nSystem prompt length: ${sysPrompt.length} characters.\n\n=== CONTENT ===\n${sysPrompt}`;
    debugModal.style.display = 'block';
});

closeDebugBtn.addEventListener('click', () => {
    debugModal.style.display = 'none';
});