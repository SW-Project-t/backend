const express = require('express');
const bodyParser = require('body-parser');
const authService = require('./auth/authService'); 
const databaseService = require('./database/databaseService'); 

const app = express();

app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

app.post('/register', async (req, res) => {
    try {
        const { email, password, fullName, role } = req.body;

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
                email
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

const PORT = 3000;
app.listen(PORT, () => console.log(`Integration Server is running on port ${PORT}`));