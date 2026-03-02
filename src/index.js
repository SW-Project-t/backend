const express = require('express');
const cors = require('cors'); //to make sure our API can be accessed from different origins (like our frontend)
const bodyParser = require('body-parser');
const authService = require('./auth/authService'); 
const databaseService = require('./database/databaseService'); 
const verifyToken = require('../middleware/authMiddleware');

const app = express();

app.use(cors());//to allow cross-origin requests from our frontend (React app)
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

app.post('/admin/add-user', async (req, res) => {
    try {
        const { email, password, fullName, role,academicYear } = req.body;

        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                error: "Email and password are required" 
            });
        }

        const authResult = await authService.signUp(email, password);

        if (authResult.success) {
            const dbResult = await databaseService.saveUserToFirestore(authResult.uid, {
                fullName,
                role,
                email,
                academicYear
            });

            if (dbResult.success) {
                return res.status(201).json({ 
                    success: true, 
                    message: "User registered and profile created successfully!" 
                });
            } else {
                return res.status(500).json({ 
                    success: false, 
                    error: "Account created, but failed to save profile to Firestore" 
                });
            }
        }
        res.status(400).json({ 
            success: false, 
            error: authResult.error 
        });

    } catch (error) {
        console.error("Internal Server Error:", error);
        res.status(500).json({ 
            success: false, 
            error: "An internal server error occurred" 
        });
    }
});
//to call it by admin dashboard
app.get('/admin/users', async (req, res) => {
    try {
        const result = await databaseService.getAllUsers();

        if (result.success) {
            return res.status(200).json({ 
                success: true, 
                message: "Users fetched successfully",
                users: result.users //send the list of users to the frontend
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
// (password Reset)
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

app.get('/', (req, res) => res.send("Server is ALIVE!")); //check the server

//(Verify Login & Get Profile)
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

//delete path for admin dashboard to delete user from both auth and firestore
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
            }
        }

        res.status(400).json({ success: false, error: "Failed to delete user" });

    } catch (error) {
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});
//update path for admin dashboard to update user in firestore 
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
        // بنستخدم req.user.uid اللي التيرمنال عندك طبعه
        const userData = await databaseService.getUserData(req.user.uid);

        if (userData) {
            return res.status(200).json({
                success: true,
                profile: userData
            });
        } else {
            // لو دخل هنا، يبقا الـ UID ده مش موجود في كولكشن users
            return res.status(404).json({
                success: false,
                error: "User profile not found",
                debug_uid: req.user.uid // ده عشان تتأكد في Postman من الـ ID اللي بيدور عليه
            });
        }
    } catch (error) {
        console.error("Profile Error:", error);
        res.status(500).json({ success: false, error: "Server Error" });
    }
});

//update path for user dashboard to update him in firestore 
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
// to make user change password
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

const PORT = 3001;
app.listen(PORT, () => console.log(`Integration Server is running on port ${PORT}`));