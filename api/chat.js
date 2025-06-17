// api/chat.js - Updated for OpenAI with History

// 1. ייבוא ספריות נחוצות
const OpenAI = require("openai");
const { applyDynamicCors } = require("../lib/corsUtil.js");
const { db, admin } = require("../lib/firebaseAdmin.js"); // ייבוא admin גם כן לצורך FieldValue

// 3. אתחול לקוח OpenAI
if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY environment variable is not set.");
  // טיפול מתאים במפתח API חסר
}
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
  const MIN_CONFIDENCE = 30;

  console.log(`[CHAT] shouldTriggerLeadCapture called with: message="${message}", intent="${intent}", confidence=${confidence}`);

  const lowerMessage = message.toLowerCase();

  // בדיקות ישירות יותר
  const directTriggers = [
    'שאיר פרטים', 'השאר פרטים', 'רוצה פרטים',
    'אשמח לפרטים', 'אשמח לקבל פרטים', 'תתקשרו אלי',
    'רוצה שתתקשרו', 'בוא נדבר', 'אני מעוניין',
    'כן', 'בסדר', 'אוקיי', 'ok', 'נשמע טוב'
  ];

  // בדיקה לטריגרים ישירים
  if (directTriggers.some(trigger => lowerMessage.includes(trigger))) {
    console.log("[CHAT] Lead capture triggered: Direct trigger found");
    return true;
  }

  // בדיקה לכוונת עזרה אנושית
  if (intent === 'human_assistance') {
    console.log("[CHAT] Lead capture triggered: 'human_assistance' intent detected.");
    return true;
  }

  // בדיקה לביטחון גבוה בכוונות ספציפיות
  if (confidence >= MIN_CONFIDENCE) {
    if (intent === 'pricing' || intent === 'complex_queries' || intent === 'detailed_info') {
      console.log(`[CHAT] Lead capture triggered: High confidence (${confidence}) in ${intent} intent`);
      return true;
    }
  }

  // בדיקת הקשר מההיסטוריה
  if (history && history.length > 0) {
    const lastMessage = history[history.length - 1];
    if (lastMessage.role === 'model' && lastMessage.parts && lastMessage.parts.length > 0) {
      const lastModelText = lastMessage.parts[0].text.toLowerCase();

      const aiOfferTriggers = [
        'אשמח לחבר אותך עם נציג',
        'האם זה מתאים לך',
        'אשמח לקבל פרטים',
        'רוצה שנציג יצור איתך קשר',
        'תרצה שאחבר אותך לנציג'
      ];

      if (aiOfferTriggers.some(trigger => lastModelText.includes(trigger))) {
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
  // קבלת הנחיית המערכת (עם ברירת מחדל) והקשחתה
  const baseSystemPrompt =
    typeof data.system_prompt === "string" && data.system_prompt.trim().length > 0
      ? data.system_prompt
      : "אתה עוזר כללי ועונה בעברית בצורה נעימה.";

  // הוספת הנחיה להגבלת אורך התשובה בתחילת הפרומפט
  const systemPrompt = "הגב ב-15-30 מילים, לא יותר משתי שורות. " + baseSystemPrompt;

  // קבלת היסטוריה (ודא שמדובר במערך) והגבלתה ל-15 ההודעות האחרונות
  const retrievedHistory = Array.isArray(data.history) ? data.history : [];
  const limitedHistory = retrievedHistory.slice(-15); // קח את 15 ההודעות האחרונות

  // 7. בניית מערך ההודעות עבור OpenAI API
  const messages = [
    { role: "system", content: systemPrompt },
    ...limitedHistory.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.parts[0].text
    })),
    { role: "user", content: message },
  ];

  // 8. קריאה ל-OpenAI API
  console.log(`[CHAT] Calling OpenAI for client_id: ${clientId} with ${messages.length} messages.`);
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini", // או מודל אחר שתבחר
    messages: messages,
    max_tokens: 80, // הגבלת טוקנים
    temperature: 0.3, // שליטה על יצירתיות
  });

  if (!completion || !completion.choices || completion.choices.length === 0 || !completion.choices[0].message) {
      console.error("[CHAT] Invalid response structure from OpenAI API:", completion);
      throw new Error("Failed to get a valid response from the AI model.");
  }

  const reply = completion.choices[0].message.content;

  // Add a check to ensure the generated reply is not empty
  if (!reply || typeof reply !== 'string' || reply.trim().length === 0) {
      console.error("[CHAT] Received empty or invalid reply text from OpenAI API.");
      throw new Error("Failed to get a valid text response from the AI model.");
  }

  // 9. עדכון Firestore עם הודעת המשתמש החדשה ותגובת ה-AI
  const newUserMessageForHistory = { role: "user", parts: [{ text: message }] };
  const newAiMessageForHistory = { role: "model", parts: [{ text: reply }] }; // שמור את התגובה בפורמט הישן עבור Firestore

  await docRef.set(
    {
      history: admin.firestore.FieldValue.arrayUnion(
        newUserMessageForHistory,
        newAiMessageForHistory
      ),
      ...( !data.system_prompt && { system_prompt: baseSystemPrompt } ) // שמור את הפרומפט הבסיסי ללא הגבלת אורך
    },
    { merge: true }
  );

  // --- הוספה: עדכון active_chats ---
  const activeChatRef = db.collection("active_chats").doc(clientId);

  await activeChatRef.set(
    {
      client_id: clientId,
      status: "active",
      started_at: admin.firestore.FieldValue.serverTimestamp(),
      messages: admin.firestore.FieldValue.arrayUnion(
        {
          sender: "client",
          text: message,
          timestamp: new Date().toISOString()
        },
        {
          sender: "bot",
          text: reply,
          timestamp: new Date().toISOString()
        }
      )
    },
    { merge: true }
  );

  console.log(`[CHAT] Successfully updated history and active_chats for client_id: ${clientId}`);

  return { reply };
}
