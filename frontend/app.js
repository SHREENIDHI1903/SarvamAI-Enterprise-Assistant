// ==========================================================================
// APPLICATION GLOBAL STATE & CONSTANTS
// ==========================================================================
const BASE_URL = "http://127.0.0.1:8000";

let state = {
    messages: [],
    sessions: [],
    currentSessionId: null,
    useRAG: true,
    isRecording: false,
    mediaRecorder: null,
    audioChunks: [],
    currentAudio: null,
    systemMode: "DEMO",
    indexedFiles: []
};

// ==========================================================================
// DOM SELECTORS
// ==========================================================================
const elements = {
    systemMode: document.getElementById("system-mode"),
    apiStatus: document.getElementById("api-status"),
    indexedChunks: document.getElementById("indexed-chunks"),
    languageSelect: document.getElementById("language-select"),
    speakerSelect: document.getElementById("speaker-select"),
    voicePace: document.getElementById("voice-pace"),
    paceVal: document.getElementById("pace-val"),
    voiceOutputToggle: document.getElementById("voice-output-toggle"),
    dropzone: document.getElementById("dropzone"),
    fileInput: document.getElementById("file-input"),
    uploadProgressContainer: document.getElementById("upload-progress-container"),
    uploadProgressFill: document.getElementById("upload-progress-fill"),
    uploadProgressText: document.getElementById("upload-progress-text"),
    sourcesList: document.getElementById("sources-list"),
    clearDocsBtn: document.getElementById("clear-docs-btn"),
    darkThemeBtn: document.getElementById("dark-theme-btn"),
    lightThemeBtn: document.getElementById("light-theme-btn"),
    useRagToggle: document.getElementById("use-rag-toggle"),
    ragStatusText: document.getElementById("rag-status-text"),
    chatMessages: document.getElementById("chat-messages"),
    chatInputTextarea: document.getElementById("chat-input-textarea"),
    sendBtn: document.getElementById("send-btn"),
    micBtn: document.getElementById("mic-btn"),
    micRecordingUI: document.getElementById("mic-recording-ui"),
    recLangLabel: document.getElementById("rec-lang-label"),
    stopMicBtn: document.getElementById("stop-mic-btn"),
    cancelMicBtn: document.getElementById("cancel-mic-btn"),
    voicePlayerContainer: document.getElementById("voice-player-container"),
    voicePlayingLang: document.getElementById("voice-playing-lang"),
    audioPlayPauseBtn: document.getElementById("audio-play-pause-btn"),
    audioStopBtn: document.getElementById("audio-stop-btn"),
    globalAudioPlayer: document.getElementById("global-audio-player"),
    ocrBtn: document.getElementById("ocr-btn"),
    ocrFileInput: document.getElementById("ocr-file-input"),
    newChatBtn: document.getElementById("new-chat-btn"),
    sessionsList: document.getElementById("sessions-list")
};

// ==========================================================================
// APP INITIALIZATION
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
    // 1. Initial server scanning
    scanServerStatus();
    
    // 2. Setup Action Listeners
    setupThemeHandlers();
    setupChatInputHandlers();
    setupRAGHandlers();
    setupPreferencesHandlers();
    setupSTTHandlers();
    setupOCRHandlers();
    setupSuggestedChips();
    
    // 3. Initialize chat history sessions
    initializeSessions();
    setupSessionHandlers();
});

// ==========================================================================
// PREFERENCES & UTILITIES HANDLERS
// ==========================================================================
function setupPreferencesHandlers() {
    elements.voicePace.addEventListener("input", (e) => {
        elements.paceVal.innerText = `${e.target.value}x`;
    });

    // Reset conversation history when target language changes to prevent model in-context language blending
    elements.languageSelect.addEventListener("change", () => {
        state.messages = [];
        const currentSession = state.sessions.find(s => s.id === state.currentSessionId);
        if (currentSession) {
            currentSession.messages = [];
            currentSession.title = "New Chat";
            localStorage.setItem("sarvam_chat_sessions", JSON.stringify(state.sessions));
        }
        renderSessionsList();
        renderChatMessages();
        const activeLangName = elements.languageSelect.options[elements.languageSelect.selectedIndex].text.split(" (")[0];
        appendMessageBubble("bot", `🌐 **[System Notification]** Target language changed to **${activeLangName}**. The conversation history has been reset to ensure high-quality translation and reasoning in your preferred language.`);
    });
}

