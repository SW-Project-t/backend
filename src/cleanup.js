const admin = require('firebase-admin');
const serviceAccount = require('./config/service-account-key.json');

// Initialize Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const auth = admin.auth();
const db = admin.firestore();

const deleteAllUsers = async () => {
    try {
        console.log('Starting cleanup...');

        // 1. Delete from Firebase Auth
        const listUsersResult = await auth.listUsers(1000); // Fetches up to 1000 users
        const uids = listUsersResult.users.map(user => user.uid);
        
        if (uids.length > 0) {
            await auth.deleteUsers(uids);
            console.log(`Deleted ${uids.length} users from Authentication`);
        } else {
            console.log('No users found in Authentication.');
        }

        // 2. Delete from Firestore (users collection)
        const batch = db.batch();
        const usersRef = db.collection('users');
        const snapshot = await usersRef.get();

        if (snapshot.empty) {
            console.log('No users found in Firestore.');
        } else {
            snapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            console.log(`Deleted ${snapshot.size} documents from Firestore 'users' collection.`);
        }

        console.log('Cleanup completed!');
        process.exit(); // Exit the script
    } catch (error) {
        console.error('Error during cleanup:', error);
        process.exit(1);
    }
};

deleteAllUsers();