const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const admin = require('firebase-admin');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { Resend } = require('resend');
console.log('🔥 Starting EduPortal Secure Backend Server...');

dotenv.config();

// Firebase initialization with individual environment variables (PERMANENT SOLUTION)
let serviceAccount;

console.log("🔵 Checking Firebase environment variables...");
console.log("🔵 FIREBASE_PROJECT_ID:", process.env.FIREBASE_PROJECT_ID ? "Set" : "NOT SET");
console.log("🔵 FIREBASE_CLIENT_EMAIL:", process.env.FIREBASE_CLIENT_EMAIL ? "Set" : "NOT SET");
console.log("🔵 FIREBASE_PRIVATE_KEY length:", process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.length : 0);

// Check karein ke individual variables set hain ya nahi
if (process.env.FIREBASE_PROJECT_ID) {
    // Individual environment variables se credentials banayein
    let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
    
    // Try multiple ways to fix newlines in private key
    privateKey = privateKey.replace(/\\n/g, '\n'); // Replace literal \n with actual newlines
    privateKey = privateKey.replace(/\\r/g, '\r'); // Replace literal \r with actual carriage returns
    privateKey = privateKey.trim(); // Trim whitespace
    
    serviceAccount = {
        type: process.env.FIREBASE_TYPE || 'service_account',
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: privateKey,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: process.env.FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
        token_uri: process.env.FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL || 'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
    };
    
    console.log("✅ Firebase credentials loaded from individual Environment Variables");
    console.log(`📧 Project ID: ${serviceAccount.project_id}`);
    console.log(`📧 Client Email: ${serviceAccount.client_email}`);
    console.log("🔵 Private key starts with:", serviceAccount.private_key.substring(0, 50));
} else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Fallback: Purana JSON variable
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
            serviceAccount.private_key = serviceAccount.private_key.trim();
        }
        console.log("✅ Firebase credentials loaded from JSON Environment Variable");
    } catch (error) {
        console.error("❌ Failed to parse FIREBASE_SERVICE_ACCOUNT:", error.message);
        process.exit(1);
    }
} else {
    try {
        serviceAccount = require('./serviceAccountKey.json');
        console.log("✅ Firebase credentials loaded from local file");
    } catch (err) {
        console.error("❌ Firebase credentials missing! Set environment variables.");
        process.exit(1);
    }
}
console.log("PROJECT:", serviceAccount.project_id);
console.log("EMAIL:", serviceAccount.client_email);
console.log("PRIVATE KEY EXISTS:", !!serviceAccount.private_key);
console.log("PRIVATE KEY starts with:", serviceAccount.private_key?.substring(0, 50));
console.log("PRIVATE KEY ends with:", serviceAccount.private_key?.substring(serviceAccount.private_key.length - 20));
// Initialize Firebase Admin
try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("✅ Firebase Admin initialized successfully");
} catch (error) {
    console.error("❌ Firebase Admin initialization failed:", error.message);
    process.exit(1);
}

const db = admin.firestore();

// Firestore Test
db.collection("test")
  .limit(1)
  .get()
  .then(() => {
    console.log("✅ Firestore Connected Successfully");
  })
  .catch((err) => {
    console.error("❌ Firestore Connection Failed:", err);
  });

// Firebase Auth Test
admin.auth().listUsers(1)
  .then((result) => {
    console.log("✅ Firebase Auth Connected");
    console.log("Users:", result.users.length);
  })
  .catch((err) => {
    console.error("❌ Firebase Auth Failed");
    console.error(err);
  });

// ------------------------------
// Firestore OTP Helper Functions
// ------------------------------
const otpCollection = db.collection('otps');

/**
 * Store OTP in Firestore
 * @param {string} email - User's email
 * @param {string} otp - OTP code
 * @param {string} [purpose='verification'] - Purpose of OTP (verification or password_reset)
 */
