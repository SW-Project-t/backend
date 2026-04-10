// backend/services/attendanceTrackingService.js
const admin = require('firebase-admin');
const db = admin.firestore();

/**
 * Get all courses for a student with attendance stats
 * @param {string} studentId - Student UID
 * @returns {Promise<{success: boolean, courses?: Array, error?: string}>}
 */
const getStudentCoursesWithAttendance = async (studentId) => {
    try {
        if (!studentId) {
            return { success: false, error: "Student ID is required" };
        }

        // Get student's enrolled courses from user document
        const userDoc = await db.collection('users').doc(studentId).get();
        if (!userDoc.exists) {
            return { success: false, error: "Student not found" };
        }

        const userData = userDoc.data();
        const enrolledCourseIds = userData.enrolledCourses || [];

        if (enrolledCourseIds.length === 0) {
            return { success: true, courses: [] };
        }

        // Get course details
        const courses = [];
        for (const courseId of enrolledCourseIds) {
            const courseQuery = await db.collection('courses').where('courseId', '==', courseId).get();
            
            if (!courseQuery.empty) {
                const courseDoc = courseQuery.docs[0];
                const courseData = courseDoc.data();
                
                // Get attendance records for this student in this course
                const attendanceQuery = await db.collection('attendance_records')
                    .where('studentId', '==', studentId)
                    .where('courseId', '==', courseId)
                    .get();
                
                const attendanceRecords = [];
                let presentCount = 0;
                let absentCount = 0;
                let lateCount = 0;
                
                attendanceQuery.forEach(doc => {
                    const record = doc.data();
                    attendanceRecords.push(record);
                    if (record.status === 'present') presentCount++;
                    else if (record.status === 'absent') absentCount++;
                    else if (record.status === 'late') lateCount++;
                });
                
                const totalSessions = attendanceRecords.length;
                const attendanceRate = totalSessions > 0 ? Math.round((presentCount / totalSessions) * 100) : 0;
                const absenceRate = totalSessions > 0 ? Math.round(((absentCount + lateCount) / totalSessions) * 100) : 0;
                
                courses.push({
                    id: courseData.courseId,
                    name: courseData.courseName,
                    instructor: courseData.instructorName,
                    schedule: `${courseData.SelectDays || 'TBA'} ${courseData.Time || ''}`,
                    room: courseData.RoomNumber || 'TBA',
                    attendanceRate: attendanceRate,
                    absenceRate: absenceRate,
                    presentCount: presentCount,
                    absentCount: absentCount,
                    lateCount: lateCount,
                    totalSessions: totalSessions,
                    attendanceRecords: attendanceRecords
                });
            }
        }

        return { success: true, courses: courses };
    } catch (error) {
        console.error("Error getting student courses with attendance:", error);
        return { success: false, error: error.message };
    }
};

/**
 * Get all courses with statistics for admin
 * @returns {Promise<{success: boolean, courses?: Array, error?: string}>}
 */
const getAllCoursesWithAttendanceStats = async () => {
    try {
        // Get all courses
        const coursesSnapshot = await db.collection('courses').get();
        
        if (coursesSnapshot.empty) {
            return { success: true, courses: [] };
        }

        const courses = [];
        
        for (const courseDoc of coursesSnapshot.docs) {
            const courseData = courseDoc.data();
            const courseId = courseData.courseId;
            
            // Get all enrollments for this course
            const enrollmentsQuery = await db.collection('enrollments')
                .where('courseId', '==', courseId)
                .get();
            
            const enrolledStudents = [];
            enrollmentsQuery.forEach(doc => {
                enrolledStudents.push({ id: doc.id, ...doc.data() });
            });
            
            const studentCount = enrolledStudents.length;
            
            // Get all attendance records for this course
            const attendanceQuery = await db.collection('attendance_records')
                .where('courseId', '==', courseId)
                .get();
            
            let totalPresent = 0;
            let totalAbsent = 0;
            let totalLate = 0;
            let totalRecords = 0;
            
            // Track per-student stats
            const studentStats = {};
            
            attendanceQuery.forEach(doc => {
                const record = doc.data();
                totalRecords++;
                
                if (record.status === 'present') totalPresent++;
                else if (record.status === 'absent') totalAbsent++;
                else if (record.status === 'late') totalLate++;
                
                // Track per student
                if (!studentStats[record.studentId]) {
                    studentStats[record.studentId] = {
                        studentId: record.studentId,
                        studentName: record.studentName || 'Unknown',
                        studentCode: record.studentCode || '',
                        presentCount: 0,
                        absentCount: 0,
                        lateCount: 0,
                        totalSessions: 0
                    };
                }
                
                studentStats[record.studentId].totalSessions++;
                if (record.status === 'present') studentStats[record.studentId].presentCount++;
                else if (record.status === 'absent') studentStats[record.studentId].absentCount++;
                else if (record.status === 'late') studentStats[record.studentId].lateCount++;
            });
            
            // Calculate attendance rates for each student
            const studentsWithStats = Object.values(studentStats).map(student => ({
                ...student,
                attendanceRate: student.totalSessions > 0 ? Math.round((student.presentCount / student.totalSessions) * 100) : 0,
                absenceRate: student.totalSessions > 0 ? Math.round(((student.absentCount + student.lateCount) / student.totalSessions) * 100) : 0
            }));
            
            // Calculate average attendance for the course
            const averageAttendance = totalRecords > 0 ? Math.round((totalPresent / totalRecords) * 100) : 0;
            const averageAbsence = totalRecords > 0 ? Math.round(((totalAbsent + totalLate) / totalRecords) * 100) : 0;
            
            courses.push({
                id: courseData.courseId,
                name: courseData.courseName,
                instructor: courseData.instructorName,
                schedule: `${courseData.SelectDays || 'TBA'} ${courseData.Time || ''}`,
                room: courseData.RoomNumber || 'TBA',
                studentCount: studentCount,
                totalRecords: totalRecords,
                averageAttendance: averageAttendance,
                averageAbsence: averageAbsence,
                students: studentsWithStats
            });
        }
        
        return { success: true, courses: courses };
    } catch (error) {
        console.error("Error getting all courses with attendance stats:", error);
        return { success: false, error: error.message };
    }
};

