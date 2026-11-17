const $ = (id) => document.getElementById(id);
let students = [];
let currentAttendance = [];
let reports = [];
let toastTimer;

const todayISO = () => new Date().toISOString().slice(0, 10);
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials = (name = '') => name.split(/\s+/).slice(0,2).map(x => x[0] || '').join('').toUpperCase();

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) showLogin();
    throw new Error(data?.error || 'Request failed.');
  }
  return data;
}
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2600);
}
function showLogin() {
  $('appView').classList.add('hidden');
  $('loginView').classList.remove('hidden');
}
function showApp(username) {
  $('loginView').classList.add('hidden');
  $('appView').classList.remove('hidden');
  $('storageMode').textContent = username || 'Administrator';
  $('todayLabel').textContent = new Date().toLocaleDateString(undefined, {weekday:'short', day:'numeric', month:'short', year:'numeric'});
  $('attendanceDate').value = todayISO();
  navigate('dashboard');
}
async function checkSession() {
  try {
    const me = await api('/api/me');
    if (me.authenticated) showApp(me.username);
    else showLogin();
  } catch { showLogin(); }
}
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault(); $('loginError').textContent = '';
  try {
    const result = await api('/api/login', { method:'POST', body:JSON.stringify({username:$('username').value, password:$('password').value}) });
    showApp(result.username);
  } catch (err) { $('loginError').textContent = err.message; }
});
$('logoutBtn').addEventListener('click', async () => { await api('/api/logout', {method:'POST'}); showLogin(); });

function navigate(page) {
  document.querySelectorAll('.page').forEach(el => el.classList.add('hidden'));
  $(`${page}Page`).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  const titles = {dashboard:['OVERVIEW','Dashboard'],students:['DIRECTORY','Students'],attendance:['DAILY REGISTER','Attendance'],reports:['ANALYTICS','Reports']};
  $('pageEyebrow').textContent = titles[page][0]; $('pageTitle').textContent = titles[page][1];
  if (page === 'dashboard') loadDashboard();
  if (page === 'students') loadStudents();
  if (page === 'attendance') loadAttendance();
  if (page === 'reports') loadReports();
}
document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.page)));
document.querySelectorAll('[data-go]').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.go)));

async function loadDashboard() {
  try {
    const d = await api('/api/dashboard');
    $('totalStudents').textContent = d.totalStudents;
    $('presentCount').textContent = d.present;
    $('absentCount').textContent = d.absent;
    $('notMarkedCount').textContent = d.notMarked;
    $('todayProgress').textContent = `${d.present + d.absent + d.leave} marked · ${d.leave} on leave`;
  } catch (e) { toast(e.message); }
}
async function loadStudents() {
  try {
    students = await api('/api/students');
    $('studentTotal').textContent = `${students.length} students`;
    renderStudents();
  } catch (e) { toast(e.message); }
}
function renderStudents() {
  const q = $('studentSearch').value.toLowerCase();
  const rows = students.filter(s => `${s.name} ${s.rollNo} ${s.course}`.toLowerCase().includes(q));
  $('studentsTable').innerHTML = rows.map(s => `<tr>
    <td><div class="student-cell"><span class="student-initial">${escapeHtml(initials(s.name))}</span><div><b>${escapeHtml(s.name)}</b><small>${escapeHtml(s.email || 'No email')}</small></div></div></td>
    <td>${escapeHtml(s.rollNo)}</td><td>${escapeHtml(s.course)}</td><td>Semester ${escapeHtml(s.semester)}</td>
    <td><button class="action-btn" data-edit="${escapeHtml(s._id)}">Edit</button><button class="action-btn delete" data-delete="${escapeHtml(s._id)}">Delete</button></td></tr>`).join('') || '<tr><td colspan="5">No students found.</td></tr>';
}
$('studentSearch').addEventListener('input', renderStudents);
$('addStudentBtn').addEventListener('click', () => openStudentDialog());
$('closeDialog').addEventListener('click', () => $('studentDialog').close());
$('cancelDialog').addEventListener('click', () => $('studentDialog').close());
function openStudentDialog(student) {
  $('studentForm').reset(); $('studentFormError').textContent = '';
  $('editId').value = student?._id || '';
  $('dialogTitle').textContent = student ? 'Edit student' : 'Add student';
  $('studentName').value = student?.name || '';
  $('rollNo').value = student?.rollNo || '';
  $('course').value = student?.course || 'CSE AI';
  $('semester').value = student?.semester || 3;
  $('email').value = student?.email || '';
  $('studentDialog').showModal();
}
$('studentsTable').addEventListener('click', async (e) => {
  const edit = e.target.closest('[data-edit]')?.dataset.edit;
  const del = e.target.closest('[data-delete]')?.dataset.delete;
  if (edit) openStudentDialog(students.find(s => s._id === edit));
  if (del && confirm('Delete this student and their attendance history?')) {
    try { await api(`/api/students/${encodeURIComponent(del)}`, {method:'DELETE'}); toast('Student deleted.'); await loadStudents(); }
    catch (err) { toast(err.message); }
  }
});
$('studentForm').addEventListener('submit', async (e) => {
  e.preventDefault(); $('studentFormError').textContent = '';
  const id = $('editId').value;
  const payload = {name:$('studentName').value, rollNo:$('rollNo').value, course:$('course').value, semester:Number($('semester').value), email:$('email').value};
  try {
    await api(id ? `/api/students/${encodeURIComponent(id)}` : '/api/students', {method:id?'PUT':'POST', body:JSON.stringify(payload)});
    $('studentDialog').close(); toast(id ? 'Student updated.' : 'Student added.'); await loadStudents();
  } catch (err) { $('studentFormError').textContent = err.message; }
});

