const admin = require('firebase-admin');
const db = admin.firestore();
const saveUserToFirestore = async (uid, userData) => {
    try {
        await db.collection('users').doc(uid).set({
            fullName: userData.fullName,
            role: userData.role, 
            email: userData.email,
            uid: uid,
            academicYear: userData.academicYear,
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
//to call it by admin dashboard
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
//to delete user by admin dashboard
const deleteUserFromFirestore = async (uid) => {
    try {
        await db.collection('users').doc(uid).delete();
        return { success: true };
    } catch (error) {
        console.error("Error deleting user from Firestore:", error);
        return { success: false, error: error.message };
    }
};
//to update user by admin dashboard
const updateUserInFirestore = async (uid, newData) => {
    try {
        await db.collection('users').doc(uid).update({
            fullName: newData.fullName,
            role: newData.role,
            academicYear: newData.academicYear
        });
        return { success: true };
    } catch (error) {
        console.error("Error updating user in Firestore:", error);
        return { success: false, error: error.message };
    }
};

module.exports = { saveUserToFirestore, getUserData, getAllUsers, deleteUserFromFirestore , updateUserInFirestore };
