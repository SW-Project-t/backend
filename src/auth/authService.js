const admin = require('firebase-admin');
const serviceAccount = require('../config/service-account-key.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const auth = admin.auth();

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

const deleteUser = async (uid) => {
    try {
        await auth.deleteUser(uid);
        console.log(' User deleted successfully from Auth');
        return { success: true };
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            console.log(' User not found in Auth, proceeding...');
            return { success: true };
        }
        console.error(' Delete Error:', error.code);
        return { success: false, error: error.code };
    }
};

const verifyToken = async (idToken) => {
    try {
        const decodedToken = await auth.verifyIdToken(idToken);
        console.log(' Token is valid for UID:', decodedToken.uid);
        return { success: true, uid: decodedToken.uid };
    } catch (error) {
        console.error(' Invalid Token:', error.code);
        return { success: false, error: error.code };
    }
};

const updateUserPassword = async (uid, newPassword) => {
    try {
        await admin.auth().updateUser(uid, {
            password: newPassword
        });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

module.exports = { signUp, getPasswordResetLink, deleteUser, verifyToken, updateUserPassword };