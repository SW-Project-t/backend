require('dotenv').config();
// 🌟 التعديل السحري: إجبار الـ Node.js على استخدام IPv4 لحل مشكلة فشل الاتصال بإيميل Brevo
require('dns').setDefaultResultOrder('ipv4first'); 

const express = require('express');
const bodyParser = require('body-parser');
const authService = require('./auth/authService'); 
const databaseService = require('./database/databaseService'); 
const verifyToken = require('../middleware/authMiddleware');
const app = express();
const multer = require('multer');
const { getStorage } = require('firebase-admin/storage');
const upload = multer({ storage: multer.memoryStorage() });

const bucket = getStorage().bucket("yallaclass-5cc62.appspot.com");
const { analyzeStudentRisk } = require('./aiService');

// 🌟 التعديل القديم بتاعك: تظبيط الـ CORS بأبسط وأضمن طريقة لحل المشاكل
const cors = require('cors');
app.use(cors()); // دي هتفتح الدنيا تماماً بدون أي قيود تسبب إيرورز في الكونسول

app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));
const admin = require('firebase-admin'); 
const { sendRiskAlertToUser } = require('./notificationService'); 

// API: Add Single User
app.post('/admin/add-user', async (req, res) => {
    try {
        console.log("Data received from Frontend:", req.body);
        
        const { email, password, fullName, role, academicYear, code, ...userData } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: "Email and password are required" });
        }
        if (!fullName || !role || !academicYear) {
            return res.status(400).json({ success: false, error: "Full name, role, and academic year are required" });
        }

        if (code && !/^[a-zA-Z0-9-]+$/.test(code)) {
            return res.status(400).json({ success: false, error: "Student code must be letters and numbers only" });
        }

        const authResult = await authService.signUp(email, password);

        if (authResult.success) {
            const finalProfileData = {
                fullName,
                role,
                email,
                academicYear,
                code: code || '', 
                ...userData  
            };

            const dbResult = await databaseService.saveUserToFirestore(authResult.uid, finalProfileData);

            if (dbResult.success) {
                // 📧 هيبعت في الخلفية بالبيانات النضيفة
                await databaseService.sendWelcomeEmail(email, fullName, password);
                return res.status(201).json({ 
                    success: true, 
                    message: "User registered, profile created, and email sending in background!" 
                });
            } else {
                return res.status(500).json({ 
                    success: false, 
                    error: "Account created, but failed to save profile to Firestore" 
                });
            }
        }

        return res.status(400).json({ 
            success: false, 
            error: authResult.error 
        });

    } catch (error) {
        console.error("Internal Server Error:", error);
        return res.status(500).json({ 
            success: false, 
            error: "An internal server error occurred" 
        });
    }
});

// Bulk Add Users Endpoint
app.post('/admin/add-users-bulk', async (req, res) => {
    try {
        const users = req.body.users; 

        if (!Array.isArray(users) || users.length === 0) {
            return res.status(400).json({ success: false, error: "Please provide an array of users" });
        }

        const results = []; 

        for (const user of users) {
            const { email, password, fullName, role, academicYear, department, code, phoneNumber, gpa } = user;

            if (!email || !password || !fullName) {
                results.push({ email: email || 'missing', success: false, error: "Missing data" });
                continue;
            }

            try {
                const authResult = await authService.signUp(email, password);

                if (authResult.success) {
                    const finalProfileData = { 
                        fullName, 
                        role: role || 'student', 
                        email, 
                        academicYear: academicYear || 'N/A',
                        department: department || '',      
                        code: code || '',                  
                        phoneNumber: phoneNumber || '',
                        gpa: gpa || null 
                    };

                    await databaseService.saveUserToFirestore(authResult.uid, finalProfileData);
                    
                    // إرسال في الخلفية
                    databaseService.sendWelcomeEmail(email, fullName, password)
                        .then(() => console.log(`📩 Background (Bulk): Email sent to ${email}`))
                        .catch((err) => console.error(`❌ Background Email Error for ${email}:`, err));

                    results.push({ email, success: true });
                } else {
                    results.push({ email, success: false, error: authResult.error });
                }
            } catch (err) {
                results.push({ email, success: false, error: err.message });
            }
        }

        res.status(200).json({ 
            message: "Bulk process completed", 
            totalProcessed: users.length,
            results: results 
        });

    } catch (error) {
        console.error("Bulk Add Error:", error);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

// API: Get All Users
app.get('/admin/users', async (req, res) => {
    try {
        const result = await databaseService.getAllUsers();

        if (result.success) {
            return res.status(200).json({ 
                success: true, 
                message: "Users fetched successfully",
                users: result.users 
            });
        } else {
            return res.status(500).json({ 
                success: false, 
                error: "Failed to fetch users from database" 
            });
        }

    } catch (error) {
        console.error("Get All Users API Error:", error);
        res.status(500).json({ 
            success: false, 
            error: "An internal server error occurred" 
        });
    }
});

// API: Reset Password
app.post('/reset-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, error: "Email is required" });
        }

        const resetResult = await authService.getPasswordResetLink(email);

        if (resetResult.success) {
            return res.status(200).json({ 
                success: true, 
                message: "Password reset link generated successfully!", 
                link: resetResult.link 
            });
        } else {
            return res.status(400).json({ success: false, error: resetResult.error });
        }

    } catch (error) {
        console.error("Reset Password Error:", error);
        res.status(500).json({ success: false, error: "An internal server error occurred" });
    }
});

