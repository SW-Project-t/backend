require('dotenv').config();
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,       
        pass: process.env.EMAIL_PASS 
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

        await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent successfully to ${email}`);
        return { success: true };

    } catch (error) {
        console.error(`❌ Error sending email to ${email}:`, error);
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