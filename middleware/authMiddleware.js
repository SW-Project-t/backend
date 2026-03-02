const authService = require('../src/auth/authService');

const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: "Token missing" });
        }

        const idToken = authHeader.split('Bearer ')[1];
        const result = await authService.verifyToken(idToken);

        if (result.success) {
          
            req.user = {
                uid: result.uid 
            }; 
            next();
        } else {
            res.status(401).json({ success: false, error: "Unauthorized access" });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: "Auth Middleware Error" });
    }
};
module.exports = verifyToken;