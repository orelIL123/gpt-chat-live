// api/chat.js - Updated for Google Gemini with History

// 1. ייבוא ספריות נחוצות
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { applyDynamicCors } = require("../lib/corsUtil.js");
const { db, admin } = require("../lib/firebaseAdmin.js"); // ייבוא admin גם כן לצורך FieldValue

// 3. אתחול לקוח Google Generative AI
if (!process.env.GOOGLE_API_KEY) {
  console.error("[CHAT] GOOGLE_API_KEY environment variable is not set."); // Added log prefix
  // טיפול מתאים במפתח API חסר
}
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });

// 4. פונקציית ה-Handler הראשית של ה-API
export default async function handler(req, res) {
  console.log("[CHAT] Function handler started."); // לוג להתחלת הפונקציה

  // קבלת clientId מוקדם לצורך בדיקת CORS
  const clientId = req.body?.client_id || req.query?.client_id;

  // החלת בדיקת CORS *לפני* כל לוגיקה אחרת
  const corsPassed = await applyDynamicCors(req, res, clientId);

  // אם בדיקת CORS נכשלה, עצור את העיבוד.
  if (!corsPassed) {
       if (req.method === 'OPTIONS' && !req.headers.origin) {
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          return res.status(200).end();
      }
      return; 
  }

  // טיפול בבקשת OPTIONS preflight
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // אפשר רק שיטת POST
  if (req.method !== "POST") {
    console.log(`[CHAT] Method not allowed: ${req.method}`); // Added log
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 5. חילוץ פרמטרים מגוף הבקשה
  const { message, analyze_intent, history } = req.body;
  if (!message || !clientId) {
    console.error("[CHAT] Missing message or client_id:", { message, clientId }); // לוג שגיאה מפורט יותר
    return res.status(400).json({ error: "Missing message or client_id" });
  }

  try {
    // אם נדרש ניתוח כוונות
    if (analyze_intent) {
      console.log("[CHAT] analyze_intent is true. Calling analyzeIntent..."); // Added log
      const intentAnalysis = await analyzeIntent(message, history);
      console.log("[CHAT] analyzeIntent finished. Returning intent analysis."); // Added log
      return res.status(200).json(intentAnalysis);
    }

    console.log("[CHAT] analyze_intent is false. Calling generateChatResponse..."); // Added log
    // המשך זרימת הצ'אט הרגילה
    const response = await generateChatResponse(message, clientId, history);
    console.log("[CHAT] generateChatResponse finished. Returning chat response."); // Added log
    return res.status(200).json(response);
  } catch (error) {
    console.error('[CHAT] Error in chat handler:', error);
    return res.status(500).json({ message: 'Internal server error', details: error.message }); // פרטים נוספים בשגיאה
  }
}

// פונקציה לניתוח כוונות
async function analyzeIntent(message, history) {
  console.log("[CHAT] Entering analyzeIntent function."); // Added log
  // ניתוח בסיסי של הכוונה
  const intent = determineIntent(message);
  const confidence = calculateConfidence(message, intent);
  const shouldCaptureLead = shouldTriggerLeadCapture(message, intent, confidence, history);

  console.log(`[CHAT] Intent Analysis Result: should_capture_lead=${shouldCaptureLead}, intent=${intent}, confidence=${confidence}`); // לוג חדש לתוצאות ניתוח כוונות

  return {
    should_capture_lead: shouldCaptureLead,
    intent: intent,
    confidence: confidence,
    suggested_response: generateSuggestedResponse(intent)
  };
}

// פונקציה לקביעת הכוונה
function determineIntent(message) {
  console.log(`[CHAT] Entering determineIntent function with message: "${message}"`); // Added log
  const lowerMessage = message.toLowerCase();
  
  if (containsAny(lowerMessage, ['מחיר', 'עלות', 'תמחור', 'price', 'cost'])) {
    console.log("[CHAT] Intent determined as: pricing"); // Added log
    return 'pricing';
  }
  
  if (containsAny(lowerMessage, ['מורכב', 'מסובך', 'לא הבנתי', 'complex'])) {
    console.log("[CHAT] Intent determined as: complex_queries"); // Added log
    return 'complex_queries';
  }
  
  if (containsAny(lowerMessage, ['נציג', 'אנושי', 'אדם', 'human', 'agent'])) {
    console.log("[CHAT] Intent determined as: human_assistance"); // Added log
    return 'human_assistance';
  }
  
  if (containsAny(lowerMessage, ['פרטים', 'מידע נוסף', 'details', 'more info'])) {
    console.log("[CHAT] Intent determined as: detailed_info"); // Added log
    return 'detailed_info';
  }
  
  console.log("[CHAT] Intent determined as: general_inquiry"); // Added log
  return 'general_inquiry';
}

// פונקציה לחישוב רמת הביטחון
function calculateConfidence(message, intent) {
  console.log(`[CHAT] Entering calculateConfidence function for intent: "${intent}"`); // Added log
  let confidence = 0;
  
  confidence += Math.min(message.length / 10, 5);
  
  const keywords = getKeywordsForIntent(intent);
  const foundKeywords = keywords.filter(keyword => 
    message.toLowerCase().includes(keyword.toLowerCase())
  );
  
  confidence += foundKeywords.length * 10;
  
  console.log(`[CHAT] Calculated confidence: ${confidence}`); // Added log
  return Math.min(confidence, 100);
}

// פונקציה לקביעה האם יש להפעיל לכידת ליד
function shouldTriggerLeadCapture(message, intent, confidence, history) {
  const MIN_CONFIDENCE = 70;

  console.log(`[CHAT] shouldTriggerLeadCapture called with: message="${message}", intent="${intent}", confidence=${confidence}`); // לוג חדש לכניסה לפונקציה

  if (intent === 'human_assistance' && confidence >= MIN_CONFIDENCE) {
    console.log("[CHAT] Intent is human_assistance and confidence is sufficient."); // Added log
    if (history && history.length > 0) {
      const lastMessage = history[history.length - 1];
      if (lastMessage.role === 'model' && lastMessage.parts && lastMessage.parts.length > 0) {
        const lastModelText = lastMessage.parts[0].text.toLowerCase();
        console.log(`[CHAT] Last AI message text: "${lastModelText}"`); // לוג חדש לתוכן הודעת ה-AI האחרונה
        if (lastModelText.includes('אשמח לחבר אותך עם נציג') || lastModelText.includes('האם זה מתאים לך?')) {
           console.log("[CHAT] Lead capture triggered: AI offered human assistance and user confirmed."); // לוג על הפעלת לכידת ליד
           return true;
        } else {
          console.log("[CHAT] Lead capture NOT triggered: Last AI message did not offer human assistance."); // Added log
        }
      } else {
        console.log("[CHAT] Lead capture NOT triggered: Last history entry is not a model message or has no text parts."); // Added log
      }
    } else {
      console.log("[CHAT] Lead capture NOT triggered: No history available."); // Added log
    }
  } else {
    console.log("[CHAT] Lead capture NOT triggered: Intent is not human_assistance or confidence is below threshold."); // Added log
  }
  console.log("[CHAT] shouldTriggerLeadCapture returning false."); // Added log
  return false;
}

// פונקציה ליצירת תשובה מוצעת
function generateSuggestedResponse(intent) {
  console.log(`[CHAT] Entering generateSuggestedResponse function for intent: "${intent}"`); // Added log
  const responses = {
    pricing: "המחירים משתנים בהתאם לסוג השירות/מוצר. אשמח לפרט או לעזור בשאלה נוספת!",
    complex_queries: "אני כאן כדי לעזור בכל שאלה מורכבת. אשמח לנסות לעזור או להבהיר כל נושא!",
    human_assistance: "אשמח לחבר אותך עם נציג שיוכל לעזור לך באופן אישי. האם זה מתאים לך?",
    detailed_info: "אני כאן כדי לספק מידע נוסף. אשמח לפרט או לעזור בשאלה נוספת!",
    general_inquiry: "אני כאן כדי לעזור בכל שאלה. איך אוכל לסייע?"
  };
  console.log(`[CHAT] Generated suggested response: "${responses[intent] || responses.general_inquiry}"`); // Added log
  return responses[intent] || responses.general_inquiry;
}

// פונקציית עזר לבדיקת מילות מפתח
function containsAny(message, keywords) {
  // console.log(`[CHAT] Checking if message "${message}" contains any of keywords: ${keywords.join(', ')}`); // Optional verbose log
  return keywords.some(keyword => message.includes(keyword.toLowerCase()));
}

// פונקציית עזר לקבלת מילות מפתח לפי כוונה
function getKeywordsForIntent(intent) {
  const keywords = {
    pricing: ['מחיר', 'עלות', 'תמחור', 'price', 'cost'],
    complex_queries: ['מורכב', 'מסובך', 'לא הבנתי', 'complex'],
    human_assistance: ['נציג', 'אנושי', 'אדם', 'human', 'agent'],
    detailed_info: ['פרטים', 'מידע נוסף', 'details', 'more info']
  };
  
  return keywords[intent] || [];
}

// 6. אחזור נתונים (system prompt והיסטוריה) מ-Firestore
async function generateChatResponse(message, clientId, history) {
  console.log(`[CHAT] Entering generateChatResponse function for client_id: ${clientId}`); // Added log
  const docRef = db.collection("brains").doc(clientId);
  const doc = await docRef.get();
  const data = doc.exists ? doc.data() : {};
  console.log(`[CHAT] Fetched brain data for client_id ${clientId}. Doc exists: ${doc.exists}`); // Added log

  // קבלת הנחיית המערכת (עם ברירת מחדל)
  const systemPrompt =
    typeof data.system_prompt === "string" && data.system_prompt.trim().length > 0
      ? data.system_prompt
      : "אתה עוזר כללי ועונה בעברית בצורה נעימה.";
  console.log(`[CHAT] Using system prompt: "${systemPrompt}"`); // Added log

  // קבלת היסטוריה (ודא שמדובר במערך)
  const retrievedHistory = Array.isArray(data.history) ? data.history : [];
  console.log(`[CHAT] Retrieved history with ${retrievedHistory.length} entries.`); // Added log

  // 7. בניית מערך ההודעות עבור Gemini API
  const contents = [
    { role: "user", parts: [{ text: systemPrompt }] },
    { role: "model", parts: [{ text: "Okay." }] },
    ...retrievedHistory,
    { role: "user", parts: [{ text: message }] },
  ];

  // 8. קריאה ל-Google Gemini API
  console.log(`[CHAT] Calling Gemini for client_id: ${clientId} with ${contents.length} content parts.`);
  const result = await model.generateContent({ contents });
  const response = result.response;
  console.log("[CHAT] Received response from Gemini API."); // Added log

  if (!response || !response.candidates || response.candidates.length === 0 || !response.candidates[0].content) {
      console.error("[CHAT] Invalid response structure from Gemini API:", response);
      throw new Error("Failed to get a valid response from the AI model.");
  }

  const reply = response.text();
  console.log(`[CHAT] Extracted reply from Gemini: "${reply}"`); // Added log

  // 9. עדכון Firestore עם הודעת המשתמש החדשה ותגובת ה-AI
  const newUserMessageForHistory = { role: "user", parts: [{ text: message }] };
  const newAiMessageForHistory = { role: "model", parts: [{ text: reply }] };

  console.log("[CHAT] Updating history in Firestore..."); // Added log
  await docRef.set( 
    {
      history: admin.firestore.FieldValue.arrayUnion(
        newUserMessageForHistory,
        newAiMessageForHistory
      ),
      ...( !data.system_prompt && { system_prompt: systemPrompt } )
    },
    { merge: true }
  );

  console.log(`[CHAT] Successfully updated history for client_id: ${clientId}`);

  return { reply };
}