async function storeOTP(email, otp, purpose = 'verification') {
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes from now
  await otpCollection.doc(email).set({
    email,
    otp,
    purpose,
    expiresAt,
    verified: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log(`🔵 OTP stored for ${email} (purpose: ${purpose})`);
}

/**
 * Retrieve OTP from Firestore
 * @param {string} email - User's email
 * @returns {Promise<FirebaseFirestore.DocumentData|null>} OTP document or null
 */
async function getOTP(email) {
  const doc = await otpCollection.doc(email).get();
  if (!doc.exists) {
    console.log(`❌ No OTP found for ${email}`);
    return null;
  }
  const data = doc.data();
  console.log(`🔵 Retrieved OTP for ${email}:`, data);
  return data;
}

/**
 * Verify OTP
 * @param {string} email - User's email
 * @param {string} otp - OTP code to verify
 * @param {string} [purpose] - Expected purpose (optional)
 * @returns {Promise<boolean>} True if valid
 */
async function verifyOTPInDB(email, otp, purpose) {
  const otpData = await getOTP(email);
  if (!otpData) {
    return { valid: false, message: 'OTP not found. Please request a new OTP.' };
  }

  // Check if OTP is expired
  if (Date.now() > otpData.expiresAt) {
    await deleteOTP(email);
    return { valid: false, message: 'OTP expired. Please request a new OTP.' };
  }

  // Check purpose only if provided
  if (purpose && otpData.purpose !== purpose) {
    return { valid: false, message: 'Invalid OTP purpose.' };
  }

  // Check OTP
  if (otpData.otp !== otp) {
    return { valid: false, message: 'Invalid OTP. Please try again.' };
  }

  // Mark as verified
  await otpCollection.doc(email).update({ verified: true });
  console.log(`✅ OTP verified for ${email}`);
  return { valid: true, message: 'OTP verified successfully!' };
}

/**
 * Delete OTP from Firestore
 * @param {string} email - User's email
 */
async function deleteOTP(email) {
  await otpCollection.doc(email).delete();
  console.log(`🔵 OTP deleted for ${email}`);
}

// Initialize Express
const app = express();

// Middleware
app.use(cors({
    origin: ['https://alicomputer76w.github.io', 'http://localhost:5500', 'http://127.0.0.1:5500'],
    credentials: true
}));
app.use(express.json());

// ============================================
// EMAIL TRANSPORTER SETUP (OTP ke liye)
// ============================================
// Initialize Resend Email API
const resend = new Resend(process.env.RESEND_API_KEY);

// Email send function
async function sendOTPEmail(toEmail, otp, subject, color = '#4361ee') {
    try {
        const { data, error } = await resend.emails.send({
            from: 'EduPortal <onboarding@resend.dev>',
            to: [toEmail],
            subject: subject,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5;">
                    <div style="max-width: 500px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <h2 style="color: ${color}; text-align: center;">EduPortal Verification</h2>
                        <p style="color: #555; font-size: 16px;">Your One-Time Password (OTP):</p>
                        <div style="background: ${color}; color: white; font-size: 32px; font-weight: bold; text-align: center; padding: 20px; margin: 20px 0; border-radius: 5px; letter-spacing: 5px;">
                            ${otp}
                        </div>
                        <p style="color: #777; font-size: 14px;">This OTP will expire in 5 minutes.</p>
                        <p style="color: #777; font-size: 14px;">If you didn't request this, please ignore this email.</p>
                    </div>
                </div>
            `
        });
        
        if (error) {
            console.error('❌ Resend error:', error);
            return false;
        }
        
        console.log('✅ Email sent successfully via Resend:', data.id);
        return true;
    } catch (error) {
        console.error('❌ Email send error:', error);
        return false;
    }
}
// Generate OTP Function
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit OTP
}

// ============================================
// AUTHENTICATION MIDDLEWARE (Token Verify)
// ============================================
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];

    if (!token) {
        return res.status(403).json({ success: false, message: 'No token provided!' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.id;
        req.userRole = decoded.role;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token!' });
    }
};

// ============================================
// BASIC ROUTES
// ============================================
app.get('/', (req, res) => {
    res.json({ 
        message: 'EduPortal Secure Backend API is running!',
        status: 'success',
        timestamp: new Date()
    });
});

// ============================================
// AUTHENTICATION ROUTES
// ============================================

// 1. SEND OTP (Registration se pehle)
app.post('/api/auth/send-otp', async (req, res) => {
    console.log('🔵 Received send-otp request for email:', req.body.email);
    try {
        const { email } = req.body;
        
        if (!email) {
            console.log('❌ No email provided');
            return res.status(400).json({ 
                success: false, 
                message: 'Email is required' 
            });
        }
        
        const usersRef = db.collection('users');
        console.log('🔵 Checking if email exists in Firestore...');
        const snapshot = await usersRef.where('email', '==', email).get();
        console.log('🔵 Firestore query result:', snapshot.size, 'documents found');
        
        if (!snapshot.empty) {
            console.log('❌ Email already registered');
            return res.status(400).json({ 
                success: false, 
                message: 'This email is already registered. Please login.' 
            });
        }
        
        const otp = generateOTP();
        console.log('🔵 Generated OTP:', otp);
        
        // Store OTP in Firestore instead of in-memory
        await storeOTP(email, otp, 'verification');
        
        // Send response IMMEDIATELY (no waiting for email)
        console.log('🔵 Sending success response immediately');
        res.json({ 
            success: true, 
            message: 'OTP sent successfully! Check your email (or Render logs for testing).' 
        });
        
        // Send email in background (async)
        (async () => {
            try {
                console.log('🔵 Attempting to send email...');
                const success = await sendOTPEmail(email, otp, 'EduPortal - Email Verification OTP');
                if (!success) {
                    console.error('❌ Failed to send email via Resend');
                }
            } catch (error) {
                console.error('❌ Email send error:', error);
            }
        })();
        
    } catch (error) {
        console.error('❌ OTP Error:', error.message);
        console.error('❌ OTP Error stack:', error.stack);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send OTP. Please try again. Error: ' + error.message 
        });
    }
});


// Test endpoint to check server
app.get('/api/test', (req, res) => {
    console.log('🔵 Test endpoint called');
    res.json({ 
        success: true, 
        message: 'Server is working!',
        firebaseConnected: !!admin.apps.length,
        emailUser: process.env.EMAIL_USER ? `Set (${process.env.EMAIL_USER})` : 'NOT SET',
        emailPass: process.env.EMAIL_PASS ? 'Set' : 'NOT SET'
    });
});

// 2. VERIFY OTP
app.post('/api/auth/verify-otp', async (req, res) => {
    console.log('🔵 Received verify-otp request for email:', req.body.email);
    try {
        const { email, otp } = req.body;
        
        if (!email || !otp) {
            console.log('❌ Missing email or otp');
            return res.status(400).json({ 
                success: false, 
                message: 'Email and OTP are required' 
            });
        }
        
        // Use our Firestore verify function (don't specify purpose to support both registration and password reset)
        const verificationResult = await verifyOTPInDB(email, otp);
        
        if (!verificationResult.valid) {
            return res.status(400).json({ 
                success: false, 
                message: verificationResult.message 
            });
        }
        
        res.json({ 
            success: true, 
            message: verificationResult.message 
        });
        
    } catch (error) {
        console.error('❌ Verify OTP Error:', error.message);
        console.error('❌ Verify OTP Stack:', error.stack);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to verify OTP. Error: ' + error.message 
        });
    }
});
// 3. REGISTER USER (OTP verify hone ke baad)
app.post('/api/auth/register', async (req, res) => {
    console.log('🔵 Received register request for email:', req.body.email);
    try {
        const { name, email, password, role } = req.body;
        
        if (!name || !email || !password) {
            console.log('❌ Missing required fields');
            return res.status(400).json({ 
                success: false, 
                message: 'Name, email, and password are required' 
            });
        }
        
        const usersRef = db.collection('users');
        
        // Check if user already exists
        const snapshot = await usersRef.where('email', '==', email).get();
        
        if (!snapshot.empty) {
            console.log('❌ User already exists');
            return res.status(400).json({ 
                success: false, 
                message: 'User already exists with this email' 
            });
        }
        
        // Hash password
        console.log('🔵 Hashing password...');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Create user in Firestore
        console.log('🔵 Creating user in Firestore...');
        const userDoc = await usersRef.add({
            name: name,
            email: email,
            password: hashedPassword,
            role: role || 'student',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            downloadedFiles: [],
            premiumFiles: [],
            accessedFiles: []
        });
        console.log('✅ User created with ID:', userDoc.id);
        
        // Delete OTP after successful registration
        await deleteOTP(email);
        
        res.status(201).json({ 
            success: true, 
            message: 'User registered successfully!',
            userId: userDoc.id
        });
        
    } catch (error) {
        console.error('❌ Registration error:', error.message);
        console.error('❌ Registration stack:', error.stack);
        res.status(500).json({ 
            success: false, 
            message: 'Registration failed. Error: ' + error.message 
        });
    }
});
// ============================================
// FORGOT PASSWORD ROUTES
// ============================================

// 5. FORGOT PASSWORD - Send OTP
app.post('/api/auth/forgot-password-send-otp', async (req, res) => {
    console.log('🔵 Received forgot password OTP request for email:', req.body.email);
    try {
        const { email } = req.body;
        
        if (!email) {
            console.log('❌ No email provided');
            return res.status(400).json({ 
                success: false, 
                message: 'Email is required' 
            });
        }
        
        const usersRef = db.collection('users');
        console.log('🔵 Checking if email exists in Firestore...');
        const snapshot = await usersRef.where('email', '==', email).get();
        console.log('🔵 Firestore query result:', snapshot.size, 'documents found');
        
        // Check karein ke user exist karta hai
        if (snapshot.empty) {
            console.log('❌ No account found with this email');
            return res.status(404).json({ 
                success: false, 
                message: 'No account found with this email.' 
            });
        }
        
        // OTP generate karein
        const otp = generateOTP();
        console.log('🔵 Generated OTP:', otp);
        
        // OTP store karein with purpose in Firestore
        await storeOTP(email, otp, 'password_reset');
        
        // Send response IMMEDIATELY (no waiting for email)
        console.log('🔵 Sending success response immediately');
        res.json({ 
            success: true, 
            message: 'OTP sent to your email for password reset!' 
        });
        
        // Send email in background using Resend (async)
(async () => {
    try {
        console.log('🔵 Attempting to send password reset email via Resend...');
        const success = await sendOTPEmail(
            email, 
            otp, 
            'EduPortal - Password Reset OTP',
            '#f72585'
        );
        
        if (!success) {
            console.error('❌ Failed to send password reset email via Resend');
        } else {
            console.log('✅ Password reset email sent successfully to', email);
        }
    } catch (emailError) {
        console.error('❌ Password reset email send error:', emailError.message);
    }
})();
        
    } catch (error) {
        console.error('Forgot Password OTP Error:', error.message);
        console.error('Forgot Password OTP Stack:', error.stack);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send OTP.' 
        });
    }
});

// 6. RESET PASSWORD
app.post('/api/auth/reset-password', async (req, res) => {
    console.log('🔵 Received reset password request for email:', req.body.email);
    try {
        const { email, otp, newPassword } = req.body;
        
        if (!email || !otp || !newPassword) {
            console.log('❌ Missing required fields');
            return res.status(400).json({
                success: false,
                message: 'Email, OTP, and new password are required.'
            });
        }
        
        // Password validation
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/;
        
        if (!passwordRegex.test(newPassword)) {
            console.log('❌ Password does not meet requirements');
            return res.status(400).json({
                success: false,
                message: 'Password must contain at least 8 characters, 1 uppercase, 1 lowercase, 1 number, and 1 special character.'
            });
        }
        
        // OTP verify karein using Firestore
        const verificationResult = await verifyOTPInDB(email, otp, 'password_reset');
        if (!verificationResult.valid) {
            return res.status(400).json({ 
                success: false, 
                message: verificationResult.message 
            });
        }
        
        // Password hash karein
        console.log('🔵 Hashing new password...');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        // Database mein update karein
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('email', '==', email).get();
        
        let userId = null;
        snapshot.forEach(doc => {
            userId = doc.id;
        });
        
        if (userId) {
            console.log('🔵 Updating password in Firestore for user ID:', userId);
            await usersRef.doc(userId).update({
                password: hashedPassword
            });
            
            // ✅ Ab OTP delete karein from Firestore
            await deleteOTP(email);
            console.log('✅ OTP deleted from Firestore');
            
            res.json({ 
                success: true, 
                message: 'Password updated successfully! Please login with new password.' 
            });
        } else {
            console.log('❌ User not found in Firestore');
            res.status(404).json({ 
                success: false, 
                message: 'User not found.' 
            });
        }
        
    } catch (error) {
        console.error('❌ Reset Password Error:', error.message);
        console.error('❌ Reset Password Stack:', error.stack);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to reset password. Error: ' + error.message 
        });
    }
});
// 4. LOGIN USER
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const db = admin.firestore();
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('email', '==', email).get();
        
        if (snapshot.empty) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid email or password' 
            });
        }
        
        let userData = null;
        let userId = null;
        
        snapshot.forEach(doc => {
            userData = { id: doc.id, ...doc.data() };
            userId = doc.id;
        });
        
        // Verify password
        const isPasswordValid = await bcrypt.compare(password, userData.password);
        
        if (!isPasswordValid) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid email or password' 
            });
        }
        
        // Generate JWT token
        const token = jwt.sign(
            { id: userId, role: userData.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        // Remove password from response
        delete userData.password;
        
        res.json({ 
            success: true, 
            message: 'Login successful!',
            token: token,
            user: userData
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// 5. GET CURRENT USER PROFILE (Protected Route)
app.get('/api/auth/me', verifyToken, async (req, res) => {
    console.log('🔵 Received get current user request for user ID:', req.userId);
    try {
        const userDoc = await db.collection('users').doc(req.userId).get();
        
        if (!userDoc.exists) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        const userData = userDoc.data();
        delete userData.password;
        
        res.json({ 
            success: true, 
            user: { id: userDoc.id, ...userData } 
        });
        
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ============================================
// ERROR HANDLING
// ============================================
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        success: false, 
        error: 'Something went wrong!', 
        message: err.message 
    });
});
// ============================================
// 📱 WHATSAPP CLOUD API - SMART AUTO REPLY SYSTEM v2
// ============================================

// Helper: WhatsApp Message Send Function
async function sendWhatsAppMessage(to, text) {
  const response = await fetch(`https://graph.facebook.com/v25.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: text }
    })
  });
  return await response.json();
}

// ============================================
// 📚 BOOKS & NOTES LINKS
// ============================================
const BOOKS = {
  '9th': [
    { name: 'Mathematics', link: 'https://alicomputer76w.github.io/Matric-Notes/pages/math-9th.html' },
    { name: 'Physics', link: 'https://alicomputer76w.github.io/Matric-Notes/pages/physics-9th.html' },
    { name: 'Chemistry', link: 'https://alicomputer76w.github.io/Matric-Notes/pages/chemistry-9th.html' },
    { name: 'Biology', link: 'https://alicomputer76w.github.io/Matric-Notes/pages/biology-9th.html' },
    { name: 'Computer Science', link: 'https://alicomputer76w.github.io/Matric-Notes/pages/computer-exercises.html' },
    { name: 'English', link: 'https://alicomputer76w.github.io/Matric-Notes/pages/english-9th.html' },
    { name: 'Urdu', link: 'https://alicomputer76w.github.io/Matric-Notes/pages/urdu-9th.html' },
    { name: 'Islamiat', link: 'https://alicomputer76w.github.io/Matric-Notes/pages/islamiat-9th.html' },
    { name: 'Al-Quran', link: 'https://alicomputer76w.github.io/Matric-Notes/pages/quran-9th.html' }
  ],
  '10th': [
    { name: 'Mathematics', link: 'https://alicomputer76w.github.io/Matric-Notes/pages/math-10th.html' },
    { name: 'Physics', link: 'https://alicomputer76w.github.io/Matric-Notes/pages/physics-10th.html' },
    { name: 'Chemistry', link: 'https://alicomputer76w.github.io/Matric-Notes/pages/chemistery-10th.html' },
    { name: 'Biology', link: 'https://alicomputer76w.github.io/Matric-Notes/pages/biology-10th.html' },
    { name: 'Computer Science', link: 'https://alicomputer76w.github.io/Matric-Notes/pages/computer-10th.html' },
    { name: 'English', link: 'https://alicomputer76w.github.io/Matric-Notes/' },
    { name: 'Urdu', link: 'https://alicomputer76w.github.io/Matric-Notes/' },
    { name: 'Pak Studies', link: 'https://alicomputer76w.github.io/Matric-Notes/pages/pak-study-10th.html' },
    { name: 'Al-Quran', link: 'https://alicomputer76w.github.io/Matric-Notes/' }
  ]
};

// Session management (10 minute expiry)
const userSessions = new Map();
const SESSION_TTL = 10 * 60 * 1000;

function getState(from) {
  const s = userSessions.get(from);
  if (!s) return null;
  if (Date.now() - s.time > SESSION_TTL) { userSessions.delete(from); return null; }
  return s.state;
}
function setState(from, state) { userSessions.set(from, { state, time: Date.now() }); }
function clearState(from) { userSessions.delete(from); }

function bookListMessage(cls) {
  const lines = BOOKS[cls].map((b, i) => `*${i + 1}* • ${b.name}`).join('\n');
  return `📚 *${cls.toUpperCase()} CLASS* — *Select Book*
━━━━━━━━━━━━━━━━━━

${lines}

━━━━━━━━━━━━━━━━━━
👉 *Reply with book number*
🏠 Main Menu: reply *Hi*`;
}

const WELCOME_MESSAGE = `🎓 *EDUPORTAL* 🎓
━━━━━━━━━━━━━━━━━━
*9th & 10th Class Study Platform*
_Board Exam Preparation Made Easy_

👋 *Welcome! Select a Service:*

📚 *1* • 9th Class Notes
📖 *2* • 10th Class Notes
📝 *3* • Past Papers (5 Years Solved)
❓ *4* • Important Questions
🎥 *5* • Video Lectures
🧪 *6* • Premium Test Series
💬 *7* • Support

━━━━━━━━━━━━━━━━━━
👉 *Reply with number (1-7)*
🌐 alicomputer76w.github.io/Matric-Notes`;

const SERVICE_REPLIES = {
  '3': `📝 *PAST PAPERS* — *5 Years Solved*
━━━━━━━━━━━━━━━━━━
✅ 2021-2025 Board Papers
✅ Solved & Guess Papers
✅ All Subjects Included

🔗 https://alicomputer76w.github.io/Matric-Notes/
━━━━━━━━━━━━━━━━━━
🏠 Main Menu: reply *Hi*`,

  '4': `❓ *IMPORTANT QUESTIONS*
━━━━━━━━━━━━━━━━━━
✅ Chapter-wise Important Q/A
✅ Board Exam Focused
✅ Solved Form Mein

🔗 https://alicomputer76w.github.io/Matric-Notes/
━━━━━━━━━━━━━━━━━━
🏠 Main Menu: reply *Hi*`,

  '5': `🎥 *VIDEO LECTURES*
━━━━━━━━━━━━━━━━━━
✅ Topic-wise Explanations
✅ Difficult Topics Made Easy
✅ Free Video Content

🔗 https://alicomputer76w.github.io/Matric-Notes/
━━━━━━━━━━━━━━━━━━
🏠 Main Menu: reply *Hi*`,

  '6': `🧪 *PREMIUM TEST SERIES*
━━━━━━━━━━━━━━━━━━
👑 Chapter-wise Tests
👑 Full Book Mock Exams
👑 Instant Results & Analysis

🔗 https://alicomputer76w.github.io/Matric-Notes/
━━━━━━━━━━━━━━━━━━
🏠 Main Menu: reply *hi*`,

  '7': `💬 *EDUPORTAL SUPPORT*
━━━━━━━━━━━━━━━━━━
📧 eduportal.contact@gmail.com
📱 +92 310 6727640
🌐 alicomputer76w.github.io/Matric-Notes

⏰ *Response Time:* Within 24 hours
━━━━━━━━━━━━━━━━━━
🏠 Main Menu: reply *hi*`
};

// ============================================
// 📡 WEBHOOK ROUTES
// ============================================

// GET - Meta verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === 'eduportal123') {
    console.log('✅ WEBHOOK VERIFIED!');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Webhook verification failed');
    res.sendStatus(403);
  }
});

