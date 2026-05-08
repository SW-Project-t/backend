const attendanceService = require('../services/attendanceService');





const getStudentAttendanceController = async (req, res) => {
    try {
        const { studentId } = req.params;
        
        if (!studentId) {
            return res.status(400).json({
                success: false,
                error: "Student ID is required"
            });
        }

        const result = await attendanceService.getStudentAttendance(studentId);

        if (result.success) {
            return res.status(200).json({
                success: true,
                message: "Student attendance fetched successfully",
                attendance: result.attendance,
                summary: result.summary
            });
        } else {
            return res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error("Error in getStudentAttendanceController:", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
};






const getProfessorCourseAttendanceController = async (req, res) => {
    try {
        const { profId, courseId } = req.params;
        
        if (!profId) {
            return res.status(400).json({
                success: false,
                error: "Professor ID is required"
            });
        }

        const result = await attendanceService.getProfessorCourseAttendance(profId, courseId || null);

        if (result.success) {
            return res.status(200).json({
                success: true,
                message: "Professor course attendance fetched successfully",
                courses: result.courses,
                attendance: result.attendance
            });
        } else {
            return res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error("Error in getProfessorCourseAttendanceController:", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
};





const getAllCoursesAttendanceController = async (req, res) => {
    try {
        const result = await attendanceService.getAllCoursesAttendance();

        if (result.success) {
            return res.status(200).json({
                success: true,
                message: "All courses attendance fetched successfully",
                courses: result.courses,
                overallStats: result.overallStats
            });
        } else {
            return res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error("Error in getAllCoursesAttendanceController:", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
};





const recordAttendanceController = async (req, res) => {
    try {
        const attendanceData = req.body;
        
        const result = await attendanceService.recordAttendance(attendanceData);

        if (result.success) {
            return res.status(201).json({
                success: true,
                message: result.message,
                id: result.id
            });
        } else {
            return res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error("Error in recordAttendanceController:", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
};





const updateAttendanceRecordController = async (req, res) => {
    try {
        const { recordId } = req.params;
        const updates = req.body;
        
        const result = await attendanceService.updateAttendanceRecord(recordId, updates);

        if (result.success) {
            return res.status(200).json({
                success: true,
                message: result.message
            });
        } else {
            return res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error("Error in updateAttendanceRecordController:", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
};





const deleteAttendanceRecordController = async (req, res) => {
    try {
        const { recordId } = req.params;
        
        const result = await attendanceService.deleteAttendanceRecord(recordId);

        if (result.success) {
            return res.status(200).json({
                success: true,
                message: result.message
            });
        } else {
            return res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error("Error in deleteAttendanceRecordController:", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
};





const getCourseAttendanceSummaryController = async (req, res) => {
    try {
        const { courseId } = req.params;
        
        if (!courseId) {
            return res.status(400).json({
                success: false,
                error: "Course ID is required"
            });
        }

        const result = await attendanceService.getCourseAttendanceSummary(courseId);

        if (result.success) {
            return res.status(200).json({
                success: true,
                message: "Course attendance summary fetched successfully",
                summary: result.summary
            });
        } else {
            return res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error("Error in getCourseAttendanceSummaryController:", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
};

module.exports = {
    getStudentAttendanceController,
    getProfessorCourseAttendanceController,
    getAllCoursesAttendanceController,
    recordAttendanceController,
    updateAttendanceRecordController,
    deleteAttendanceRecordController,
    getCourseAttendanceSummaryController
};