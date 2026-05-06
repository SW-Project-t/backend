require('dotenv').config();
const { OpenAI } = require('openai');

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const prompt = `Return JSON object {"riskLevel": "High Risk", "explanation": "test", "recommendations": "test", "riskScore": 100}`;

(async () => {
  try {
    const res = await client.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: 'You are an assistant.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0,
      max_tokens: 200
    });
    console.log(JSON.stringify(res.choices[0].message, null, 2));
  } catch (err) {
    console.error('ERROR', err);
    process.exit(1);
  }
})();
