
document.addEventListener("DOMContentLoaded", function () {
  const API_URL = "https://gpt-chat-live-3bzc6vlwl-orelil123s-projects.vercel.app/api/chat";
  const client_id = "shira_tours";
  
  const chatButton = document.createElement("div");
  chatButton.innerHTML = "💬";
  Object.assign(chatButton.style, {
    position: "fixed", bottom: "20px", left: "20px",
    width: "60px", height: "60px", borderRadius: "50%",
    backgroundColor: "#25D366", color: "white",
    display: "flex", justifyContent: "center", alignItems: "center",
    cursor: "pointer", boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
    zIndex: "1000", fontSize: "26px"
  });

  const chatWindow = document.createElement("div");
  Object.assign(chatWindow.style, {
    position: "fixed", bottom: "90px", left: "20px",
    width: "300px", height: "400px", borderRadius: "10px",
    backgroundColor: "white", boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
    zIndex: "1000", display: "none", flexDirection: "column", overflow: "hidden"
  });

  const chatHeader = document.createElement("div");
  chatHeader.innerHTML = "<span>שירה תיירות</span><span id='close-chat' style='cursor:pointer;'> × </span>";
  Object.assign(chatHeader.style, {
    backgroundColor: "#25D366", color: "white", padding: "10px",
    fontWeight: "bold", display: "flex", justifyContent: "space-between", alignItems: "center"
  });

  const chatBody = document.createElement("div");
  Object.assign(chatBody.style, {
    padding: "10px", height: "300px", overflowY: "auto", direction: "rtl"
  });

  const chatInputArea = document.createElement("div");
  chatInputArea.style.display = "flex";
  chatInputArea.style.padding = "10px";
  chatInputArea.style.borderTop = "1px solid #ececec";

  const chatInput = document.createElement("input");
  Object.assign(chatInput, {
    type: "text", placeholder: "הקלד הודעה..."
  });
  Object.assign(chatInput.style, {
    flex: "1", padding: "8px", border: "1px solid #ddd",
    borderRadius: "4px", marginRight: "5px", direction: "rtl"
  });

  const sendButton = document.createElement("button");
  sendButton.textContent = "שלח";
  Object.assign(sendButton.style, {
    backgroundColor: "#25D366", color: "white", border: "none",
    borderRadius: "4px", padding: "8px 15px", cursor: "pointer"
  });

  chatInputArea.appendChild(chatInput);
  chatInputArea.appendChild(sendButton);

  chatWindow.appendChild(chatHeader);
  chatWindow.appendChild(chatBody);
  chatWindow.appendChild(chatInputArea);

  document.body.appendChild(chatButton);
  document.body.appendChild(chatWindow);

  chatButton.addEventListener("click", () => {
    chatWindow.style.display = "flex";
  });

  document.getElementById("close-chat").addEventListener("click", () => {
    chatWindow.style.display = "none";
  });

  function appendMessage(role, text) {
    const msg = document.createElement("div");
    msg.style.borderRadius = "5px";
    msg.style.padding = "8px";
    msg.style.marginBottom = "10px";
    msg.style.maxWidth = "80%";
    msg.style.backgroundColor = role === "user" ? "#dcf8c6" : "#ececec";
    msg.textContent = text;
    chatBody.appendChild(msg);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    appendMessage("user", text);
    chatInput.value = "";
    appendMessage("bot", "...");

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, client_id: client_id })
      });

      const data = await response.json();
      chatBody.lastChild.textContent = data.reply || "לא התקבלה תשובה";
    } catch (err) {
      console.error("שגיאה בשליחה:", err);
      chatBody.lastChild.textContent = "שגיאה בשליחה לשרת.";
    }
  }

  sendButton.addEventListener("click", sendMessage);
  chatInput.addEventListener("keypress", e => {
    if (e.key === "Enter") sendMessage();
  });
});
