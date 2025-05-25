// api/chat.js - Updated for Google Gemini with History

// 1. ייבוא ספריות נחוצות
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { applyDynamicCors } = require("../lib/corsUtil.js");
const { db, admin } = require("../lib/firebaseAdmin.js"); // ייבוא admin גם כן לצורך FieldValue

// 3. אתחול לקוח Google Generative AI
if (!process.env.GOOGLE_API_KEY) {
  console.error("GOOGLE_API_KEY environment variable is not set.");
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
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 5. חילוץ פרמטרים מגוף הבקשה
  const { message, analyze_intent, history } = req.body;

  // לוג של הנתונים המתקבלים
  console.log("[CHAT] Received request body:", { message, analyze_intent, history: history ? history.length : 0, clientId });

  if (!message || !clientId) {
    console.error("[CHAT] Missing message or client_id:", { message, clientId }); // לוג שגיאה מפורט יותר
    return res.status(400).json({ error: "Missing message or client_id" });
  }

  try {
    // אם נדרש ניתוח כוונות בלבד (מצב מיוחד)
    if (analyze_intent) {
      const intentAnalysis = await analyzeIntent(message, history);
      return res.status(200).json(intentAnalysis);
    }

    // זרימת הצ'אט הרגילה - עם ניתוח כוונות אוטומטי
    const response = await generateChatResponse(message, clientId, history);
    
    // *** הוספה חדשה: ניתוח כוונות אוטומטי אחרי כל תגובה ***
    console.log("[CHAT] Analyzing intent automatically after chat response...");
    const intentAnalysis = await analyzeIntent(message, history);
    
    // אם יש צורך בלכידת ליד, הוסף את המידע לתגובה
    if (intentAnalysis.should_capture_lead) {
      console.log("[CHAT] Lead capture should be triggered! Adding trigger_lead_capture to response.");
      response.trigger_lead_capture = true;
      response.intent_analysis = intentAnalysis;
    }
    
    return res.status(200).json(response);
  } catch (error) {
    console.error('[CHAT] Error in chat handler:', error);
    return res.status(500).json({ message: 'Internal server error', details: error.message }); // פרטים נוספים בשגיאה
  }
}

// פונקציה לניתוח כוונות
async function analyzeIntent(message, history) {
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
  const lowerMessage = message.toLowerCase();

  if (containsAny(lowerMessage, ['מחיר', 'עלות', 'תמחור', 'price', 'cost'])) {
    return 'pricing';
  }

  if (containsAny(lowerMessage, ['מורכב', 'מסובך', 'לא הבנתי', 'complex'])) {
    return 'complex_queries';
  }

  if (containsAny(lowerMessage, ['נציג', 'אנושי', 'אדם', 'human', 'agent'])) {
    return 'human_assistance';
  }

  if (containsAny(lowerMessage, ['פרטים', 'מידע נוסף', 'details', 'more info'])) {
    return 'detailed_info';
  }

  return 'general_inquiry';
}

// פונקציה לחישוב רמת הביטחון
function calculateConfidence(message, intent) {
  let confidence = 0;

  confidence += Math.min(message.length / 10, 5);

  const keywords = getKeywordsForIntent(intent);
  const foundKeywords = keywords.filter(keyword =>
    message.toLowerCase().includes(keyword.toLowerCase())
  );

  confidence += foundKeywords.length * 10;

  return Math.min(confidence, 100);
}

// פונקציה לקביעה האם יש להפעיל לכידת ליד
function shouldTriggerLeadCapture(message, intent, confidence, history) {
  const MIN_CONFIDENCE = 50;

  console.log(`[CHAT] shouldTriggerLeadCapture called with: message="${message}", intent="${intent}", confidence=${confidence}`);

  // Check for direct lead capture requests
  if (containsAny(message.toLowerCase(), ['שאיר פרטים', 'השאר פרטים', 'רוצה פרטים', 'אשמח לפרטים', 'אשמח לקבל פרטים'])) {
    console.log("[CHAT] Lead capture triggered: Direct request for details");
    return true;
  }

  // Check for 'human_assistance' intent (always trigger lead capture)
  if (intent === 'human_assistance') {
    console.log("[CHAT] Lead capture triggered: 'human_assistance' intent detected.");
    return true;
  }

  // Check for high confidence in other specific intents
  if (confidence >= MIN_CONFIDENCE) {
    if (intent === 'pricing' || intent === 'complex_queries') {
      console.log(`[CHAT] Lead capture triggered: High confidence (${confidence}) in ${intent} intent`);
      return true;
    }
  }

  // Check history for context (if AI offered assistance)
  if (history && history.length > 0) {
    const lastMessage = history[history.length - 1];
    if (lastMessage.role === 'model' && lastMessage.parts && lastMessage.parts.length > 0) {
      const lastModelText = lastMessage.parts[0].text.toLowerCase();
      console.log(`[CHAT] Last AI message text: "${lastModelText}"`);
      if (lastModelText.includes('אשמח לחבר אותך עם נציג') || 
          lastModelText.includes('האם זה מתאים לך?') ||
          lastModelText.includes('אשמח לקבל פרטים')) {
        console.log("[CHAT] Lead capture triggered: AI offered assistance and user responded");
        return true;
      }
    }
  }

  console.log("[CHAT] Lead capture NOT triggered.");
  return false;
}

// פונקציה ליצירת תשובה מוצעת
function generateSuggestedResponse(intent) {
  const responses = {
    pricing: "המחירים משתנים בהתאם לסוג השירות/מוצר. אשמח לפרט או לעזור בשאלה נוספת!",
    complex_queries: "אני כאן כדי לעזור בכל שאלה מורכבת. אשמח לנסות לעזור או להבהיר כל נושא!",
    human_assistance: "אשמח לחבר אותך עם נציג שיוכל לעזור לך באופן אישי. האם זה מתאים לך?",
    detailed_info: "אני כאן כדי לספק מידע נוסף. אשמח לפרט או לעזור בשאלה נוספת!",
    general_inquiry: "אני כאן כדי לעזור בכל שאלה. איך אוכל לסייע?"
  };
  return responses[intent] || responses.general_inquiry;
}

// פונקציית עזר לבדיקת מילות מפתח
function containsAny(message, keywords) {
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
  const docRef = db.collection("brains").doc(clientId);
  const doc = await docRef.get();
  const data = doc.exists ? doc.data() : {};

  // קבלת הנחיית המערכת (עם ברירת מחדל)
  const systemPrompt =
    typeof data.system_prompt === "string" && data.system_prompt.trim().length > 0
      ? data.system_prompt
      : "אתה עוזר כללי ועונה בעברית בצורה נעימה.";

  // קבלת היסטוריה (ודא שמדובר במערך)
  const retrievedHistory = Array.isArray(data.history) ? data.history : [];

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

  if (!response || !response.candidates || response.candidates.length === 0 || !response.candidates[0].content) {
      console.error("[CHAT] Invalid response structure from Gemini API:", response);
      throw new Error("Failed to get a valid response from the AI model.");
  }

  const reply = response.text();

  // 9. עדכון Firestore עם הודעת המשתמש החדשה ותגובת ה-AI
  const newUserMessageForHistory = { role: "user", parts: [{ text: message }] };
  const newAiMessageForHistory = { role: "model", parts: [{ text: reply }] };

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
