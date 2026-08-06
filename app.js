const candidates = [
  { name: 'วีระโชติ พึ่งมานัส', initials: 'วพ', date: '6 ส.ค. 2026', email: 'boyboy21959@gmail.com', phone: '0821471742', line: '260125281105', address: 'จ.นครพนม', branch: 'ขอนแก่น', role: 'ผู้ช่วยผู้จัดการสาขา', status: 'รอพิจารณา', comments: 1 },
  { name: 'ยุทธถรณ์ สุขสงวน', initials: 'ยส', date: '6 ส.ค. 2026', email: 'Syuth2827@gmail.com', phone: '093-645-7827', line: '093-645-7827', address: 'จ.สมุทรปราการ', branch: 'บางพลี', role: 'Fresh Manager', status: 'นัดสัมภาษณ์', resume: 'https://drive.google.com', comments: 2 },
  { name: 'อรอุมา เกิดอนุ', initials: 'อก', date: '6 ส.ค. 2026', email: 'nueng.onuma24@gmail.com', phone: '0885062726', line: '0885062726', address: 'จ.สุราษฎร์ธานี', branch: 'ละไม', role: 'Section Manager - Bakery', status: 'ผ่านการคัดเลือก', resume: 'https://drive.google.com', comments: 2 },
  { name: 'ศศินันท์ พิชัยช่วง', initials: 'ศพ', date: '6 ส.ค. 2026', email: 'Sasinan643@gmail.com', phone: '0829251916', line: 'Sasinan2525', address: 'จ.ขอนแก่น', branch: 'ขอนแก่น', role: 'ผู้ช่วยผู้จัดการสาขา', status: 'รอพิจารณา', resume: 'https://drive.google.com', comments: 0 },
  { name: 'มุจจรินทร์ สุกุมลนันทน์', initials: 'มส', date: '6 ส.ค. 2026', email: 'aum***@gmail.com', phone: '099***6121', line: 'Brio1801', address: 'จ.อุดรธานี', branch: 'อุดรธานี', role: 'Manager - Key Account', status: 'ผ่านการคัดเลือก', resume: 'https://drive.google.com', comments: 2 },
  { name: 'พัชรประภา พรหมพันธ์ใจ', initials: 'พพ', date: '6 ส.ค. 2026', email: 'patcha***@gmail.com', phone: '094***9796', line: '0885617749', address: 'จ.ขอนแก่น', branch: 'ขอนแก่น', role: 'ผู้ช่วยผู้จัดการสาขา', status: 'รอพิจารณา', comments: 1 }
];

const $ = (selector) => document.querySelector(selector);
const grid = $('#candidateGrid');
const search = $('#searchInput');
const branchFilter = $('#branchFilter');
const statusFilter = $('#statusFilter');
const dialog = $('#importDialog');
let importMode = 'url';
let fetchedRows = null;

function escapeHTML(value = '') {
  const node = document.createElement('div');
  node.textContent = value;
  return node.innerHTML;
}

function statusClass(status) {
  if (status === 'ผ่านการคัดเลือก') return 'pass';
  if (status === 'นัดสัมภาษณ์') return 'interview';
  return 'pending';
}

function updateBranches() {
  const current = branchFilter.value;
  [...new Set(candidates.map((candidate) => candidate.branch))].sort().forEach((branch) => {
    if (![...branchFilter.options].some((option) => option.value === branch)) {
      branchFilter.add(new Option(branch, branch));
    }
  });
  branchFilter.value = current;
}

function candidateCard(candidate, index) {
  return `<article class="candidate-card" data-index="${index}" tabindex="0">
    <div class="candidate-head"><div class="avatar">${escapeHTML(candidate.initials)}</div><div><h3>${escapeHTML(candidate.name)}</h3><p>${escapeHTML(candidate.role)}</p></div><button class="more" aria-label="เมนู">⋯</button></div>
    <span class="tag ${statusClass(candidate.status)}">●&nbsp; ${escapeHTML(candidate.status)}</span>
    <div class="candidate-info"><span><i>⌂</i>${escapeHTML(candidate.branch)}</span><span><i>✉</i>${escapeHTML(candidate.email)}</span><span><i>⌕</i>${escapeHTML(candidate.phone)}</span></div>
    <div class="candidate-foot"><span>สมัครเมื่อ ${escapeHTML(candidate.date)}</span><span class="comment-pill">▢ ${candidate.comments} ความคิดเห็น</span></div>
  </article>`;
}

function render() {
  const query = search.value.trim().toLowerCase();
  const filtered = candidates.map((candidate, index) => ({ ...candidate, originalIndex: index })).filter((candidate) =>
    (!query || `${candidate.name} ${candidate.email} ${candidate.role}`.toLowerCase().includes(query)) &&
    (!branchFilter.value || candidate.branch === branchFilter.value) &&
    (!statusFilter.value || candidate.status === statusFilter.value));
  grid.innerHTML = filtered.map((candidate) => candidateCard(candidate, candidate.originalIndex)).join('');
  $('#resultCount').textContent = filtered.length;
  $('#emptyState').hidden = filtered.length !== 0;
  $('#totalCount').textContent = candidates.length;
  $('#navCount').textContent = candidates.length;
  $('#pendingCount').textContent = candidates.filter((candidate) => candidate.status === 'รอพิจารณา').length;
  document.querySelectorAll('.candidate-card').forEach((card) => {
    const open = () => openDrawer(candidates[Number(card.dataset.index)]);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (event) => event.key === 'Enter' && open());
  });
}

