const admin = require('firebase-admin');
const serviceAccount = require('../config/service-account-key.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
//test
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
        console.log(' User deleted successfully');
        return { success: true };
    } catch (error) {
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
 //signUp('test_key_working@yallaclass.com', 'password123'); //test code 
// Export all functions for Person 4 (Integration)
module.exports = { signUp,  getPasswordResetLink,  deleteUser,  verifyToken };