import type { JobPosting, Prisma, PrismaClient, Student } from '@prisma/client';
import { aiClient, type JobProfile, type StudentProfile } from './aiClient.js';

export interface EligibilityResult {
  eligible: boolean;
  blockers: string[];
  warnings: string[];
}

/**
 * Single source of truth for "can this student apply to this job".
 * Mirrored in the AI service so shortlists never surface ineligible students.
 */
export function checkEligibility(job: JobPosting, student: Student): EligibilityResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (student.cgpa < job.minCgpa) {
    blockers.push(`CGPA ${student.cgpa.toFixed(2)} is below the cut-off of ${job.minCgpa.toFixed(2)}`);
  }
  if (student.backlogs > job.maxBacklogs) {
    blockers.push(`${student.backlogs} active backlog(s); maximum allowed is ${job.maxBacklogs}`);
  }
  if (job.batches.length && !job.batches.includes(student.batch)) {
    blockers.push(`Open to batch ${job.batches.join(', ')} only`);
  }
  if (student.placementStatus === 'PLACED') {
    warnings.push('Already placed — institute policy may restrict a second offer');
  }
  if (student.placementStatus === 'OPTED_OUT' || student.placementStatus === 'NOT_ELIGIBLE') {
    blockers.push(`Placement status is ${student.placementStatus.replace('_', ' ').toLowerCase()}`);
  }
  if (!student.skills.length) {
    warnings.push('No skills listed on the profile — add skills to improve AI matching');
  }

  return { eligible: blockers.length === 0, blockers, warnings };
}

/** Department check needs the joined department code, so it is separate. */
export function checkDepartmentEligibility(job: JobPosting, departmentCode: string): string | null {
  if (job.allowedDepartments.length && !job.allowedDepartments.includes(departmentCode)) {
    return `Open to ${job.allowedDepartments.join(', ')} only`;
  }
  return null;
}

export function toStudentProfile(
  student: Student & { user: { name: string }; department: { code: string } },
): StudentProfile {
  return {
    studentId: student.id,
    name: student.user.name,
    rollNo: student.rollNo,
    department: student.department.code,
    batch: student.batch,
    cgpa: student.cgpa,
    backlogs: student.backlogs,
    skills: student.skills,
    resumeText: student.resumeText,
    about: student.about,
    placementStatus: student.placementStatus,
    codingScore: student.codingScore,
    githubScore: student.githubScore,
  };
}

export function toJobProfile(job: JobPosting & { company: { name: string } }): JobProfile {
  return {
    jobId: job.id,
    companyName: job.company.name,
    title: job.title,
    description: job.description,
    skills: job.skills,
    minCgpa: job.minCgpa,
    maxBacklogs: job.maxBacklogs,
    allowedDepartments: job.allowedDepartments,
    batches: job.batches,
    location: job.location,
    ctcMax: job.ctcMax,
  };
}

/** Loads every profile the AI service needs in one round trip. */
export async function loadCandidatePool(
  prisma: { student: { findMany: PrismaClient['student']['findMany'] } },
  where: Prisma.StudentWhereInput = {},
) {
  const students = (await prisma.student.findMany({
    where,
    include: {
      user: { select: { name: true } },
      department: { select: { code: true } },
    },
  })) as unknown as (Student & { user: { name: string }; department: { code: string } })[];
  return students.map(toStudentProfile);
}

export { aiClient };
