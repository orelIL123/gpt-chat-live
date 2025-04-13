// api/chat.js - Updated for Google Gemini with History

// 1. Import necessary libraries
const { GoogleGenerativeAI } = require("@google/generative-ai"); // Changed from openai
const admin = require("firebase-admin");

// 2. Initialize Firebase Admin SDK (only once)
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (error) {
    console.error("Firebase Admin Initialization Error:", error);
    // Handle initialization error appropriately, maybe exit or prevent function execution
  }
}

const db = admin.firestore();

// 3. Initialize Google Generative AI Client
if (!process.env.GOOGLE_API_KEY) {
  console.error("GOOGLE_API_KEY environment variable is not set.");
  // Handle missing API key appropriately
}
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" }); // Using latest recommended model

// 4. Main API Handler Function
module.exports = async (req, res) => {
  console.log("[GEMINI CODE] Function handler started."); // ADDED FOR DEBUGGING
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*"); // Adjust in production for security
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle OPTIONS preflight request
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // Only allow POST method
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 5. Extract request body parameters
  const { message, client_id } = req.body;
  if (!message || !client_id) {
    return res.status(400).json({ error: "Missing message or client_id" });
  }

  try {
    // 6. Fetch data (system prompt and history) from Firestore
    const docRef = db.collection("brains").doc(client_id);
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
    console.log(`Calling Gemini for client_id: ${client_id} with ${contents.length} content parts.`); // Log for debugging
    const result = await model.generateContent({ contents });
    const response = result.response; // Use optional chaining for safety

    if (!response || !response.candidates || response.candidates.length === 0 || !response.candidates[0].content) {
        console.error("Invalid response structure from Gemini API:", response);
        throw new Error("Failed to get a valid response from the AI model.");
    }

    // Check for safety ratings if needed - response.promptFeedback, response.candidates[0].safetyRatings

    const reply = response.text(); // Extract text reply

    // 9. Update Firestore with the new user message and AI reply
    const newUserMessageForHistory = { role: "user", parts: [{ text: message }] };
    const newAiMessageForHistory = { role: "model", parts: [{ text: reply }] };

    await docRef.set( // Use set with merge:true or update carefully
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

    console.log(`Successfully updated history for client_id: ${client_id}`); // Log success

    // 10. Send the reply back to the client
    res.status(200).json({ reply });

  } catch (error) {
    console.error(`Error processing chat for client_id ${client_id}:`, error); // Log the error
    // Check for specific Gemini API errors if needed (e.g., error.status, error.message)
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
};
