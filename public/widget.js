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
    const scriptClientId = widgetScriptElement?.dataset?.clientId; // Use optional chaining
    if (scriptClientId) {
      client_id = scriptClientId;
      console.log("Chat Widget: Using clientId from script tag:", client_id);
    } else {
      console.error("Chat Widget Error: Could not find clientId in URL parameter ('clientId') or in script tag ('vegos-chat-widget-script' with 'data-client-id'). Widget may not function correctly.");
      // Optionally, prevent the widget from initializing further if client_id is critical
      // return;
    }
  }
  // --- End Get Client ID ---

const N8N_CHAT_WEBHOOK_URL = 'https://chatvegosai.app.n8n.cloud/webhook/4a467811-bd9e-4b99-a145-3672a6ae6ed2/chat'; // New n8n webhook
  const API_URL = "https://gpt-chat-live.vercel.app/api/chat";
  const LEAD_CAPTURE_API_URL = "https://gpt-chat-live.vercel.app/api/capture_lead"; // New endpoint
  const WELCOME_MESSAGE = "היי אני vegos העוזר החכם שלך לכל מה שתצטרך";
  const AUTO_OPEN_DELAY = 5000; // milliseconds (5 seconds)
  // Use the dynamic client_id for the history key
  const CHAT_HISTORY_KEY = client_id ? `chatHistory_${client_id}` : 'chatHistory_unknown'; // Fallback key if ID is missing
  const LEAD_CAPTURE_KEYWORDS = ['נציג', 'פרטים', 'עזרה', 'contact', 'agent', 'representative', 'human', 'speak']; // Keywords to trigger lead capture
  // Placeholder for API response indicating inability to answer - needs coordination with API
  const API_CANNOT_ANSWER_RESPONSE = "אני מצטער, אין לי מידע על זה. האם תרצה להשאיר פרטים ונציג יחזור אליך?";

  let chatHistory = [];
  let leadCaptureState = 'idle'; // 'idle', 'askingName', 'askingContact'
  let capturedName = '';
  let capturedContact = '';

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

    /* Responsive adjustments for smaller screens */
    @media (max-width: 600px) {
      #vegos-chat-window { /* Use an ID for easier targeting */
        width: 90% !important; /* More width on mobile */
        max-width: calc(100% - 20px) !important; /* Ensure it doesn't exceed screen width */
        left: 10px !important;
        right: 10px !important; /* Set both left and right for centering/spanning */
        bottom: 75px !important; /* Adjust bottom position relative to button */
        max-height: calc(100vh - 95px) !important; /* Adjust max height accordingly */
      }
      #vegos-chat-button { /* Use an ID for easier targeting */
         left: 10px !important;
         bottom: 10px !important;
         width: 50px !important; /* Slightly smaller button */
         height: 50px !important;
      }
    }
  `;
  document.head.appendChild(styleSheet);
  // --- End CSS Injection ---

  const chatButton = document.createElement("div");
  chatButton.id = 'vegos-chat-button'; // Add ID for CSS targeting
  const logoImg = document.createElement("img");
  logoImg.src = "https://gpt-chat-live.vercel.app/logo/logo.png"; // Consider making this configurable
  Object.assign(logoImg.style, {
    width: "100%",
    height: "100%",
  });
  chatButton.appendChild(logoImg);
  Object.assign(chatButton.style, {
    position: "fixed", bottom: "20px", left: "20px", // Consider making position configurable
    width: "60px", height: "60px",
    display: "flex", justifyContent: "center", alignItems: "center",
    cursor: "pointer",
    zIndex: "1000"
  });
  chatButton.classList.add('chat-button-pulse'); // Apply pulse animation class

  const chatWindow = document.createElement("div");
  chatWindow.id = 'vegos-chat-window'; // Add ID for CSS targeting
  Object.assign(chatWindow.style, {
    position: "fixed", bottom: "90px", left: "20px", // Adjust if button position changes
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

  // Add Admin Link (if client_id exists)
  if (client_id) {
      const adminLink = document.createElement("a");
      adminLink.textContent = "מעבר לאדמין";
      adminLink.href = `https://admin.chatvegosai.app/client/${encodeURIComponent(client_id)}`;
      adminLink.target = "_blank"; // Open in new tab
      Object.assign(adminLink.style, {
          color: 'white',
          textDecoration: 'none',
          fontSize: '12px',
          marginRight: '15px' // Space between link and close button
      });
      headerControls.appendChild(adminLink);
  }

  // Add Close Button
  const closeButton = document.createElement("span");
  closeButton.id = 'close-chat';
  closeButton.textContent = '×';
  closeButton.style.cursor = 'pointer';
  closeButton.style.fontSize = '20px'; // Make it slightly larger
  headerControls.appendChild(closeButton);

  chatHeader.appendChild(headerControls);

  const chatBody = document.createElement("div");
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
  Object.assign(chatInput, {
    type: "text", placeholder: "הקלד הודעה..." // Consider making placeholder configurable
  });
  Object.assign(chatInput.style, {
    flex: "1", padding: "8px", border: "1px solid #ddd",
    borderRadius: "4px", marginRight: "5px", direction: "rtl"
  });

  const sendButton = document.createElement("button");
  sendButton.textContent = "שלח"; // Consider making text configurable
  Object.assign(sendButton.style, {
    backgroundColor: "#25D366", color: "white", border: "none", // Consider making colors configurable
    borderRadius: "4px", padding: "8px 15px", cursor: "pointer"
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
    // Only load history if client_id was found
    if (!client_id) return;
    const savedHistory = localStorage.getItem(CHAT_HISTORY_KEY);
    if (savedHistory) {
      try {
        chatHistory = JSON.parse(savedHistory);
        chatHistory.forEach(msg => appendMessage(msg.role, msg.text, false)); // Don't save again while loading
      } catch (e) {
        console.error("Error parsing chat history:", e);
        localStorage.removeItem(CHAT_HISTORY_KEY); // Clear corrupted history
      }
    }
  }
  // --- End Load Chat History ---

  // --- Append Message Function (Handles DOM and History) ---
  function appendMessage(role, text, save = true) {
    const msg = document.createElement("div");
    msg.style.borderRadius = "5px";
    msg.style.padding = "8px";
    msg.style.marginBottom = "10px";
    msg.style.maxWidth = "80%";
    msg.style.wordWrap = "break-word"; // Ensure long words wrap
    msg.style.backgroundColor = role === "user" ? "#dcf8c6" : "#ececec"; // Consider configurable colors
    msg.style.alignSelf = role === "user" ? "flex-start" : "flex-end"; // Align messages
    msg.style.marginLeft = role === "user" ? "0" : "auto";
    msg.style.marginRight = role === "user" ? "auto" : "0";
    msg.textContent = text;
    chatBody.appendChild(msg);
    chatBody.scrollTop = chatBody.scrollHeight;

    // Only save if client_id exists and save flag is true
    if (client_id && save) {
      // Add message to history array only if not in lead capture asking phase
      if (leadCaptureState === 'idle' || role === 'user') {
          chatHistory.push({ role, text });
          // Save updated history to localStorage
          try {
            localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatHistory));
          } catch (e) {
            console.error("Error saving chat history:", e);
          }
      }
    }
    return msg; // Return the message element for potential updates
  }
  // --- End Append Message Function ---

  // --- Send Lead via Fetch Function ---
  async function sendLeadViaFetch() {
      if (!client_id) {
          console.error("Cannot send lead: client_id is missing.");
          appendMessage('bot', "אירעה שגיאה פנימית (קוד: L1).");
          return;
      }
      console.log("Preparing to send lead via fetch for client:", client_id, { name: capturedName, contact: capturedContact });

      // const n8nWebhookUrl = 'https://chatvegosai.app.n8n.cloud/webhook/ea7535a1-31d7-4cca-9457-35dfae767ced'; // Remove or comment out the old URL

// --- Send Message to n8n Webhook ---
  async function sendToN8nWebhook(message, clientId) {
    if (!clientId) {
      console.error("Cannot send to n8n: client_id is missing.");
      return; // Don't proceed without clientId
    }
    if (!message) {
        console.error("Cannot send to n8n: message is empty.");
        return; // Don't send empty messages
    }

    console.log(`Sending message to n8n for client ${clientId}`);
    const payload = {
      message: message,
      clientId: clientId
    };

    try {
      const response = await fetch(N8N_CHAT_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        mode: 'cors' // Important for cross-origin requests
      });

      if (!response.ok) {
        // Log error but don't bother the user, it's a background task
        console.error(`Error sending message to n8n webhook: HTTP status ${response.status}`);
        try {
            const errorBody = await response.text();
            console.error("n8n webhook error body:", errorBody);
        } catch(e) {
            console.error("Could not read n8n error response body.");
        }
      } else {
        console.log("Message sent successfully to n8n webhook.");
      }
    } catch (error) {
      console.error("Network or other error sending message to n8n webhook:", error);
    }
  }
