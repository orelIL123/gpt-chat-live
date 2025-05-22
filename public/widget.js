document.addEventListener("DOMContentLoaded", function () {
  // --- Get Client ID: Prioritize URL parameter, fallback to script tag ---
  let client_id = null;
  const urlParams = new URLSearchParams(window.location.search);
  const urlClientId = urlParams.get('clientId');

  if (urlClientId) {
    client_id = urlClientId;
    console.log("Chat Widget: Using clientId from URL parameter:", client_id);
  } else {
    const widgetScriptElement = document.getElementById('vegos-chat-widget-script');
    const scriptClientId = widgetScriptElement?.dataset?.clientId;
    if (scriptClientId) {
      client_id = scriptClientId;
      console.log("Chat Widget: Using clientId from script tag:", client_id);
    } else {
      console.error("Chat Widget Error: Could not find clientId in URL parameter ('clientId') or in script tag ('vegos-chat-widget-script' with 'data-client-id'). Widget may not function correctly.");
    }
  }

  const N8N_CHAT_WEBHOOK_URL = 'https://chatvegosai.app.n8n.cloud/webhook/4a467811-bd9e-4b99-a145-3672a6ae6ed2/chat';
  const API_URL = "https://gpt-chat-live.vercel.app/api/chat";
  const LEAD_CAPTURE_API_URL = "https://gpt-chat-live.vercel.app/api/capture_lead";
  const AUTO_OPEN_DELAY = 0;
  const CLIENT_CONFIG_API_URL = "https://gpt-chat-live.vercel.app/api/client_config";
  let welcomeMessage = null;
  const CHAT_HISTORY_KEY = client_id ? `chatHistory_${client_id}` : 'chatHistory_unknown';
  const LEAD_CAPTURE_KEYWORDS = {
    human_assistance: ['נציג', 'אנושי', 'אדם', 'human', 'agent'],
    complex_queries: ['מורכב', 'מסובך', 'לא הבנתי', 'complex'],
    pricing: ['מחיר', 'עלות', 'תמחור', 'price', 'cost'],
    detailed_info: ['פרטים', 'מידע נוסף', 'details', 'more info']
  };

  let chatHistory = [];
  let leadCaptureState = 'idle';
  let capturedName = '';
  let capturedContact = '';
  let capturedContext = null;
  let onboardingQuestions = [];
  let onboardingStep = 0;
  let onboardingActive = false;

  // --- CSS Injection for Pulse Animation ---
  const styleSheet = document.createElement("style");
  styleSheet.type = "text/css";
  styleSheet.innerText = `
    @keyframes pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.05); }
      100% { transform: scale(1); }
    }
    .chat-button-pulse {
      animation: pulse 2s infinite ease-in-out;
    }

    /* Improved responsive adjustments for mobile */
    @media (max-width: 600px) {
      #vegos-chat-window {
        width: 85% !important;
        max-width: 370px !important;
        left: 10px !important;
        right: auto !important;
        bottom: 75px !important;
        max-height: 70vh !important;
        height: auto !important;
        transform: none !important;
        -webkit-transform: none !important;
        zoom: 1 !important;
      }
      
      #vegos-chat-button {
        left: 10px !important;
        right: auto !important;
        bottom: 10px !important;
        width: 55px !important;
        height: 55px !important;
        transform: none !important;
        -webkit-transform: none !important;
        zoom: 1 !important;
      }
      
      #vegos-chat-body {
        max-height: calc(70vh - 125px) !important;
      }
      
      /* Fix input on mobile */
      #vegos-chat-input {
        font-size: 16px !important; /* Prevents zoom on iOS */
      }
    }
  `;
  document.head.appendChild(styleSheet);
  // --- End CSS Injection ---

  const chatButton = document.createElement("div");
  chatButton.id = 'vegos-chat-button'; // Add ID for CSS targeting
  const logoImg = document.createElement("img");
  logoImg.src = "https://cdn-icons-png.flaticon.com/512/1041/1041916.png"; // Changed to a standard chat bubble icon
  Object.assign(logoImg.style, {
    width: "100%",
    height: "100%",
  });
  chatButton.appendChild(logoImg);
  Object.assign(chatButton.style, {
    position: "fixed", bottom: "20px", left: "20px", // Changed back to left
    width: "60px", height: "60px",
    display: "flex", justifyContent: "center", alignItems: "center",
    cursor: "pointer",
    zIndex: "1000"
  });
  chatButton.classList.add('chat-button-pulse'); // Apply pulse animation class

  const chatWindow = document.createElement("div");
  chatWindow.id = 'vegos-chat-window'; // Add ID for CSS targeting
  Object.assign(chatWindow.style, {
    position: "fixed", bottom: "90px", left: "20px", // Changed back to left
    width: "300px",
    maxHeight: "calc(100vh - 120px)",
    borderRadius: "10px",
    backgroundColor: "white", boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
    zIndex: "1000", display: "none", flexDirection: "column", overflow: "hidden"
  });

  const chatHeader = document.createElement("div");
  Object.assign(chatHeader.style, {
    backgroundColor: "#25D366", color: "white", padding: "10px", // Consider making colors configurable
    fontWeight: "bold", display: "flex", justifyContent: "space-between", alignItems: "center"
  });

  // Create Title Span
  const titleSpan = document.createElement("span");
  titleSpan.textContent = client_id || 'Chat'; // Use determined client_id or default
  chatHeader.appendChild(titleSpan);

  // Create container for buttons/links on the right (or left in RTL)
  const headerControls = document.createElement("div");
  headerControls.style.display = "flex";
  headerControls.style.alignItems = "center";


  // Add Close Button
  const closeButton = document.createElement("span");
  closeButton.id = 'close-chat';
  closeButton.textContent = '×';
  closeButton.style.cursor = 'pointer';
  closeButton.style.fontSize = '20px'; // Make it slightly larger
  headerControls.appendChild(closeButton);

  chatHeader.appendChild(headerControls);

  const chatBody = document.createElement("div");
  chatBody.id = "vegos-chat-body"; // Add ID for CSS targeting
  Object.assign(chatBody.style, {
    padding: "10px",
    flexGrow: 1,
    overflowY: "auto", direction: "rtl"
  });

  const chatInputArea = document.createElement("div");
  chatInputArea.style.display = "flex";
  chatInputArea.style.padding = "10px";
  chatInputArea.style.borderTop = "1px solid #ececec";

  const chatInput = document.createElement("input");
  chatInput.id = "vegos-chat-input"; // Add ID for CSS targeting
  Object.assign(chatInput, {
    type: "text", placeholder: "הקלד הודעה..." // Consider making placeholder configurable
  });
  Object.assign(chatInput.style, {
    flex: "1", padding: "8px", border: "1px solid #ddd",
    borderRadius: "4px", marginRight: "5px", direction: "rtl"
  });

  const sendButton = document.createElement("button");
  sendButton.id = "send-message"; // Add ID for event listener
  sendButton.textContent = "שלח"; // Consider making text configurable
  Object.assign(sendButton.style, {
    backgroundColor: "#25D366", color: "white", border: "none", // Consider making colors configurable
    borderRadius: "4px", padding: "8px 15px", cursor: "pointer",
    minWidth: "60px", // Ensure minimum width for better touch targets
    touchAction: "manipulation" // Improve touch handling
  });

  chatInputArea.appendChild(chatInput);
  chatInputArea.appendChild(sendButton);

  // Create Powered by link
  const poweredBy = document.createElement("div");
  poweredBy.style.padding = "5px 10px";
  poweredBy.style.textAlign = "center";
  poweredBy.style.fontSize = "10px";
  poweredBy.style.color = "#aaa";
  poweredBy.style.borderTop = "1px solid #ececec";

  const whatsappLink = "https://wa.me/972523985505?text=" + encodeURIComponent("היי אני מעוניין/ת בצאט בוט חכם לאתר שלי!"); // Consider making this configurable or removing
  poweredBy.innerHTML = `Powered by <a href="${whatsappLink}" target="_blank" style="color: #888; text-decoration: none;">Orel Aharon</a>`;

  chatWindow.appendChild(chatHeader);
  chatWindow.appendChild(chatBody);
  chatWindow.appendChild(chatInputArea);
  chatWindow.appendChild(poweredBy);

  document.body.appendChild(chatButton);
  document.body.appendChild(chatWindow);

  // --- Load Chat History ---
  function loadHistory() {
    if (!client_id) return;
    const savedHistory = localStorage.getItem(CHAT_HISTORY_KEY);
    if (savedHistory) {
      try {
        chatHistory = JSON.parse(savedHistory);
        chatHistory.forEach(msg => appendMessage(msg.role, msg.text, false));
      } catch (e) {
        console.error("Error parsing chat history:", e);
        localStorage.removeItem(CHAT_HISTORY_KEY);
      }
    }
  }

  // --- Append Message Function ---
  function appendMessage(role, text, save = true) {
    const msg = document.createElement("div");
    msg.style.borderRadius = "5px";
    msg.style.padding = "8px";
    msg.style.marginBottom = "10px";
    msg.style.maxWidth = "80%";
    msg.style.wordWrap = "break-word";
    msg.style.backgroundColor = role === "user" ? "#dcf8c6" : "#ececec";
    msg.style.alignSelf = role === "user" ? "flex-start" : "flex-end";
    msg.style.marginLeft = role === "user" ? "0" : "auto";
    msg.style.marginRight = role === "user" ? "auto" : "0";
    msg.textContent = text;
    document.getElementById("vegos-chat-body").appendChild(msg);
    document.getElementById("vegos-chat-body").scrollTop = document.getElementById("vegos-chat-body").scrollHeight;

    if (client_id && save) {
      if (leadCaptureState === 'idle' || role === 'user') {
        chatHistory.push({ role, text });
        const MAX_HISTORY_LENGTH = 10;
        if (chatHistory.length > MAX_HISTORY_LENGTH) {
          chatHistory = chatHistory.slice(chatHistory.length - MAX_HISTORY_LENGTH);
        }
        try {
          localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatHistory));
        } catch (e) {
          console.error("Error saving chat history:", e);
        }
      }
    }
    return msg;
  }

  // --- Send Lead via Fetch Function ---
  async function sendLeadViaFetch() {
    if (!client_id) {
      console.error("Cannot send lead: client_id is missing.");
      appendMessage('bot', "אירעה שגיאה פנימית (קוד: L1).");
      return;
    }

    const leadData = {
      name: capturedName,
      contact: capturedContact,
      clientId: client_id,
      context: capturedContext,
      history: chatHistory,
      leadScore: calculateLeadScore(capturedContext),
      timestamp: new Date().toISOString()
    };

    try {
      const response = await fetch(LEAD_CAPTURE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(leadData)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      appendMessage('bot', "תודה! קיבלנו את פרטיך ונציג ייצור קשר בהקדם.");
      resetLeadCaptureState();
    } catch (error) {
      console.error("Error sending lead:", error);
      appendMessage('bot', "אירעה שגיאה בשליחת הפרטים. נסה שוב מאוחר יותר.");
    }
  }

  // --- Lead Capture Flow with AI involvement ---
  async function handleLeadCaptureStep(userInput) {
    // שלח את התשובה של המשתמש ל-AI יחד עם ההקשר
    try {
      showLoading();
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userInput,
          client_id: client_id,
          lead_capture_state: leadCaptureState,
          captured_name: capturedName,
          captured_contact: capturedContact,
          context: capturedContext,
          history: chatHistory,
          lead_capture: true // דגל שמדובר בתהליך ליד
        })
      });
      const data = await response.json();
      hideLoading();

      // ניהול זרימת הליד לפי תשובת ה-AI
      if (data.lead_capture_cancelled) {
        appendMessage('bot', data.reply || 'אין בעיה, לא אשמור את פרטיך. אם תרצה עזרה נוספת – אני כאן!');
        resetLeadCaptureState();
        return;
      }
      if (leadCaptureState === 'askingName') {
        if (data.captured_name) {
          capturedName = data.captured_name;
          leadCaptureState = 'askingContact';
          appendMessage('bot', data.reply || 'תודה! אשמח לקבל מספר טלפון או כתובת אימייל ליצירת קשר.');
        } else {
          appendMessage('bot', data.reply || 'לא הבנתי, אשמח לשמוע את שמך.');
        }
        return;
      }
      if (leadCaptureState === 'askingContact') {
        if (data.captured_contact) {
          capturedContact = data.captured_contact;
          await sendLeadViaFetch();
          return;
        } else {
          appendMessage('bot', data.reply || 'לא קיבלתי מספר טלפון או אימייל תקין. אפשר לנסות שוב?');
        }
        return;
      }
    } catch (error) {
      hideLoading();
      appendMessage('bot', 'מצטער, אירעה שגיאה. אנא נסה שוב.');
    }
  }

  // --- עדכון שליחת הודעה ---
  async function sendMessage() {
    const messageInput = document.getElementById('vegos-chat-input');
    const message = messageInput.value.trim();
    if (!message) return;
    appendMessage("user", message);
    messageInput.value = '';

    // אם אנחנו בתהליך onboarding
    if (onboardingActive && onboardingQuestions.length > 0 && onboardingStep < onboardingQuestions.length) {
      // אפשר לשמור את התשובה בהיסטוריה או לשלוח ל-AI
      // כרגע רק מציגים את השאלה הבאה
      onboardingStep++;
      if (onboardingStep < onboardingQuestions.length) {
        appendMessage('bot', onboardingQuestions[onboardingStep]);
      } else {
        onboardingActive = false;
      }
      return;
    }

    // אם אנחנו בתהליך ליד – נשלח ל-AI לטיפול חכם
    if (leadCaptureState === 'askingName' || leadCaptureState === 'askingContact') {
      await handleLeadCaptureStep(message);
      return;
    }

    try {
      showLoading();
      const intentResponse = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          client_id: client_id,
          analyze_intent: true,
          history: chatHistory
        })
      });
      const intentData = await intentResponse.json();
      hideLoading();
      if (intentData.should_capture_lead) {
        startLeadCaptureFlow(intentData);
        return;
      }
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          client_id: client_id,
          history: chatHistory
        })
      });
      const data = await response.json();
      appendMessage('bot', data.reply);
    } catch (error) {
      hideLoading();
      appendMessage('bot', 'מצטער, אירעה שגיאה. אנא נסה שוב.');
    }
  }

  // --- Event Listeners ---
  const chatBtn = document.getElementById("vegos-chat-button");
  if (chatBtn) {
    chatBtn.addEventListener("click", () => {
      const chatWindow = document.getElementById("vegos-chat-window");
      const chatButton = document.getElementById("vegos-chat-button");
      if (chatWindow && chatButton) {
        if (chatWindow.style.display === "none" || !chatWindow.style.display) {
          chatWindow.style.display = "flex";
          chatButton.classList.remove('chat-button-pulse');
        } else {
          chatWindow.style.display = "none";
          chatButton.classList.add('chat-button-pulse');
        }
      }
    });
  }

  const closeBtn = document.getElementById("close-chat");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      const chatWindow = document.getElementById("vegos-chat-window");
      const chatButton = document.getElementById("vegos-chat-button");
      if (chatWindow && chatButton) {
        chatWindow.style.display = "none";
        chatButton.classList.add('chat-button-pulse');
      }
    });
  }

  // Update send button event listener
  const sendBtn = document.getElementById("send-message");
  if (sendBtn) {
    sendBtn.addEventListener("click", function(e) {
      e.preventDefault(); // Prevent default button behavior
      sendMessage();
    });
  }

  // Update input event listener
  const chatInputEl = document.getElementById("vegos-chat-input");
  if (chatInputEl) {
    chatInputEl.addEventListener("keypress", function(e) {
      if (e.key === "Enter") {
        e.preventDefault(); // Prevent default enter behavior
        sendMessage();
      }
    });
  }

  const minimizeBtn = document.getElementById("minimize-chat");
  if (minimizeBtn) {
    minimizeBtn.addEventListener("click", function() {
      const chatWidget = document.getElementById("vegos-chat-window");
      const minimizeButton = document.getElementById("minimize-chat");
      if (chatWidget && minimizeButton) {
        if (chatWidget.classList.contains('minimized')) {
          chatWidget.classList.remove('minimized');
          minimizeButton.textContent = '−';
        } else {
          chatWidget.classList.add('minimized');
          minimizeButton.textContent = '+';
        }
      }
    });
  }

  // --- Load History and Fetch Config ---
  loadHistory();
  fetchClientConfig();

  // --- Fetch Client Configuration ---
  async function fetchClientConfig() {
    if (!client_id) {
      console.error("Cannot fetch client config: client_id is missing.");
      if (AUTO_OPEN_DELAY !== null) {
        setTimeout(openChatProactively, AUTO_OPEN_DELAY);
      }
      return;
    }
    try {
      const response = await fetch(`${CLIENT_CONFIG_API_URL}?client_id=${encodeURIComponent(client_id)}`);
      if (!response.ok) {
        console.error(`Error fetching client config: HTTP status ${response.status}`);
      } else {
        const config = await response.json();
        if (config.welcome_message) {
          welcomeMessage = config.welcome_message;
          console.log("Using client-specific welcome message:", welcomeMessage);
        } else {
          console.log("No client-specific welcome message found, using default.");
        }
        if (Array.isArray(config.onboarding_questions) && config.onboarding_questions.length > 0) {
          onboardingQuestions = config.onboarding_questions;
          onboardingActive = true;
          onboardingStep = 0;
        }
      }
    } catch (error) {
      console.error("Error fetching client config:", error);
    } finally {
      if (AUTO_OPEN_DELAY !== null) {
        setTimeout(openChatProactively, AUTO_OPEN_DELAY);
      }
    }
  }

  // --- Auto Open Chat ---
  function openChatProactively() {
    if (!client_id || AUTO_OPEN_DELAY === null) return;
    const chatWindow = document.getElementById("vegos-chat-window");
    const chatButton = document.getElementById("vegos-chat-button");
    if (chatWindow.style.display === 'none') {
      chatWindow.style.display = 'flex';
      chatButton.classList.remove('chat-button-pulse');
      if (welcomeMessage && (chatHistory.length === 0 || chatHistory[chatHistory.length - 1].text !== welcomeMessage)) {
        appendMessage('bot', welcomeMessage);
      }
      // אם יש שאלות התחלתיות, נתחיל אותן
      if (onboardingActive && onboardingQuestions.length > 0) {
        setTimeout(() => {
          appendMessage('bot', onboardingQuestions[onboardingStep]);
        }, 500);
      }
    }
  }

  // --- Lead Capture Functions ---
  function startLeadCaptureFlow(intentData) {
    capturedContext = {
      intent: intentData.intent,
      confidence: intentData.confidence,
      conversation_history: chatHistory
    };
    
    leadCaptureState = 'askingName';
    appendMessage('bot', intentData.suggested_response);
  }

  function resetLeadCaptureState() {
    leadCaptureState = 'idle';
    capturedName = '';
    capturedContact = '';
    capturedContext = null;
  }

  function calculateLeadScore(leadData) {
    if (!leadData) return 0;
    
    let score = 0;
    score += leadData.confidence * 0.5;
    
    const intentScores = {
      pricing: 30,
      complex_queries: 25,
      human_assistance: 20,
      detailed_info: 15,
      general_inquiry: 10
    };
    
    score += intentScores[leadData.intent] || 0;
    
    const conversationLength = leadData.conversation_history?.length || 0;
    score += Math.min(conversationLength * 2, 20);
    
    return Math.min(score, 100);
  }

  // --- UI Helper Functions ---
  function showLoading() {
    const loadingElement = document.createElement("div");
    loadingElement.className = "loading";
    loadingElement.id = "loading-indicator";
    document.getElementById("vegos-chat-body").appendChild(loadingElement);
  }

  function hideLoading() {
    const loadingElement = document.getElementById("loading-indicator");
    if (loadingElement) {
      loadingElement.classList.add('fade-out');
      setTimeout(() => {
        loadingElement.remove();
      }, 300);
    }
  }
});