// POST - Smart Message Handler
app.post('/webhook', async (req, res) => {
  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    
    if (value?.messages?.length) {
      const msg = value.messages[0];
      const from = msg.from;
      const text = (msg.text?.body || '').trim().toLowerCase();
      
      console.log(`📩 New WhatsApp from ${from}: "${text}"`);

      // Greetings → Main Menu (state reset)
      const greetings = ['hi', 'hello', 'hey', 'salam', 'assalam o alaikum', 'aoa', 'start', 'menu', 'help', '0'];
      if (greetings.includes(text)) {
        clearState(from);
        await sendWhatsAppMessage(from, WELCOME_MESSAGE);
        return res.sendStatus(200);
      }

      // Agar student book select kar raha hai
      const state = getState(from);
      if (state === 'awaiting_9th' || state === 'awaiting_10th') {
        const cls = state === 'awaiting_9th' ? '9th' : '10th';
        const list = BOOKS[cls];
        const idx = parseInt(text, 10) - 1;
        
        if (!isNaN(idx) && list[idx]) {
          clearState(from);
          const book = list[idx];
          await sendWhatsAppMessage(from,
  `✅ *${cls} CLASS* — *${book.name}*
━━━━━━━━━━━━━━━━━━

📖 *Chapter-wise Complete Notes!*

🔗 *Read / Download:*
${book.link}

━━━━━━━━━━━━━━━━━━
📚 More books: reply *${cls === '9th' ? '1' : '2'}*
🏠 Main menu: reply *Hi*
💬 Support: reply *7*`
);
        } else {
          await sendWhatsAppMessage(from, `❌ Sahi number bhejein (1-${list.length})\n\n🏠 Menu ke liye *Hi* bhejein.`);
        }
        return res.sendStatus(200);
      }

      // Main Menu selections
      if (text === '1') {
        setState(from, 'awaiting_9th');
        await sendWhatsAppMessage(from, bookListMessage('9th'));
      } else if (text === '2') {
        setState(from, 'awaiting_10th');
        await sendWhatsAppMessage(from, bookListMessage('10th'));
      } else if (SERVICE_REPLIES[text]) {
        await sendWhatsAppMessage(from, SERVICE_REPLIES[text]);
      } else {
        await sendWhatsAppMessage(from, `Maaf kijiye, main samajh nahi paya 😅\n\nMenu dekhne ke liye *Hi* likh kar bhejein.`);
      }
    }
    
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Webhook error:', err.message);
    res.sendStatus(200);
  }
});

