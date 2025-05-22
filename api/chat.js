// api/chat.js - Updated for Google Gemini with History

// 1. Import necessary libraries
const { GoogleGenerativeAI } = require("@google/generative-ai"); // Changed from openai
// Remove direct admin import
// const admin = require("firebase-admin"); 
const { applyDynamicCors } = require("../lib/corsUtil.js"); // Import the CORS utility
// Import the initialized db instance
const { db } = require("../lib/firebaseAdmin.js");

// 2. REMOVE Firebase Admin SDK initialization block
// if (!admin.apps.length) { ... }

// const db = admin.firestore(); // Remove this too

// 3. Initialize Google Generative AI Client
if (!process.env.GOOGLE_API_KEY) {
  console.error("GOOGLE_API_KEY environment variable is not set.");
  // Handle missing API key appropriately
}
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" }); // Using latest recommended model

// 4. Main API Handler Function
export default async function handler(req, res) {
  console.log("[GEMINI CODE] Function handler started."); // ADDED FOR DEBUGGING

  // Get clientId early for CORS check
  const clientId = req.body?.client_id || req.query?.client_id; // Try getting from body or query

  // Apply CORS check *before* any other logic
  const corsPassed = await applyDynamicCors(req, res, clientId);

  // If CORS failed, stop processing.
  if (!corsPassed) {
      // applyDynamicCors already sent the response (403 or 400) or decided not to set headers.
      // If no origin was present, we might still want to allow OPTIONS.
       if (req.method === 'OPTIONS' && !req.headers.origin) {
          // Allow OPTIONS even without origin for simple requests, but don't set Allow-Origin
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          return res.status(200).end();
      }
      // Otherwise, if corsPassed is false, the response was already handled.
      return; 
  }

  // Handle OPTIONS preflight request (CORS headers already set by applyDynamicCors)
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // Only allow POST method
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 5. Extract request body parameters
  const { message, analyze_intent, history } = req.body;
  // clientId already extracted above
  if (!message || !clientId) {
    // Add explicit check for clientId again, although CORS check should have caught it
    return res.status(400).json({ error: "Missing message or client_id" });
  }

  try {
    // אם נדרש ניתוח כוונות
    if (analyze_intent) {
      const intentAnalysis = await analyzeIntent(message, history);
      return res.status(200).json(intentAnalysis);
    }

    // המשך זרימת הצ'אט הרגילה
    const response = await generateChatResponse(message, clientId, history);
    return res.status(200).json(response);
  } catch (error) {
    console.error('Error in chat handler:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

// פונקציה לניתוח כוונות
async function analyzeIntent(message, history) {
  // ניתוח בסיסי של הכוונה
  const intent = determineIntent(message);
  const confidence = calculateConfidence(message, intent);
  const shouldCaptureLead = shouldTriggerLeadCapture(message, intent, confidence, history);

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
  
  // בדיקת מילות מפתח לכל סוג כוונה
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
  
  // חישוב בסיסי לפי אורך ההודעה
  confidence += Math.min(message.length / 10, 5);
  
  // חישוב לפי מספר מילות המפתח שנמצאו
  const keywords = getKeywordsForIntent(intent);
  const foundKeywords = keywords.filter(keyword => 
    message.toLowerCase().includes(keyword.toLowerCase())
  );
  
  confidence += foundKeywords.length * 10;
  
  // נרמול ל-100
  return Math.min(confidence, 100);
}

// פונקציה לקביעה האם יש להפעיל לכידת ליד
function shouldTriggerLeadCapture(message, intent, confidence, history) {
  // סף ביטחון מינימלי להפעלת לכידת ליד
  const MIN_CONFIDENCE = 70; // ניתן להתאים את הסף הזה לפי הצורך

  // 1. בדוק אם הכוונה שזוהתה היא "human_assistance" ורמת הביטחון מספיק גבוהה
  if (intent === 'human_assistance' && confidence >= MIN_CONFIDENCE) {
    // 2. בדוק את היסטוריית השיחה - האם התשובה האחרונה של ה-AI הציעה עזרה אנושית?
    if (history && history.length > 0) {
      const lastMessage = history[history.length - 1];
      // ודא שההודעה האחרונה היא מהמודל (ה-AI) ויש לה תוכן טקסטואלי
      if (lastMessage.role === 'model' && lastMessage.parts && lastMessage.parts.length > 0) {
        const lastModelText = lastMessage.parts[0].text.toLowerCase();
        // בדוק אם הטקסט של התשובה האחרונה של ה-AI מכיל ביטויים המעידים על הצעת עזרה אנושית
        // (מבוסס על התשובה המוצעת בפונקציה generateSuggestedResponse)
        if (lastModelText.includes('אשמח לחבר אותך עם נציג') || lastModelText.includes('האם זה מתאים לך?')) {
           // 3. אם הכוונה היא עזרה אנושית, הביטחון גבוה, וה-AI הציע עזרה אנושית, הפעל לכידת ליד.
           // אנחנו מניחים שאם התנאים הללו מתקיימים, התשובה הנוכחית של המשתמש היא אישור להצעה.
           return true;
        }
      }
    }
    // אם הכוונה היא עזרה אנושית והביטחון גבוה, אך ה-AI לא הציע עזרה אנושית בהודעה הקודמת,
    // או שאין היסטוריה רלוונטית, אל תפעיל לכידת ליד.
    return false;
  }

  // אם הכוונה אינה עזרה אנושית או שהביטחון נמוך מהסף, אל תפעיל לכידת ליד.
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

// 6. Fetch data (system prompt and history) from Firestore
// Use the imported db directly
async function generateChatResponse(message, clientId, history) {
  const docRef = db.collection("brains").doc(clientId);
  const doc = await docRef.get();
  const data = doc.exists ? doc.data() : {};

  // Get system prompt (with default)
  const systemPrompt =
    typeof data.system_prompt === "string" && data.system_prompt.trim().length > 0
      ? data.system_prompt
      : "אתה עוזר כללי ועונה בעברית בצורה נעימה."; // Default prompt

  // Get history (ensure it's an array)
  const retrievedHistory = Array.isArray(data.history) ? data.history : [];

  // 7. Construct the message array for Gemini API
  // Gemini format: [{ role: "user" | "model", parts: [{ text: "..." }] }]
  // Include system prompt as first user message + simple model response
  const contents = [
    { role: "user", parts: [{ text: systemPrompt }] },
    { role: "model", parts: [{ text: "Okay." }] }, // Simple ack for system prompt
    ...retrievedHistory, // Spread the existing history
    { role: "user", parts: [{ text: message }] }, // Add the new user message
  ];

  // 8. Call Google Gemini API
  console.log(`Calling Gemini for client_id: ${clientId} with ${contents.length} content parts.`); // Log for debugging
  const result = await model.generateContent({ contents });
  const response = result.response; // Use optional chaining for safety

  if (!response || !response.candidates || response.candidates.length === 0 || !response.candidates[0].content) {
      console.error("Invalid response structure from Gemini API:", response);
      throw new Error("Failed to get a valid response from the AI model.");
  }

  // Check for safety ratings if needed - response.promptFeedback, response.candidates[0].safetyRatings

  const reply = response.text(); // Extract text reply

  // 9. Update Firestore with the new user message and AI reply
  // Use the imported admin object if FieldValue is needed, OR ensure firebaseAdmin exports admin too.
  // Assuming firebaseAdmin exports admin:
  const { admin } = require("../lib/firebaseAdmin.js"); // Need admin for FieldValue
  const newUserMessageForHistory = { role: "user", parts: [{ text: message }] };
  const newAiMessageForHistory = { role: "model", parts: [{ text: reply }] };

  await docRef.set( 
    {
      history: admin.firestore.FieldValue.arrayUnion(
        newUserMessageForHistory,
        newAiMessageForHistory
      ),
      // Optionally update system_prompt if it didn't exist
      ...( !data.system_prompt && { system_prompt: systemPrompt } )
    },
    { merge: true } // Use merge:true to avoid overwriting other fields if doc exists
  );

  console.log(`Successfully updated history for client_id: ${clientId}`); // Log success

  return { reply };
}
