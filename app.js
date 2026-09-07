const hotspots = [...document.querySelectorAll('.hotspot')];
const playScene = document.querySelector('#playScene');
const timerEl = document.querySelector('#timer');
const foundEl = document.querySelector('#foundCount');
const progressBar = document.querySelector('#progressBar');
const progressText = document.querySelector('#progressText');
const hintButton = document.querySelector('#hintButton');
const hintCountEl = document.querySelector('#hintCount');
const modal = document.querySelector('#resultModal');
const toast = document.querySelector('#toast');
let found = new Set();
let hints = 2;
let seconds = 120;
let finished = false;
let timer;

function formatTime(value) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove('show'), 1800);
}

function updateScore() {
  const count = found.size;
  const percent = count * 20;
  foundEl.textContent = count;
  progressText.textContent = `${percent}%`;
  progressBar.style.width = `${percent}%`;
  if (count === hotspots.length) endGame(true);
}

function endGame(won) {
  finished = true;
  clearInterval(timer);
  document.querySelector('#resultTitle').textContent = won ? 'เก่งมาก! คุณเจอครบแล้ว' : 'หมดเวลาแล้ว!';
  document.querySelector('#resultMessage').textContent = won
    ? `คุณตามหาจุดแตกต่างครบทั้ง 5 จุด โดยเหลือเวลา ${formatTime(seconds)}`
    : `คุณเจอ ${found.size} จาก 5 จุด ลองอีกครั้งนะ`;
  setTimeout(() => { modal.hidden = false; }, 350);
}

function startTimer() {
  clearInterval(timer);
  timer = setInterval(() => {
    if (finished) return;
    seconds -= 1;
    timerEl.textContent = formatTime(seconds);
    if (seconds <= 10) timerEl.style.color = '#d7192d';
    if (seconds <= 0) endGame(false);
  }, 1000);
}

hotspots.forEach((spot) => {
  spot.addEventListener('click', (event) => {
    event.stopPropagation();
    if (finished || found.has(spot.dataset.id)) return;
    found.add(spot.dataset.id);
    spot.classList.remove('hint');
    spot.classList.add('found');
    spot.setAttribute('aria-label', `${spot.getAttribute('aria-label')} พบแล้ว`);
    showToast('ถูกต้อง! พบ 1 จุดแล้ว 🎉');
    updateScore();
  });
});

playScene.addEventListener('click', (event) => {
  if (finished || event.target.closest('.hotspot')) return;
  const rect = playScene.getBoundingClientRect();
  const miss = document.createElement('span');
  miss.className = 'miss';
  miss.style.left = `${event.clientX - rect.left}px`;
  miss.style.top = `${event.clientY - rect.top}px`;
  playScene.appendChild(miss);
  setTimeout(() => miss.remove(), 700);
});

hintButton.addEventListener('click', () => {
  if (!hints || finished) return;
  const available = hotspots.filter((spot) => !found.has(spot.dataset.id));
  if (!available.length) return;
  hotspots.forEach((spot) => spot.classList.remove('hint'));
  available[Math.floor(Math.random() * available.length)].classList.add('hint');
  hints -= 1;
  hintCountEl.textContent = hints;
  if (!hints) hintButton.disabled = true;
  showToast('สังเกตบริเวณที่กำลังกะพริบ 👀');
});

document.querySelector('#soundToggle').addEventListener('click', (event) => {
  const button = event.currentTarget;
  const enabled = button.getAttribute('aria-pressed') === 'true';
  button.setAttribute('aria-pressed', String(!enabled));
  document.querySelector('#soundIcon').textContent = enabled ? '♪' : '♫';
  showToast(enabled ? 'ปิดเสียงแล้ว' : 'เปิดเสียงแล้ว');
});

document.querySelector('#playAgain').addEventListener('click', () => {
  found = new Set();
  hints = 2;
  seconds = 120;
  finished = false;
  hotspots.forEach((spot) => spot.classList.remove('found', 'hint'));
  hintCountEl.textContent = hints;
  hintButton.disabled = false;
  timerEl.textContent = formatTime(seconds);
  timerEl.style.color = '';
  modal.hidden = true;
  updateScore();
  startTimer();
});

startTimer();