// API endpoint for website to send WhatsApp messages
app.post('/api/send-whatsapp', async (req, res) => {
  try {
    const { to, name, message } = req.body;
    const text = message || `Hello ${name || 'Student'}! EduPortal ki taraf se aapke notes ready hain.`;
    const result = await sendWhatsAppMessage(to, text);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// ============================================
// 👑 PREMIUM SYSTEM - ADMIN ENDPOINTS
// ============================================

// Premium Activation Email
async function sendPremiumActivationEmail(toEmail, name) {
    try {
        const { data, error } = await resend.emails.send({
            from: 'EduPortal <onboarding@resend.dev>',
            to: [toEmail],
            subject: '🎉 EduPortal Premium Activated!',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5;">
                    <div style="max-width: 500px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; border-top: 5px solid #f72585;">
                        <h2 style="color: #f72585; text-align: center;">👑 Premium Activated!</h2>
                        <p style="color: #555;">Dear <strong>${name}</strong>,</p>
                        <p style="color: #555;">Mubarak ho! Aapki <strong>EduPortal Premium Subscription (Rs. 500 - Lifetime)</strong> activate ho gayi hai.</p>
                        <div style="background: #fff0f3; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <p style="color: #9f1239; margin: 5px 0;">✅ Tamam Premium Tests</p>
                            <p style="color: #9f1239; margin: 5px 0;">✅ Chapter-wise Notes</p>
                            <p style="color: #9f1239; margin: 5px 0;">✅ Past Papers & Guess Papers</p>
                            <p style="color: #9f1239; margin: 5px 0;">✅ Full Book Model Papers</p>
                        </div>
                        <p style="text-align: center;"><a href="https://alicomputer76w.github.io/Matric-Notes/" style="background: #f72585; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; display: inline-block;">Website Kholein</a></p>
                        <p style="color: #777; font-size: 13px; text-align: center;">— Team EduPortal</p>
                    </div>
                </div>
            `
        });
        if (error) { console.error('❌ Premium email error:', error); return false; }
        console.log('✅ Premium activation email sent to', toEmail);
        return true;
    } catch (e) {
        console.error('❌ Premium email error:', e.message);
        return false;
    }
}

// Premium WhatsApp Message
function premiumWhatsAppMsg(name) {
  return `🎉 *MUBARAK HO ${name}!* 🎉
━━━━━━━━━━━━━━━━━━
✅ Aapka *EduPortal Premium* activate ho gaya hai!

👑 *Ab aap access kar sakte hain:*
• Tamam Premium Tests
• Chapter-wise Notes
• Past Papers & Guess Papers
• Full Book Model Papers

🌐 *Website:* https://alicomputer76w.github.io/Matric-Notes/

Parhte rahein, kamyab hon! 📚
— *Team EduPortal*`;
}

// APPROVE PREMIUM ORDER (Admin only)
app.post('/api/admin/approve-premium', async (req, res) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token' });

    const decoded = await admin.auth().verifyIdToken(token);
    const adminDoc = await db.collection('users').doc(decoded.uid).get();
    if (!adminDoc.exists || adminDoc.data().role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin only!' });
    }

    const { orderId } = req.body;
    const orderRef = db.collection('premiumOrders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return res.status(404).json({ success: false, message: 'Order not found' });

    const order = orderSnap.data();
    if (order.status !== 'pending') return res.status(400).json({ success: false, message: 'Order already reviewed' });

    // 1. Order approve karo
    await orderRef.update({ status: 'approved', reviewedAt: admin.firestore.FieldValue.serverTimestamp() });
    // 2. User ko premium karo
    await db.collection('users').doc(order.userId).update({
      isPremium: true,
      premiumSince: admin.firestore.FieldValue.serverTimestamp()
    });
    // 3. Email bhejo
    await sendPremiumActivationEmail(order.email, order.name);
    // 4. WhatsApp bhejo
    if (order.whatsapp) {
      let digits = order.whatsapp.replace(/\D/g, '');
      if (!digits.startsWith('92')) digits = '92' + digits;
      await sendWhatsAppMessage(digits, premiumWhatsAppMsg(order.name));
    }

    console.log(`✅ Premium order approved: ${orderId} (${order.email})`);
    res.json({ success: true, message: 'Approved! Email + WhatsApp sent.' });
  } catch (e) {
    console.error('❌ Approve error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// REJECT PREMIUM ORDER (Admin only)
app.post('/api/admin/reject-premium', async (req, res) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token' });

    const decoded = await admin.auth().verifyIdToken(token);
    const adminDoc = await db.collection('users').doc(decoded.uid).get();
    if (!adminDoc.exists || adminDoc.data().role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin only!' });
    }

    const { orderId } = req.body;
    const orderRef = db.collection('premiumOrders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return res.status(404).json({ success: false, message: 'Order not found' });

    await orderRef.update({ status: 'rejected', reviewedAt: admin.firestore.FieldValue.serverTimestamp() });
    console.log(`❌ Premium order rejected: ${orderId}`);
    res.json({ success: true, message: 'Order rejected.' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});
// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
    console.log(`🔒 Security: Bcrypt + JWT Enabled`);
    console.log(`📧 Email: Nodemailer Configured`);
    console.log(`📝 OTP Routes: Active`);
});