function openDrawer(candidate) {
  $('#resumeContent').innerHTML = `<div class="resume-header"><div class="avatar">${escapeHTML(candidate.initials)}</div><h2>${escapeHTML(candidate.name)}</h2><p>${escapeHTML(candidate.role)} · ${escapeHTML(candidate.branch)}</p><span class="tag ${statusClass(candidate.status)}">●&nbsp; ${escapeHTML(candidate.status)}</span></div>
    <section class="resume-section"><h4>ข้อมูลติดต่อ</h4><div class="detail-grid"><div><span>อีเมล</span><p>${escapeHTML(candidate.email)}</p></div><div><span>โทรศัพท์</span><p>${escapeHTML(candidate.phone)}</p></div><div><span>LINE ID</span><p>${escapeHTML(candidate.line)}</p></div><div><span>ที่อยู่</span><p>${escapeHTML(candidate.address)}</p></div></div></section>
    <section class="resume-section"><h4>เอกสารประกอบ</h4><a class="resume-link" href="${candidate.resume || '#'}" target="_blank" rel="noopener">▤ ${candidate.resume ? 'เปิด Resume ต้นฉบับ' : 'ยังไม่มี Resume แนบมา'}</a></section>
    <section class="comments"><h3>ความคิดเห็น (${candidate.comments})</h3><div id="commentList">${candidate.comments ? '<div class="comment"><time>วันนี้ 10:42</time><strong>นันทิยา พรหมดี</strong>ประสบการณ์ตรงกับตำแหน่ง แนะนำให้ติดต่อเพื่อนัดสัมภาษณ์</div>' : '<p class="subtitle">ยังไม่มีความคิดเห็น เป็นคนแรกที่แสดงความคิดเห็น</p>'}</div><form class="comment-form" id="commentForm"><input placeholder="เขียนความคิดเห็น..." required><button>ส่ง</button></form></section>`;
  $('#resumeDrawer').classList.add('open');
  $('#resumeDrawer').setAttribute('aria-hidden', 'false');
  $('#drawerOverlay').hidden = false;
  $('#commentForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = event.target.querySelector('input');
    $('#commentList').insertAdjacentHTML('beforeend', `<div class="comment"><time>เมื่อสักครู่</time><strong>นันทิยา พรหมดี</strong>${escapeHTML(input.value)}</div>`);
    input.value = '';
    candidate.comments += 1;
    $('#commentCount').textContent = candidates.reduce((count, item) => count + item.comments, 0);
    render();
  });
}

function closeDrawer() {
  $('#resumeDrawer').classList.remove('open');
  $('#resumeDrawer').setAttribute('aria-hidden', 'true');
  $('#drawerOverlay').hidden = true;
}

// Supports quoted cells, embedded commas and newlines from Google Sheets CSV export.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((item) => item.some((value) => value.trim()));
}

function parseTSV(text) {
  return text.trim().split(/\n(?=\d{1,2}\/\d{1,2}\/\d{4})/).map((row) => row.split('\t'));
}

function normalizeHeader(value) {
  return value.toLowerCase().replace(/[–—\s|:()]/g, '');
}

function findColumn(headers, aliases, fallback) {
  const index = headers.findIndex((header) => aliases.some((alias) => header.includes(alias)));
  return index >= 0 ? index : fallback;
}

function rowsToCandidates(rows) {
  if (rows.length < 2) return [];
  const normalized = rows[0].map(normalizeHeader);
  const columns = {
    timestamp: findColumn(normalized, ['ประทับเวลา', 'timestamp'], 0),
    name: findColumn(normalized, ['ชื่อนามสกุล', 'fullname', 'ชื่อ'], 1),
    email: findColumn(normalized, ['อีเมล', 'email'], 3),
    phone: findColumn(normalized, ['เบอร์โทรศัพท์', 'โทรศัพท์', 'phone'], 4),
    line: findColumn(normalized, ['lineid', 'ไลน์'], 5),
    address: findColumn(normalized, ['ที่อยู่ปัจจุบัน', 'address'], 6),
    resume: findColumn(normalized, ['uploadresume', 'resume'], 7),
    position: findColumn(normalized, ['สาขาและตำแหน่ง', 'ตำแหน่งงาน', 'position'], 8)
  };
  return rows.slice(1).filter((row) => row[columns.name]?.trim()).map((row) => {
    const name = row[columns.name].trim();
    const position = row[columns.position]?.trim() || 'ไม่ระบุตำแหน่ง';
    const parts = position.split('|');
    const branchText = parts[0].replace(/^\s*\d{6}\s*:?[\s]*/, '').trim();
    return {
      name,
      initials: name.replace(/นาย|นางสาว|นาง|น\.ส\./g, '').trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join(''),
      date: (row[columns.timestamp] || '').split(',')[0],
      email: row[columns.email]?.trim() || '-',
      phone: row[columns.phone]?.trim() || '-',
      line: row[columns.line]?.trim() || '-',
      address: row[columns.address]?.trim() || '-',
      resume: row[columns.resume]?.trim() || '',
      branch: branchText || 'ไม่ระบุ',
      role: parts.length > 1 ? parts.slice(1).join('|').trim() : position.replace(/^\s*\d{6}\s+\S+\s*/, '').trim(),
      status: 'รอพิจารณา', comments: 0
    };
  });
}