/**
 * Mark attendance for students in a course session
 * @param {Object} attendanceData - Attendance data for multiple students
 * @returns {Promise<{success: boolean, results?: Array, error?: string}>}
 */
const markCourseAttendance = async (attendanceData) => {
    try {
        const { courseId, courseName, sessionDate, records, recordedBy } = attendanceData;
        
        if (!courseId || !records || !Array.isArray(records) || records.length === 0) {
            return { success: false, error: "Course ID and attendance records are required" };
        }
        
        const results = [];
        const batch = db.batch();
        const attendanceRef = db.collection('attendance_records');
        
        // Use provided date or today's date
        const date = sessionDate || new Date().toISOString().split('T')[0];
        
        for (const record of records) {
            const { studentId, studentName, studentCode, status } = record;
            
            if (!studentId || !status) {
                results.push({ studentId, success: false, error: "Student ID and status required" });
                continue;
            }
            
            if (!['present', 'absent', 'late'].includes(status)) {
                results.push({ studentId, success: false, error: "Status must be 'present', 'absent', or 'late'" });
                continue;
            }
            
            // Check if attendance already recorded for this student, course, and date
            const existingQuery = await attendanceRef
                .where('studentId', '==', studentId)
                .where('courseId', '==', courseId)
                .where('date', '==', date)
                .get();
            
            if (!existingQuery.empty) {
                // Update existing record
                const docId = existingQuery.docs[0].id;
                const updateData = {
                    status: status,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    recordedBy: recordedBy || ''
                };
                batch.update(attendanceRef.doc(docId), updateData);
                results.push({ studentId, success: true, action: 'updated' });
            } else {
                // Create new record
                const newAttendance = {
                    studentId,
                    studentName: studentName || '',
                    studentCode: studentCode || '',
                    courseId,
                    courseName: courseName || '',
                    status,
                    date: date,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    recordedBy: recordedBy || ''
                };
                const docRef = attendanceRef.doc();
                batch.set(docRef, newAttendance);
                results.push({ studentId, success: true, action: 'created' });
            }
        }
        
        await batch.commit();
        
        return {
            success: true,
            message: `Attendance recorded for ${results.filter(r => r.success).length} students`,
            results: results
        };
    } catch (error) {
        console.error("Error marking course attendance:", error);
        return { success: false, error: error.message };
    }
};

/**
 * Get attendance for a specific course session
 * @param {string} courseId - Course ID
 * @param {string} date - Date (YYYY-MM-DD)
 * @returns {Promise<{success: boolean, records?: Array, error?: string}>}
 */
const getCourseSessionAttendance = async (courseId, date) => {
    try {
        if (!courseId || !date) {
            return { success: false, error: "Course ID and date are required" };
        }
        
        const attendanceQuery = await db.collection('attendance_records')
            .where('courseId', '==', courseId)
            .where('date', '==', date)
            .get();
        
        const records = [];
        attendanceQuery.forEach(doc => {
            records.push({ id: doc.id, ...doc.data() });
        });
        
        return { success: true, records: records };
    } catch (error) {
        console.error("Error getting course session attendance:", error);
        return { success: false, error: error.message };
    }
};

/**
 * Get all attendance sessions for a course
 * @param {string} courseId - Course ID
 * @returns {Promise<{success: boolean, sessions?: Array, error?: string}>}
 */
const getCourseAttendanceSessions = async (courseId) => {
    try {
        if (!courseId) {
            return { success: false, error: "Course ID is required" };
        }
        
        const attendanceQuery = await db.collection('attendance_records')
            .where('courseId', '==', courseId)
            .orderBy('date', 'desc')
            .get();
        
        const sessions = new Map();
        
        attendanceQuery.forEach(doc => {
            const record = doc.data();
            const date = record.date;
            
            if (!sessions.has(date)) {
                sessions.set(date, {
                    date: date,
                    total: 0,
                    present: 0,
                    absent: 0,
                    late: 0,
                    records: []
                });
            }
            
            const session = sessions.get(date);
            session.total++;
            if (record.status === 'present') session.present++;
            else if (record.status === 'absent') session.absent++;
            else if (record.status === 'late') session.late++;
            session.records.push({ id: doc.id, ...record });
        });
        
        return { 
            success: true, 
            sessions: Array.from(sessions.values())
        };
    } catch (error) {
        console.error("Error getting course attendance sessions:", error);
        return { success: false, error: error.message };
    }
};

module.exports = {
    getStudentCoursesWithAttendance,
    getAllCoursesWithAttendanceStats,
    markCourseAttendance,
    getCourseSessionAttendance,
    getCourseAttendanceSessions
};