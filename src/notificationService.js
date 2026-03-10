const admin = require('firebase-admin');

const sendRiskAlertToUser = async (uid, riskLevel) => {
    try {
        let title = "Attendance Alert";
        let body = "";

        if (riskLevel === 'high risk') {
            body = "Warning: Your attendance status is critical (High Risk). Please check your attendance record.";
        } else if (riskLevel === 'mid risk') {
            body = "Alert: Your attendance is at a moderate risk level.";
        } else {
            body = "Good news: Your attendance status is now Low Risk.";
        }

        const message = {
            notification: {
                title: title,
                body: body
            },
            topic: uid 
        };

        await admin.messaging().send(message);
        console.log(`Successfully sent alert to user ${uid}`);

    } catch (error) {
        console.error('Error sending notification:', error);
        throw error;
    }
};

module.exports = { sendRiskAlertToUser };