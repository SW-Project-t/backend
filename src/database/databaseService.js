require('dotenv').config();
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

const db = admin.firestore();

// 🚀 الـ Transporter الجديد الخاص بـ Brevo لتخطي حظر بورتات ريلواي
const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false, // لازم false مع بورت 587
    auth: {
        user: 'a72094001@smtp-brevo.com',
        pass: process.env.SENDINBLUE_KEY// حط الـ SMTP Key اللي نسخناه
    }
});

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

// 📧 دالة الإرسال باستخدام Nodemailer الكلاسيكي العظيم بعد معالجة مشاكله
const sendWelcomeEmail = async (email, name, password) => {
    console.log("⏳ بنحاول نبعت الإيميل دلوقتي مستخدمين Brevo...");
    
    const mailOptions = {
        from: '"Yalla Class Admin" <a72094001@smtp-brevo.com>', // لازم يكون إيميل بريفو بتاعك
        to: email,
        subject: 'Welcome to Yalla Class - Your Account Details',
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <h3 style="color: #4CAF50;">Hello ${name},</h3>
                <p>Your account has been created by the Admin on <strong>Yalla Class</strong>.</p>
                <p>Here are your login credentials:</p>
                <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; border: 1px solid #ddd;">
                    <ul style="list-style: none; padding: 0; margin: 0;">
                        <li><strong>Email:</strong> <span style="color: #0056b3;">${email}</span></li>
                        <li><strong>Password:</strong> <span style="color: #0056b3;">${password}</span></li>
                    </ul>
                </div>
                <p style="color: #ff0000; font-size: 0.9em; font-weight: bold; margin-top: 15px;">
                    ⚠️ Please login and change your password immediately for security reasons.
                </p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
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