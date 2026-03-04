// OpenAI API 설정
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const API_KEY_STORAGE_KEY = 'voimeow_openai_api_key';

/**
 * 로컬 스토리지에서 API 키 가져오기
 */
function getStoredApiKey() {
    return localStorage.getItem(API_KEY_STORAGE_KEY);
}

/**
 * 로컬 스토리지에 API 키 저장
 */
function saveApiKeyToStorage({ apiKey }) {
    localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
}

/**
 * 저장된 API 키 삭제
 */
function removeStoredApiKey() {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
}

/**
 * API 키 입력 모달 표시
 */
function showApiKeyInputModal() {
    const existingModal = document.getElementById('apiKeyModal');
    if (existingModal) {
        existingModal.style.display = 'flex';
        return;
    }

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'apiKeyModal';
    modalOverlay.className = 'api-key-modal-overlay';
    modalOverlay.innerHTML = `
        <div class="api-key-modal-content">
            <h3>🔑 OpenAI API 키 설정</h3>
            <p>챗봇을 사용하려면 OpenAI API 키가 필요합니다.</p>
            <p class="api-key-modal-hint">API 키는 브라우저에만 저장되며 외부로 전송되지 않습니다.</p>
            <input type="password" id="apiKeyInput" placeholder="sk-..." class="api-key-input" />
            <div class="api-key-modal-buttons">
                <button id="saveApiKeyButton" class="api-key-save-button">저장</button>
                <button id="cancelApiKeyButton" class="api-key-cancel-button">취소</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modalOverlay);
    
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveButton = document.getElementById('saveApiKeyButton');
    const cancelButton = document.getElementById('cancelApiKeyButton');
    
    saveButton.addEventListener('click', () => {
        const enteredApiKey = apiKeyInput.value.trim();
        if (enteredApiKey && enteredApiKey.startsWith('sk-')) {
            saveApiKeyToStorage({ apiKey: enteredApiKey });
            modalOverlay.style.display = 'none';
            appendBotMessageToChat({ 
                messageText: 'API 키가 설정되었습니다. 이제 대화를 시작할 수 있습니다!' 
            });
        } else {
            alert('유효한 OpenAI API 키를 입력해주세요. (sk-로 시작)');
        }
    });
    
    cancelButton.addEventListener('click', () => {
        modalOverlay.style.display = 'none';
    });
    
    apiKeyInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            saveButton.click();
        }
    });
}

/**
 * API 키 설정 여부 확인 및 안내 메시지 표시
 */
function checkApiKeyAndNotify() {
    const storedApiKey = getStoredApiKey();
    if (!storedApiKey) {
        setTimeout(() => {
            appendBotMessageToChat({ 
                messageText: '안녕하세요! 챗봇을 사용하려면 먼저 OpenAI API 키를 설정해주세요. 아래 설정 버튼을 클릭하거나 메시지를 보내면 설정 창이 열립니다.' 
            });
        }, 500);
    }
}

// DOM 요소 참조
const chatbotFloatingButton = document.getElementById('openChatbotButton');
const chatbotContainer = document.getElementById('chatbotContainer');
const closeChatbotButton = document.getElementById('closeChatbotButton');
const chatbotMessagesContainer = document.getElementById('chatbotMessages');
const chatbotInputField = document.getElementById('chatbotInput');
const sendMessageButton = document.getElementById('sendMessageButton');

// 대화 내역 저장
const conversationHistory = [];

/**
 * 챗봇 창 표시 상태 토글
 */
function toggleChatbotVisibility() {
    chatbotContainer.classList.toggle('chatbot-container--active');
    
    if (chatbotContainer.classList.contains('chatbot-container--active')) {
        chatbotInputField.focus();
    }
}

/**
 * 사용자 메시지를 화면에 추가
 */
function appendUserMessageToChat({ messageText }) {
    const userMessageElement = document.createElement('div');
    userMessageElement.className = 'chatbot-message chatbot-message--user';
    
    const messageContentElement = document.createElement('div');
    messageContentElement.className = 'chatbot-message-content';
    messageContentElement.textContent = messageText;
    
    userMessageElement.appendChild(messageContentElement);
    chatbotMessagesContainer.appendChild(userMessageElement);
    
    scrollChatToBottom();
}

/**
 * AI 응답 메시지를 화면에 추가
 */
function appendBotMessageToChat({ messageText }) {
    const botMessageElement = document.createElement('div');
    botMessageElement.className = 'chatbot-message chatbot-message--bot';
    
    const messageContentElement = document.createElement('div');
    messageContentElement.className = 'chatbot-message-content';
    messageContentElement.textContent = messageText;
    
    botMessageElement.appendChild(messageContentElement);
    chatbotMessagesContainer.appendChild(botMessageElement);
    
    scrollChatToBottom();
}

/**
 * 로딩 인디케이터 표시
 */
function showTypingIndicator() {
    const loadingMessageElement = document.createElement('div');
    loadingMessageElement.className = 'chatbot-message chatbot-message--bot chatbot-message--loading';
    loadingMessageElement.id = 'typingIndicator';
    
    const messageContentElement = document.createElement('div');
    messageContentElement.className = 'chatbot-message-content';
    
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'chatbot-typing-indicator';
    
    for (let i = 0; i < 3; i++) {
        const dotElement = document.createElement('div');
        dotElement.className = 'chatbot-typing-dot';
        typingIndicator.appendChild(dotElement);
    }
    
    messageContentElement.appendChild(typingIndicator);
    loadingMessageElement.appendChild(messageContentElement);
    chatbotMessagesContainer.appendChild(loadingMessageElement);
    
    scrollChatToBottom();
}

/**
 * 로딩 인디케이터 제거
 */
function hideTypingIndicator() {
    const typingIndicatorElement = document.getElementById('typingIndicator');
    if (typingIndicatorElement) {
        typingIndicatorElement.remove();
    }
}

/**
 * 채팅창을 최하단으로 스크롤
 */
function scrollChatToBottom() {
    chatbotMessagesContainer.scrollTop = chatbotMessagesContainer.scrollHeight;
}

/**
 * OpenAI API를 호출하여 응답 받기
 */
async function fetchAIResponseFromOpenAI({ userMessageText }) {
    const currentApiKey = getStoredApiKey();
    
    if (!currentApiKey) {
        showApiKeyInputModal();
        throw new Error('API 키가 설정되지 않았습니다.');
    }
    
    // 대화 내역에 사용자 메시지 추가
    conversationHistory.push({
        role: 'user',
        content: userMessageText
    });
    
    try {
        const response = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentApiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: '당신은 VoiMeow의 친절한 고객 상담 AI입니다. 반려묘에 관한 질문에 전문적이고 따뜻하게 답변해주세요.'
                    },
                    ...conversationHistory
                ],
                temperature: 0.7,
                max_tokens: 500
            })
        });
        
        if (!response.ok) {
            throw new Error(`API 요청 실패: ${response.status} ${response.statusText}`);
        }
        
        const responseData = await response.json();
        const aiMessageText = responseData.choices[0].message.content;
        
        // 대화 내역에 AI 응답 추가
        conversationHistory.push({
            role: 'assistant',
            content: aiMessageText
        });
        
        return aiMessageText;
        
    } catch (error) {
        console.error('OpenAI API 호출 중 오류 발생:', error);
        throw error;
    }
}

/**
 * 사용자 메시지 전송 처리
 */
async function handleUserMessageSubmission() {
    const userInputText = chatbotInputField.value.trim();
    
    if (!userInputText) {
        return;
    }
    
    // 입력 필드 초기화 및 버튼 비활성화
    chatbotInputField.value = '';
    sendMessageButton.disabled = true;
    chatbotInputField.disabled = true;
    
    // 사용자 메시지 화면에 표시
    appendUserMessageToChat({ messageText: userInputText });
    
    // 로딩 인디케이터 표시
    showTypingIndicator();
    
    try {
        // OpenAI API 호출
        const aiResponseText = await fetchAIResponseFromOpenAI({ 
            userMessageText: userInputText 
        });
        
        // 로딩 인디케이터 제거
        hideTypingIndicator();
        
        // AI 응답 화면에 표시
        appendBotMessageToChat({ messageText: aiResponseText });
        
    } catch (error) {
        hideTypingIndicator();
        appendBotMessageToChat({ 
            messageText: '죄송합니다. 응답을 생성하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' 
        });
    } finally {
        // 입력 필드 및 버튼 활성화
        sendMessageButton.disabled = false;
        chatbotInputField.disabled = false;
        chatbotInputField.focus();
    }
}

// 이벤트 리스너 등록
chatbotFloatingButton.addEventListener('click', toggleChatbotVisibility);
closeChatbotButton.addEventListener('click', toggleChatbotVisibility);

sendMessageButton.addEventListener('click', handleUserMessageSubmission);

chatbotInputField.addEventListener('keypress', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleUserMessageSubmission();
    }
});

// 챗봇 열릴 때 API 키 확인
chatbotFloatingButton.addEventListener('click', () => {
    setTimeout(checkApiKeyAndNotify, 300);
}, { once: true });
