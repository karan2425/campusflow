/**
 * CampusFlow seed — deterministic, realistic demo data.
 *
 * Creates departments, faculty, ~60 students, courses, attendance history,
 * companies, live job postings, applications across the whole pipeline,
 * interviews, offers and AI telemetry.
 *
 * Run: npm run db:seed        (from repo root or apps/api)
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ---------------------------------------------------------------- utilities
/** Mulberry32 — deterministic PRNG so every seed run produces identical data. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(20260918);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const pickMany = <T,>(arr: T[], n: number): T[] => {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length; i++) out.push(...copy.splice(Math.floor(rand() * copy.length), 1));
  return out;
};
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const round1 = (n: number) => Math.round(n * 10) / 10;
const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000);

const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? 'Password@123';

// ---------------------------------------------------------------- source data
const FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan',
  'Ananya', 'Diya', 'Aadhya', 'Saanvi', 'Myra', 'Anika', 'Kiara', 'Riya', 'Isha', 'Tanvi',
  'Rohan', 'Kabir', 'Aarohi', 'Neha', 'Pooja', 'Sneha', 'Rahul', 'Manish', 'Karan', 'Nikhil',
  'Priya', 'Shreya', 'Meera', 'Nandini', 'Kavya', 'Divya', 'Harsh', 'Yash', 'Devansh', 'Om',
  'Siddharth', 'Ritika', 'Pranav', 'Ankit', 'Gaurav', 'Swati', 'Akash', 'Ritwik', 'Bhavya', 'Chirag',
  'Shruti', 'Aryan', 'Mohit', 'Deepak', 'Varun', 'Sanya', 'Aditi', 'Naina', 'Roshni', 'Parth',
];
const LAST_NAMES = [
  'Sharma', 'Verma', 'Gupta', 'Patel', 'Singh', 'Kumar', 'Reddy', 'Nair', 'Iyer', 'Mehta',
  'Joshi', 'Chauhan', 'Bansal', 'Agarwal', 'Rao', 'Pillai', 'Deshmukh', 'Kulkarni', 'Mishra', 'Tiwari',
  'Chatterjee', 'Banerjee', 'Saxena', 'Kapoor', 'Malhotra', 'Bhatt', 'Dutta', 'Menon', 'Shetty', 'Yadav',
];

const DEPARTMENTS = [
  { code: 'CSE', name: 'Computer Science & Engineering', hodName: 'Dr. Ramesh Iyer' },
  { code: 'IT', name: 'Information Technology', hodName: 'Dr. Sunita Deshmukh' },
  { code: 'ECE', name: 'Electronics & Communication Engineering', hodName: 'Dr. Prakash Menon' },
  { code: 'EE', name: 'Electrical Engineering', hodName: 'Dr. Alok Bhatt' },
  { code: 'ME', name: 'Mechanical Engineering', hodName: 'Dr. Vikram Rathore' },
  { code: 'CE', name: 'Civil Engineering', hodName: 'Dr. Nirmala Shetty' },
];

const SKILL_POOLS: Record<string, string[]> = {
  CSE: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'DSA', 'SQL', 'MongoDB', 'Docker', 'AWS', 'System Design', 'Git', 'Redis', 'Kubernetes', 'GraphQL'],
  IT: ['Java', 'Spring Boot', 'SQL', 'Linux', 'Networking', 'React', 'Python', 'Git', 'Docker', 'REST APIs', 'Jenkins', 'Terraform'],
  ECE: ['Embedded C', 'Verilog', 'VLSI', 'IoT', 'MATLAB', 'Python', 'PCB Design', 'Arduino', 'Signal Processing', 'Raspberry Pi'],
  EE: ['Power Systems', 'MATLAB', 'PLC', 'SCADA', 'Electrical Design', 'AutoCAD', 'Python', 'Control Systems'],
  ME: ['SolidWorks', 'AutoCAD', 'ANSYS', 'Thermodynamics', 'CNC', 'GD&T', 'Manufacturing', 'CATIA'],
  CE: ['AutoCAD', 'STAAD Pro', 'Surveying', 'Concrete Design', 'Revit', 'Project Management', 'Estimation'],
};

const COMPANIES = [
  { name: 'Vertex Analytics', industry: 'Data & AI', tier: 'Tier 1', hqCity: 'Bengaluru', website: 'https://vertex-analytics.example.com', hrName: 'Priyanka Rao', hrEmail: 'talent@vertex-analytics.example.com', description: 'AI-first analytics platform serving global BFSI clients. Known on campus for deep technical interviews and strong mentorship.' },
  { name: 'Nimbus Cloud Systems', industry: 'Cloud Infrastructure', tier: 'Tier 1', hqCity: 'Hyderabad', website: 'https://nimbuscloud.example.com', hrName: 'Arvind Shetty', hrEmail: 'campus@nimbuscloud.example.com', description: 'Public cloud platform engineering. Runs a 6-month internship-to-PPO track for final-year students.' },
  { name: 'FinEdge Capital', industry: 'FinTech', tier: 'Tier 1', hqCity: 'Mumbai', website: 'https://finedge.example.com', hrName: 'Ritu Malhotra', hrEmail: 'hiring@finedge.example.com', description: 'Algorithmic trading and risk platforms. Highest CTC on campus last season.' },
  { name: 'Brightwave Technologies', industry: 'IT Services', tier: 'Tier 2', hqCity: 'Pune', website: 'https://brightwave.example.com', hrName: 'Sanjay Kulkarni', hrEmail: 'campus@brightwave.example.com', description: 'Large-scale enterprise delivery across ERP, cloud migration and QA automation. Consistent mass recruiter.' },
  { name: 'Yantra Robotics', industry: 'Robotics & Automation', tier: 'Startup', hqCity: 'Chennai', website: 'https://yantra.example.com', hrName: 'Deepa Nair', hrEmail: 'join@yantra.example.com', description: 'Warehouse automation robotics startup. Hiring embedded and mechanical design engineers.' },
  { name: 'MediLogix Health', industry: 'HealthTech', tier: 'Tier 2', hqCity: 'Ahmedabad', website: 'https://medilogix.example.com', hrName: 'Kunal Bhatt', hrEmail: 'careers@medilogix.example.com', description: 'Hospital information systems and telemedicine infrastructure across 400+ hospitals.' },
  { name: 'Shakti Motors', industry: 'Automotive', tier: 'Tier 2', hqCity: 'Gurugram', website: 'https://shaktimotors.example.com', hrName: 'Rohit Yadav', hrEmail: 'talent@shaktimotors.example.com', description: 'EV powertrain and chassis engineering. Strong ME and EE hiring.' },
  { name: 'Lumina Consulting', industry: 'Consulting', tier: 'Tier 1', hqCity: 'Gurugram', website: 'https://lumina.example.com', hrName: 'Anjali Menon', hrEmail: 'campus@lumina.example.com', description: 'Technology consulting with a case-study driven selection process. Open to all branches.' },
  { name: 'Orbit Space Labs', industry: 'SpaceTech', tier: 'Startup', hqCity: 'Bengaluru', website: 'https://orbitspace.example.com', hrName: 'Farhan Qureshi', hrEmail: 'crew@orbitspace.example.com', description: 'Small-satellite avionics and ground-station software.' },
  { name: 'Cognito Software', industry: 'Product Engineering', tier: 'Tier 2', hqCity: 'Noida', website: 'https://cognito.example.com', hrName: 'Shalini Verma', hrEmail: 'hiring@cognito.example.com', description: 'SaaS product engineering for logistics and retail verticals.' },
];

const FACULTY_SEED = [
  { name: 'Dr. Ramesh Iyer', designation: 'Professor & HOD', dept: 'CSE', specialization: 'Distributed Systems' },
  { name: 'Dr. Sunita Deshmukh', designation: 'Professor & HOD', dept: 'IT', specialization: 'Information Security' },
  { name: 'Dr. Prakash Menon', designation: 'Professor & HOD', dept: 'ECE', specialization: 'VLSI Design' },
  { name: 'Dr. Alok Bhatt', designation: 'Associate Professor', dept: 'EE', specialization: 'Power Electronics' },
  { name: 'Dr. Vikram Rathore', designation: 'Professor & HOD', dept: 'ME', specialization: 'Thermal Engineering' },
  { name: 'Dr. Nirmala Shetty', designation: 'Professor & HOD', dept: 'CE', specialization: 'Structural Engineering' },
  { name: 'Prof. Meenal Joshi', designation: 'Assistant Professor', dept: 'CSE', specialization: 'Machine Learning' },
  { name: 'Prof. Anil Kumar', designation: 'Assistant Professor', dept: 'CSE', specialization: 'Compiler Design' },
  { name: 'Prof. Shalini Rao', designation: 'Assistant Professor', dept: 'IT', specialization: 'Cloud Computing' },
  { name: 'Prof. Javed Khan', designation: 'Assistant Professor', dept: 'ECE', specialization: 'Embedded Systems' },
  { name: 'Prof. Kavita Singh', designation: 'Assistant Professor', dept: 'ME', specialization: 'Manufacturing Processes' },
  { name: 'Prof. Suresh Pillai', designation: 'Assistant Professor', dept: 'EE', specialization: 'Control Systems' },
];

const COURSE_SEED = [
  { code: 'CS301', title: 'Data Structures & Algorithms', credits: 4, semester: 5, dept: 'CSE', faculty: 7, description: 'Arrays, trees, graphs, dynamic programming and complexity analysis with weekly problem-solving labs.' },
  { code: 'CS302', title: 'Database Management Systems', credits: 4, semester: 5, dept: 'CSE', faculty: 8, description: 'Relational modelling, normalisation, indexing, transactions and query optimisation.' },
  { code: 'CS401', title: 'Machine Learning', credits: 4, semester: 7, dept: 'CSE', faculty: 7, description: 'Supervised and unsupervised learning, model evaluation, feature engineering and deployment basics.' },
  { code: 'CS402', title: 'Operating Systems', credits: 4, semester: 6, dept: 'CSE', faculty: 8, description: 'Processes, scheduling, memory management, file systems and concurrency.' },
  { code: 'CS403', title: 'Computer Networks', credits: 3, semester: 6, dept: 'CSE', faculty: 9, description: 'Layered protocols, TCP/IP, routing, congestion control and network security fundamentals.' },
  { code: 'IT301', title: 'Web Technologies', credits: 3, semester: 5, dept: 'IT', faculty: 9, description: 'Modern full-stack development with REST APIs, authentication and deployment pipelines.' },
  { code: 'IT401', title: 'Cloud & DevOps', credits: 4, semester: 7, dept: 'IT', faculty: 9, description: 'Containers, orchestration, CI/CD, infrastructure as code and observability.' },
  { code: 'EC301', title: 'Digital Signal Processing', credits: 4, semester: 5, dept: 'ECE', faculty: 3, description: 'Sampling, filters, FFT and real-time signal processing implementations.' },
  { code: 'EC401', title: 'Embedded Systems Design', credits: 4, semester: 7, dept: 'ECE', faculty: 10, description: 'Microcontroller architecture, RTOS concepts, peripherals and firmware design.' },
  { code: 'EE401', title: 'Power Systems Analysis', credits: 4, semester: 7, dept: 'EE', faculty: 12, description: 'Load flow, fault analysis, protection schemes and grid stability.' },
  { code: 'ME401', title: 'Computer Aided Design & Manufacturing', credits: 4, semester: 7, dept: 'ME', faculty: 11, description: 'Parametric modelling, simulation-driven design and CNC toolpath generation.' },
  { code: 'CE401', title: 'Structural Analysis', credits: 4, semester: 7, dept: 'CE', faculty: 6, description: 'Determinate and indeterminate structures, matrix methods and design codes.' },
];

const RESUME_TEMPLATE = (name: string, dept: string, skills: string[], cgpa: number) => `
${name}
B.Tech ${dept} · Final Year · CGPA ${cgpa.toFixed(2)}

SUMMARY
Final-year engineering student with hands-on experience building production-grade software. Strong fundamentals in data structures, databases and system design. Comfortable shipping end-to-end features with modern tooling.

EDUCATION
B.Tech in ${dept}, Institute of Engineering & Technology — CGPA ${cgpa.toFixed(2)}/10

TECHNICAL SKILLS
${skills.join(', ')}

PROJECTS
• CampusFlow-style Booking Platform — Built a REST API with authentication, role-based access and PostgreSQL persistence. Reduced average query latency by 40% with indexing and caching.
• Realtime Analytics Dashboard — Developed a React dashboard streaming metrics over WebSockets with charting, filters and export to CSV.
• Distributed Key-Value Store — Implemented consistent hashing, replication and failure recovery as part of coursework.

EXPERIENCE
Software Engineering Intern — built microservice endpoints, wrote unit tests raising coverage to 85%, and automated deployments with GitHub Actions.

ACHIEVEMENTS
• Solved 500+ data structures and algorithms problems
• Finalist, national level hackathon (team of 4)
• Technical lead, departmental coding club
`.trim();

// ---------------------------------------------------------------- main
async function main() {
  console.log('\n🌱 Seeding CampusFlow…\n');

  // Clean slate (order matters because of FKs).
  await prisma.$transaction([
    prisma.aIInteraction.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.offer.deleteMany(),
    prisma.interview.deleteMany(),
    prisma.application.deleteMany(),
    prisma.jobPosting.deleteMany(),
    prisma.company.deleteMany(),
    prisma.attendanceRecord.deleteMany(),
    prisma.attendanceSession.deleteMany(),
    prisma.enrollment.deleteMany(),
    prisma.course.deleteMany(),
    prisma.student.deleteMany(),
    prisma.faculty.deleteMany(),
    prisma.user.deleteMany(),
    prisma.department.deleteMany(),
  ]);

  // --- departments + staff ------------------------------------------------
  const departments = new Map<string, { id: string }>();
  for (const d of DEPARTMENTS) {
    const created = await prisma.department.create({ data: d });
    departments.set(d.code, created);
  }
  console.log(`  ✓ ${departments.size} departments`);

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  await prisma.user.create({
    data: {
      email: 'admin@campusflow.dev',
      name: 'Rekha Menon',
      role: 'ADMIN',
      passwordHash,
      phone: '+91 98200 11223',
    },
  });

  await prisma.user.create({
    data: {
      email: 'officer@campusflow.dev',
      name: 'Sanjay Deshpande',
      role: 'PLACEMENT_OFFICER',
      passwordHash,
      phone: '+91 98200 44556',
    },
  });

  const facultyRecords: { id: string; userId: string; dept: string }[] = [];
  for (const [index, f] of FACULTY_SEED.entries()) {
    const user = await prisma.user.create({
      data: {
        email: `${f.name.replace(/^(Dr\.|Prof\.)\s*/, '').toLowerCase().replace(/[^a-z]+/g, '.')}@campusflow.dev`,
        name: f.name,
        role: 'FACULTY',
        passwordHash,
      },
    });
    const faculty = await prisma.faculty.create({
      data: {
        userId: user.id,
        employeeCode: `FAC${String(index + 1).padStart(3, '0')}`,
        departmentId: departments.get(f.dept)!.id,
        designation: f.designation,
        specialization: f.specialization,
      },
    });
    facultyRecords.push({ id: faculty.id, userId: user.id, dept: f.dept });
    if (index === 0) {
      // Keep a well-known faculty login for demos.
      await prisma.user.update({ where: { id: user.id }, data: { email: 'faculty@campusflow.dev' } });
    }
  }
  console.log(`  ✓ ${facultyRecords.length} faculty members`);

  // --- courses ------------------------------------------------------------
  const courses: { id: string; code: string; dept: string; semester: number }[] = [];
  for (const c of COURSE_SEED) {
    const faculty = facultyRecords.find((f) => f.id === facultyRecords[c.faculty - 1]?.id);
    const course = await prisma.course.create({
      data: {
        code: c.code,
        title: c.title,
        credits: c.credits,
        semester: c.semester,
        departmentId: departments.get(c.dept)!.id,
        facultyId: faculty?.id,
        description: c.description,
      },
    });
    courses.push({ id: course.id, code: course.code, dept: c.dept, semester: c.semester });
  }
  console.log(`  ✓ ${courses.length} courses`);

  // --- students -----------------------------------------------------------
  const usedEmails = new Set<string>();
  const batchMix = [2026, 2026, 2026, 2027]; // weighted towards the outgoing batch
  const studentRecords: {
    id: string;
    userId: string;
    name: string;
    email: string;
    rollNo: string;
    dept: string;
    batch: number;
    cgpa: number;
    backlogs: number;
    skills: string[];
  }[] = [];

  for (let i = 0; i < 60; i++) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length];
    const last = pick(LAST_NAMES);
    const name = `${first} ${last}`;
    // Every 3rd student goes to CSE/IT, the rest rotate through core branches.
    const cycle = i % 30;
    const deptCode =
      i === 0
        ? 'CSE'
        : cycle < 10
          ? 'CSE'
          : cycle < 17
            ? 'IT'
            : ['ECE', 'ME', 'EE', 'CE'][cycle % 4];
    const batch = i === 0 ? 2026 : batchMix[i % batchMix.length];

    let email = `${first}.${last}`.toLowerCase() + '@campusflow.dev';
    let suffix = 1;
    while (usedEmails.has(email)) email = `${first}.${last}${++suffix}`.toLowerCase() + '@campusflow.dev';
    usedEmails.add(email);

    // Realistic distribution: ~18% toppers (8.5+), a small struggling tail,
    // everyone else clustered in the 6.5–8.4 band — varies by branch too.
    const roll = rand();
    const cgpa =
      i === 0
        ? 8.74
        : round1(
            roll < 0.18
              ? 8.55 + rand() * 1.3 // toppers
              : roll < 0.28
                ? 5.7 + rand() * 0.9 // struggling tail
                : 6.5 + rand() * 1.95, // core band
          );
    const backlogs = i === 0 ? 0 : rand() > 0.88 ? int(1, 2) : 0;
    const skills = pickMany(SKILL_POOLS[deptCode], int(5, 9));

    const user = await prisma.user.create({
      data: {
        email: batch === 2026 ? email : email.replace('@', `${batch}@`),
        name,
        role: 'STUDENT',
        passwordHash,
        phone: `+91 9${int(100000000, 999999999)}`,
      },
    });

    const student = await prisma.student.create({
      data: {
        userId: user.id,
        rollNo: `${batch}${deptCode}${String(i + 1).padStart(3, '0')}`,
        departmentId: departments.get(deptCode)!.id,
        batch,
        currentSemester: batch === 2026 ? 7 : 5,
        cgpa,
        backlogs,
        skills,
        city: pick(['Meerut', 'Noida', 'Delhi', 'Jaipur', 'Lucknow', 'Bengaluru', 'Pune', 'Hyderabad', 'Indore', 'Kochi']),
        about: `${batch === 2026 ? 'Final' : 'Pre-final'}-year ${deptCode} student interested in ${skills.slice(0, 3).join(', ')}. Actively preparing for campus placements.`,
        githubUrl: rand() > 0.35 ? `https://github.com/${first.toLowerCase()}-${last.toLowerCase()}` : null,
        linkedinUrl: rand() > 0.4 ? `https://linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase()}` : null,
        resumeText: RESUME_TEMPLATE(name, deptCode, skills, cgpa),
        githubScore: rand() > 0.3 ? int(180, 720) : null,
        codingScore: rand() > 0.25 ? int(200, 850) : null,
        verified: rand() > 0.25,
      },
    });

    studentRecords.push({
      id: student.id,
      userId: user.id,
      name,
      email: batch === 2026 ? email : email.replace('@', `${batch}@`),
      rollNo: student.rollNo,
      dept: deptCode,
      batch,
      cgpa,
      backlogs,
      skills,
    });
  }

  // A memorable demo login, and the strongest CSE candidate.
  const demoEmail = 'demo.student@campusflow.dev';
  const firstStudent = studentRecords[0];
  await prisma.user.update({
    where: { id: firstStudent.userId },
    data: { email: demoEmail, name: 'Aarav Sharma' },
  });
  firstStudent.email = demoEmail;
  firstStudent.name = 'Aarav Sharma';

  console.log(`  ✓ ${studentRecords.length} students (demo login: ${demoEmail})`);

  // --- enrollments --------------------------------------------------------
  const enrollments: Prisma.EnrollmentCreateManyInput[] = [];
  for (const s of studentRecords) {
    const deptCourses = courses.filter((c) => c.dept === s.dept);
    for (const c of pickMany(deptCourses, Math.min(deptCourses.length, int(3, 4)))) {
      enrollments.push({
        studentId: s.id,
        courseId: c.id,
        status: 'ENROLLED',
        marks: int(55, 96),
        grade: pick(['A+', 'A', 'B+', 'B', 'C']),
      });
    }
  }
  await prisma.enrollment.createMany({ data: enrollments, skipDuplicates: true });
  console.log(`  ✓ ${enrollments.length} course enrollments`);

  // --- attendance history -------------------------------------------------
  let sessionCount = 0;
  let recordCount = 0;
  for (const course of courses) {
    const roster = enrollments.filter((e) => e.courseId === course.id).map((e) => e.studentId);
    if (!roster.length) continue;

    for (let week = 12; week >= 1; week--) {
      const session = await prisma.attendanceSession.create({
        data: {
          courseId: course.id,
          date: daysFromNow(-week * 7 + int(0, 2)),
          topic: `Unit ${Math.max(1, 4 - Math.floor(week / 3))} — lecture ${13 - week}`,
        },
      });
      sessionCount++;

      await prisma.attendanceRecord.createMany({
        data: roster.map((studentId) => ({
          sessionId: session.id,
          studentId,
          // Most students attend; a slice becomes habitual absentees.
          status:
            rand() < 0.86 ? 'PRESENT' : rand() < 0.55 ? 'ABSENT' : rand() < 0.7 ? 'LATE' : 'EXCUSED',
        })),
        skipDuplicates: true,
      });
      recordCount += roster.length;
    }
  }
  console.log(`  ✓ ${sessionCount} attendance sessions / ${recordCount} records`);

  // --- companies ----------------------------------------------------------
  const companyRecords = new Map<string, { id: string; name: string; tier: string }>();
  for (const c of COMPANIES) {
    const company = await prisma.company.create({ data: c });
    companyRecords.set(c.name, { id: company.id, name: company.name, tier: c.tier });
  }
  console.log(`  ✓ ${companyRecords.size} companies`);

  // --- job postings -------------------------------------------------------
  const JD = (role: string, stack: string, extra = '') => `
We are hiring ${role} for our 2026 campus intake.

Responsibilities
• Design, build and ship features across the stack with ${stack}
• Write clean, tested, reviewable code and participate in design discussions
• Collaborate with product, QA and DevOps to take features from idea to production
• Debug production issues and improve reliability, performance and observability

Requirements
• Strong fundamentals in data structures, algorithms and problem solving
• Hands-on project or internship experience with ${stack}
• Good communication skills and willingness to learn quickly
${extra}

Selection process: online assessment, technical interviews, HR round.
`.trim();

  const jobSeeds = [
    { company: 'Vertex Analytics', title: 'Software Engineer — AI Platform', type: 'FULL_TIME', location: 'Bengaluru', workMode: 'Hybrid', ctcMin: 18, ctcMax: 26, minCgpa: 8.0, maxBacklogs: 0, depts: ['CSE', 'IT', 'ECE'], batches: [2026], skills: ['Python', 'PyTorch', 'Docker', 'SQL', 'System Design'], openings: 6, deadline: 12, bondMonths: null, desc: JD('Software Engineers', 'Python, distributed systems and ML tooling', '• Exposure to LLMs, vector search or data pipelines is a strong plus') },
    { company: 'FinEdge Capital', title: 'Quantitative Developer', type: 'FULL_TIME', location: 'Mumbai', workMode: 'On-site', ctcMin: 28, ctcMax: 42, minCgpa: 8.2, maxBacklogs: 0, depts: ['CSE', 'IT', 'EE', 'ECE'], batches: [2026], skills: ['C++', 'Python', 'DSA', 'Statistics', 'Linux'], openings: 3, deadline: 9, bondMonths: null, desc: JD('Quantitative Developers', 'C++, Python and low-latency systems', '• Strong mathematical aptitude required; trading exposure is a bonus') },
    { company: 'Nimbus Cloud Systems', title: 'Cloud Engineer (Internship + PPO)', type: 'INTERNSHIP_PPO', location: 'Hyderabad', workMode: 'Hybrid', ctcMin: 14, ctcMax: 20, stipend: 45000, minCgpa: 7.5, maxBacklogs: 0, depts: ['CSE', 'IT'], batches: [2026, 2027], skills: ['AWS', 'Kubernetes', 'Terraform', 'Linux', 'Go'], openings: 10, deadline: 16, desc: JD('Cloud Engineering Interns', 'AWS, Kubernetes and infrastructure as code', '• 6-month internship with performance-linked PPO conversion') },
    { company: 'Brightwave Technologies', title: 'Graduate Engineer Trainee', type: 'FULL_TIME', location: 'Pune / Bengaluru', workMode: 'On-site', ctcMin: 6.5, ctcMax: 9, minCgpa: 6.5, maxBacklogs: 1, depts: [], batches: [2026], skills: ['Java', 'SQL', 'JavaScript', 'Git', 'REST APIs'], openings: 45, deadline: 21, bondMonths: 12, desc: JD('Graduate Engineer Trainees', 'Java, SQL and enterprise systems', '• 12-week paid training program before project allocation') },
    { company: 'Cognito Software', title: 'Full Stack Developer', type: 'FULL_TIME', location: 'Noida', workMode: 'Hybrid', ctcMin: 9, ctcMax: 13, minCgpa: 7.0, maxBacklogs: 0, depts: ['CSE', 'IT'], batches: [2026, 2027], skills: ['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'Docker'], openings: 8, deadline: 14, desc: JD('Full Stack Developers', 'React, Node.js and PostgreSQL', '• You will own features end to end in a 6-person product pod') },
    { company: 'Yantra Robotics', title: 'Embedded Systems Engineer', type: 'FULL_TIME', location: 'Chennai', workMode: 'On-site', ctcMin: 8, ctcMax: 12, minCgpa: 7.0, maxBacklogs: 0, depts: ['ECE', 'EE', 'ME'], batches: [2026], skills: ['Embedded C', 'RTOS', 'PCB Design', 'Python', 'IoT'], openings: 5, deadline: 18, desc: JD('Embedded Engineers', 'embedded C, RTOS and motor control firmware', '• Hands-on lab round with our robotics testbed') },
    { company: 'MediLogix Health', title: 'Software Engineer — Backend', type: 'FULL_TIME', location: 'Ahmedabad', workMode: 'Hybrid', ctcMin: 8.5, ctcMax: 12, minCgpa: 7.0, maxBacklogs: 0, depts: ['CSE', 'IT'], batches: [2026], skills: ['Node.js', 'PostgreSQL', 'REST APIs', 'Docker', 'Redis'], openings: 6, deadline: 11, desc: JD('Backend Engineers', 'Node.js, PostgreSQL and HL7/FHIR integrations', '• Healthcare domain exposure after joining') },
    { company: 'Shakti Motors', title: 'Graduate Design Engineer', type: 'FULL_TIME', location: 'Gurugram', workMode: 'On-site', ctcMin: 7, ctcMax: 10, minCgpa: 6.8, maxBacklogs: 1, depts: ['ME', 'EE'], batches: [2026], skills: ['SolidWorks', 'ANSYS', 'GD&T', 'CATIA'], openings: 12, deadline: 24, desc: JD('Design Engineers', 'SolidWorks, ANSYS and GD&T', '• EV powertrain and chassis design tracks') },
    { company: 'Lumina Consulting', title: 'Technology Analyst', type: 'FULL_TIME', location: 'Gurugram', workMode: 'Hybrid', ctcMin: 11, ctcMax: 15, minCgpa: 7.5, maxBacklogs: 0, depts: [], batches: [2026, 2027], skills: ['SQL', 'Python', 'Communication', 'Problem Solving', 'Cloud'], openings: 15, deadline: 19, desc: JD('Technology Analysts', 'cloud platforms, SQL and client-facing problem solving', '• Case-study driven selection; all branches welcome') },
    { company: 'Orbit Space Labs', title: 'Flight Software Intern', type: 'INTERNSHIP', location: 'Bengaluru', workMode: 'On-site', ctcMin: 6, ctcMax: 9, stipend: 35000, minCgpa: 7.8, maxBacklogs: 0, depts: ['CSE', 'ECE', 'EE'], batches: [2026, 2027], skills: ['C++', 'Python', 'Embedded C', 'Linux', 'Signal Processing'], openings: 4, deadline: 7, desc: JD('Flight Software Interns', 'C++, embedded Linux and spacecraft telemetry', '• Internship with a clear full-time conversion path') },
    { company: 'Brightwave Technologies', title: 'QA Automation Engineer', type: 'FULL_TIME', location: 'Pune', workMode: 'On-site', ctcMin: 6, ctcMax: 8, minCgpa: 6.5, maxBacklogs: 2, depts: ['CSE', 'IT', 'ECE'], batches: [2026], skills: ['Selenium', 'Java', 'SQL', 'Git', 'REST APIs'], openings: 20, deadline: 26, bondMonths: 12, desc: JD('QA Automation Engineers', 'Selenium, Java and API testing', '• Strong attention to detail valued over prior automation experience') },
    { company: 'Vertex Analytics', title: 'Data Engineering Intern', type: 'INTERNSHIP_PPO', location: 'Bengaluru', workMode: 'Hybrid', ctcMin: 12, ctcMax: 16, stipend: 40000, minCgpa: 7.5, maxBacklogs: 0, depts: ['CSE', 'IT', 'ECE', 'EE'], batches: [2027], skills: ['Python', 'SQL', 'Spark', 'Airflow', 'AWS'], openings: 6, deadline: 20, desc: JD('Data Engineering Interns', 'Python, Spark and modern data stacks', '• Focused on pre-final year students with strong SQL') },
  ];

  const jobs: { id: string; company: string; title: string; ctcMax: number; skills: string[]; minCgpa: number; maxBacklogs: number; depts: string[]; batches: number[]; openings: number }[] = [];
  for (const j of jobSeeds) {
    const job = await prisma.jobPosting.create({
      data: {
        companyId: companyRecords.get(j.company)!.id,
        title: j.title,
        description: j.desc,
        type: j.type as never,
        status: 'OPEN',
        location: j.location,
        workMode: j.workMode,
        ctcMin: j.ctcMin,
        ctcMax: j.ctcMax,
        stipendPerMonth: j.stipend,
        minCgpa: j.minCgpa,
        maxBacklogs: j.maxBacklogs,
        allowedDepartments: j.depts,
        batches: j.batches,
        skills: j.skills,
        openings: j.openings,
        bondMonths: j.bondMonths ?? null,
        deadline: daysFromNow(j.deadline),
        postedAt: daysFromNow(-int(4, 30)),
      },
    });
    jobs.push({
      id: job.id,
      company: j.company,
      title: j.title,
      ctcMax: j.ctcMax,
      skills: j.skills,
      minCgpa: j.minCgpa,
      maxBacklogs: j.maxBacklogs,
      depts: j.depts,
      batches: j.batches,
      openings: j.openings,
    });
  }
  console.log(`  ✓ ${jobs.length} open job postings`);

  // --- applications -------------------------------------------------------
  const statusFlow: { status: string; weight: number }[] = [
    { status: 'APPLIED', weight: 20 },
    { status: 'UNDER_REVIEW', weight: 11 },
    { status: 'SHORTLISTED', weight: 18 },
    { status: 'INTERVIEW_SCHEDULED', weight: 12 },
    { status: 'INTERVIEWED', weight: 10 },
    { status: 'OFFERED', weight: 52 },
    { status: 'REJECTED', weight: 7 },
  ];
  const weightedStatus = () => {
    const total = statusFlow.reduce((s, x) => s + x.weight, 0);
    let r = rand() * total;
    for (const s of statusFlow) {
      r -= s.weight;
      if (r <= 0) return s.status;
    }
    return 'APPLIED';
  };

  const appRows: Prisma.ApplicationCreateManyInput[] = [];
  const applicationsByStudent = new Map<string, { jobId: string; status: string }[]>();

  for (const s of studentRecords) {
    const eligible = jobs.filter(
      (j) =>
        s.cgpa >= j.minCgpa &&
        s.backlogs <= j.maxBacklogs &&
        (!j.depts.length || j.depts.includes(s.dept)) &&
        j.batches.includes(s.batch),
    );
    if (!eligible.length) continue;

    const count = Math.min(eligible.length, int(4, 8));
    const chosen = pickMany(eligible, count);

    for (const job of chosen) {
      const status = weightedStatus();
      // Match score correlates with skill overlap and CGPA — looks believable.
      const overlap = job.skills.filter((sk) => s.skills.includes(sk)).length / job.skills.length;
      const rawScore = overlap * 62 + (s.cgpa / 10) * 34 + rand() * 6;
      const matchScore = Math.min(99, round1(rawScore));
      const atsScore = Math.min(99, round1(45 + overlap * 40 + rand() * 12));
      const matched = job.skills.filter((sk) => s.skills.includes(sk));
      const missing = job.skills.filter((sk) => !s.skills.includes(sk));

      appRows.push({
        jobId: job.id,
        studentId: s.id,
        status: status as never,
        matchScore,
        atsScore,
        aiSummary:
          `Strong ${overlap > 0.6 ? 'skill alignment' : 'academic foundation'} for ${job.title}: matches ${matched.length}/${job.skills.length} required skills` +
          (missing.length ? `; gaps in ${missing.slice(0, 3).join(', ')}.` : '.'),
        matchedSkills: matched,
        missingSkills: missing,
        source: rand() > 0.85 ? 'PLACEMENT_CELL' : 'STUDENT',
        coverNote: rand() > 0.6 ? `I am excited about ${job.company}'s work in this space and believe my ${matched.slice(0, 2).join(' and ')} experience fits the role well.` : null,
        appliedAt: daysFromNow(-int(1, 45)),
      });

      const list = applicationsByStudent.get(s.id) ?? [];
      list.push({ jobId: job.id, status });
      applicationsByStudent.set(s.id, list);
    }
  }

  await prisma.application.createMany({ data: appRows, skipDuplicates: true });
  console.log(`  ✓ ${appRows.length} applications across the pipeline`);

  // --- interviews ---------------------------------------------------------
  const offeredOrInterviewed = await prisma.application.findMany({
    where: { status: { in: ['INTERVIEW_SCHEDULED', 'INTERVIEWED', 'OFFERED'] } },
    include: { student: true },
  });

  const interviewRows: Prisma.InterviewCreateManyInput[] = [];
  const roundNames = ['Online Assessment', 'Technical Round 1', 'Technical Round 2', 'Managerial Round', 'HR Round'];

  for (const app of offeredOrInterviewed) {
    const rounds = app.status === 'OFFERED' ? int(2, 4) : int(1, 2);
    for (let r = 1; r <= rounds; r++) {
      const isFuture = app.status === 'INTERVIEW_SCHEDULED' && r === rounds;
      const cleared = app.status === 'OFFERED' || r < rounds;
      interviewRows.push({
        applicationId: app.id,
        round: r,
        name: roundNames[Math.min(r - 1, roundNames.length - 1)],
        scheduledAt: isFuture ? daysFromNow(int(1, 12)) : daysFromNow(-int(2, 30)),
        durationMins: pick([30, 45, 60, 75]),
        mode: pick(['ONLINE', 'IN_PERSON', 'TELEPHONIC']) as never,
        meetingLink: rand() > 0.4 ? `https://meet.campusflow.dev/${Math.random().toString(36).slice(2, 10)}` : null,
        interviewer: `${pick(['Ankit', 'Sneha', 'Rahul', 'Priya', 'Vikram'])} ${pick(LAST_NAMES)}`,
        result: isFuture ? ('PENDING' as never) : cleared ? ('CLEARED' as never) : ('FAILED' as never),
        feedback: isFuture
          ? null
          : cleared
            ? 'Solid problem-solving approach, clear communication and good debugging instincts.'
            : 'Good fundamentals but could not complete the optimisation discussion in time.',
        score: isFuture ? null : int(58, 92),
      });
    }
  }
  await prisma.interview.createMany({ data: interviewRows });
  console.log(`  ✓ ${interviewRows.length} interview rounds scheduled/recorded`);

  // --- offers -------------------------------------------------------------
  const offeredApps = await prisma.application.findMany({
    where: { status: 'OFFERED' },
    include: { job: { include: { company: true } }, student: true },
  });

  const offerRows: Prisma.OfferCreateManyInput[] = [];
  const placedStudentIds = new Set<string>();

  for (const app of offeredApps) {
    if (placedStudentIds.has(app.studentId)) continue; // one offer per student keeps analytics clean
    placedStudentIds.add(app.studentId);
    const ctc = round1(app.job.ctcMin + rand() * (app.job.ctcMax - app.job.ctcMin));
    offerRows.push({
      applicationId: app.id,
      studentId: app.studentId,
      companyName: app.job.company.name,
      role: app.job.title,
      ctc,
      stipendPerMonth: app.job.stipendPerMonth,
      location: app.job.location,
      offerDate: daysFromNow(-int(1, 40)),
      joiningDate: daysFromNow(int(60, 200)),
      accepted: rand() > 0.22,
    });
  }

  await prisma.offer.createMany({ data: offerRows });
  console.log(`  ✓ ${offerRows.length} offers rolled out`);

  // --- placement status + internships in progress -------------------------
  await prisma.student.updateMany({
    where: { id: { in: Array.from(placedStudentIds) } },
    data: { placementStatus: 'PLACED' },
  });

  const inProcess = Array.from(applicationsByStudent.entries())
    .filter(([id, apps]) => !placedStudentIds.has(id) && apps.some((a) => a.status === 'SHORTLISTED'))
    .map(([id]) => id);
  await prisma.student.updateMany({
    where: { id: { in: inProcess } },
    data: { placementStatus: 'IN_PROCESS' },
  });

  await prisma.student.updateMany({
    where: { cgpa: { lt: 6 }, backlogs: { gt: 1 } },
    data: { placementStatus: 'NOT_ELIGIBLE' },
  });

  // --- notifications ------------------------------------------------------
  const notificationRows: Prisma.NotificationCreateManyInput[] = [];
  const recentOffers = offerRows.slice(0, 25);
  for (const o of recentOffers) {
    const student = studentRecords.find((s) => s.id === o.studentId);
    if (!student) continue;
    notificationRows.push({
      userId: student.userId,
      title: `🏆 Offer from ${o.companyName}`,
      body: `${o.role} · ₹${o.ctc} LPA. Respond from your applications page.`,
      type: 'PLACEMENT',
      link: '/applications',
      read: rand() > 0.4,
      createdAt: daysFromNow(-int(1, 25)),
    });
  }
  for (const s of pickMany(studentRecords, 20)) {
    notificationRows.push({
      userId: s.userId,
      title: 'New opening matches your profile',
      body: `A recruiter is hiring ${s.dept} students with ${s.skills[0]} skills. Check the AI recommendations feed.`,
      type: 'AI',
      link: '/placements',
      read: rand() > 0.5,
      createdAt: daysFromNow(-int(0, 10)),
    });
  }
  const officers = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'PLACEMENT_OFFICER'] } } });
  for (const o of officers) {
    notificationRows.push({
      userId: o.id,
      title: 'Weekly placement digest ready',
      body: `${offerRows.length} offers this season · ${jobs.filter((j) => j.openings > 10).length} mass recruiters are live.`,
      type: 'INFO',
      link: '/analytics',
      read: false,
      createdAt: daysFromNow(-1),
    });
  }
  await prisma.notification.createMany({ data: notificationRows });
  console.log(`  ✓ ${notificationRows.length} notifications`);

  // --- AI telemetry -------------------------------------------------------
  const aiRows: Prisma.AIInteractionCreateManyInput[] = [];
  const kinds = ['CHAT', 'RESUME_MATCH', 'CANDIDATE_SHORTLIST', 'ATS_SCORE', 'INTERVIEW_QUESTIONS'] as const;
  for (let i = 0; i < 40; i++) {
    const kind = kinds[i % kinds.length];
    const s = pick(studentRecords);
    aiRows.push({
      userId: s.userId,
      kind: kind as never,
      prompt:
        kind === 'CHAT'
          ? pick([
              'Which companies am I eligible for with 8.5 CGPA and no backlogs?',
              'How do I improve my resume for backend roles?',
              'What is the placement process for Vertex Analytics?',
              'Prepare a 7-day plan before my technical interview.',
            ])
          : kind === 'ATS_SCORE'
            ? `ATS score for ${s.rollNo}`
            : `Shortlist candidates for ${pick(jobs).title}`,
      response: 'Generated response stored for audit and analytics.',
      latencyMs: int(280, 2400),
      provider: rand() > 0.15 ? 'gemini' : 'heuristic-fallback',
      createdAt: daysFromNow(-int(0, 20)),
    });
  }
  await prisma.aIInteraction.createMany({ data: aiRows });
  console.log(`  ✓ ${aiRows.length} AI interaction logs`);

  // --- summary ------------------------------------------------------------
  const [students_, placed_, jobs_, apps_] = await Promise.all([
    prisma.student.count(),
    prisma.student.count({ where: { placementStatus: 'PLACED' } }),
    prisma.jobPosting.count({ where: { status: 'OPEN' } }),
    prisma.application.count(),
  ]);

  console.log('\n✅ Seed complete');
  console.log(`   Students      ${students_}`);
  console.log(`   Placed        ${placed_} (${round1((placed_ / students_) * 100)}%)`);
  console.log(`   Open postings ${jobs_}`);
  console.log(`   Applications  ${apps_}`);
  console.log('\n   Demo logins (password: ' + DEFAULT_PASSWORD + ')');
  console.log('   ├─ admin@campusflow.dev        Admin');
  console.log('   ├─ officer@campusflow.dev      Placement Officer');
  console.log('   ├─ faculty@campusflow.dev      Faculty (CSE)');
  console.log('   └─ demo.student@campusflow.dev Student (Aarav Sharma, CSE 2026)\n');
}

main()
  .catch((e) => {
    console.error('\n❌ Seed failed:\n', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
