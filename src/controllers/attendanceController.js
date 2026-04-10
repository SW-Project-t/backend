const attendanceService = require('../services/attendanceService');

/**
 * Get attendance records for a student
 * GET /api/attendance/student/:studentId
 */
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

/**
 * Get attendance records for a professor's courses
 * GET /api/attendance/professor/:profId
 * GET /api/attendance/professor/:profId/course/:courseId
 */
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

/**
 * Get attendance data for all courses (Admin only)
 * GET /api/attendance/admin/courses
 */
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

/**
 * Record new attendance
 * POST /api/attendance/record
 */
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

/**
 * Update an attendance record
 * PUT /api/attendance/:recordId
 */
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

/**
 * Delete an attendance record
 * DELETE /api/attendance/:recordId
 */
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

/**
 * Get attendance summary for a course
 * GET /api/attendance/course/:courseId/summary
 */
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