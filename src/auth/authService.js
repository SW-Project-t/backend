const admin = require('firebase-admin');
const serviceAccount = require('../config/service-account-key.json');

// تشغيل الفايربيز بالأدمن
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// دالة تسجيل مستخدم جديد (مهمتك الأساسية)
const signUp = async (email, password) => {
    try {
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
        });
        console.log('Successfully created new user:', userRecord.uid);
        return { success: true, uid: userRecord.uid };
    } catch (error) {
        console.error('Error creating new user:', error);
        return { success: false, error: error.code };
    }
};

module.exports = { signUp };