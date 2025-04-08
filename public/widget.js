document.addEventListener("DOMContentLoaded", function () {
  const API_URL = "https://gpt-chat-live.vercel.app/api/chat";
  const client_id = "shira_tours";
  
  const chatButton = document.createElement("div");
  const logoImg = document.createElement("img");
  logoImg.src = "/logo/logo.png";
  Object.assign(logoImg.style, {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    borderRadius: "50%"
  });
  chatButton.appendChild(logoImg);
  Object.assign(chatButton.style, {
    position: "fixed", bottom: "20px", left: "20px",
    width: "60px", height: "60px", borderRadius: "50%",
    backgroundColor: "white",
    display: "flex", justifyContent: "center", alignItems: "center",
    cursor: "pointer", boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
    zIndex: "1000",
    overflow: "hidden"
  });

  const chatWindow = document.createElement("div");
  Object.assign(chatWindow.style, {
    position: "fixed", bottom: "90px", left: "20px",
    width: "300px",
    maxHeight: "calc(100vh - 120px)",
    borderRadius: "10px",
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

  // Create Powered by link
  const poweredBy = document.createElement("div");
  poweredBy.style.padding = "5px 10px";
  poweredBy.style.textAlign = "center";
  poweredBy.style.fontSize = "10px";
  poweredBy.style.color = "#aaa";
  poweredBy.style.borderTop = "1px solid #ececec";

  const whatsappLink = "https://wa.me/972523985505?text=" + encodeURIComponent("היי אני מעוניין/ת בצאט בוט חכם לאתר שלי!");
  poweredBy.innerHTML = `Powered by <a href="${whatsappLink}" target="_blank" style="color: #888; text-decoration: none;">Orel Aharon</a>`;

  chatWindow.appendChild(chatHeader);
  chatWindow.appendChild(chatBody);
  chatWindow.appendChild(chatInputArea);
  chatWindow.appendChild(poweredBy);

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