function setupThemeHandlers() {
    elements.darkThemeBtn.addEventListener("click", () => {
        document.body.classList.add("dark-theme");
        document.body.classList.remove("light-theme");
        elements.darkThemeBtn.classList.add("active");
        elements.lightThemeBtn.classList.remove("active");
    });

    elements.lightThemeBtn.addEventListener("click", () => {
        document.body.classList.add("light-theme");
        document.body.classList.remove("dark-theme");
        elements.lightThemeBtn.classList.add("active");
        elements.darkThemeBtn.classList.remove("active");
    });
}

function setupSuggestedChips() {
    document.querySelectorAll(".chip").forEach(chip => {
        chip.addEventListener("click", () => {
            const query = chip.getAttribute("data-query");
            elements.chatInputTextarea.value = query;
            elements.chatInputTextarea.dispatchEvent(new Event("input"));
            submitUserMessage();
        });
    });
}

// ==========================================================================
// SERVER COMMUNICATOR & REFRESH STATS
// ==========================================================================
async function scanServerStatus() {
    try {
        const res = await fetch(`${BASE_URL}/api/status`);
        if (res.ok) {
            const data = await res.json();
            state.systemMode = data.mode;
            
            // Render state mode badge
            elements.systemMode.innerText = data.mode === "PROD" ? "Production" : "Demo Mode";
            elements.systemMode.className = `badge status-badge ${data.mode === "PROD" ? "prod-badge" : "demo-badge"}`;
            
            // API health display
            elements.apiStatus.innerHTML = `<span style="color: #10b981"><i class="fa-solid fa-circle-check"></i> Connected</span>`;
            
            // RAG database status
            const chunkCount = data.rag_stats.total_chunks || 0;
            elements.indexedChunks.innerText = `${chunkCount} chunk${chunkCount === 1 ? "" : "s"}`;
            
            // Render source list
            renderSourceFiles(data.rag_stats.files || []);
        } else {
            setOfflineStatus();
        }
    } catch (e) {
        console.error("Connection failed with server:", e);
        setOfflineStatus();
    }
}

function setOfflineStatus() {
    elements.apiStatus.innerHTML = `<span style="color: #ef4444"><i class="fa-solid fa-triangle-exclamation"></i> Offline</span>`;
    elements.systemMode.innerText = "Offline";
    elements.systemMode.className = "badge status-badge demo-badge";
    elements.indexedChunks.innerText = "N/A";
}

function renderSourceFiles(files) {
    state.indexedFiles = files;
    elements.sourcesList.innerHTML = "";
    
    if (files.length === 0) {
        elements.sourcesList.innerHTML = `<li class="empty-sources">No documents uploaded yet.</li>`;
        return;
    }
    
    files.forEach(filename => {
        const li = document.createElement("li");
        li.innerHTML = `
            <div class="file-info">
                <i class="fa-solid fa-file-invoice"></i>
                <span title="${filename}">${filename}</span>
            </div>
        `;
        elements.sourcesList.appendChild(li);
    });
}

// ==========================================================================
// CHAT LAYOUT & CONVERSATION LOOP
// ==========================================================================
function setupChatInputHandlers() {
    // Dynamic height resize
    elements.chatInputTextarea.addEventListener("input", (e) => {
        e.target.style.height = "auto";
        e.target.style.height = `${e.target.scrollHeight - 10}px`;
        
        // Toggle Send Button
        elements.sendBtn.disabled = !e.target.value.trim();
    });

    elements.chatInputTextarea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submitUserMessage();
        }
    });

    elements.sendBtn.addEventListener("click", () => {
        submitUserMessage();
    });
}

function formatMarkdown(text) {
    if (!text) return "";
    // Basic rich rendering for bullets, bold, paragraphs, and newlines
    let formatted = String(text)
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") // Bold
        .replace(/\*(.*?)\*/g, "<em>$1</em>"); // Italic

    // Split paragraphs
    const paragraphs = formatted.split(/\n\n+/);
    return paragraphs.map(p => {
        p = p.trim();
        if (p.startsWith("- ") || p.startsWith("* ")) {
            const listItems = p.split(/\n[-*]\s+/);
            const listHtml = listItems.map((li, idx) => {
                let cleanLi = li.replace(/^[-*]\s+/, "");
                return `<li>${cleanLi}</li>`;
            }).join("");
            return `<ul>${listHtml}</ul>`;
        }
        
        if (p.match(/^\d+\.\s+/)) {
            const listItems = p.split(/\n\d+\.\s+/);
            const listHtml = listItems.map((li, idx) => {
                let cleanLi = li.replace(/^\d+\.\s+/, "");
                return `<li>${cleanLi}</li>`;
            }).join("");
            return `<ol>${listHtml}</ol>`;
        }
        
        return `<p>${p.replace(/\n/g, "<br>")}</p>`;
    }).join("");
}

