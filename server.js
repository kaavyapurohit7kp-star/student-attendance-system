import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { store, initializeStore } from './src/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);

if (!process.env.SESSION_SECRET) {
  console.warn('WARNING: SESSION_SECRET is not set. Set it in .env before using this app.');
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: 'attendance.sid',
  secret: process.env.SESSION_SECRET || 'development-only-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8
  }
}));
app.use(express.static(path.join(__dirname, 'public')));

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const requireAuth = (req, res, next) => {
  if (!req.session.admin) return res.status(401).json({ error: 'Please sign in first.' });
  next();
};
const clean = (v) => String(v ?? '').trim();
const validDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

app.get('/api/health', (req, res) => res.json({ ok: true, storage: store.mode }));

app.post('/api/login', asyncRoute(async (req, res) => {
  const username = clean(req.body.username);
  const password = String(req.body.password ?? '');
  const expectedUser = process.env.ADMIN_USERNAME || 'admin';
  const hash = process.env.ADMIN_PASSWORD_HASH || '';
  if (!hash) return res.status(503).json({ error: 'Admin password is not configured. Follow README setup steps.' });
  const ok = username === expectedUser && await bcrypt.compare(password, hash);
  if (!ok) return res.status(401).json({ error: 'Invalid username or password.' });
  req.session.admin = { username };
  res.json({ ok: true, username });
}));

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});
app.get('/api/me', (req, res) => res.json({ authenticated: Boolean(req.session.admin), username: req.session.admin?.username || null }));

app.get('/api/dashboard', requireAuth, asyncRoute(async (req, res) => {
  const [students, attendance] = await Promise.all([store.listStudents(), store.listAttendance()]);
  const today = new Date().toISOString().slice(0, 10);
  const todays = attendance.filter(a => a.date === today);
  const present = todays.filter(a => a.status === 'Present').length;
  const absent = todays.filter(a => a.status === 'Absent').length;
  const leave = todays.filter(a => a.status === 'Leave').length;
  const marked = todays.length;
  res.json({
    totalStudents: students.length, present, absent, leave,
    notMarked: Math.max(0, students.length - marked),
    attendanceRate: marked ? Math.round((present / marked) * 100) : 0,
    today
  });
}));

app.get('/api/students', requireAuth, asyncRoute(async (req, res) => {
  res.json(await store.listStudents());
}));

app.post('/api/students', requireAuth, asyncRoute(async (req, res) => {
  const student = {
    rollNo: clean(req.body.rollNo),
    name: clean(req.body.name),
    course: clean(req.body.course),
    semester: Number(req.body.semester),
    email: clean(req.body.email)
  };
  if (!student.rollNo || !student.name || !student.course || !Number.isInteger(student.semester) || student.semester < 1 || student.semester > 12) {
    return res.status(400).json({ error: 'Enter roll number, name, course and a semester from 1 to 12.' });
  }
  const existing = await store.listStudents();
  if (existing.some(s => s.rollNo.toLowerCase() === student.rollNo.toLowerCase())) {
    return res.status(409).json({ error: 'A student with this roll number already exists.' });
  }
  const saved = await store.createStudent(student);
  res.status(201).json(saved);
}));

app.put('/api/students/:id', requireAuth, asyncRoute(async (req, res) => {
  const current = await store.getStudent(req.params.id);
  if (!current) return res.status(404).json({ error: 'Student not found.' });
  const student = {
    ...current,
    rollNo: clean(req.body.rollNo),
    name: clean(req.body.name),
    course: clean(req.body.course),
    semester: Number(req.body.semester),
    email: clean(req.body.email)
  };
  if (!student.rollNo || !student.name || !student.course || !Number.isInteger(student.semester) || student.semester < 1 || student.semester > 12) {
    return res.status(400).json({ error: 'Please complete all required fields.' });
  }
  const all = await store.listStudents();
  if (all.some(s => s._id !== current._id && s.rollNo.toLowerCase() === student.rollNo.toLowerCase())) {
    return res.status(409).json({ error: 'Another student already uses this roll number.' });
  }
  res.json(await store.updateStudent(student));
}));

app.delete('/api/students/:id', requireAuth, asyncRoute(async (req, res) => {
  const current = await store.getStudent(req.params.id);
  if (!current) return res.status(404).json({ error: 'Student not found.' });
  await store.deleteStudent(current);
  res.json({ ok: true });
}));

app.get('/api/attendance', requireAuth, asyncRoute(async (req, res) => {
  const date = clean(req.query.date) || new Date().toISOString().slice(0, 10);
  if (!validDate(date)) return res.status(400).json({ error: 'Date must use YYYY-MM-DD format.' });
  const [students, records] = await Promise.all([store.listStudents(), store.listAttendanceByDate(date)]);
  const byStudent = new Map(records.map(r => [r.studentId, r]));
  res.json(students.map(s => ({
    studentId: s._id, rollNo: s.rollNo, name: s.name, course: s.course,
    status: byStudent.get(s._id)?.status || 'Not marked'
  })));
}));

app.post('/api/attendance', requireAuth, asyncRoute(async (req, res) => {
  const date = clean(req.body.date);
  const status = clean(req.body.status);
  const studentId = clean(req.body.studentId);
  if (!validDate(date) || !['Present', 'Absent', 'Leave'].includes(status) || !studentId) {
    return res.status(400).json({ error: 'Provide a valid date, student and status.' });
  }
  const student = await store.getStudent(studentId);
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  const saved = await store.saveAttendance({
    studentId, rollNo: student.rollNo, studentName: student.name, date, status,
    updatedAt: new Date().toISOString()
  });
  res.json(saved);
}));

app.get('/api/reports', requireAuth, asyncRoute(async (req, res) => {
  const [students, attendance] = await Promise.all([store.listStudents(), store.listAttendance()]);
  const report = students.map(s => {
    const rows = attendance.filter(a => a.studentId === s._id);
    const present = rows.filter(a => a.status === 'Present').length;
    const absent = rows.filter(a => a.status === 'Absent').length;
    const leave = rows.filter(a => a.status === 'Leave').length;
    const counted = present + absent + leave;
    return {
      studentId: s._id, rollNo: s.rollNo, name: s.name, course: s.course,
      present, absent, leave, totalMarked: counted,
      percentage: counted ? Math.round((present / counted) * 100) : 0
    };
  });
  res.json(report);
}));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Check the server terminal and database configuration.' });
});

await initializeStore();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Attendance system running at http://localhost:${PORT}`);
  console.log(`Storage mode: ${store.mode}`);
});
