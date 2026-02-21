const admin = require('firebase-admin');
const serviceAccount = require('../config/service-account-key.json');

// 1. Initialize Firebase Admin SDK
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const auth = admin.auth();

/**
 * TASK 1: Register a new user (Sign Up)
 */
const signUp = async (email, password) => {
    try {
        const userRecord = await auth.createUser({
            email: email,
            password: password,
            emailVerified: false,
        });
        console.log(' User created successfully:', userRecord.uid);
        return { success: true, uid: userRecord.uid };
    } catch (error) {
        console.error(' Sign Up Error:', error.code); 
        return { success: false, error: error.code };
    }
};

/**
 * TASK 2: Send Password Reset Email
 * Note: Admin SDK generates a link. Person 4 will use this link.
 */
const getPasswordResetLink = async (email) => {
    try {
        const link = await auth.generatePasswordResetLink(email);
        console.log(' Reset link generated for:', email);
        return { success: true, link: link };
    } catch (error) {
        console.error(' Reset Link Error:', error.code);
        return { success: false, error: error.code };
    }
};

/**
 * TASK 3: Delete User (Optional but useful for Admin Dashboard)
 */
const deleteUser = async (uid) => {
    try {
        await auth.deleteUser(uid);
        console.log(' User deleted successfully');
        return { success: true };
    } catch (error) {
        console.error(' Delete Error:', error.code);
        return { success: false, error: error.code };
    }
};

// Export all functions for Person 4 (Integration)
module.exports = { 
    signUp, 
    getPasswordResetLink, 
    deleteUser 
};