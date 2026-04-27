require('dotenv').config();
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

const normalizedEmailPass = process.env.EMAIL_PASS ? process.env.EMAIL_PASS.replace(/\s+/g, '') : process.env.EMAIL_PASS;
const normalizedEmailUser = process.env.EMAIL_USER ? process.env.EMAIL_USER.trim() : process.env.EMAIL_USER;

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: normalizedEmailUser,
        pass: normalizedEmailPass
    }
});

transporter.verify((error, success) => {
    if (error) {
        console.error('❌ Nodemailer transporter verification failed:', error);
    } else {
        console.log('✅ Nodemailer transporter is ready to send messages');
    }
});

const db = admin.firestore();

const checkUserExists = async (email) => {
    try {
        const snapshot = await db.collection('users').where('email', '==', email).get();
        return !snapshot.empty;
    } catch (error) {
        console.error("Error checking user:", error);
        return false;
    }
};

const saveUserToFirestore = async (uid, userData) => {
    try {
        await db.collection('users').doc(uid).set({
            uid: uid,
            ...userData,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

const getUserData = async (uid) => {
    try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) {
            return null;
        }
        return userDoc.data();
    } catch (error) {
        console.error("Firestore Error:", error);
        throw error;
    }
};

const getAllUsers = async () => {
    try {
        const usersSnapshot = await db.collection('users').get();
        const usersList = [];
        
        usersSnapshot.forEach((doc) => {
            usersList.push({ id: doc.id, ...doc.data() });
        });

        return { success: true, users: usersList };
    } catch (error) {
        console.error("Error fetching all users:", error);
        return { success: false, error: error.message };
    }
};

const deleteUserFromFirestore = async (uid) => {
    try {
        await db.collection('users').doc(uid).delete();
        console.log(`User ${uid} deleted from Firestore`);
        return { success: true };
    } catch (error) {
        console.error("Error deleting user from Firestore:", error);
        return { success: false, error: error.message };
    }
};

const updateUserInFirestore = async (uid, updates) => {
    try {
        await db.collection('users').doc(uid).update(updates); 
        return { success: true };
    } catch (error) {
        console.error("Error updating user in Firestore:", error);
        return { success: false, error: error.message };
    }
};

const addCourse = async (courseData) => {
    try {
        const docRef = db.collection('courses').doc(); 
        
        const newCourse = {
            courseId: courseData.courseId,
            courseName: courseData.courseName,
            instructorName: courseData.instructorName,
            SelectDays: courseData.SelectDays,
            Time: courseData.Time,
            RoomNumber: courseData.RoomNumber,
            capacity: courseData.capacity, 
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await docRef.set(newCourse);
        return { 
            success: true, 
            docId: docRef.id,          
            courseId: newCourse.courseId  
        };
    } catch (error) {
        console.error("Error adding course: ", error);
        return { success: false, error: error.message };
    }
};

const getAllAvailableCourses = async () => {
    try {
        const snapshot = await db.collection('courses')
            .where('isPublished', '==', true) 
            .orderBy('createdAt', 'desc')
            .get();

        const courses = [];
        snapshot.forEach(doc => {
            courses.push(doc.data());
        });

        return { success: true, courses };
    } catch (error) {
        return { success: false, error: error.message };
    }
};
const enrollStudentInCourse = async (studentUid, courseId) => {
    console.log("--- DEBUG START ---");
    console.log("1. Received from API -> studentUid:", studentUid, "| courseId:", courseId);

    try {
        if (!studentUid || !courseId) {
            return { success: false, error: "Missing parameters in Service" };
        }

        // 2. محاولة البحث عن الكورس
        const coursesRef = db.collection('courses');
        const courseQuery = await coursesRef.where('courseId', '==', courseId).get();

        console.log("2. Query executed. Documents found:", courseQuery.size);

        if (courseQuery.empty) {
            // لو طبعت 0، يبقى المشكلة في اسم الحقل 'CourseId' أو القيمة نفسها
            console.error(`3. ERROR: Course [${courseId}] not found in Firestore`);
            return { success: false, error: `Course ${courseId} not found` };
        }

        const courseDoc = courseQuery.docs[0];
        const courseRef = courseDoc.ref;
        console.log("4. Course document found. Path:", courseRef.path);

        const enrollmentRef = db.collection('enrollments').doc();

        await db.runTransaction(async (transaction) => {
            transaction.set(enrollmentRef, {
                uid: studentUid,
                courseId: courseId,
                enrolledAt: admin.firestore.FieldValue.serverTimestamp()
            });

            transaction.update(courseRef, {
                studentsCount: admin.firestore.FieldValue.increment(1)
            });
        });

        console.log("5. Transaction completed successfully!");
        return { success: true };

    } catch (error) {
        console.error("--- TRANSACTION ERROR ---:", error.message);
        return { success: false, error: error.message };
    }
};

const sendWelcomeEmail = async (email, fullName, password) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Welcome to YallaClass!',
            html: `
                <h3>Hi ${fullName},</h3>
                <p>Welcome to YallaClass! Your account has been created.</p>
                <p><strong>Your login details:</strong></p>
                <ul>
                    <li>Email: ${email}</li>
                    <li>Password: ${password}</li>
                </ul>
                <p>Please change your password after logging in.</p>
            `
        };

        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            const missing = [];
            if (!process.env.EMAIL_USER) missing.push('EMAIL_USER');
            if (!process.env.EMAIL_PASS) missing.push('EMAIL_PASS');
            throw new Error(`Missing email config: ${missing.join(', ')}`);
        }

        await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent successfully to ${email}`);
        return { success: true };

    } catch (error) {
        console.error(`❌ Error sending email to ${email}:`, error);
        if (error.response) {
            console.error('Nodemailer response:', error.response);
        }
        return { success: false, error: error.message };
    }
};

// AI Progress functions
const addAiProgress = async (progressData) => {
    try {
        const docRef = db.collection('ai_progress').doc();
        await docRef.set({
            studentId: progressData.studentId,
            courseId: progressData.courseId || null, // إضافة courseId كاختياري
            riskLevel: progressData.riskLevel,
            explanation: progressData.explanation,
            date: admin.firestore.FieldValue.serverTimestamp()
        });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

const getAiProgressForStudent = async (studentId) => {
    try {
        const snapshot = await db.collection('ai_progress').where('studentId', '==', studentId).orderBy('date', 'desc').get();
        const progressList = [];
        snapshot.forEach(doc => {
            progressList.push({ id: doc.id, ...doc.data() });
        });
        return { success: true, progress: progressList };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

// Departments functions
const addDepartment = async (departmentData) => {
    try {
        const docRef = db.collection('departments').doc();
        await docRef.set({
            name: departmentData.name,
            code: departmentData.code,
            headOfDepartment: departmentData.headOfDepartment,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

const getAllDepartments = async () => {
    try {
        const snapshot = await db.collection('departments').get();
        const departmentsList = [];
        snapshot.forEach(doc => {
            departmentsList.push({ id: doc.id, ...doc.data() });
        });
        return { success: true, departments: departmentsList };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

// Sessions functions
const addSession = async (sessionData) => {
    try {
        const docRef = db.collection('sessions').doc();
        await docRef.set({
            courseId: sessionData.courseId,
            professorId: sessionData.professorId,
            date: sessionData.date,
            startTime: sessionData.startTime,
            endTime: sessionData.endTime,
            isActive: sessionData.isActive || true,
            location: sessionData.location || null,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return { success: true, sessionId: docRef.id };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

const getSessionsForCourse = async (courseId) => {
    try {
        const snapshot = await db.collection('sessions').where('courseId', '==', courseId).orderBy('date', 'desc').get();
        const sessionsList = [];
        snapshot.forEach(doc => {
            sessionsList.push({ id: doc.id, ...doc.data() });
        });
        return { success: true, sessions: sessionsList };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

const updateSessionStatus = async (sessionId, isActive) => {
    try {
        await db.collection('sessions').doc(sessionId).update({ isActive });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

// Enrollments functions
const addEnrollment = async (enrollmentData) => {
    try {
        const docRef = db.collection('enrollments').doc();
        await docRef.set({
            studentId: enrollmentData.studentId,
            courseId: enrollmentData.courseId,
            totalAbsences: enrollmentData.totalAbsences || 0,
            grades: enrollmentData.grades || {},
            enrolledAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

const getEnrollmentsForStudent = async (studentId) => {
    try {
        const snapshot = await db.collection('enrollments').where('studentId', '==', studentId).get();
        const enrollmentsList = [];
        snapshot.forEach(doc => {
            enrollmentsList.push({ id: doc.id, ...doc.data() });
        });
        return { success: true, enrollments: enrollmentsList };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

const getEnrollmentsForCourse = async (courseId) => {
    try {
        const snapshot = await db.collection('enrollments').where('courseId', '==', courseId).get();
        const enrollmentsList = [];
        snapshot.forEach(doc => {
            enrollmentsList.push({ id: doc.id, ...doc.data() });
        });
        return { success: true, enrollments: enrollmentsList };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

const updateEnrollment = async (enrollmentId, updates) => {
    try {
        await db.collection('enrollments').doc(enrollmentId).update(updates);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

// Audit Logs functions
const addAuditLog = async (logData) => {
    try {
        const docRef = db.collection('audit_logs').doc();
        await docRef.set({
            userId: logData.userId,
            action: logData.action,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            details: logData.details || null
        });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

const getAuditLogs = async (limit = 100) => {
    try {
        const snapshot = await db.collection('audit_logs').orderBy('timestamp', 'desc').limit(limit).get();
        const logsList = [];
        snapshot.forEach(doc => {
            logsList.push({ id: doc.id, ...doc.data() });
        });
        return { success: true, logs: logsList };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

const getAuditLogsForUser = async (userId, limit = 50) => {
    try {
        const snapshot = await db.collection('audit_logs').where('userId', '==', userId).orderBy('timestamp', 'desc').limit(limit).get();
        const logsList = [];
        snapshot.forEach(doc => {
            logsList.push({ id: doc.id, ...doc.data() });
        });
        return { success: true, logs: logsList };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

module.exports = { 
    saveUserToFirestore, 
    getUserData, 
    getAllUsers, 
    deleteUserFromFirestore, 
    updateUserInFirestore,
    addCourse,
    getAllAvailableCourses,
    enrollStudentInCourse,
    sendWelcomeEmail,
    addAiProgress,
    getAiProgressForStudent,
    addDepartment,
    getAllDepartments,
    addSession,
    getSessionsForCourse,
    updateSessionStatus,
    addEnrollment,
    getEnrollmentsForStudent,
    getEnrollmentsForCourse,
    updateEnrollment,
    addAuditLog,
    getAuditLogs,
    getAuditLogsForUser
};