function appendMessageBubble(role, content, extra = {}) {
    const isWelcome = elements.chatMessages.querySelector(".system-welcome");
    if (isWelcome) isWelcome.remove();

    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${role === "user" ? "user" : "bot"}`;
    
    const avatarIcon = role === "user" ? '<i class="fa-solid fa-user-astronaut"></i>' : '<i class="fa-solid fa-robot"></i>';
    
    // Bubble Base
    let bubbleContent = `<div class="message-bubble">`;
    
    if (extra.isTyping) {
        bubbleContent += `
            <div class="typing-indicator" id="active-typing">
                <span></span><span></span><span></span>
            </div>`;
    } else {
        // Append reasoning_content if available and different from main content
        if (extra.reasoning_content && extra.reasoning_content !== content) {
            bubbleContent += `
                <details class="thinking-block">
                    <summary><i class="fa-solid fa-brain"></i> Thinking Process</summary>
                    <div class="thinking-content">${formatMarkdown(extra.reasoning_content)}</div>
                </details>`;
        }
        
        bubbleContent += formatMarkdown(content);
        
        // Append RAG Document citations if available
        if (extra.rag_applied && extra.rag_sources && extra.rag_sources.length > 0) {
            bubbleContent += `
                <div class="citation-block">
                    <div class="citation-title"><i class="fa-solid fa-book-bookmark"></i> Grounded Sources</div>
                    <div class="citation-chips-container">
                        ${extra.rag_sources.map(src => `<span class="citation-badge">${src}</span>`).join("")}
                    </div>
                </div>`;
        }
        
        // Voice synthesizer shortcut button for bot responses
        if (role === "bot" && content) {
            bubbleContent += `
                <button class="tts-trigger-btn" title="Speak Response" onclick="synthesizeText(this, '${content.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, " ")}')">
                    <i class="fa-solid fa-volume-low"></i>
                </button>`;
        }
    }
    
    bubbleContent += `</div>`;
    
    msgDiv.innerHTML = `
        <div class="msg-avatar">
            ${avatarIcon}
        </div>
        ${bubbleContent}
    `;
    
    elements.chatMessages.appendChild(msgDiv);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    
    return msgDiv;
}

async function submitUserMessage() {
    const text = elements.chatInputTextarea.value.trim();
    if (!text) return;
    
    // Reset textarea layout
    elements.chatInputTextarea.value = "";
    elements.chatInputTextarea.dispatchEvent(new Event("input"));
    
    // 1. Display User message in UI
    appendMessageBubble("user", text);
    state.messages.push({ role: "user", content: text });
    
    // Auto-name active session title if it was default "New Chat"
    const currentSession = state.sessions.find(s => s.id === state.currentSessionId);
    if (currentSession) {
        if (currentSession.messages.length === 1 || currentSession.title === "New Chat") {
            const titleText = text.length > 25 ? text.substring(0, 22) + "..." : text;
            currentSession.title = titleText;
            renderSessionsList();
        }
        currentSession.messages = state.messages;
        localStorage.setItem("sarvam_chat_sessions", JSON.stringify(state.sessions));
    }
    
    // 2. Append typing indicator
    const typingBubble = appendMessageBubble("bot", "", { isTyping: true });
    
    try {
        const activeLangOption = elements.languageSelect.options[elements.languageSelect.selectedIndex];
        const languageName = activeLangOption.text.split(" (")[0]; // e.g. "Kannada" or "Hindi"
        
        const payload = {
            messages: state.messages,
            model: "sarvam-30b",
            use_rag: state.useRAG,
            temperature: 0.5,
            target_language: languageName
        };
        
        // Call backend API
        const res = await fetch(`${BASE_URL}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        
        // Remove typing indicators
        typingBubble.remove();
        
        if (res.ok) {
            const data = await res.json();
            const choice = data.choices[0];
            let botResponse = choice.message.content;
            const reasoning = choice.message.reasoning_content;
            
            // Defensive fallback: If main content is empty but reasoning is present, use it
            if (!botResponse && reasoning) {
                botResponse = reasoning;
            }
            
            // Display response bubble
            appendMessageBubble("bot", botResponse, {
                rag_applied: data.rag_applied,
                rag_sources: data.rag_sources,
                reasoning_content: reasoning
            });
            
            state.messages.push({
                role: "assistant",
                content: botResponse || reasoning || "",
                rag_applied: data.rag_applied,
                rag_sources: data.rag_sources,
                reasoning_content: reasoning
            });
            
            // Update active session messages
            if (currentSession) {
                currentSession.messages = state.messages;
                localStorage.setItem("sarvam_chat_sessions", JSON.stringify(state.sessions));
            }
            
            // Auto play voice response if checked
            if (elements.voiceOutputToggle.checked) {
                playVoiceResponse(botResponse);
            }
        } else {
            const err = await res.text();
            appendMessageBubble("bot", `⚠️ Failed to retrieve AI response. Server error: ${err}`);
        }
    } catch (e) {
        typingBubble.remove();
        appendMessageBubble("bot", `⚠️ Error communicating with server. Make sure the FastAPI backend is running on port 8000.`);
    }
}

