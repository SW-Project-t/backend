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

        const riskScore = calculateRiskScore(attendanceRate, grades, gpa, timeliness);
        const riskInfo = getRiskLevel(riskScore);

        let explanation = `Risk score: ${riskScore}. `;
        if (riskInfo.level === 'High Risk') {
            explanation += 'The student has low attendance, poor grades, or low GPA.';
        } else if (riskInfo.level === 'Medium Risk') {
            explanation += 'The student has moderate performance in attendance and grades.';
        } else if (riskInfo.level === 'Low Risk') {
            explanation += 'The student has good attendance and grades.';
        } else {
            explanation += 'The student has excellent performance.';
        }

        return {
            riskLevel: riskInfo.level,
            explanation: explanation,
            riskScore: riskScore,
            color: riskInfo.color,
            icon: riskInfo.icon
        };

    } catch (error) {
        console.error("Risk Analysis Error:", error.message);
        return { riskLevel: "Unknown", explanation: "Could not analyze data due to an error." };
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