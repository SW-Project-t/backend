async function enrollStudent({
  studentId,
  courseId,
  studentName,
  studentCode,
  studentEmail,
}) {
  const response = await fetch("/api/enroll-student", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      studentId,
      courseId,
      studentName,
      ...(studentCode && { studentCode }),
      ...(studentEmail && { studentEmail }),
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message ?? "Enrollment failed");
  }

  return response.json();
}

async function unenrollStudent({ enrollmentId, studentId, courseId } = {}) {
  if (!enrollmentId && !studentId && !courseId) {
    throw new Error("Provide at least one identifier");
  }

  const response = await fetch("/api/unenroll-student", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(enrollmentId && { enrollmentId }),
      ...(studentId && { studentId }),
      ...(courseId && { courseId }),
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message ?? "Unenrollment failed");
  }

  return response.json();
}

async function getCourseStudents(courseId) {
  if (!courseId) {
    throw new Error("courseId is required");
  }

  const response = await fetch(`/api/course-students/${courseId}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message ?? "Failed to fetch students");
  }

  return response.json();
}

module.exports = {
  enrollStudent,
  unenrollStudent,
  getCourseStudents,
};