app.get('/', (req, res) => res.send("Server is ALIVE!"));

// API: Verify Login
app.post('/verify-login', async (req, res) => {
    try {
        const { idToken } = req.body;

        if (!idToken) {
            return res.status(400).json({ success: false, error: "idToken is required" });
        }

        const verifyResult = await authService.verifyToken(idToken);

        if (verifyResult.success) {
            const userData = await databaseService.getUserData(verifyResult.uid);

            if (userData) {
                return res.status(200).json({ 
                    success: true, 
                    message: "Login verified successfully!", 
                    token: idToken,
                    profile: userData 
                });
            } else {
                return res.status(404).json({ success: false, error: "User profile not found in database" });
            }
        } else {
            return res.status(401).json({ success: false, error: "Invalid or expired token" });
        }

    } catch (error) {
        console.error("Verify Login Error:", error);
        res.status(500).json({ success: false, error: "An internal server error occurred" });
    }
});

// API: Delete User (Auth + Firestore)
app.delete('/admin/delete-user/:uid', async (req, res) => {
    try {
        const { uid } = req.params; 

        const authDelete = await authService.deleteUser(uid);

        if (authDelete.success) {
            const dbDelete = await databaseService.deleteUserFromFirestore(uid);

            if (dbDelete.success) {
                return res.status(200).json({ 
                    success: true, 
                    message: "User deleted successfully from Auth and Firestore" 
                });
            } else {
                 return res.status(500).json({ 
                    success: false, 
                    error: "User deleted from Auth, but failed to delete from Firestore" 
                });
            }
        }

        res.status(400).json({ success: false, error: "Failed to delete user from Auth" });

    } catch (error) {
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

// API: Update User (Firestore)
app.put('/admin/update-user/:uid', async (req, res) => {
    try {
        const { uid } = req.params;
        const updates = req.body; 

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: "No data provided to update" 
            });
        }

        const result = await databaseService.updateUserInFirestore(uid, updates);

        if (result.success) {
            return res.status(200).json({ 
                success: true, 
                message: "User updated successfully" 
            });
        }
        
        res.status(400).json({ success: false, error: "Failed to update user" });
    } catch (error) {
        console.error("Update Error:", error);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

app.get('/api/profile', verifyToken, async (req, res) => {
    try {
        const userData = await databaseService.getUserData(req.user.uid);

        if (userData) {
            return res.status(200).json({
                success: true,
                profile: userData
            });
        } else {
            return res.status(404).json({
                success: false,
                error: "User profile not found",
                debug_uid: req.user.uid 
            });
        }
    } catch (error) {
        console.error("Profile Error:", error);
        res.status(500).json({ success: false, error: "Server Error" });
    }
});

// API: User Updates own profile
app.put('/api/profile/update', verifyToken, async (req, res) => {
    try {
        const updates = req.body;
        delete updates.email;
        delete updates.uid;
        delete updates.role;

        const result = await databaseService.updateUserInFirestore(req.user.uid, updates);
        if (result.success) {
            res.status(200).json({ success: true, message: "Profile updated successfully" });
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        res.status(500).json({ success: false, error: "Update Error" });
    }
});

// API: User Changes Password
app.put('/api/profile/update-password', verifyToken, async (req, res) => {
    try {
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ success: false, error: "Password must be at least 6 characters" });
        }
        const result = await authService.updateUserPassword(req.user.uid, newPassword);

        if (result.success) {
            res.status(200).json({ success: true, message: "Password updated successfully!" });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: "Password Update Error" });
    }
});