// ==========================================================================
// TEXT-TO-SPEECH (TTS) AUDIO COMPONENT
// ==========================================================================
async function playVoiceResponse(text) {
    if (state.systemMode === "DEMO") {
        console.log("Speech TTS output skipped: System running in Demo mode.");
        return;
    }
    
    // Simple filter to remove markdown links or code snippets in spoken audio
    const speechText = text.replace(/\[.*?\]\(.*?\)/g, "").replace(/[#*`]/g, "").substring(0, 1500);
    
    await requestSpeechSynthesis(speechText);
}

// Global click-to-trigger synthesis for individual bubbles
window.synthesizeText = async function(btn, text) {
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    await requestSpeechSynthesis(text);
    btn.innerHTML = '<i class="fa-solid fa-volume-low"></i>';
};

async function requestSpeechSynthesis(text) {
    try {
        const payload = {
            text: text,
            language_code: elements.languageSelect.value,
            speaker: elements.speakerSelect.value,
            pace: parseFloat(elements.voicePace.value)
        };
        
        const res = await fetch(`${BASE_URL}/api/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            const data = await res.json();
            
            if (data.is_demo) {
                appendMessageBubble("bot", "🎙️ *[TTS Feature Information]* Text-to-Speech voice synthesis (Bulbul v3) requires a valid `SARVAM_API_KEY` configured in the backend `.env` file.");
                return;
            }
            
            // Typical Sarvam returns a JSON with base64 string under audio or audios list
            const base64Audio = data.audios ? data.audios[0] : (data.audio || null);
            if (base64Audio) {
                playBase64Audio(base64Audio);
            } else {
                console.error("Audio payload missing in TTS API response structure:", data);
            }
        } else {
            console.error("TTS API replied with failure status code:", res.status);
        }
    } catch (e) {
        console.error("Error invoking TTS service:", e);
    }
}

function playBase64Audio(base64Data) {
    // 1. Stop current audio if playing
    stopAudioPlayback();
    
    // 2. Set source
    elements.globalAudioPlayer.src = `data:audio/mp3;base64,${base64Data}`;
    
    // 3. Show player bar
    const activeLangName = elements.languageSelect.options[elements.languageSelect.selectedIndex].text;
    const activeSpeaker = elements.speakerSelect.options[elements.speakerSelect.selectedIndex].text.split(" ")[0];
    elements.voicePlayingLang.innerText = `${activeLangName} Voice (${activeSpeaker})`;
    elements.voicePlayerContainer.classList.remove("hidden");
    
    // Play triggers
    elements.globalAudioPlayer.play()
        .then(() => {
            elements.audioPlayPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        })
        .catch(e => {
            console.error("HTML5 Audio playback failed:", e);
            elements.voicePlayerContainer.classList.add("hidden");
        });
        
    // Events
    elements.globalAudioPlayer.onended = () => {
        elements.voicePlayerContainer.classList.add("hidden");
    };
    
    // Setup controls
    elements.audioPlayPauseBtn.onclick = () => {
        if (elements.globalAudioPlayer.paused) {
            elements.globalAudioPlayer.play();
            elements.audioPlayPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        } else {
            elements.globalAudioPlayer.pause();
            elements.audioPlayPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        }
    };
    
    elements.audioStopBtn.onclick = () => {
        stopAudioPlayback();
    };
}

function stopAudioPlayback() {
    if (elements.globalAudioPlayer) {
        elements.globalAudioPlayer.pause();
        elements.globalAudioPlayer.currentTime = 0;
        elements.globalAudioPlayer.src = "";
    }
    elements.voicePlayerContainer.classList.add("hidden");
}

// ==========================================================================
// SPEECH-TO-TEXT (STT) RECORDING COMPONENT
// ==========================================================================
function setupSTTHandlers() {
    elements.micBtn.addEventListener("click", startVoiceRecording);
    elements.stopMicBtn.addEventListener("click", stopVoiceRecording);
    elements.cancelMicBtn.addEventListener("click", cancelVoiceRecording);
}

async function startVoiceRecording() {
    if (state.isRecording) return;
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        state.isRecording = true;
        state.audioChunks = [];
        
        // Define media recording options (prefer audio/webm or audio/ogg, standard web audio API standard)
        state.mediaRecorder = new MediaRecorder(stream);
        
        state.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                state.audioChunks.push(event.data);
            }
        };
        
        state.mediaRecorder.onstop = processRecordedAudio;
        
        // Trigger recording start
        state.mediaRecorder.start();
        
        // UI Visual Update
        const activeLangName = elements.languageSelect.options[elements.languageSelect.selectedIndex].text;
        elements.recLangLabel.innerText = activeLangName;
        elements.micRecordingUI.classList.remove("hidden");
    } catch (e) {
        console.error("Microphone capture access denied:", e);
        alert("Microphone permission is required to use voice text input. Please enable permissions in your browser settings.");
    }
}

function stopVoiceRecording() {
    if (!state.isRecording || !state.mediaRecorder) return;
    
    // Stop recording state, triggers 'onstop' event
    state.mediaRecorder.stop();
    state.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    
    state.isRecording = false;
    elements.micRecordingUI.classList.add("hidden");
}

function cancelVoiceRecording() {
    if (!state.isRecording || !state.mediaRecorder) return;
    
    // Clear callbacks and stop without processing
    state.mediaRecorder.onstop = null;
    state.mediaRecorder.stop();
    state.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    
    state.isRecording = false;
    state.audioChunks = [];
    elements.micRecordingUI.classList.add("hidden");
}

async function processRecordedAudio() {
    const audioBlob = new Blob(state.audioChunks, { type: "audio/wav" });
    state.audioChunks = [];
    
    // 1. Send Audio to STT API
    const typingBubble = appendMessageBubble("bot", "", { isTyping: true });
    
    try {
        const formData = new FormData();
        formData.append("file", audioBlob, "voice_input.wav");
        formData.append("mode", "transcribe");
        formData.append("language_code", elements.languageSelect.value);
        
        const res = await fetch(`${BASE_URL}/api/stt`, {
            method: "POST",
            body: formData
        });
        
        typingBubble.remove();
        
        if (res.ok) {
            const data = await res.json();
            const transcript = data.transcript || data.text || "";
            
            if (transcript.strip ? transcript.strip() : transcript) {
                // Autopopulate and trigger submit
                elements.chatInputTextarea.value = transcript;
                elements.chatInputTextarea.dispatchEvent(new Event("input"));
                submitUserMessage();
            } else {
                appendMessageBubble("bot", "🎙️ Spech-to-Text did not recognize any speech terms. Please speak clearly into your microphone.");
            }
        } else {
            const err = await res.text();
            appendMessageBubble("bot", `🎙️ Speech transcription failed. Server response: ${err}`);
        }
    } catch (e) {
        typingBubble.remove();
        appendMessageBubble("bot", "🎙️ Connection error during Speech translation. Ensure the backend FastAPI server is online.");
    }
}

// ==========================================================================
// DOCUMENT DIGITIZATION & OCR (SARVAM VISION) COMPONENT
// ==========================================================================
function setupOCRHandlers() {
    elements.ocrBtn.addEventListener("click", () => {
        elements.ocrFileInput.click();
    });

    elements.ocrFileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            handleOCRUpload(e.target.files[0]);
        }
    });
}

async function handleOCRUpload(file) {
    // 1. Basic format verification (Images & PDFs)
    const allowedExts = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    
    if (!allowedExts.includes(ext)) {
        alert("Unsupported file type! Please select an Image (PNG, JPG, WEBP) or scanned PDF for text extraction.");
        return;
    }
    
    if (file.size > 10 * 1024 * 1024) { // 10MB Limit
        alert("File size limit exceeded! Maximum allowed size is 10MB.");
        return;
    }
    
    const userMsgContent = file.type.startsWith("image/") 
        ? `📷 **[Uploaded Document for OCR]**`
        : `📷 **[Uploaded PDF for OCR]**\n\n📄 *\"${file.name}\"* (Scanned Document)`;

    // 2. Render Image Attachment Bubble on Frontend (for supreme visual fidelity)
    if (file.type.startsWith("image/")) {
        // Read file as base64 data URL to show a local thumbnail preview in the chat
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            appendMessageBubble("user", `📷 **[Uploaded Document for OCR]**\n\n<img src="${dataUrl}" class="ocr-preview-thumbnail" alt="Scanning Document..." style="max-height: 180px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); margin-top: 8px; display: block;">`);
        };
        reader.readAsDataURL(file);
    } else {
        appendMessageBubble("user", `📷 **[Uploaded PDF for OCR]**\n\n📄 *\"${file.name}\"* (Scanned Document)`);
    }

    state.messages.push({ role: "user", content: userMsgContent });
    
    // Auto-name active session title
    const currentSession = state.sessions.find(s => s.id === state.currentSessionId);
    if (currentSession) {
        if (currentSession.messages.length === 1 || currentSession.title === "New Chat") {
            const cleanName = file.name.length > 15 ? file.name.substring(0, 12) + "..." : file.name;
            currentSession.title = `OCR: ${cleanName}`;
            renderSessionsList();
        }
        currentSession.messages = state.messages;
        localStorage.setItem("sarvam_chat_sessions", JSON.stringify(state.sessions));
    }

    // 3. Show loading scanning state
    const typingBubble = appendMessageBubble("bot", "", { isTyping: true });
    
    try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("language_code", elements.languageSelect.value); // Pass preferred language hint!
        
        const res = await fetch(`${BASE_URL}/api/ocr`, {
            method: "POST",
            body: formData
        });
        
        typingBubble.remove();
        
        if (res.ok) {
            const data = await res.json();
            if (data.error) {
                const errMsg = `📷 **[Digitization Failed]**\n\n⚠️ ${data.message || "Failed to process document."}`;
                appendMessageBubble("bot", errMsg);
                state.messages.push({ role: "assistant", content: errMsg });
            } else {
                const extractedText = data.text || "";
                const successMsg = `📷 **[Extracted OCR Content]**\n\n${extractedText}`;
                appendMessageBubble("bot", successMsg);
                state.messages.push({ role: "assistant", content: successMsg });
            }
            if (currentSession) {
                currentSession.messages = state.messages;
                localStorage.setItem("sarvam_chat_sessions", JSON.stringify(state.sessions));
            }
        } else {
            const err = await res.text();
            const errMsg = `📷 **[Digitization Failed]**\n\n⚠️ OCR API replied with failure status: ${err}`;
            appendMessageBubble("bot", errMsg);
            state.messages.push({ role: "assistant", content: errMsg });
            if (currentSession) {
                currentSession.messages = state.messages;
                localStorage.setItem("sarvam_chat_sessions", JSON.stringify(state.sessions));
            }
        }
    } catch (e) {
        typingBubble.remove();
        console.error("OCR API error:", e);
        const errMsg = "📷 **[Connection Error]**\n\n⚠️ Failed to communicate with Document Digitization server. Ensure the backend FastAPI is online.";
        appendMessageBubble("bot", errMsg);
        state.messages.push({ role: "assistant", content: errMsg });
        if (currentSession) {
            currentSession.messages = state.messages;
            localStorage.setItem("sarvam_chat_sessions", JSON.stringify(state.sessions));
        }
    }
}

// ==========================================================================
// RAG GROUNDING / DOCUMENT UPLOAD COMPONENT
// ==========================================================================
function setupRAGHandlers() {
    elements.useRagToggle.addEventListener("click", () => {
        state.useRAG = !state.useRAG;
        elements.useRagToggle.className = `action-btn ${state.useRAG ? "active" : ""}`;
        elements.ragStatusText.innerText = state.useRAG ? "ON" : "OFF";
    });

    // Drag-and-drop triggers
    const dropzone = elements.dropzone;
    
    dropzone.addEventListener("click", () => elements.fileInput.click());
    
    dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("dragover");
    });
    
    dropzone.addEventListener("dragleave", () => {
        dropzone.classList.remove("dragover");
    });
    
    dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("dragover");
        if (e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });
    
    elements.fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });

    // Clear sources
    elements.clearDocsBtn.addEventListener("click", clearRAGKnowledge);
}

