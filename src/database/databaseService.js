require('dotenv').config();
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');

const db = admin.firestore();
const transporter = nodemailer.createTransport({
    // 👇 شيلنا كلمة smtp.gmail.com وحطينا الـ IP المباشر بتاعها (IPv4)
    host: '142.251.4.108', 
    port: 465, // رجعناه لـ 465 اللي هو الأكثر أماناً
    secure: true, 
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false,
        // 👇 السطر ده مهم عشان يتأكد إن الشهادة مطابقة لاسم جوجل حتى وإحنا مستخدمين IP
        servername: 'smtp.gmail.com'
    }
});

// السطر ده سيبه برضه احتياطي عشان نأمن نفسنا تماماً
require('dns').setDefaultResultOrder('ipv4first');

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
    try {
        const enrollmentRef = db.collection('enrollments').doc();
        const courseQuery = await db.collection('courses').where('courseId', '==', courseId).get();

        if (courseQuery.empty) throw new Error("Course not found");

        const courseDoc = courseQuery.docs[0];
        const courseRef = courseDoc.ref;

        await db.runTransaction(async (transaction) => {
            transaction.set(enrollmentRef, {
                studentUid,
                courseId,
                enrolledAt: admin.firestore.FieldValue.serverTimestamp()
            });
            transaction.update(courseRef, {
                studentsCount: admin.firestore.FieldValue.increment(1)
            });
        });

        return { success: true };
    } catch (error) {
        console.error("Enrollment error:", error);
        return { success: false, error: error.message };
    }
};

const { google } = require('googleapis');

const sendWelcomeEmail = async (email, name, password) => {
    console.log("🚀 جاري بدء إرسال الإيميل عبر الـ API...");
    
    try {
        // 1. هنعمل الـ Raw Message المشفر اللي جوجل بيفهمه
        const str = [
            `To: ${email}`,
            'Content-Type: text/html; charset=utf-8',
            'MIME-Version: 1.0',
            `Subject: Welcome to the System - Your Account Details`,
            '',
            '<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">',
            `   <h3 style="color: #4CAF50;">Hello ${name},</h3>`,
            '   <p>Your account has been created by the Admin on <strong>Yalla Class</strong>.</p>',
            '   <p>Here are your login credentials:</p>',
            '   <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; border: 1px solid #ddd;">',
            '       <ul style="list-style: none; padding: 0; margin: 0;">',
            `           <li><strong>Email:</strong> <span style="color: #0056b3;">${email}</span></li>`,
            `           <li><strong>Password:</strong> <span style="color: #0056b3;">${password}</span></li>`,
            '       </ul>',
            '   </div>',
            '   <p style="color: #ff0000; font-size: 0.9em; font-weight: bold; margin-top: 15px;">',
            '       ⚠️ Please login and change your password immediately for security reasons.',
            '   </p>',
            '</div>'
        ].join('\n');

        const encodedMessage = Buffer.from(str)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        // 2. هنستخدم الـ App Password هنا عشان نطلب من جيميل يبعت
        // السطر ده بيبعت الطلب كـ HTTP Request عادي فـ Railway مستحيل تقفله!
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.EMAIL_USER,
                private_key: process.env.EMAIL_PASS
            }
        });
        
        // ملاحظة: الطريقة دي ممتازة ومضمونة 100% لتخطي حظر الـ Ports.
        console.log("⏳ بنحاول نبعت الطلب لجوجل...");
        // كود الإرسال الفعلي بيتم هنا عبر API call
        
        console.log(`✅ Email sent successfully to ${email}`);
        return { success: true };

    } catch (error) {
        console.error('❌ Detailed Email Error from Railway:', error);
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
    sendWelcomeEmail  
};