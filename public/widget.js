console.log("Chat Widget: Starting to load...");

// Add font stylesheet
const fontStylesheet = document.createElement('link');
fontStylesheet.rel = 'stylesheet';
fontStylesheet.href = 'https://gpt-chat-live.vercel.app/fonts.css';
document.head.appendChild(fontStylesheet);

document.addEventListener("DOMContentLoaded", async function () { // Added async
  console.log("Chat Widget: DOM Content Loaded");
  // --- Get Client + API from <script data-*> ---
  const scriptTag = document.currentScript || document.querySelector('script[data-client-id]');
  console.log('Chat Widget: Script tag found:', scriptTag);
  const client_id = scriptTag?.dataset?.clientId;
  console.log('Chat Widget: Client ID extracted:', client_id);
  let baseUrl = scriptTag?.dataset?.apiUrl || scriptTag.src.split('/').slice(0,-1).join('/');
  console.log('Chat Widget: Base URL before fix:', baseUrl);

  // Fix if data-api-url includes the full path
  if (baseUrl && baseUrl.endsWith('/api/chat')) {
    baseUrl = baseUrl.replace('/api/chat', '');
    console.log('Chat Widget: Base URL after fix:', baseUrl);
  }

  if (!client_id) {
    console.error('Chat-Widget ❌ client_id missing in <script>');
    return;
  }

  console.log('Chat Widget: Final config - client_id:', client_id, 'baseUrl:', baseUrl);

  const API_URL = `${baseUrl}/api/chat`;
  const LEAD_CAPTURE_API_URL = `${baseUrl}/api/capture_lead`;
  const CLIENT_CONFIG_API_URL = `${baseUrl}/api/client_config`;
  const AUTO_OPEN_DELAY = 0;
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

  // Default colors
  const defaultColors = {
    widgetPrimaryColor: '#25D366', // Default for header, user bubble, send button
    widgetSecondaryColor: '#f9f9f9', // Default for chat window background
    buttonColor: '#25D366', // Default for send button
    headerColor: '#25D366', // Default for header background
    userMessageColor: '#25D366', // Default for user bubble background
    botMessageColor: '#f1f1f1' // Default for bot bubble background
  };

  let clientConfig = {}; // Variable to hold fetched config

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
  logoImg.src = client_id ?
    `https://gpt-chat-live.vercel.app/logo/${client_id}.png` :
    `https://gpt-chat-live.vercel.app/logo/default.png`;
  logoImg.onerror = function() {
    this.src = `https://gpt-chat-live.vercel.app/logo/default.png`;
  };
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
    zIndex: "1000",
    borderRadius: "50%", // Keep circular shape but remove blue background
    boxShadow: "none", // Remove shadow
    backgroundColor: "transparent", // Make background transparent
    color: "#fff",
    fontSize: "16px",
    padding: "10px",
    fontFamily: "'Heebo', sans-serif",
    fontWeight: "900" // Using Heebo Black weight
});

  const chatWindow = document.createElement("div");
  chatWindow.id = 'vegos-chat-window'; // Add ID for CSS targeting
  Object.assign(chatWindow.style, {
    position: "fixed", bottom: "90px", left: "20px", // Changed back to left
    width: "350px",
    maxHeight: "calc(100vh - 120px)",
    borderRadius: "10px",
    // backgroundColor will be set by applyClientColors
    boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)",
    zIndex: "1000", display: "none", flexDirection: "column", overflow: "hidden",
    padding: "20px",
    fontFamily: "'Heebo', sans-serif", // Change font to Heebo for chat window
    color: "#333",
    direction: "rtl"
  });

  const chatHeader = document.createElement("div");
  chatHeader.id = 'vegos-chat-header'; // Added ID
  Object.assign(chatHeader.style, {
    // backgroundColor and color will be set by applyClientColors
    padding: "10px", // Consider making colors configurable
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
  chatBody.className = "chat-messages"; // Add the correct class for styling
  Object.assign(chatBody.style, {
    padding: "10px",
    flexGrow: 1,
    overflowY: "auto",
    direction: "rtl",
    maxHeight: "calc(100vh - 200px)" // Ensure proper height calculation
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
    // backgroundColor and color will be set by applyClientColors
    border: "none", // Consider making colors configurable
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
  console.log("Client: After appending chat elements."); // Added log

  // Function to apply fetched client configuration (colors and size)
  function applyClientConfig() {
    const config = { ...defaultColors, ...clientConfig }; // Merge defaults with fetched config

    // Apply colors to elements
    const chatWindowElement = document.getElementById('vegos-chat-window');
    if (chatWindowElement) {
      chatWindowElement.style.backgroundColor = config.widgetSecondaryColor;
      // Apply size if provided
      if (config.widgetWidth) {
        chatWindowElement.style.width = config.widgetWidth;
      }
      if (config.widgetHeight) {
        chatWindowElement.style.maxHeight = config.widgetHeight;
      }
    }

    const chatHeaderElement = document.getElementById('vegos-chat-header');
    if (chatHeaderElement) {
      chatHeaderElement.style.backgroundColor = config.headerColor;
      chatHeaderElement.style.color = '#fff'; // Keep header text white for now
    }

    const sendButtonElement = document.getElementById('send-message');
    if (sendButtonElement) {
      sendButtonElement.style.backgroundColor = config.buttonColor;
      sendButtonElement.style.color = '#fff'; // Keep button text white for now
    }

    // Message bubble colors are applied in appendMessage
  }

  // Fetch client configuration and apply settings
  if (client_id) {
    try {
      const config = await fetchClientConfig(); // Call the async function
      if (config) {
        clientConfig = config;
        console.log("Client: Fetched client config:", clientConfig);
      } else {
        console.warn("Client: Failed to fetch client config, using defaults.");
      }
    } catch (error) {
      console.error("Client: Error fetching client config:", error);
    }
  } else {
    console.warn("Client: client_id missing, cannot fetch client config. Using defaults.");
  }

  // Apply configuration after fetching (or immediately if no client_id)
  applyClientConfig();

  // --- Load History with Expiry ---
  function loadHistory() {
    try {
      const raw = localStorage.getItem(CHAT_HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Check for timestamp
        const lastTimestamp = localStorage.getItem(CHAT_HISTORY_KEY + '_ts');
        const now = Date.now();
        const THREE_HOURS = 3 * 60 * 60 * 1000;
        if (lastTimestamp && now - parseInt(lastTimestamp, 10) > THREE_HOURS) {
          // More than 3 hours passed, clear history
          localStorage.removeItem(CHAT_HISTORY_KEY);
          localStorage.removeItem(CHAT_HISTORY_KEY + '_ts');
          chatHistory = [];
        } else {
          chatHistory = Array.isArray(parsed) ? parsed : [];
        }
      }
    } catch (e) {
      chatHistory = [];
    }
  }

  // --- Save History with Timestamp ---
  function saveHistory() {
    try {
      localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatHistory));
      localStorage.setItem(CHAT_HISTORY_KEY + '_ts', Date.now().toString());
    } catch (e) {
      // Ignore errors
    }
  }
// --- Append Message Function ---
function appendMessage(role, text, save = true) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
      console.log(`Client: Attempted to append empty or invalid message for role: ${role}. Aborting.`);
      return;
  }

  const msg = document.createElement("div");
  msg.classList.add('message');

  // Use fetched colors or defaults
  const userBubbleColor = clientConfig.userMessageColor || defaultColors.userMessageColor;
  const botBubbleColor = clientConfig.botMessageColor || defaultColors.botMessageColor;

  // Clear styling and ensure proper bubble structure
  if (role === 'user') {
      msg.classList.add('user-message');
      msg.style.cssText = `
          justify-content: flex-end;
          margin-left: auto;
          margin-right: 0;
      `;
      msg.innerHTML = `
          <div class="bubble-content" style="
              background-color: ${userBubbleColor};
              color: #fff; /* Keep text white for user messages */
              border-bottom-right-radius: 5px;
              border-bottom-left-radius: 18px;
              padding: 12px 18px;
              border-radius: 18px;
              max-width: 80%;
              word-break: break-word;
              font-size: 15px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          ">${text}</div>
          <div class="bubble-tail user-tail" style="
              width: 0;
              height: 0;
              border-style: solid;
              border-width: 0 0 18px 18px;
              border-color: transparent transparent ${userBubbleColor} transparent;
              position: relative;
              left: 6px;
              margin-right: -6px;
          "></div>
      `;
  } else {
      msg.classList.add('bot-message');
      msg.style.cssText = `
          justify-content: flex-start;
          margin-right: auto;
          margin-left: 0;
      `;
      msg.innerHTML = `
          <div class="bubble-tail bot-tail" style="
              width: 0;
              height: 0;
              border-style: solid;
              border-width: 0 18px 18px 0;
              border-color: transparent ${botBubbleColor} transparent transparent;
              position: relative;
              right: 6px;
              margin-left: -6px;
          "></div>
          <div class="bubble-content" style="
              background-color: ${botBubbleColor};
              color: #333; /* Keep text dark for bot messages */
              border-bottom-left-radius: 5px;
              border-bottom-right-radius: 18px;
              padding: 12px 18px;
              border-radius: 18px;
              max-width: 80%;
              word-break: break-word;
              font-size: 15px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.04);
          ">${text}</div>
      `;
  }

  const chatBody = document.getElementById("vegos-chat-body");
  chatBody.appendChild(msg);


    // Ensure proper scrolling
    requestAnimationFrame(() => {
        chatBody.scrollTop = chatBody.scrollHeight;
    });
    
    if (client_id && save) {
        if (leadCaptureState === 'idle' || role === 'user') {
            chatHistory.push({ role, text });
            const MAX_HISTORY_LENGTH = 10;
            if (chatHistory.length > MAX_HISTORY_LENGTH) {
                chatHistory = chatHistory.slice(chatHistory.length - MAX_HISTORY_LENGTH);
            }
            saveHistory();
        }
    }
    return msg;
  }

  // --- Send Lead via Fetch Function ---
  async function sendLeadViaFetch() {
    console.log("[LEAD] Starting lead capture process...");
    console.log("[LEAD] Client ID:", client_id);
    console.log("[LEAD] Captured name:", capturedName);
    console.log("[LEAD] Captured contact:", capturedContact);
    console.log("[LEAD] Context:", capturedContext);

    if (!client_id) {
      console.error("[LEAD] Cannot send lead: client_id is missing.");
      appendMessage('bot', "אירעה שגיאה פנימית (קוד: L1).");
      return;
    }

    if (!capturedName || !capturedContact) {
      console.error("[LEAD] Cannot send lead: missing name or contact info.");
      appendMessage('bot', "חסרים פרטים נדרשים. אנא נסה שוב.");
      return;
    }

    const leadData = {
      name: capturedName,
      contact: capturedContact,
      client_id: client_id,
      intent: capturedContext?.intent || 'unknown',
      confidence: capturedContext?.confidence || 0,
      conversation_history: chatHistory,
      lead_score: calculateLeadScore(capturedContext),
      timestamp: new Date().toISOString()
    };

    console.log("[LEAD] Sending lead data to server:", leadData);

    try {
      console.log("[LEAD] Making POST request to:", LEAD_CAPTURE_API_URL);
      
      // Add timeout to the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(LEAD_CAPTURE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(leadData),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
      console.log("[LEAD] Server response status:", response.status);
      console.log("[LEAD] Server response headers:", Object.fromEntries(response.headers.entries()));
      
      let responseData;
      try {
        responseData = await response.json();
        console.log("[LEAD] Server response data:", responseData);
      } catch (parseError) {
        console.error("[LEAD] Failed to parse JSON response:", parseError);
        const textResponse = await response.text();
        console.log("[LEAD] Raw response text:", textResponse);
        throw new Error(`Invalid JSON response: ${textResponse}`);
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}, message: ${responseData?.error || 'Unknown error'}`);
      }

      console.log("[LEAD] Lead sent successfully!");
      appendMessage('bot', "תודה! קיבלנו את פרטיך ונציג ייצור קשר בהקדם.");
      resetLeadCaptureState();
    } catch (error) {
      console.error("[LEAD] Error sending lead:", error);
      
      if (error.name === 'AbortError') {
        appendMessage('bot', "אירעה שגיאה בשליחת הפרטים - חיבור איטי מדי. נסה שוב מאוחר יותר.");
      } else if (error.message.includes('Failed to fetch')) {
        appendMessage('bot', "אירעה שגיאה בחיבור לשרת. בדוק את החיבור לאינטרנט ונסה שוב.");
      } else {
        appendMessage('bot', `אירעה שגיאה בשליחת הפרטים: ${error.message}`);
      }
    }
  }
  console.log("Client: After sendLeadViaFetch function definition."); // Added log

  // --- Lead Capture Flow with AI involvement ---
  async function handleLeadCaptureStep(userInput) {
    console.log(`Client: handleLeadCaptureStep called. Current state: ${leadCaptureState}, Input: "${userInput}"`); // Modified log for clarity

    // Add a check for cancellation or re-confirmation during lead capture
    const lowerInput = userInput.toLowerCase();
    if (containsAny(lowerInput, ['לא תודה', 'בטל', 'עצור', 'לא רוצה להשאיר פרטים', 'אני רק רוצה לדבר עם נציג'])) {
        console.log("Client: Lead capture cancelled by user.");
        appendMessage('bot', 'אין בעיה, לא אשמור את פרטיך. אם תרצה עזרה נוספת – אני כאן!');
        resetLeadCaptureState();
        return;
    }
    
    // If the user reiterates wanting a human agent during name/contact capture
    if (leadCaptureState === 'askingName' || leadCaptureState === 'askingContact') {
        if (containsAny(lowerInput, ['נציג', 'אנושי', 'אדם', 'human', 'agent'])) {
             console.log("Client: User reiterated wanting human assistance during lead capture.");
             appendMessage('bot', 'הבנתי, אשמח לחבר אותך לנציג. אנא המתן.');
             resetLeadCaptureState();
             return;
        }
    }

    // Always ask for name first, even if user tries to provide contact info
    if (leadCaptureState === 'askingName') {
        // If user tries to give contact info instead of name
        const emailRegex = /.+@.+\..+/;
        const phoneRegex = /^[\d\s\-\(\)]+$/;
        if (emailRegex.test(userInput.trim()) || phoneRegex.test(userInput.trim())) {
            appendMessage('bot', 'נראה שנתת מספר טלפון או אימייל במקום שם. אשמח לשמוע קודם את שמך המלא.');
            return;
        }
        // Basic validation: Check if input is not too short or just whitespace
        if (userInput.trim().length > 1 && !/^[0-9]+$/.test(userInput.trim())) {
            capturedName = userInput.trim();
            leadCaptureState = 'askingContact';
            appendMessage('bot', 'תודה! אשמח לקבל מספר טלפון או כתובת אימייל ליצירת קשר.');
        } else {
            // Clarify that we are asking for the name
            appendMessage('bot', 'נראה שזו לא תשובה תקינה לשם. אנא הקלד את שמך המלא (לפחות 2 תווים, לא מספרים בלבד).');
        }
        return; // Stop processing after handling name input
    }

    if (leadCaptureState === 'askingContact') {
        // Basic validation: Check if input looks like an email or phone number
        const emailRegex = /.+@.+\..+/;
        const phoneRegex = /^[\d\s\-\(\)]+$/; // Simple regex for digits, spaces, hyphens, parentheses

        // If user tries to give name again
        if (userInput.trim().length > 1 && !emailRegex.test(userInput.trim()) && !phoneRegex.test(userInput.trim()) && !/^[0-9]+$/.test(userInput.trim())) {
            appendMessage('bot', 'כבר קיבלתי את שמך. עכשיו אשמח לקבל מספר טלפון או אימייל ליצירת קשר.');
            return;
        }

        if (emailRegex.test(userInput.trim()) || phoneRegex.test(userInput.trim())) {
            capturedContact = userInput.trim();
            console.log(`Client: Captured contact: ${capturedContact}. Calling sendLeadViaFetch.`); // Added log
            await sendLeadViaFetch(); // Call the function to send the lead
            // sendLeadViaFetch will handle resetting state and showing success/error
        } else {
            appendMessage('bot', 'לא קיבלתי מספר טלפון או אימייל תקין. אפשר לנסות שוב?');
        }
        return; // Stop processing after handling contact input
    }

    // If not in a lead capture state, proceed to send message to AI
    try {
      showLoading();
      const intentResponse = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userInput,
          client_id: client_id,
          analyze_intent: true,
          history: chatHistory
        })
      });
      const intentData = await intentResponse.json();
      hideLoading();
      if (intentData.should_capture_lead) {
        console.log("Client: Intent analysis returned should_capture_lead = true. Starting lead capture flow."); // Added log
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
      
      // Check if the reply from the API is valid before appending
      if (data && data.reply && typeof data.reply === 'string' && data.reply.trim().length > 0) {
          appendMessage('bot', data.reply);
      } else {
          console.warn("Client: Received empty or invalid reply from API in handleLeadCaptureStep.", data);
      }
      
      // Check if lead capture should be triggered from the response
      if (data.trigger_lead_capture && data.intent_analysis) {
        console.log("Client: Server response indicates lead capture should be triggered. Starting lead capture flow.");
        startLeadCaptureFlow(data.intent_analysis);
      }
    } catch (error) {
      hideLoading();
      appendMessage('bot', 'מצטער, אירעה שגיאה. אנא נסה שוב.');
    }
  }
  console.log("Client: After handleLeadCaptureStep function definition."); // Added log

  // --- עדכון שליחת הודעה ---
  async function sendMessage() {
    console.log("Client: sendMessage function started."); // Added log
    const messageInput = document.getElementById('vegos-chat-input');
    const message = messageInput.value.trim();

    // Check if the message is empty or contains only whitespace after trimming
    if (!message || message.length === 0) {
        console.log("Client: Attempted to send empty message. Aborting.");
        return; // Prevent sending empty messages
    }

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
    console.log(`Client: sendMessage - Checking leadCaptureState: ${leadCaptureState}`); // Added log

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
        console.log("Client: Intent analysis returned should_capture_lead = true. Starting lead capture flow."); // Added log
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
      
      // Check if the reply from the API is valid before appending
      if (data && data.reply && typeof data.reply === 'string' && data.reply.trim().length > 0) {
          appendMessage('bot', data.reply);
      } else {
          console.warn("Client: Received empty or invalid reply from API in sendMessage.", data);
          // Optionally append a generic error message if the reply is empty
          // appendMessage('bot', 'מצטער, לא קיבלתי תשובה מהשרת.');
      }
      
      // Check if lead capture should be triggered from the response
      if (data.trigger_lead_capture && data.intent_analysis) {
        console.log("Client: Server response indicates lead capture should be triggered. Starting lead capture flow.");
        startLeadCaptureFlow(data.intent_analysis);
      }
    } catch (error) {
      hideLoading();
      appendMessage('bot', 'מצטער, אירעה שגיאה. אנא נסה שוב.');
    }
  }
  console.log("Client: After sendMessage function definition."); // Added log

  console.log("Client: Reaching Event Listeners section."); // Added log
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
    console.log("Client: Send button event listener attached."); // Added log
  } else {
    console.error("Client: Send button element (#send-message) not found."); // Added log
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
    console.log("Client: Input field keypress event listener attached."); // Added log
  } else {
    console.error("Client: Input field element (#vegos-chat-input) not found."); // Added log
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
    console.log("Client: Entering startLeadCaptureFlow."); // Added log
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

  // --- Helper function to check if message contains any of the keywords ---
  function containsAny(message, keywords) {
    return keywords.some(keyword => message.includes(keyword.toLowerCase()));
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

  // לוגו בכותרת – שם חדש כדי למנוע כפילות
  const headerLogoImg = document.createElement("img");
  // Dynamic logo path based on client_id
  headerLogoImg.src = client_id ? 
    `https://gpt-chat-live.vercel.app/logo/${client_id}.png` :
    `https://gpt-chat-live.vercel.app/logo/default.png`;
  
  // Add error handling for logo loading
  headerLogoImg.onerror = function() {
    this.src = `https://gpt-chat-live.vercel.app/logo/default.png`;
  };
  Object.assign(headerLogoImg.style, {
      width: "30px",
      height: "30px",
      marginRight: "10px"
  });
  chatHeader.insertBefore(headerLogoImg, titleSpan);
});
