const admin = require('firebase-admin');

if (!admin.apps.length) {
    try {
        const serviceAccount = require('../serviceAccountKey.json'); 
        
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: "yallaclass-5cc62.appspot.com"
        });
        console.log("🔥 Firebase Admin initialized successfully (Local Mode)!");
    } catch (error) {
        console.error("❌ Firebase initialization error:", error.message);
    }
}

const auth = admin.auth();
const signUp = async (email, password) => {
    try {
        const userRecord = await auth.createUser({
            email: email,
            password: password,
            emailVerified: false,
        });
        console.log('✅ User created successfully:', userRecord.uid);
        return { success: true, uid: userRecord.uid };
    } catch (error) {
        console.error('❌ Sign Up Error:', error.code); 
        return { success: false, error: error.code };
    }
};

const getPasswordResetLink = async (email) => {
    try {
        const link = await auth.generatePasswordResetLink(email);
        return { success: true, link: link };
    } catch (error) {
        return { success: false, error: error.code };
    }
};

const deleteUser = async (uid) => {
    try {
        await auth.deleteUser(uid);
        return { success: true };
    } catch (error) {
        if (error.code === 'auth/user-not-found') return { success: true };
        return { success: false, error: error.code };
    }
};

const verifyToken = async (idToken) => {
    try {
        const decodedToken = await auth.verifyIdToken(idToken);
        return { success: true, uid: decodedToken.uid };
    } catch (error) {
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