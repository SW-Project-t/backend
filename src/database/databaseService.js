const admin = require('firebase-admin');
const db = admin.firestore();
const saveUserToFirestore = async (uid, userData) => {
    try {
        await db.collection('users').doc(uid).set({
            fullName: userData.fullName,
            role: userData.role, 
            email: userData.email,
            uid: uid,
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
        return userDoc.exists ? userDoc.data() : null;
    } catch (error) {
        throw new Error(error.message);
    }
};

module.exports = { saveUserToFirestore, getUserData };