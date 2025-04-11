const OpenAI = require("openai");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK only once
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

module.exports = async (req, res) => {
  console.log('[API LOG] Function handler started.');

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message, client_id } = req.body;
  if (!message || !client_id) {
    console.error("API ERROR: Missing message or client_id in request body");
    return res.status(400).json({ error: "Missing message or client_id" });
  }

  console.log(`[API LOG] Received request for client_id: ${client_id}`);

  try {
    const doc = await db.collection("brains").doc(client_id).get();
    console.log(`[API LOG] Firestore document exists for ${client_id}: ${doc.exists}`);
    const data = doc.exists ? doc.data() : {};
    if(doc.exists) {
        console.log(`[API LOG] Data fetched for ${client_id}:`, JSON.stringify(data));
        console.log(`[API LOG] Type of system_prompt: ${typeof data.system_prompt}`);
    }
    const systemPrompt =
      typeof data.system_prompt === "string" && data.system_prompt.trim().length > 0
        ? data.system_prompt
        : "אתה עוזר כללי ועונה בעברית בצורה נעימה.";
    console.log(`[API LOG] Using system prompt for ${client_id}: "${systemPrompt}"`);

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
    });

    const reply = completion.choices[0].message.content;
    res.status(200).json({ reply });
  } catch (error) {
    console.error("API ERROR:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
