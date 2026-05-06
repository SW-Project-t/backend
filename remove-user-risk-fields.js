require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

let serviceAccount;
const envServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
if (envServiceAccount) {
  try {
    serviceAccount = JSON.parse(envServiceAccount);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    console.log('Using FIREBASE_SERVICE_ACCOUNT from .env');
  } catch (error) {
    console.warn('Invalid FIREBASE_SERVICE_ACCOUNT JSON in .env:', error.message);
  }
}

if (!serviceAccount) {
  const serviceAccountPath = path.resolve(__dirname, 'src', 'config', 'service-account-key.json');
  if (fs.existsSync(serviceAccountPath)) {
    serviceAccount = require(serviceAccountPath);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    console.log(`Using service account from ${serviceAccountPath}`);
  }
}

if (!serviceAccount) {
  console.error('No valid Firebase service account configuration found. Set FIREBASE_SERVICE_ACCOUNT or add src/config/service-account-key.json.');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

(async () => {
  try {
    console.log('Fetching users...');
    const snapshot = await db.collection('users').get();
    console.log(`Found ${snapshot.size} users.`);

    const batchSize = 500;
    let batch = db.batch();
    let operations = 0;
    let batchesCommitted = 0;

    snapshot.docs.forEach((doc, index) => {
      batch.update(doc.ref, {
        riskLevel: admin.firestore.FieldValue.delete(),
        riskExplanation: admin.firestore.FieldValue.delete(),
        riskScore: admin.firestore.FieldValue.delete(),
        riskColor: admin.firestore.FieldValue.delete(),
        riskIcon: admin.firestore.FieldValue.delete()
      });
      operations++;

      if (operations === batchSize) {
        batch.commit();
        batchesCommitted++;
        batch = db.batch();
        operations = 0;
      }
    });

    if (operations > 0) {
      await batch.commit();
      batchesCommitted++;
    }

    console.log(`Completed. ${batchesCommitted} batch(es) committed.`);
  } catch (error) {
    console.error('Failed to remove user risk fields:', error);
    process.exit(1);
  }
})();
