const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const admin = require('firebase-admin');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

console.log('🔥 Starting EduPortal Secure Backend Server...');

// Load environment variables
dotenv.config();

// Firebase initialization with individual environment variables (PERMANENT SOLUTION)
let serviceAccount;

// Check karein ke individual variables set hain ya nahi
if (process.env.FIREBASE_PROJECT_ID) {
    // Individual environment variables se credentials banayein
    serviceAccount = {
        type: process.env.FIREBASE_TYPE || 'service_account',
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
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
} else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Fallback: Purana JSON variable
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        if (serviceAccount.private_key && serviceAccount.private_key.includes('\\n')) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
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
console.log(
  "PRIVATE KEY START:",
  serviceAccount.private_key?.substring(0, 30)
);
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

  
// Initialize Express
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// ============================================
// EMAIL TRANSPORTER SETUP (OTP ke liye)
// ============================================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// OTP Store (Temporary - production mein database mein store karein)
const otpStore = {};

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
    try {
        const { email } = req.body;
        
        const db = admin.firestore();
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('email', '==', email).get();
        
        if (!snapshot.empty) {
            return res.status(400).json({ 
                success: false, 
                message: 'This email is already registered. Please login.' 
            });
        }
        
        const otp = generateOTP();
        
        otpStore[email] = {
            otp: otp,
            expires: Date.now() + 5 * 60 * 1000 // 5 minutes
        };
        
        // Console mein OTP print karein (Email na chale to)
        console.log('===========================================');
        console.log(`📧 OTP for ${email}: ${otp}`);
        console.log('===========================================');
        
        // Email bhejne ki koshish
        try {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'EduPortal - Email Verification OTP',
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5;">
                        <div style="max-width: 500px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                            <h2 style="color: #4361ee; text-align: center;">EduPortal Verification</h2>
                            <p style="color: #555; font-size: 16px;">Your One-Time Password (OTP) for email verification:</p>
                            <div style="background: #4361ee; color: white; font-size: 32px; font-weight: bold; text-align: center; padding: 20px; margin: 20px 0; border-radius: 5px; letter-spacing: 5px;">
                                ${otp}
                            </div>
                            <p style="color: #777; font-size: 14px;">This OTP will expire in 5 minutes.</p>
                            <p style="color: #777; font-size: 14px;">If you didn't request this, please ignore this email.</p>
                        </div>
                    </div>
                `
            };
            
            await transporter.sendMail(mailOptions);
            console.log('✅ Email sent successfully');
        } catch (emailError) {
            console.log('⚠️ Email send nahi ho saka, lekin OTP console mein available hai');
        }
        
        res.json({ 
            success: true, 
            message: 'OTP sent successfully! Check console (CMD) for OTP.' 
        });
        
    } catch (error) {
        console.error('OTP Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send OTP. Please try again.' 
        });
    }
});

// 2. VERIFY OTP
// 2. VERIFY OTP
app.post('/api/auth/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        
        const storedOTP = otpStore[email];
        
        if (!storedOTP) {
            return res.status(400).json({ 
                success: false, 
                message: 'OTP not found. Please request a new OTP.' 
            });
        }
        
        if (Date.now() > storedOTP.expires) {
            delete otpStore[email];
            return res.status(400).json({ 
                success: false, 
                message: 'OTP expired. Please request a new OTP.' 
            });
        }
        
        if (storedOTP.otp !== otp) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid OTP. Please try again.' 
            });
        }
        
        // ✅ OTP ko delete NAHI karein - Reset password ke liye chahiye hoga
        // Sirf verified flag add karein
        otpStore[email].verified = true;
        
        res.json({ 
            success: true, 
            message: 'Email verified successfully!' 
        });
        
    } catch (error) {
        console.error('Verify OTP Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to verify OTP.' 
        });
    }
});
// 3. REGISTER USER (OTP verify hone ke baad)
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        
        const db = admin.firestore();
        const usersRef = db.collection('users');
        
        // Check if user already exists
        const snapshot = await usersRef.where('email', '==', email).get();
        
        if (!snapshot.empty) {
            return res.status(400).json({ 
                success: false, 
                message: 'User already exists with this email' 
            });
        }
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Create user in Firestore
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
        
        res.status(201).json({ 
            success: true, 
            message: 'User registered successfully!',
            userId: userDoc.id
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});
// ============================================
// FORGOT PASSWORD ROUTES
// ============================================

// 5. FORGOT PASSWORD - Send OTP
app.post('/api/auth/forgot-password-send-otp', async (req, res) => {
    try {
        const { email } = req.body;
        
        const db = admin.firestore();
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('email', '==', email).get();
        
        // Check karein ke user exist karta hai
        if (snapshot.empty) {
            return res.status(404).json({ 
                success: false, 
                message: 'No account found with this email.' 
            });
        }
        
        // OTP generate karein
        const otp = generateOTP();
        
        // OTP store karein with purpose
        otpStore[email] = {
            otp: otp,
            expires: Date.now() + 5 * 60 * 1000, // 5 minutes
            purpose: 'password_reset'
        };
        
        // Email bhejein
        try {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'EduPortal - Password Reset OTP',
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5;">
                        <div style="max-width: 500px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                            <h2 style="color: #f72585; text-align: center;">Password Reset Request</h2>
                            <p style="color: #555; font-size: 16px;">Your OTP for password reset:</p>
                            <div style="background: #f72585; color: white; font-size: 32px; font-weight: bold; text-align: center; padding: 20px; margin: 20px 0; border-radius: 5px; letter-spacing: 5px;">
                                ${otp}
                            </div>
                            <p style="color: #777; font-size: 14px;">This OTP will expire in 5 minutes.</p>
                            <p style="color: #777; font-size: 14px;">If you didn't request this, please ignore this email.</p>
                        </div>
                    </div>
                `
            };
            
            await transporter.sendMail(mailOptions);
        } catch (emailError) {
            console.log('⚠️ Email send nahi ho saka');
        }
        
        res.json({ 
            success: true, 
            message: 'OTP sent to your email for password reset!' 
        });
        
    } catch (error) {
        console.error('Forgot Password OTP Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send OTP.' 
        });
    }
});

