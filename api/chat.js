
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message, client_id } = req.body;

  const brains = {
    "shira_tours": "אתה עוזר אישי בסוכנות תיירות. ענה בעברית ונסה להציע טיולים ליוון, תאילנד ואיטליה.",
    "default": "אתה עוזר כללי ועונה בצורה נעימה בעברית."
  };

  const systemPrompt = brains[client_id] || brains["default"];

  try {
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
    });

    const reply = completion.data.choices[0].message.content;
    res.status(200).json({ reply });
  } catch (error) {
    console.error("OpenAI API error:", error);
    res.status(500).json({ error: "Failed to connect to OpenAI" });
  }
};
