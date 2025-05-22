// api/client_config.js - Endpoint to fetch client configuration

const { applyDynamicCors } = require("../lib/corsUtil.js");
const { db } = require("../lib/firebaseAdmin.js");

module.exports = async (req, res) => {
  console.log("[CLIENT_CONFIG] Function handler started.");

  // Get clientId early for CORS check
  const clientId = req.body?.client_id || req.query?.client_id;

  // Apply CORS check *before* any other logic
  const corsPassed = await applyDynamicCors(req, res, clientId);

  // If CORS failed, stop processing.
  if (!corsPassed) {
      if (req.method === 'OPTIONS' && !req.headers.origin) {
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          return res.status(200).end();
      }
      return;
  }

  // Only allow GET method for fetching config
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!clientId) {
    return res.status(400).json({ error: "Missing client_id" });
  }

  try {
    // Fetch client data from Firestore
    const docRef = db.collection("brains").doc(clientId);
    const doc = await docRef.get();

    if (!doc.exists) {
      // Client not found, return default config or error
      console.warn(`[CLIENT_CONFIG] Client not found: ${clientId}`);
      // Return a minimal structure indicating client not found, but allow widget to use defaults
      return res.status(404).json({ error: "Client not found", client_id: clientId });
    }

    const data = doc.data();

    // Extract relevant configuration fields
    const clientConfig = {
      client_id: clientId,
      system_prompt: data.system_prompt || "אתה עוזר כללי ועונה בעברית בצורה נעימה.", // Default system prompt
      welcome_message: data.welcome_message || "היי אני vegos העוזר החכם שלך לכל מה שתצטרך",
      onboarding_questions: data.onboarding_questions || [] // שאלות התחלתיות
      // Add other configurable fields here in the future
    };

    console.log(`[CLIENT_CONFIG] Successfully fetched config for client_id: ${clientId}`);
    res.status(200).json(clientConfig);

  } catch (error) {
    console.error(`[CLIENT_CONFIG] Error fetching config for client_id ${clientId}:`, error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
};