async function handleFileUpload(file) {
    // Basic validations
    const allowedExts = [".pdf", ".txt", ".md", ".json"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    
    if (!allowedExts.includes(ext)) {
        alert("Unsupported file type! Please upload a PDF, TXT, MD, or JSON document.");
        return;
    }
    
    if (file.size > 10 * 1024 * 1024) { // 10MB Limit
        alert("File size limit exceeded! Maximum allowed size is 10MB.");
        return;
    }
    
    // UI Progress Show
    elements.uploadProgressFill.style.width = "0%";
    elements.uploadProgressText.innerText = "Indexing file details...";
    elements.uploadProgressContainer.classList.remove("hidden");
    
    try {
        const formData = new FormData();
        formData.append("file", file);
        
        // Mock progress update (standard ajax triggers can be hooked, simple timed fill for mock usability)
        let percent = 0;
        const progressTimer = setInterval(() => {
            if (percent < 85) {
                percent += 5;
                elements.uploadProgressFill.style.width = `${percent}%`;
            }
        }, 100);
        
        const res = await fetch(`${BASE_URL}/api/upload`, {
            method: "POST",
            body: formData
        });
        
        clearInterval(progressTimer);
        elements.uploadProgressFill.style.width = "100%";
        
        if (res.ok) {
            const data = await res.json();
            elements.uploadProgressText.innerText = "Success! Indexed successfully.";
            
            // Reload status & lists
            setTimeout(() => {
                elements.uploadProgressContainer.classList.add("hidden");
                scanServerStatus();
            }, 1500);
            
            appendMessageBubble("bot", `📂 **[System Notification]** File *\"${file.name}\"* has been indexed successfully into your company knowledge database (${data.details.chunks_added} chunks added). You can now ask questions about its content!`);
        } else {
            const err = await res.text();
            elements.uploadProgressText.innerText = "Indexing failed!";
            setTimeout(() => elements.uploadProgressContainer.classList.add("hidden"), 3000);
            alert(`File parsing failed: ${err}`);
        }
    } catch (e) {
        elements.uploadProgressText.innerText = "Connection failed!";
        setTimeout(() => elements.uploadProgressContainer.classList.add("hidden"), 3000);
        alert("Failed to communicate with RAG index server. Ensure the backend is active.");
    }
}

async function clearRAGKnowledge() {
    if (!confirm("Are you sure you want to clear the entire company knowledge base? This will wipe all indexed chunks and source files.")) return;
    
    try {
        const res = await fetch(`${BASE_URL}/api/clear-docs`, { method: "POST" });
        if (res.ok) {
            scanServerStatus();
            appendMessageBubble("bot", "📂 **[System Notification]** The company knowledge database has been completely cleared. General knowledge answers are now active.");
        } else {
            alert("Failed to wipe index on server.");
        }
    } catch (e) {
        alert("Failed to connect to backend server.");
    }
}

// ==========================================================================
// CHAT SESSION & CONVERSATION HISTORY MANAGEMENT
// ==========================================================================
function initializeSessions() {
    const storedSessions = localStorage.getItem("sarvam_chat_sessions");
    const storedCurrentId = localStorage.getItem("sarvam_chat_current_session_id");
    
    if (storedSessions) {
        state.sessions = JSON.parse(storedSessions);
        state.currentSessionId = storedCurrentId;
    }
    
    // If no sessions, create one initial default session
    if (state.sessions.length === 0) {
        createNewSession(true);
    } else {
        const currentSession = state.sessions.find(s => s.id === state.currentSessionId);
        if (currentSession) {
            state.messages = currentSession.messages;
            renderChatMessages();
        } else {
            // Fallback to first session if currentSessionId is invalid
            state.currentSessionId = state.sessions[0].id;
            state.messages = state.sessions[0].messages;
            localStorage.setItem("sarvam_chat_current_session_id", state.currentSessionId);
            renderChatMessages();
        }
        renderSessionsList();
    }
}

function setupSessionHandlers() {
    elements.newChatBtn.addEventListener("click", () => {
        createNewSession();
    });
}

function createNewSession(isInitial = false) {
    const sessionId = "session_" + Date.now();
    const newSession = {
        id: sessionId,
        title: "New Chat",
        messages: []
    };
    
    state.sessions.unshift(newSession);
    state.currentSessionId = sessionId;
    state.messages = [];
    
    localStorage.setItem("sarvam_chat_sessions", JSON.stringify(state.sessions));
    localStorage.setItem("sarvam_chat_current_session_id", sessionId);
    
    renderSessionsList();
    renderChatMessages();
}

function renderSessionsList() {
    elements.sessionsList.innerHTML = "";
    
    if (state.sessions.length === 0) {
        elements.sessionsList.innerHTML = `<li class="empty-history">No chat history</li>`;
        return;
    }
    
    state.sessions.forEach(session => {
        const li = document.createElement("li");
        li.className = session.id === state.currentSessionId ? "active" : "";
        li.setAttribute("data-session-id", session.id);
        
        li.innerHTML = `
            <div class="session-title">
                <i class="fa-regular fa-message"></i>
                <span title="${session.title}">${session.title}</span>
            </div>
            <button class="delete-session-btn" title="Delete Chat">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        `;
        
        li.addEventListener("click", (e) => {
            if (e.target.closest(".delete-session-btn")) return;
            switchSession(session.id);
        });
        
        const deleteBtn = li.querySelector(".delete-session-btn");
        deleteBtn.addEventListener("click", () => {
            deleteSession(session.id);
        });
        
        elements.sessionsList.appendChild(li);
    });
}

function switchSession(sessionId) {
    if (state.currentSessionId === sessionId) return;
    
    state.currentSessionId = sessionId;
    localStorage.setItem("sarvam_chat_current_session_id", sessionId);
    
    const currentSession = state.sessions.find(s => s.id === sessionId);
    if (currentSession) {
        state.messages = currentSession.messages;
    } else {
        state.messages = [];
    }
    
    renderSessionsList();
    renderChatMessages();
}

function deleteSession(sessionId) {
    const confirmDelete = confirm("Are you sure you want to delete this chat session?");
    if (!confirmDelete) return;
    
    state.sessions = state.sessions.filter(s => s.id !== sessionId);
    localStorage.setItem("sarvam_chat_sessions", JSON.stringify(state.sessions));
    
    if (state.currentSessionId === sessionId) {
        if (state.sessions.length > 0) {
            state.currentSessionId = state.sessions[0].id;
            state.messages = state.sessions[0].messages;
        } else {
            state.currentSessionId = null;
            state.messages = [];
            createNewSession();
            return;
        }
    }
    
    localStorage.setItem("sarvam_chat_current_session_id", state.currentSessionId);
    renderSessionsList();
    renderChatMessages();
}

function renderChatMessages() {
    elements.chatMessages.innerHTML = "";
    
    if (state.messages.length === 0) {
        renderWelcomeScreen();
        return;
    }
    
    state.messages.forEach(msg => {
        appendMessageBubble(msg.role === "user" ? "user" : "bot", msg.content, {
            rag_applied: msg.rag_applied,
            rag_sources: msg.rag_sources,
            reasoning_content: msg.reasoning_content
        });
    });
}

function renderWelcomeScreen() {
    elements.chatMessages.innerHTML = `
        <div class="message system-welcome">
            <div class="welcome-card card">
                <div class="welcome-icon-wrapper">
                    <i class="fa-solid fa-sparkles"></i>
                </div>
                <h2>How can I assist you today?</h2>
                <p>I am your specialized corporate assistant powered by <strong>Sarvam AI</strong>. Upload documents to query company secrets, or speak directly in your regional language!</p>
                
                <div class="suggested-queries">
                    <h4>Suggested Quick Prompts</h4>
                    <div class="suggestion-chips">
                        <button class="chip" data-query="Explain how RAG grounding works in this chatbot.">💡 Tell me about RAG Grounding</button>
                        <button class="chip" data-query="How does Sarvam AI optimize for Indian languages?">🇮🇳 Indian Language Optimization</button>
                        <button class="chip" data-query="Help me write a professional leave request email in formal English and Hindi.">📝 Leave Request Email</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    setupSuggestedChips();
}