sendToN8nWebhook(text, client_id); // Send message to n8n webhook
  // --- End Send Message to n8n Webhook ---
      const leadData = {
          name: capturedName,
          contact: capturedContact,
          clientId: client_id,
          history: chatHistory // Send history array directly
      };

      try {
          const response = await fetch(LEAD_CAPTURE_API_URL, { // Use the correct API URL constant
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
              },
              body: JSON.stringify(leadData), // שלח כ-JSON
              mode: 'cors' // חשוב לבקשות Cross-Origin
          });

          if (!response.ok) {
               // נסה לקרוא את גוף השגיאה אם אפשר
               let errorBody = '';
               try {
                   errorBody = await response.text();
               } catch (e) {}
               console.error(`Error sending lead: HTTP status ${response.status}`, errorBody);
               // הודעה כללית למשתמש, כי ייתכן שהשגיאה מהשרת לא רלוונטית לו
               appendMessage('bot', "אירעה שגיאה בשליחת הפרטים (קוד: L2). נסה שוב מאוחר יותר.");
          } else {
               console.log("Lead sent successfully via fetch.");
               // Reset captured lead info only on success
               capturedName = '';
               capturedContact = '';
               // הצג הודעת הצלחה (כבר נעשה קודם)
               // appendMessage('bot', "תודה! קיבלנו את פרטיך ונציג ייצור קשר בהקדם.");
          }

      } catch (error) {
          console.error("Error sending lead via fetch:", error);
          // יכול להיות כשל ברשת או בעיה אחרת
          appendMessage('bot', "אירעה שגיאה בשליחת הפרטים (קוד: L3). בדוק את חיבור האינטרנט ונסה שוב.");
      }
  }
  // --- End Send Lead via Fetch Function ---


  // --- Send Message Function (Handles normal chat and lead capture flow) ---
  async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    // Only proceed if client_id is available
    if (!client_id) {
        appendMessage('bot', "אירעה שגיאה בהגדרת הצ'אט (קוד: M1).", false);
        return;
    }

    appendMessage("user", text); // Display user message and save it
    const currentInput = text.toLowerCase();
    chatInput.value = ""; // Clear input field immediately

    // --- Lead Capture Flow ---
    if (leadCaptureState === 'askingName') {
        capturedName = text;
        leadCaptureState = 'askingContact';
        appendMessage('bot', "תודה, " + capturedName + ". מה כתובת המייל או מספר הטלפון שלך ליצירת קשר?");
        return; // Wait for contact info
    }

    if (leadCaptureState === 'askingContact') {
        capturedContact = text;
        leadCaptureState = 'idle'; // End capture flow
        appendMessage('bot', "תודה! קיבלנו את פרטיך ונציג ייצור קשר בהקדם.");
        sendLeadViaFetch(); // קרא לפונקציה החדשה
        return; // End interaction after capturing lead
    }
    // --- End Lead Capture Flow ---

    // Check for lead capture keywords if not already in the flow
    const triggerLeadCapture = LEAD_CAPTURE_KEYWORDS.some(keyword => currentInput.includes(keyword));

    if (triggerLeadCapture) {
        leadCaptureState = 'askingName';
        appendMessage('bot', "בטח, אשמח לעזור בכך. מה שמך?");
        return; // Wait for name
    }

    // --- Normal Chat Flow ---
    const botMsgElement = appendMessage("bot", "..."); // Display placeholder and save it
    const placeholderIndex = chatHistory.length - 1; // Index of the placeholder message

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, client_id: client_id }) // Pass dynamic client_id
      });

      if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const reply = data.reply || "לא התקבלה תשובה";
      botMsgElement.textContent = reply; // Update the placeholder message element in DOM

      // Update the placeholder message in history
      if (placeholderIndex >= 0 && chatHistory[placeholderIndex]?.role === 'bot') {
          chatHistory[placeholderIndex].text = reply;
          localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatHistory)); // Save updated history
      }

      // TODO: Check if reply indicates inability to answer and trigger lead capture
      // if (reply === API_CANNOT_ANSWER_RESPONSE) {
      //     leadCaptureState = 'askingName';
      //     appendMessage('bot', "בטח, אשמח לעזור בכך. מה שמך?");
      // }

    } catch (err) {
      console.error("שגיאה בשליחה:", err);
      const errorText = "שגיאה בשליחה לשרת.";
      botMsgElement.textContent = errorText; // Update the placeholder message element in DOM
       // Update the placeholder message in history with error
       if (placeholderIndex >= 0 && chatHistory[placeholderIndex]?.role === 'bot') {
          chatHistory[placeholderIndex].text = errorText;
          localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatHistory)); // Save updated history
      }
    } finally {
        chatBody.scrollTop = chatBody.scrollHeight; // Scroll down after response/error
    }
  }
  // --- End Send Message Function ---

  // --- Event Listeners ---
  chatButton.addEventListener("click", () => {
    chatWindow.style.display = "flex";
    chatButton.classList.remove('chat-button-pulse'); // Stop pulsing when open
  });

  document.getElementById("close-chat").addEventListener("click", () => {
    chatWindow.style.display = "none";
    chatButton.classList.add('chat-button-pulse'); // Start pulsing again when closed
  });

  sendButton.addEventListener("click", sendMessage);
  chatInput.addEventListener("keypress", e => {
    if (e.key === "Enter") sendMessage();
  });
  // --- End Event Listeners ---

  // --- Auto Open and Welcome Message ---
  function openChatProactively() {
      // Only open if client_id was found
      if (!client_id) return;
      // Check if the chat window is currently hidden
      if (chatWindow.style.display === 'none') {
          chatWindow.style.display = 'flex'; // Open the window
          chatButton.classList.remove('chat-button-pulse'); // Stop pulsing
          // Check if history is empty or last message wasn't the welcome message
          if (chatHistory.length === 0 || chatHistory[chatHistory.length - 1].text !== WELCOME_MESSAGE) {
             appendMessage('bot', WELCOME_MESSAGE); // Add welcome message
          }
      }
  }

  // Load history before setting the timeout
  loadHistory();

  // Set timeout to open proactively
  setTimeout(openChatProactively, AUTO_OPEN_DELAY);
  // --- End Auto Open ---

  // Trigger deployment marker
});