// 6. RESET PASSWORD
// 6. RESET PASSWORD
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        
        // Password validation
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/;
        
        if (!passwordRegex.test(newPassword)) {
            return res.status(400).json({
                success: false,
                message: 'Password must contain at least 8 characters, 1 uppercase, 1 lowercase, 1 number, and 1 special character.'
            });
        }
        
        // OTP verify karein
        const storedOTP = otpStore[email];
        
        if (!storedOTP || storedOTP.purpose !== 'password_reset') {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid or expired OTP.' 
            });
        }
        
        if (Date.now() > storedOTP.expires) {
            delete otpStore[email];
            return res.status(400).json({ 
                success: false, 
                message: 'OTP expired. Please request a new one.' 
            });
        }
        
        if (storedOTP.otp !== otp) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid OTP.' 
            });
        }
        
        // Password hash karein
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        // Database mein update karein
        const db = admin.firestore();
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('email', '==', email).get();
        
        let userId = null;
        snapshot.forEach(doc => {
            userId = doc.id;
        });
        
        if (userId) {
            await usersRef.doc(userId).update({
                password: hashedPassword
            });
            
            // ✅ Ab OTP delete karein
            delete otpStore[email];
            
            res.json({ 
                success: true, 
                message: 'Password updated successfully! Please login with new password.' 
            });
        } else {
            res.status(404).json({ 
                success: false, 
                message: 'User not found.' 
            });
        }
        
    } catch (error) {
        console.error('Reset Password Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to reset password.' 
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
    try {
        const db = admin.firestore();
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
// START SERVER
// ============================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
    console.log(`🔒 Security: Bcrypt + JWT Enabled`);
    console.log(`📧 Email: Nodemailer Configured`);
    console.log(`📝 OTP Routes: Active`);
});