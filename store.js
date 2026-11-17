import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CloudantV1 } from '@ibm-cloud/cloudant';

const dbName = (process.env.CLOUDANT_DB || 'attendance_db').toLowerCase();
const cloudEnabled = Boolean(process.env.CLOUDANT_URL && process.env.CLOUDANT_APIKEY);
const cloudant = cloudEnabled ? CloudantV1.newInstance({}) : null;
const localFile = path.resolve('data/local-db.json');

async function ensureLocalFile() {
  await fs.mkdir(path.dirname(localFile), { recursive: true });
  try { await fs.access(localFile); }
  catch { await fs.writeFile(localFile, JSON.stringify({ students: [], attendance: [] }, null, 2)); }
}
async function readLocal() {
  await ensureLocalFile();
  return JSON.parse(await fs.readFile(localFile, 'utf8'));
}
async function writeLocal(data) {
  await ensureLocalFile();
  await fs.writeFile(localFile, JSON.stringify(data, null, 2));
}
async function cloudFind(selector) {
  const response = await cloudant.postFind({ db: dbName, selector, limit: 10000 });
  return response.result.docs || [];
}
async function cloudGet(id) {
  try {
    const response = await cloudant.getDocument({ db: dbName, docId: id });
    return response.result;
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}
async function cloudPut(doc) {
  const response = await cloudant.putDocument({ db: dbName, docId: doc._id, document: doc });
  return { ...doc, _rev: response.result.rev };
}

export const store = {
  mode: cloudEnabled ? 'IBM Cloudant' : 'Local JSON (development)',
  async listStudents() {
    if (!cloudEnabled) return (await readLocal()).students;
    return cloudFind({ type: 'student' });
  },
  async getStudent(id) {
    if (!cloudEnabled) return (await readLocal()).students.find(s => s._id === id) || null;
    const doc = await cloudGet(id);
    return doc?.type === 'student' ? doc : null;
  },
  async createStudent(data) {
    const doc = { _id: `student_${randomUUID()}`, type: 'student', ...data, createdAt: new Date().toISOString() };
    if (cloudEnabled) return cloudPut(doc);
    const db = await readLocal(); db.students.push(doc); await writeLocal(db); return doc;
  },
  async updateStudent(doc) {
    if (cloudEnabled) return cloudPut(doc);
    const db = await readLocal(); db.students = db.students.map(s => s._id === doc._id ? doc : s); await writeLocal(db); return doc;
  },
  async deleteStudent(doc) {
    if (cloudEnabled) {
      const records = await cloudFind({ type: 'attendance', studentId: doc._id });
      for (const r of records) await cloudant.deleteDocument({ db: dbName, docId: r._id, rev: r._rev });
      await cloudant.deleteDocument({ db: dbName, docId: doc._id, rev: doc._rev });
      return;
    }
    const db = await readLocal();
    db.students = db.students.filter(s => s._id !== doc._id);
    db.attendance = db.attendance.filter(a => a.studentId !== doc._id);
    await writeLocal(db);
  },
  async listAttendance() {
    if (!cloudEnabled) return (await readLocal()).attendance;
    return cloudFind({ type: 'attendance' });
  },
  async listAttendanceByDate(date) {
    if (!cloudEnabled) return (await readLocal()).attendance.filter(a => a.date === date);
    return cloudFind({ type: 'attendance', date });
  },
  async saveAttendance(data) {
    const id = `attendance_${data.date}_${data.studentId}`;
    if (cloudEnabled) {
      const old = await cloudGet(id);
      return cloudPut({ ...old, ...data, _id: id, type: 'attendance' });
    }
    const db = await readLocal();
    const index = db.attendance.findIndex(a => a._id === id);
    const doc = { ...(index >= 0 ? db.attendance[index] : {}), ...data, _id: id, type: 'attendance' };
    if (index >= 0) db.attendance[index] = doc; else db.attendance.push(doc);
    await writeLocal(db);
    return doc;
  }
};

export async function initializeStore() {
  if (cloudEnabled) {
    try {
      await cloudant.putDatabase({ db: dbName });
      console.log(`Created Cloudant database: ${dbName}`);
    } catch (e) {
      if (e.status !== 412) throw e; // 412 means database already exists.
      console.log(`Using existing Cloudant database: ${dbName}`);
    }
    return;
  }
  await ensureLocalFile();
  const db = await readLocal();
  if (db.students.length === 0) {
    db.students = [
      { _id: 'student_demo_1', type: 'student', rollNo: 'AI001', name: 'Aarav Sharma', course: 'CSE AI', semester: 3, email: 'aarav@example.com', createdAt: new Date().toISOString() },
      { _id: 'student_demo_2', type: 'student', rollNo: 'AI002', name: 'Diya Patel', course: 'CSE AI', semester: 3, email: 'diya@example.com', createdAt: new Date().toISOString() },
      { _id: 'student_demo_3', type: 'student', rollNo: 'AI003', name: 'Kabir Verma', course: 'CSE AI', semester: 3, email: 'kabir@example.com', createdAt: new Date().toISOString() },
      { _id: 'student_demo_4', type: 'student', rollNo: 'AI004', name: 'Meera Singh', course: 'CSE AI', semester: 3, email: 'meera@example.com', createdAt: new Date().toISOString() }
    ];
    await writeLocal(db);
  }
}