$('attendanceDate').addEventListener('change', loadAttendance);
async function loadAttendance() {
  try {
    currentAttendance = await api(`/api/attendance?date=${encodeURIComponent($('attendanceDate').value || todayISO())}`);
    renderAttendance();
  } catch (e) { toast(e.message); }
}
function renderAttendance() {
  const counts = {Present:0,Absent:0,Leave:0,'Not marked':0};
  currentAttendance.forEach(r => counts[r.status]++);
  $('presentPill').textContent = `${counts.Present} Present`;
  $('absentPill').textContent = `${counts.Absent} Absent`;
  $('leavePill').textContent = `${counts.Leave} Leave`;
  $('pendingPill').textContent = `${counts['Not marked']} Pending`;
  $('attendanceTable').innerHTML = currentAttendance.map(s => `<tr>
    <td><div class="student-cell"><span class="student-initial">${escapeHtml(initials(s.name))}</span><b>${escapeHtml(s.name)}</b></div></td>
    <td>${escapeHtml(s.rollNo)}</td><td><select class="status-select" data-student="${escapeHtml(s.studentId)}">
      ${['Not marked','Present','Absent','Leave'].map(v => `<option ${s.status===v?'selected':''} value="${v}">${v}</option>`).join('')}
    </select></td></tr>`).join('') || '<tr><td colspan="3">Add students first to take attendance.</td></tr>';
}
$('attendanceTable').addEventListener('change', (e) => {
  const id = e.target.dataset.student;
  if (!id) return;
  const row = currentAttendance.find(x => x.studentId === id);
  if (row) row.status = e.target.value;
  renderAttendance();
});
$('saveAllBtn').addEventListener('click', async () => {
  const date = $('attendanceDate').value;
  if (!date) return toast('Choose an attendance date.');
  try {
    const marked = currentAttendance.filter(s => s.status !== 'Not marked');
    for (const s of marked) {
      await api('/api/attendance', {method:'POST', body:JSON.stringify({studentId:s.studentId, date, status:s.status})});
    }
    toast(`Saved ${marked.length} attendance records.`);
    await loadAttendance();
  } catch (e) { toast(e.message); }
});
async function loadReports() {
  try {
    reports = await api('/api/reports');
    $('reportsTable').innerHTML = reports.map(r => `<tr>
      <td><div class="student-cell"><span class="student-initial">${escapeHtml(initials(r.name))}</span><b>${escapeHtml(r.name)}</b></div></td>
      <td>${escapeHtml(r.rollNo)}</td><td>${r.present}</td><td>${r.absent}</td><td>${r.leave}</td>
      <td><b>${r.percentage}%</b></td></tr>`).join('') || '<tr><td colspan="6">No report data yet.</td></tr>';
  } catch (e) { toast(e.message); }
}
$('exportBtn').addEventListener('click', () => {
  const header = ['Name','Roll Number','Course','Present','Absent','Leave','Attendance Percentage'];
  const rows = reports.map(r => [r.name,r.rollNo,r.course,r.present,r.absent,r.leave,`${r.percentage}%`]);
  const csv = [header,...rows].map(row => row.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'attendance-report.csv'; link.click(); URL.revokeObjectURL(link.href);
});
checkSession();