// API: Get Courses
app.get('/api/all-courses', verifyToken, async (req, res) => {
    try {
        const result = await databaseService.getAllAvailableCourses();

        if (result.success) {
            return res.status(200).json({
                success: true,
                courses: result.courses
            });
        } else {
            return res.status(500).json({ success: false, error: "Failed to fetch courses" });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

// API: Admin Add Course
app.post('/admin/add-course', verifyToken, async (req, res) => {
   if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: "Forbidden: Admins only" });
    }
    try {
        const courseData = req.body;

        if (!courseData.courseName || !courseData.instructorName || !courseData.courseId) {
            return res.status(400).json({ 
                success: false, 
                error: "Course name,Id and instructor name  are required" 
            });
        }
        const result = await databaseService.addCourse(courseData);

        if (result.success) {
            return res.status(201).json({ 
                success: true, 
                message: "Course created successfully!", 
                courseId: result.courseId 
            });
        } else {
            return res.status(500).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error("Add Course Error:", error);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

// API: Bulk Add Courses
app.post('/admin/add-courses-bulk', verifyToken, async (req, res) => {
    
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: "Forbidden: Admins only" });
    }

    try {
        const courses = req.body.courses; 

        if (!Array.isArray(courses) || courses.length === 0) {
            return res.status(400).json({ success: false, error: "Please provide an array of courses" });
        }

        const results = []; 
        for (const course of courses) {
        
            if (!course.courseName || !course.instructorName || !course.courseId) {
                results.push({ courseId: course.courseId || 'missing', success: false, error: "Missing required fields" });
                continue;
            }

            try {
                const result = await databaseService.addCourse(course);

                if (result.success) {
                    results.push({ courseId: course.courseId, success: true });
                } else {
                    results.push({ courseId: course.courseId, success: false, error: result.error });
                }
            } catch (err) {
                results.push({ courseId: course.courseId, success: false, error: err.message });
            }
        }

        res.status(200).json({ 
            message: "Bulk courses process completed", 
            totalProcessed: courses.length,
            results: results 
        });

    } catch (error) {
        console.error("Bulk Add Courses Error:", error);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

// API: Upload Profile Image
app.post('/api/profile/upload-image', verifyToken, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: "No image file provided" });
        }

        const uid = req.user.uid; 
        const fileName = `profile_pics/${uid}.jpg`; 
        const file = bucket.file(fileName);

        await file.save(req.file.buffer, {
            contentType: req.file.mimetype,
            metadata: { cacheControl: 'public, max-age=31536000' }
        });

        await file.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

        const dbResult = await databaseService.updateUserInFirestore(uid, { profilePic: publicUrl });

        if (dbResult.success) {
            res.status(200).json({ 
                success: true, 
                message: "Profile picture updated successfully!",
                profilePic: publicUrl 
            });
        } else {
            res.status(500).json({ success: false, error: "Failed to save image link to database" });
        }

    } catch (error) {
        console.error("Upload Error:", error);
        res.status(500).json({ success: false, error: "An error occurred during image upload" });
    }
});

// API: Enroll in Course
app.post('/api/enroll-course', async (req, res) => {
    const { studentUid, courseId } = req.body;
    const result = await databaseService.enrollStudentInCourse(studentUid, courseId);
    
    if (result.success) {
        res.status(200).json(result);
    } else {
        res.status(500).json(result);
    }
});

// API: Update Risk
app.post('/api/attendance/update-risk', verifyToken, async (req, res) => {
    try {
        const { uid, riskLevel } = req.body; 

        if (!uid || !riskLevel) {
            return res.status(400).json({ success: false, error: "Student UID and riskLevel are required" });
        }

        const dbResult = await databaseService.updateUserInFirestore(uid, { riskLevel: riskLevel });

        if (!dbResult.success) {
            return res.status(500).json({ success: false, error: "Failed to update database" });
        }

        await sendRiskAlertToUser(uid, riskLevel);

        res.status(200).json({ 
            success: true, 
            message: "Risk level updated and alert sent successfully." 
        });

    } catch (error) {
        console.error("Risk Update Error:", error);
        res.status(500).json({ success: false, error: "Failed to update risk or send alert." });
    }
});

// API: Analyze Student Risk using AI
app.post('/api/analyze-risk/:uid', async (req, res) => {
    try {
        const { uid } = req.params;

        const studentData = await databaseService.getUserData(uid);

        if (!studentData) {
            return res.status(404).json({ success: false, error: "Student not found" });
        }

        const analysis = await analyzeStudentRisk(studentData);

        await databaseService.updateUserInFirestore(uid, { 
            riskLevel: analysis.riskLevel,
            riskExplanation: analysis.explanation 
        });

        res.status(200).json({ 
            success: true, 
            message: "Risk analysis completed",
            analysis: analysis 
        });

    } catch (error) {
        console.error("Risk Analysis Error:", error);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
});