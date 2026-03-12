const { OpenAI } = require('openai');
require('dotenv').config();

const openai = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
});

const analyzeStudentRisk = async (studentData) => {
    try {
        const prompt = `
            You are an AI student risk analysis system.
            Analyze the following student data and determine the risk level (Low, Medium, High).
            Also provide a brief explanation for the risk level in English.

            Student Data:
            - Name: ${studentData.fullName}
            - GPA: ${studentData.gpa}
            - Attendance Percentage: ${studentData.attendancePercentage || 'N/A'}%
            - Department: ${studentData.department}
            - Academic Year: ${studentData.academicYear}

            Return the result in JSON format exactly like this:
            {
                "riskLevel": "High",
                "explanation": "The reason here in English"
            }
        `;

        const completion = await openai.chat.completions.create({
            model: "llama-3.1-8b-instant", 
            messages: [
                { role: "system", content: "You are a helpful assistant designed to output JSON." },
                { role: "user", content: prompt }
            ],
            temperature: 0.5,
            response_format: { type: "json_object" },
        });

        const result = JSON.parse(completion.choices[0].message.content);
        return result;

    } catch (error) {
        console.error("AI Analysis Error:", error.message);
        return { riskLevel: "Unknown", explanation: "Could not analyze data due to an error." };
    }
};

module.exports = { analyzeStudentRisk };