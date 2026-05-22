import { mockStudents } from '../data/mockStudents';
import type { GuardianContact, StudentRecord } from '../types';
import { studentFullName } from './student';

let students = [...mockStudents];

export async function searchStudents(query: string): Promise<StudentRecord[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return students;
  }

  return students.filter((student) => {
    const haystack = [
      student.admissionNo,
      studentFullName(student),
      student.grade,
      student.section,
      student.guardian.name,
      student.guardian.phone
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(needle);
  });
}

export async function updateGuardian(
  studentId: string,
  guardian: GuardianContact
): Promise<StudentRecord> {
  students = students.map((student) =>
    student.id === studentId ? { ...student, guardian: { ...guardian } } : student
  );
  return requireStudent(studentId);
}

export async function updatePhoto(studentId: string, photoUrl: string): Promise<StudentRecord> {
  students = students.map((student) =>
    student.id === studentId ? { ...student, photoUrl } : student
  );
  return requireStudent(studentId);
}

function requireStudent(studentId: string) {
  const student = students.find((item) => item.id === studentId);
  if (!student) {
    throw new Error('Student was not found.');
  }
  return student;
}
