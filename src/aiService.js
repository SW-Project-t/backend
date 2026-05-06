const { OpenAI } = require('openai');
require('dotenv').config();

const openai = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
});

const calculateRiskScore = (attendanceRate, grades, gpa, timeliness) => {
    const attendanceWeight = 0.2;
    const gradesWeight = 0.4;
    const gpaWeight = 0.2;
    const timelinessWeight = 0.2;
    const attendanceScore = attendanceRate || 0;
    const gradesScore = grades || 0;
    const gpaScore = (parseFloat(gpa) || 0) * 25;
    const timelinessScore = timeliness || 0; 
    const riskScore = (attendanceScore * attendanceWeight) + 
                      (gradesScore * gradesWeight) + 
                      (gpaScore * gpaWeight) + 
                      (timelinessScore * timelinessWeight);
    
    return Math.round(riskScore);
};

const getRiskLevel = (score) => {
    if (score < 40) return { level: 'High Risk', color: '#ef4444', icon: '🔴' };
    if (score < 60) return { level: 'Medium Risk', color: '#f59e0b', icon: '🟡' };
    if (score < 80) return { level: 'Low Risk', color: '#10b981', icon: '🟢' };
    return { level: 'Very Low Risk', color: '#3b82f6', icon: '🔵' };
};

const analyzeStudentRisk = async (studentData) => {
    try {
        const attendanceRate = studentData.attendancePercentage || 0;
        const grades = studentData.grades || 0;
        const gpa = studentData.gpa || 0;
        const timeliness = studentData.timeliness || 0;

        // Create a comprehensive prompt for AI analysis
        const prompt = `
You are an AI educational assistant analyzing student risk factors. Based on the following student data, provide a detailed risk assessment:

Student Data:
- Attendance Rate: ${attendanceRate}%
- Grades Average: ${grades}/100
- GPA: ${gpa}/4.0
- Timeliness Score: ${timeliness}/100

Please analyze this student's academic performance and provide:
1. Risk Level: Choose from "Very Low Risk", "Low Risk", "Medium Risk", or "High Risk"
2. Detailed explanation of why this risk level was assigned
3. Specific recommendations for improvement
4. Risk score from 0-100 (where 0 is no risk, 100 is highest risk)

Format your response as JSON:
{
  "riskLevel": "Risk Level Here",
  "explanation": "Detailed explanation here",
  "recommendations": "Specific recommendations here",
  "riskScore": 50
}
`;

        const completion = await openai.chat.completions.create({
            model: "llama3-8b-8192",
            messages: [
                {
                    role: "system",
                    content: "You are an expert educational analyst. Always respond with valid JSON only."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.3,
            max_tokens: 500
        });

        const aiResponse = completion.choices[0].message.content.trim();

        // Parse the AI response
        let analysis;
        try {
            analysis = JSON.parse(aiResponse);
        } catch (parseError) {
            console.error("AI Response Parse Error:", parseError);
            // Fallback to basic calculation if AI fails
            const riskScore = calculateRiskScore(attendanceRate, grades, gpa, timeliness);
            const riskInfo = getRiskLevel(riskScore);
            analysis = {
                riskLevel: riskInfo.level,
                explanation: `AI analysis failed, using fallback calculation. Risk score: ${riskScore}. ${riskInfo.level} based on attendance, grades, GPA, and timeliness.`,
                recommendations: "Please review attendance records, grades, and academic performance.",
                riskScore: riskScore
            };
        }

        // Add color and icon based on risk level
        let color, icon;
        switch (analysis.riskLevel.toLowerCase()) {
            case 'high risk':
                color = '#ef4444';
                icon = '🔴';
                break;
            case 'medium risk':
                color = '#f59e0b';
                icon = '🟡';
                break;
            case 'low risk':
                color = '#10b981';
                icon = '🟢';
                break;
            case 'very low risk':
            default:
                color = '#3b82f6';
                icon = '🔵';
                break;
        }

        return {
            riskLevel: analysis.riskLevel,
            explanation: analysis.explanation,
            recommendations: analysis.recommendations,
            riskScore: analysis.riskScore,
            color: color,
            icon: icon
        };

    } catch (error) {
        console.error("AI Risk Analysis Error:", error.message);
        // Fallback to basic calculation
        const attendanceRate = studentData.attendancePercentage || 0;
        const grades = studentData.grades || 0;
        const gpa = studentData.gpa || 0;
        const timeliness = studentData.timeliness || 0;

        const riskScore = calculateRiskScore(attendanceRate, grades, gpa, timeliness);
        const riskInfo = getRiskLevel(riskScore);

        return {
            riskLevel: riskInfo.level,
            explanation: `AI analysis failed due to error: ${error.message}. Using fallback calculation. Risk score: ${riskScore}.`,
            recommendations: "Please review student data and try again.",
            riskScore: riskScore,
            color: riskInfo.color,
            icon: riskInfo.icon
        };
    }
};

const analyzeCourseRisk = async (enrollmentData, studentData) => {
    try {
        const totalSessions = enrollmentData.totalSessions || 10; 
        const absences = enrollmentData.totalAbsences || 0;
        const attendanceRate = ((totalSessions - absences) / totalSessions) * 100;

        let grades = enrollmentData.grades;
        if (typeof grades === 'object' && grades !== null) {
            const gradeValues = Object.values(grades).filter(val => typeof val === 'number');
            grades = gradeValues.length > 0 ? gradeValues.reduce((a, b) => a + b, 0) / gradeValues.length : 0;
        } else {
            grades = parseFloat(grades) || 0;
        }

        const gpa = studentData.gpa || 0; 
        const timeliness = enrollmentData.timeliness || 0; 

        const riskScore = calculateRiskScore(attendanceRate, grades, gpa, timeliness);
        const riskInfo = getRiskLevel(riskScore);

        let explanation = `Risk score for course ${enrollmentData.courseId}: ${riskScore}. `;
        if (riskInfo.level === 'High Risk') {
            explanation += 'High absences or poor grades in this course.';
        } else if (riskInfo.level === 'Medium Risk') {
            explanation += 'Moderate performance in attendance and grades.';
        } else if (riskInfo.level === 'Low Risk') {
            explanation += 'Good attendance and grades in this course.';
        } else {
            explanation += 'Excellent performance in this course.';
        }

        return {
            riskLevel: riskInfo.level,
            explanation: explanation,
            riskScore: riskScore,
            color: riskInfo.color,
            icon: riskInfo.icon,
            courseId: enrollmentData.courseId
        };

    } catch (error) {
        console.error("Course Risk Analysis Error:", error.message);
        return { riskLevel: "Unknown", explanation: "Could not analyze course data due to an error.", courseId: enrollmentData.courseId };
    }
};

module.exports = { analyzeStudentRisk, analyzeCourseRisk, calculateRiskScore, getRiskLevel };