function googleSheetCSVUrl(input) {
  const match = input.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error('กรุณาใส่ลิงก์ Google Sheets ที่ถูกต้อง');
  const gid = new URL(input).searchParams.get('gid') || '0';
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`;
}

function setConnectionStatus(message, type = '') {
  const status = $('#connectionStatus');
  status.hidden = false;
  status.className = `connection-status ${type}`;
  status.textContent = message;
}

async function fetchGoogleSheet(silent = false) {
  try {
    const url = $('#sheetUrl').value.trim();
    if (!silent) setConnectionStatus('กำลังอ่านข้อมูลจาก Google Sheets…', 'loading');
    const response = await fetch(googleSheetCSVUrl(url));
    if (!response.ok) throw new Error('ไม่สามารถเปิดชีตได้ กรุณาตรวจสอบสิทธิ์การแชร์');
    fetchedRows = parseCSV(await response.text());
    const parsed = rowsToCandidates(fetchedRows);
    if (!parsed.length) throw new Error('ไม่พบข้อมูลผู้สมัคร หรือชื่อคอลัมน์ไม่ตรงกับ Google Form');
    setConnectionStatus(`เชื่อมต่อสำเร็จ พบผู้สมัคร ${parsed.length} รายการ ✓`);
    return parsed;
  } catch (error) {
    fetchedRows = null;
    setConnectionStatus(error.message, 'error');
    if (silent) localStorage.removeItem('sectioncvSheetUrl');
    return [];
  }
}

function addImported(imported) {
  const existing = new Set(candidates.map((item) => `${item.email}|${item.role}`.toLowerCase()));
  const unique = imported.filter((item) => !existing.has(`${item.email}|${item.role}`.toLowerCase()));
  candidates.unshift(...unique);
  updateBranches();
  render();
  return unique.length;
}

function selectImportTab(mode) {
  importMode = mode;
  $('#urlPanel').hidden = mode !== 'url';
  $('#pastePanel').hidden = mode !== 'paste';
  $('#urlTab').classList.toggle('active', mode === 'url');
  $('#pasteTab').classList.toggle('active', mode === 'paste');
  $('#urlTab').setAttribute('aria-selected', mode === 'url');
  $('#pasteTab').setAttribute('aria-selected', mode === 'paste');
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

[search, branchFilter, statusFilter].forEach((element) => element.addEventListener('input', render));
$('#gridView').addEventListener('click', () => { grid.classList.remove('list-mode'); $('#gridView').classList.add('active'); $('#listView').classList.remove('active'); });
$('#listView').addEventListener('click', () => { grid.classList.add('list-mode'); $('#listView').classList.add('active'); $('#gridView').classList.remove('active'); });
$('#drawerClose').addEventListener('click', closeDrawer);
$('#drawerOverlay').addEventListener('click', closeDrawer);
document.querySelectorAll('#importOpen,#importTop').forEach((button) => button.addEventListener('click', () => dialog.showModal()));
$('#urlTab').addEventListener('click', () => selectImportTab('url'));
$('#pasteTab').addEventListener('click', () => selectImportTab('paste'));
$('#connectSheet').addEventListener('click', () => fetchGoogleSheet());
$('#importConfirm').addEventListener('click', async () => {
  let imported;
  if (importMode === 'url') {
    imported = fetchedRows ? rowsToCandidates(fetchedRows) : await fetchGoogleSheet();
    if (!imported.length) return;
    if ($('#rememberSheet').checked) localStorage.setItem('sectioncvSheetUrl', $('#sheetUrl').value.trim());
    else localStorage.removeItem('sectioncvSheetUrl');
  } else {
    const text = $('#importData').value.trim();
    if (!text) { showToast('กรุณาวางข้อมูลก่อนนำเข้า'); return; }
    imported = rowsToCandidates(parseTSV(text));
  }
  const added = addImported(imported);
  dialog.close();
  showToast(`นำเข้าสำเร็จ ${added} รายการ${added < imported.length ? ' (ข้ามรายการซ้ำแล้ว)' : ''}`);
});

updateBranches();
render();
const savedSheet = localStorage.getItem('sectioncvSheetUrl');
if (savedSheet) {
  $('#sheetUrl').value = savedSheet;
  fetchGoogleSheet(true).then((imported) => {
    if (imported.length) {
      const added = addImported(imported);
      if (added) showToast(`ซิงก์จาก Google Form แล้ว ${added} รายการ`);
    }
  });
}
