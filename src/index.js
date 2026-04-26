require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const { getStorage } = require('firebase-admin/storage');

const serviceAccount = require('./config/service-account-key.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: "yallaclass-5cc62.appspot.com"
    });
}

const bucket = getStorage().bucket("yallaclass-5cc62.appspot.com");

const authService = require('./auth/authService'); 
const databaseService = require('./database/databaseService'); 
const verifyToken = require('../middleware/authMiddleware');
const { analyzeStudentRisk } = require('./aiService');
const { sendRiskAlertToUser } = require('./notificationService');
const attendanceController = require('./controllers/attendanceController');
const attendanceTrackingService = require('./services/attendanceTrackingService');

const app = express();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const cors = require('cors');
app.use(cors({
    origin: true, 
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

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
                databaseService.sendWelcomeEmail(email, fullName, password)
                    .then(() => console.log(`📩 Background: Email sent to ${email}`))
                    .catch((err) => console.error(`❌ Background Email Error for ${email}:`, err));

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
})
app.get('/api/my-courses/:uid', async (req, res) => {
    try {
        const { uid } = req.params;
        
        // 1. جلب سجلات التسجيل للطالب
        const enrollmentsSnapshot = await admin.firestore().collection("enrollments")
            .where("studentId", "==", uid)
            .get();

        if (enrollmentsSnapshot.empty) {
            return res.status(200).json({ success: true, courses: [] });
        }

        const courses = [];
        
        // 2. لفة على كل تسجيل عشان نجيب بيانات الكورس بتاعه
        for (const docItem of enrollmentsSnapshot.docs) {
            const enrollmentData = docItem.data();
            const cid = enrollmentData.courseId; // ده الكود اللي اتسجل (مثلاً CS101)

            // 3. البحث عن الكورس في كوليكشن الـ courses باستخدام الـ courseId كـ field
            const courseQuery = await admin.firestore().collection("courses")
                .where("courseId", "==", cid)
                .get();

            if (!courseQuery.empty) {
                // لو لقاه كـ Field
                courses.push({ id: courseQuery.docs[0].id, ...courseQuery.docs[0].data() });
            } else {
                // محاولة أخيرة: البحث عنه كـ Document ID مباشرة
                const courseDoc = await admin.firestore().collection("courses").doc(cid).get();
                if (courseDoc.exists) {
                    courses.push({ id: courseDoc.id, ...courseDoc.data() });
                }
            }
        }

        // تنظيف القائمة من أي تكرار لو موجود
        const uniqueCourses = Array.from(new Map(courses.map(c => [c.courseId, c])).values());

        return res.status(200).json({ success: true, courses: uniqueCourses });
    } catch (error) {
        console.error("Error in my-courses API:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

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
                    try {
                        await databaseService.sendWelcomeEmail(email, fullName, password);
                        console.log(`📩 Email sent successfully to ${email}`);
                    } catch (emailErr) {
                        console.error(`❌ Email Error for ${email}:`, emailErr);
                    }

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

app.post('/admin/add-course', verifyToken, async (req, res) => {
   if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: "Forbidden: Admins only" });
    }
    try {
        const courseData = req.body;

        if (!courseData.courseName || !courseData.instructorName || !courseData.courseId) {
            return res.status(400).json({ 
                success: false, 
                error: "Course name,Id and instructor name are required" 
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

app.post('/api/enroll-course', async (req, res) => {
    try {
    
        const { studentId, courseId } = req.body; 

        if (!studentId || !courseId) {
            return res.status(400).json({ success: false, error: "Missing studentId or courseId" });
        }

        const result = await databaseService.enrollStudentInCourse(studentId, courseId);

        if (result.success) {
            res.status(200).json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

app.delete('/api/unenroll-student', async (req, res) => {
    try {
        const { enrollmentId } = req.body;
        await admin.firestore().collection("enrollments").doc(enrollmentId).delete();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/enroll-student', async (req, res) => {
    try {
        // بنستقبل الـ studentCode (اللي الدكتور كتبه) والـ courseId
        const { studentCode, courseId } = req.body; 

        // 1. نبحث عن الطالب في كولكشن users بالكود بتاعه
        const userQuery = await admin.firestore()
            .collection("users")
            .where("code", "==", studentCode)
            .limit(1)
            .get();

        if (userQuery.empty) {
            return res.status(404).json({ error: "الطالب غير موجود بهذا الكود" });
        }

        const studentDoc = userQuery.docs[0];
        const studentData = studentDoc.data();

        // 2. نسجل في الـ enrollments البيانات الحقيقية من الداتابيز
        const newEnrollment = {
            uid: studentDoc.id, // الـ UID الحقيقي
            courseId: courseId,
            studentName: studentData.fullName || studentData.name, // الاسم الحقيقي
            studentCode: studentData.code, // الكود الحقيقي
            enrolledAt: admin.firestore.FieldValue.serverTimestamp(),
            status: "active"
        };

        const docRef = await admin.firestore().collection("enrollments").add(newEnrollment);
        
        // نرجع البيانات كاملة للفرونت إيند عشان الجدول يتحدث صح
        res.json({ id: docRef.id, ...newEnrollment });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/course-students/:courseId', async (req, res) => {
    try {
        const { courseId } = req.params;
        console.log("Fetching for course:", courseId);

        const snapshot = await admin.firestore().collection("enrollments")
            .where("courseId", "==", courseId)
            .get();

        const students = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        return res.status(200).json(students);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
});

app.get('/api/professor/:profId/students', async (req, res) => {
    try {
        const { profId } = req.params;
        
        const coursesSnapshot = await admin.firestore().collection("courses")
            .where("instructorId", "==", profId) 
            .get();

        const courseIds = coursesSnapshot.docs.map(doc => doc.data().courseId);

        if (courseIds.length === 0) {
            return res.status(200).json({ success: true, students: [] });
        }

        const enrollmentsSnapshot = await admin.firestore().collection("enrollments").get();
        
        const students = [];
        const uniqueStudentIds = new Set();

        enrollmentsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            
            if (courseIds.includes(data.courseId) && !uniqueStudentIds.has(data.studentId)) {
                uniqueStudentIds.add(data.studentId);
                students.push({
                    id: data.studentId,
                    studentName: data.studentName,
                    studentCode: data.studentCode || "",     
                    studentEmail: data.studentEmail
                });
            }
        });

        return res.status(200).json({ 
            success: true, 
            students: students 
        });

    } catch (error) {
        console.error("Error fetching professor students:", error);
        return res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});
// ==================== MESSAGES API ROUTES ====================

// إرسال رسالة (لأي مستخدم)
app.post('/api/messages/send', verifyToken, async (req, res) => {
    try {
        const { to, toId, toName, subject, message, fromName, fromRole } = req.body;
        
        if (!to || !toId || !message) {
            return res.status(400).json({ 
                success: false, 
                error: "Missing required fields: to, toId, message" 
            });
        }

        const messageData = {
            from: req.user.role || 'user',
            fromId: req.user.uid,
            fromName: fromName || req.user.name || 'User',
            fromRole: req.user.role || 'user',
            to: to,
            toId: toId,
            toName: toName || (to === 'admin' ? 'System Admin' : 'User'),
            subject: subject || 'No Subject',
            message: message,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            adminRead: to === 'admin' ? false : true
        };

        const docRef = await admin.firestore().collection("messages").add(messageData);
        
        return res.status(200).json({ 
            success: true, 
            message: "Message sent successfully",
            messageId: docRef.id 
        });
    } catch (error) {
        console.error("Error sending message:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// جلب رسائل المستخدم (المستلم)
app.get('/api/messages/inbox', verifyToken, async (req, res) => {
    try {
        const { type } = req.query; // 'admin', 'student', or 'all'
        
        let queryRef = admin.firestore().collection("messages")
            .where("toId", "==", req.user.uid)
            .orderBy("createdAt", "desc");
        
        // إذا كان نوع الرسائل محدداً
        if (type && type !== 'all') {
            queryRef = queryRef.where("from", "==", type);
        }
        
        const snapshot = await queryRef.get();
        
        const messages = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            messages.push({
                id: doc.id,
                ...data,
                createdAt: data.createdAt ? data.createdAt.toDate() : new Date()
            });
        });
        
        return res.status(200).json({ 
            success: true, 
            messages: messages 
        });
    } catch (error) {
        console.error("Error fetching inbox:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// جلب الرسائل المرسلة من المستخدم
app.get('/api/messages/sent', verifyToken, async (req, res) => {
    try {
        const snapshot = await admin.firestore().collection("messages")
            .where("fromId", "==", req.user.uid)
            .orderBy("createdAt", "desc")
            .get();
        
        const messages = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            messages.push({
                id: doc.id,
                ...data,
                createdAt: data.createdAt ? data.createdAt.toDate() : new Date()
            });
        });
        
        return res.status(200).json({ 
            success: true, 
            messages: messages 
        });
    } catch (error) {
        console.error("Error fetching sent messages:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// تحديث حالة القراءة لرسالة
app.put('/api/messages/read/:messageId', verifyToken, async (req, res) => {
    try {
        const { messageId } = req.params;
        
        const messageRef = admin.firestore().collection("messages").doc(messageId);
        const messageDoc = await messageRef.get();
        
        if (!messageDoc.exists) {
            return res.status(404).json({ success: false, error: "Message not found" });
        }
        
        const messageData = messageDoc.data();
        
        // تأكد أن المستخدم هو المستلم الصحيح
        if (messageData.toId !== req.user.uid) {
            return res.status(403).json({ success: false, error: "Unauthorized to mark this message as read" });
        }
        
        await messageRef.update({ read: true });
        
        return res.status(200).json({ 
            success: true, 
            message: "Message marked as read" 
        });
    } catch (error) {
        console.error("Error marking message as read:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// حذف رسالة (للدكتور فقط رسائله الخاصة)
app.delete('/api/messages/:messageId', verifyToken, async (req, res) => {
    try {
        const { messageId } = req.params;
        
        const messageRef = admin.firestore().collection("messages").doc(messageId);
        const messageDoc = await messageRef.get();
        
        if (!messageDoc.exists) {
            return res.status(404).json({ success: false, error: "Message not found" });
        }
        
        const messageData = messageDoc.data();
        
        // فقط المرسل أو الأدمن يمكنه حذف الرسالة
        if (messageData.fromId !== req.user.uid && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: "Unauthorized to delete this message" });
        }
        
        await messageRef.delete();
        
        return res.status(200).json({ 
            success: true, 
            message: "Message deleted successfully" 
        });
    } catch (error) {
        console.error("Error deleting message:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// جلب عدد الرسائل غير المقروءة
app.get('/api/messages/unread-count', verifyToken, async (req, res) => {
    try {
        const snapshot = await admin.firestore().collection("messages")
            .where("toId", "==", req.user.uid)
            .where("read", "==", false)
            .get();
        
        return res.status(200).json({ 
            success: true, 
            unreadCount: snapshot.size 
        });
    } catch (error) {
        console.error("Error getting unread count:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// جلب جميع الطلاب المسجلين في كورسات دكتور معين (تحسين للموجود)
app.get('/api/professor/:profId/students-enhanced', verifyToken, async (req, res) => {
    try {
        const { profId } = req.params;
        
        // التأكد أن المستخدم هو الدكتور نفسه أو أدمن
        if (req.user.uid !== profId && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: "Unauthorized" });
        }
        
        // جلب الكورسات التي يدرسها الدكتور
        const coursesSnapshot = await admin.firestore().collection("courses")
            .where("instructorId", "==", profId)
            .get();
        
        const courseIds = coursesSnapshot.docs.map(doc => doc.data().courseId || doc.id);
        
        if (courseIds.length === 0) {
            return res.status(200).json({ success: true, students: [] });
        }
        
        // جلب التسجيلات في هذه الكورسات
        const enrollmentsSnapshot = await admin.firestore().collection("enrollments")
            .where("courseId", "in", courseIds)
            .get();
        
        const studentsMap = new Map();
        
        for (const doc of enrollmentsSnapshot.docs) {
            const data = doc.data();
            const studentId = data.studentId;
            
            if (!studentsMap.has(studentId)) {
                // جلب بيانات الطالب كاملة من users collection
                const userDoc = await admin.firestore().collection("users").doc(studentId).get();
                const userData = userDoc.exists ? userDoc.data() : {};
                
                studentsMap.set(studentId, {
                    id: studentId,
                    studentName: data.studentName || userData.fullName || 'Unknown',
                    studentCode: data.studentCode || userData.code || '',
                    studentEmail: data.studentEmail || userData.email || '',
                    enrolledCourses: [],
                    status: data.status || 'active'
                });
            }
            
            studentsMap.get(studentId).enrolledCourses.push({
                courseId: data.courseId,
                enrolledAt: data.enrolledAt
            });
        }
        
        const students = Array.from(studentsMap.values());
        
        return res.status(200).json({ 
            success: true, 
            students: students 
        });
    } catch (error) {
        console.error("Error fetching professor students enhanced:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

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
// ==================== MISSING CORE ROUTES (ADMIN, PROFESSOR, STUDENT) ====================
app.put('/admin/update-course/:courseId', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: "Forbidden: Admins only" });
    }
    try {
        const { courseId } = req.params;
        const updateData = req.body;
        await admin.firestore().collection("courses").doc(courseId).update(updateData);
        return res.status(200).json({ success: true, message: "Course updated successfully" });
    } catch (error) {
        console.error("Error updating course:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/admin/delete-course/:courseId', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: "Forbidden: Admins only" });
    }
    try {
        const { courseId } = req.params;
        await admin.firestore().collection("courses").doc(courseId).delete();
    
        const enrollments = await admin.firestore().collection("enrollments").where("courseId", "==", courseId).get();
        const batch = admin.firestore().batch();
        enrollments.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        return res.status(200).json({ success: true, message: "Course and related enrollments deleted successfully" });
    } catch (error) {
        console.error("Error deleting course:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/professor/:profId/courses', verifyToken, async (req, res) => {
    try {
        const { profId } = req.params;
        const snapshot = await admin.firestore().collection("courses")
            .where("instructorId", "==", profId)
            .get();

        const courses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return res.status(200).json({ success: true, courses: courses });
    } catch (error) {
        console.error("Error fetching professor courses:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/student/:studentId/courses', verifyToken, async (req, res) => {
    try {
        const { studentId } = req.params;
        const enrollmentsSnapshot = await admin.firestore().collection("enrollments")
            .where("studentId", "==", studentId)
            .get();

        if (enrollmentsSnapshot.empty) {
            return res.status(200).json({ success: true, courses: [] });
        }

        const courseIds = enrollmentsSnapshot.docs.map(doc => doc.data().courseId);
        
        const courses = [];
        for (const id of courseIds) {
        const courseDoc = await admin.firestore().collection("courses").doc(id).get();
            if (courseDoc.exists) {
                courses.push({ id: courseDoc.id, ...courseDoc.data() });
            } else {
    
                const courseQuery = await admin.firestore().collection("courses").where("courseId", "==", id).get();
                if (!courseQuery.empty) {
                    courses.push({ id: courseQuery.docs[0].id, ...courseQuery.docs[0].data() });
                }
            }
        }

        return res.status(200).json({ success: true, courses: courses });
    } catch (error) {
        console.error("Error fetching student courses:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/assignments/submit', verifyToken, async (req, res) => {
    try {
        const { courseId, studentId, studentName, assignmentId, fileUrl, fileName } = req.body;

        if (!courseId || !studentId || !fileUrl) {
            return res.status(400).json({ success: false, error: "Missing required fields" });
        }

        const submissionData = {
            courseId,
            studentId,
            studentName,
            assignmentId: assignmentId || "general",
            fileUrl,
            fileName: fileName || "Assignment File",
            submittedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: "submitted"
        };

        const docRef = await admin.firestore().collection("submissions").add(submissionData);
        return res.status(200).json({ success: true, submissionId: docRef.id, message: "Assignment submitted successfully" });
    } catch (error) {
        console.error("Error submitting assignment:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== ATTENDANCE API ROUTES ====================

app.get('/api/attendance/student/:studentId', verifyToken, attendanceController.getStudentAttendanceController);
app.get('/api/attendance/professor/:profId', verifyToken, attendanceController.getProfessorCourseAttendanceController);
app.get('/api/attendance/professor/:profId/course/:courseId', verifyToken, attendanceController.getProfessorCourseAttendanceController);
app.get('/api/attendance/admin/courses', verifyToken, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: "Forbidden: Admins only" });
    }
    attendanceController.getAllCoursesAttendanceController(req, res);
});
app.post('/api/attendance/record', verifyToken, attendanceController.recordAttendanceController);
app.put('/api/attendance/:recordId', verifyToken, attendanceController.updateAttendanceRecordController);
app.delete('/api/attendance/:recordId', verifyToken, attendanceController.deleteAttendanceRecordController);
app.get('/api/attendance/course/:courseId/summary', verifyToken, attendanceController.getCourseAttendanceSummaryController);

// ==================== NEW ATTENDANCE TRACKING API ROUTES ====================

app.get('/api/student/:studentId/courses-attendance', verifyToken, async (req, res) => {
    try {
        const { studentId } = req.params;
        
        if (req.user.uid !== studentId && req.user.role !== 'admin' && req.user.role !== 'instructor') {
            return res.status(403).json({ success: false, error: "Unauthorized access" });
        }
        
        const result = await attendanceTrackingService.getStudentCoursesWithAttendance(studentId);
        
        if (result.success) {
            return res.status(200).json({
                success: true,
                courses: result.courses
            });
        } else {
            return res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error("Error in getStudentCoursesAttendance:", error);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
});

app.get('/api/admin/courses-attendance', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: "Forbidden: Admins only" });
        }
        
        const result = await attendanceTrackingService.getAllCoursesWithAttendanceStats();
        
        if (result.success) {
            return res.status(200).json({
                success: true,
                courses: result.courses
            });
        } else {
            return res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error("Error in getAllCoursesAttendanceStats:", error);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
});

app.post('/api/course/attendance/mark', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'instructor' && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: "Forbidden: Instructors only" });
        }
        
        const attendanceData = {
            ...req.body,
            recordedBy: req.user.uid
        };
        
        const result = await attendanceTrackingService.markCourseAttendance(attendanceData);
        
        if (result.success) {
            return res.status(200).json({
                success: true,
                message: result.message,
                results: result.results
            });
        } else {
            return res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error("Error in markCourseAttendance:", error);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
});

app.get('/api/course/:courseId/attendance/:date', verifyToken, async (req, res) => {
    try {
        const { courseId, date } = req.params;
        
        const result = await attendanceTrackingService.getCourseSessionAttendance(courseId, date);
        
        if (result.success) {
            return res.status(200).json({
                success: true,
                records: result.records
            });
        } else {
            return res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error("Error in getCourseSessionAttendance:", error);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
});

app.get('/api/course/:courseId/attendance-sessions', verifyToken, async (req, res) => {
    try {
        const { courseId } = req.params;
        
        const result = await attendanceTrackingService.getCourseAttendanceSessions(courseId);
        
        if (result.success) {
            return res.status(200).json({
                success: true,
                sessions: result.sessions
            });
        } else {
            return res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error("Error in getCourseAttendanceSessions:", error);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});