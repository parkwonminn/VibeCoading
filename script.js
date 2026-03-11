// 프록시 서버 API 설정
// Cloudflare Worker 배포 후 아래 URL을 실제 Worker URL로 변경하세요
const PROXY_API_URL = 'https://your-worker-name.your-subdomain.workers.dev';

// DOM 요소 참조
const chatbotFloatingButton = document.getElementById('openChatbotButton');
const chatbotContainer = document.getElementById('chatbotContainer');
const closeChatbotButton = document.getElementById('closeChatbotButton');
const chatbotMessagesContainer = document.getElementById('chatbotMessages');
const chatbotInputField = document.getElementById('chatbotInput');
const sendMessageButton = document.getElementById('sendMessageButton');

const mobileMenuToggleButton = document.getElementById('mobileMenuToggle');
const mainNavigation = document.getElementById('mainNavigation');

/**
 * 모바일 햄버거 메뉴 열림/닫힘 상태 토글
 */
function toggleMobileNavigation() {
    const isMobileMenuOpen = mainNavigation.classList.toggle('navigation--open');
    mobileMenuToggleButton.classList.toggle('mobile-menu-toggle--open', isMobileMenuOpen);
    mobileMenuToggleButton.setAttribute('aria-expanded', String(isMobileMenuOpen));
    mobileMenuToggleButton.setAttribute('aria-label', isMobileMenuOpen ? '메뉴 닫기' : '메뉴 열기');
}

/**
 * 내비게이션 링크 클릭 시 모바일 메뉴 자동 닫기
 */
function closeMobileNavigationOnLinkClick() {
    mainNavigation.classList.remove('navigation--open');
    mobileMenuToggleButton.classList.remove('mobile-menu-toggle--open');
    mobileMenuToggleButton.setAttribute('aria-expanded', 'false');
    mobileMenuToggleButton.setAttribute('aria-label', '메뉴 열기');
}

/**
 * 메뉴 영역 외부 클릭 시 모바일 메뉴 닫기
 */
function handleOutsideClickToCloseMenu({ target }) {
    const isClickInsideHeader = target.closest('.header');
    if (!isClickInsideHeader && mainNavigation.classList.contains('navigation--open')) {
        closeMobileNavigationOnLinkClick();
    }
}

mobileMenuToggleButton.addEventListener('click', toggleMobileNavigation);

mainNavigation.querySelectorAll('.nav-link').forEach((navLink) => {
    navLink.addEventListener('click', closeMobileNavigationOnLinkClick);
});

document.addEventListener('click', handleOutsideClickToCloseMenu);

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
 * 프록시 서버를 통해 AI 응답 받기
 */
async function fetchAIResponseFromProxy({ userMessageText }) {
    // 대화 내역에 사용자 메시지 추가
    conversationHistory.push({
        role: 'user',
        content: userMessageText
    });
    
    try {
        const response = await fetch(PROXY_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
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
        console.error('프록시 서버 호출 중 오류 발생:', error);
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
        // 프록시 서버를 통해 AI 응답 요청
        const aiResponseText = await fetchAIResponseFromProxy({ 
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

