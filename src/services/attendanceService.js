require('dotenv').config();
const admin = require('firebase-admin');
const db = admin.firestore();

/**
 * Get attendance records for a specific student
 * @param {string} studentId - The student's UID
 * @returns {Promise<{success: boolean, attendance?: Array, error?: string}>}
 */
const getStudentAttendance = async (studentId) => {
    try {
        if (!studentId) {
            return { success: false, error: "Student ID is required" };
        }

        // Query attendance records for the student
        const attendanceRef = db.collection('attendance_records');
        const q = attendanceRef.where('studentId', '==', studentId);
        const snapshot = await q.get();

        if (snapshot.empty) {
            return { success: true, attendance: [] };
        }

        const attendanceRecords = [];
        snapshot.forEach((doc) => {
            attendanceRecords.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Calculate summary statistics
        const totalRecords = attendanceRecords.length;
        const presentCount = attendanceRecords.filter(r => r.status === 'present').length;
        const lateCount = attendanceRecords.filter(r => r.status === 'late').length;
        const absentCount = attendanceRecords.filter(r => r.status === 'absent').length;
        const attendanceRate = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0;

        return {
            success: true,
            attendance: attendanceRecords,
            summary: {
                totalRecords,
                presentCount,
                lateCount,
                absentCount,
                attendanceRate
            }
        };
    } catch (error) {
        console.error("Error fetching student attendance:", error);
        return { success: false, error: error.message };
    }
};

/**
 * Get attendance records for a professor's course
 * @param {string} profId - The professor's UID
 * @param {string} [courseId] - Optional specific course ID
 * @returns {Promise<{success: boolean, attendance?: Array, courses?: Array, error?: string}>}
 */
const getProfessorCourseAttendance = async (profId, courseId = null) => {
    try {
        if (!profId) {
            return { success: false, error: "Professor ID is required" };
        }

        // First, get the professor's courses
        const professorCoursesRef = db.collection('professorCourses');
        let profCoursesQuery = professorCoursesRef.where('professorId', '==', profId);
        
        if (courseId) {
            profCoursesQuery = profCoursesQuery.where('courseId', '==', courseId);
        }
        
        const profCoursesSnapshot = await profCoursesQuery.get();

        if (profCoursesSnapshot.empty) {
            return { success: true, courses: [], attendance: [] };
        }

        const courses = [];
        const courseIds = [];
        
        profCoursesSnapshot.forEach((doc) => {
            const courseData = doc.data();
            courses.push({
                id: doc.id,
                ...courseData
            });
            courseIds.push(courseData.courseId);
        });

        // Get attendance records for these courses
        const attendanceRef = db.collection('attendance_records');
        const attendanceQuery = attendanceRef.where('courseId', 'in', courseIds);
        const attendanceSnapshot = await attendanceQuery.get();

        const attendanceRecords = [];
        if (!attendanceSnapshot.empty) {
            attendanceSnapshot.forEach((doc) => {
                attendanceRecords.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
        }

        // Calculate per-course statistics
        const coursesWithStats = courses.map(course => {
            const courseAttendance = attendanceRecords.filter(a => a.courseId === course.courseId);
            const totalRecords = courseAttendance.length;
            const presentCount = courseAttendance.filter(r => r.status === 'present').length;
            const lateCount = courseAttendance.filter(r => r.status === 'late').length;
            const absentCount = courseAttendance.filter(r => r.status === 'absent').length;
            const attendanceRate = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0;

            return {
                ...course,
                attendanceStats: {
                    totalRecords,
                    presentCount,
                    lateCount,
                    absentCount,
                    attendanceRate
                }
            };
        });

        return {
            success: true,
            courses: coursesWithStats,
            attendance: attendanceRecords
        };
    } catch (error) {
        console.error("Error fetching professor course attendance:", error);
        return { success: false, error: error.message };
    }
};

/**
 * Get attendance data for all courses (Admin)
 * @returns {Promise<{success: boolean, courses?: Array, error?: string}>}
 */
const getAllCoursesAttendance = async () => {
    try {
        // Get all courses
        const coursesRef = db.collection('courses');
        const coursesSnapshot = await coursesRef.get();

        if (coursesSnapshot.empty) {
            return { success: true, courses: [] };
        }

        const courses = [];
        const courseIds = [];
        
        coursesSnapshot.forEach((doc) => {
            const courseData = doc.data();
            courses.push({
                id: doc.id,
                ...courseData
            });
            courseIds.push(courseData.courseId);
        });

        // Get attendance records for all courses
        const attendanceRef = db.collection('attendance_records');
        const attendanceQuery = attendanceRef.where('courseId', 'in', courseIds);
        const attendanceSnapshot = await attendanceQuery.get();

        const attendanceRecords = [];
        if (!attendanceSnapshot.empty) {
            attendanceSnapshot.forEach((doc) => {
                attendanceRecords.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
        }

        // Calculate per-course statistics
        const coursesWithStats = courses.map(course => {
            const courseAttendance = attendanceRecords.filter(a => a.courseId === course.courseId);
            const totalRecords = courseAttendance.length;
            const presentCount = courseAttendance.filter(r => r.status === 'present').length;
            const lateCount = courseAttendance.filter(r => r.status === 'late').length;
            const absentCount = courseAttendance.filter(r => r.status === 'absent').length;
            const attendanceRate = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0;

            return {
                ...course,
                attendanceStats: {
                    totalRecords,
                    presentCount,
                    lateCount,
                    absentCount,
                    attendanceRate
                }
            };
        });

        // Calculate overall statistics
        const totalStudents = coursesWithStats.reduce((sum, c) => sum + (c.attendanceStats.totalRecords || 0), 0);
        const totalPresent = coursesWithStats.reduce((sum, c) => sum + (c.attendanceStats.presentCount || 0), 0);
        const overallAttendanceRate = totalStudents > 0 ? Math.round((totalPresent / totalStudents) * 100) : 0;

        return {
            success: true,
            courses: coursesWithStats,
            overallStats: {
                totalCourses: courses.length,
                totalRecords: totalStudents,
                totalPresent,
                overallAttendanceRate
            }
        };
    } catch (error) {
        console.error("Error fetching all courses attendance:", error);
        return { success: false, error: error.message };
    }
};

/**
 * Record new attendance for a student
 * @param {Object} attendanceData - The attendance data to record
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
const recordAttendance = async (attendanceData) => {
    try {
        const {
            studentId,
            studentName,
            studentCode,
            courseId,
            courseName,
            status,
            recordedBy
        } = attendanceData;

        // Validation
        if (!studentId || !courseId || !status) {
            return { success: false, error: "Student ID, Course ID, and status are required" };
        }

        if (!['present', 'late', 'absent'].includes(status)) {
            return { success: false, error: "Status must be 'present', 'late', or 'absent'" };
        }

        const newAttendance = {
            studentId,
            studentName: studentName || '',
            studentCode: studentCode || '',
            courseId,
            courseName: courseName || '',
            status,
            date: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            recordedBy: recordedBy || ''
        };

        const docRef = await db.collection('attendance_records').add(newAttendance);
        
        return {
            success: true,
            id: docRef.id,
            message: "Attendance recorded successfully"
        };
    } catch (error) {
        console.error("Error recording attendance:", error);
        return { success: false, error: error.message };
    }
};

/**
 * Update an existing attendance record
 * @param {string} recordId - The attendance record ID
 * @param {Object} updates - The fields to update
 * @returns {Promise<{success: boolean, error?: string}>}
 */
const updateAttendanceRecord = async (recordId, updates) => {
    try {
        if (!recordId) {
            return { success: false, error: "Record ID is required" };
        }

        const allowedFields = ['status', 'studentName', 'studentCode', 'courseName'];
        const validUpdates = {};
        
        Object.keys(updates).forEach(key => {
            if (allowedFields.includes(key)) {
                validUpdates[key] = updates[key];
            }
        });

        if (Object.keys(validUpdates).length === 0) {
            return { success: false, error: "No valid fields to update" };
        }

        await db.collection('attendance_records').doc(recordId).update(validUpdates);
        
        return {
            success: true,
            message: "Attendance record updated successfully"
        };
    } catch (error) {
        console.error("Error updating attendance record:", error);
        return { success: false, error: error.message };
    }
};

/**
 * Delete an attendance record
 * @param {string} recordId - The attendance record ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
const deleteAttendanceRecord = async (recordId) => {
    try {
        if (!recordId) {
            return { success: false, error: "Record ID is required" };
        }

        await db.collection('attendance_records').doc(recordId).delete();
        
        return {
            success: true,
            message: "Attendance record deleted successfully"
        };
    } catch (error) {
        console.error("Error deleting attendance record:", error);
        return { success: false, error: error.message };
    }
};

/**
 * Get attendance summary for a specific course
 * @param {string} courseId - The course ID
 * @returns {Promise<{success: boolean, summary?: Object, error?: string}>}
 */
const getCourseAttendanceSummary = async (courseId) => {
    try {
        if (!courseId) {
            return { success: false, error: "Course ID is required" };
        }

        const attendanceRef = db.collection('attendance_records');
        const q = attendanceRef.where('courseId', '==', courseId);
        const snapshot = await q.get();

        if (snapshot.empty) {
            return { 
                success: true, 
                summary: {
                    totalRecords: 0,
                    presentCount: 0,
                    lateCount: 0,
                    absentCount: 0,
                    attendanceRate: 0,
                    uniqueStudents: 0
                }
            };
        }

        const attendanceRecords = [];
        const uniqueStudents = new Set();
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            attendanceRecords.push(data);
            if (data.studentId) {
                uniqueStudents.add(data.studentId);
            }
        });

        const totalRecords = attendanceRecords.length;
        const presentCount = attendanceRecords.filter(r => r.status === 'present').length;
        const lateCount = attendanceRecords.filter(r => r.status === 'late').length;
        const absentCount = attendanceRecords.filter(r => r.status === 'absent').length;
        const attendanceRate = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0;

        return {
            success: true,
            summary: {
                totalRecords,
                presentCount,
                lateCount,
                absentCount,
                attendanceRate,
                uniqueStudents: uniqueStudents.size
            }
        };
    } catch (error) {
        console.error("Error fetching course attendance summary:", error);
        return { success: false, error: error.message };
    }
};

module.exports = {
    getStudentAttendance,
    getProfessorCourseAttendance,
    getAllCoursesAttendance,
    recordAttendance,
    updateAttendanceRecord,
    deleteAttendanceRecord,
    getCourseAttendanceSummary
};