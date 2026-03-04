const authService = require('../src/auth/authService');
const databaseService = require('../src/database/databaseService');

const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: "Token missing" });
        }

        const idToken = authHeader.split('Bearer ')[1];
        const result = await authService.verifyToken(idToken);

        if (result.success) {
            const userProfile = await databaseService.getUserData(result.uid);
            
            if (!userProfile) {
                return res.status(404).json({ success: false, error: "User profile not found" });
            }

            req.user = {
                uid: result.uid,
                role: userProfile.role, 
                academicYear: userProfile.academicYear,
                fullName: userProfile.fullName
            };
            next();
        } else {
            res.status(401).json({ success: false, error: "Unauthorized access" });
        }
    } catch (error) {
        console.error("Auth Middleware Error:", error);
        res.status(500).json({ success: false, error: "Auth Middleware Error" });
    }
};

module.exports = verifyToken;