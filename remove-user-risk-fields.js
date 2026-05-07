require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const RISK_FIELDS = ['riskLevel', 'riskExplanation', 'riskScore', 'riskColor', 'riskIcon'];

const serviceAccount = loadServiceAccount();
const projectId = serviceAccount.project_id;
if (!projectId) {
  console.error('Missing project_id in Firebase service account.');
  process.exit(1);
}

function loadServiceAccount() {
  const envServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (envServiceAccount) {
    try {
      const serviceAccount = JSON.parse(envServiceAccount);
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      console.log('Using FIREBASE_SERVICE_ACCOUNT from .env');
      return serviceAccount;
    } catch (error) {
      console.warn('Invalid FIREBASE_SERVICE_ACCOUNT JSON in .env:', error.message);
    }
  }

  const serviceAccountPath = path.resolve(__dirname, 'src', 'config', 'service-account-key.json');
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    console.log(`Using service account from ${serviceAccountPath}`);
    return serviceAccount;
  }

  console.error('No valid Firebase service account configuration found. Set FIREBASE_SERVICE_ACCOUNT or add src/config/service-account-key.json.');
  process.exit(1);
}

function base64UrlEncode(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getGoogleServerTime() {
  const response = await fetch('https://www.googleapis.com/generate_204', { method: 'HEAD' });
  const dateHeader = response.headers.get('date');
  if (!dateHeader) {
    throw new Error('Unable to obtain Google server time from response headers.');
  }
  return Math.floor(new Date(dateHeader).getTime() / 1000);
}

function createJwtAssertion(serviceAccount, issuedAt) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: issuedAt + 3600,
    iat: issuedAt
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signatureBase = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto.createSign('RSA-SHA256')
    .update(signatureBase)
    .end()
    .sign(serviceAccount.private_key, 'base64');

  return `${signatureBase}.${signature.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

function postForm(url, params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const request = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data || '{}');
          if (res.statusCode >= 400) {
            return reject(new Error(`POST ${url} failed ${res.statusCode}: ${JSON.stringify(parsed)}`));
          }
          resolve(parsed);
        } catch (error) {
          reject(new Error(`Failed to parse JSON response from ${url}: ${error.message}`));
        }
      });
    });

    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

async function getAccessToken() {
  const serverTime = await getGoogleServerTime();
  console.log(`Google server time: ${new Date(serverTime * 1000).toISOString()}`);
  const assertion = createJwtAssertion(serviceAccount, serverTime);

  const tokenData = await postForm('https://oauth2.googleapis.com/token', {
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  });

  if (!tokenData.access_token) {
    throw new Error(`Failed to obtain access token: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

function stripRiskFields(fields = {}) {
  const cleaned = { ...fields };
  let removed = false;
  for (const field of RISK_FIELDS) {
    if (field in cleaned) {
      delete cleaned[field];
      removed = true;
    }
  }
  return { cleaned, removed };
}

async function listUserDocuments(accessToken, pageToken) {
  let url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users?pageSize=500`;
  if (pageToken) {
    url += `&pageToken=${encodeURIComponent(pageToken)}`;
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to list documents: ${response.status} ${errorBody}`);
  }
  return response.json();
}

async function patchDocument(accessToken, document) {
  const { cleaned, removed } = stripRiskFields(document.fields);
  if (!removed) {
    return { skipped: true, name: document.name };
  }

  const url = `https://firestore.googleapis.com/v1/${document.name}?currentDocument.exists=true`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields: cleaned })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to patch document ${document.name}: ${response.status} ${errorBody}`);
  }

  return { skipped: false, name: document.name };
}

(async () => {
  try {
    const accessToken = await getAccessToken();
    console.log('Firestore access token acquired.');

    let pageToken;
    let totalProcessed = 0;
    let totalSkipped = 0;
    let totalUpdated = 0;

    do {
      const result = await listUserDocuments(accessToken, pageToken);
      const documents = result.documents || [];
      pageToken = result.nextPageToken;

      if (documents.length === 0 && !pageToken) {
        break;
      }

      for (const document of documents) {
        totalProcessed++;
        const { skipped } = await patchDocument(accessToken, document);
        if (skipped) {
          totalSkipped++;
        } else {
          totalUpdated++;
          console.log(`Updated ${document.name}`);
        }
      }
    } while (pageToken);

    console.log(`Completed. Processed ${totalProcessed} documents, updated ${totalUpdated}, skipped ${totalSkipped}.`);
  } catch (error) {
    console.error('Failed to remove user risk fields:', error);
    process.exit(1);
  }
})();
