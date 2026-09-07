(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const playScene = $('#playScene');
  const originalScene = $('[data-scene="original"]');
  const templates = [...playScene.querySelectorAll('.hotspot')];
  const ids = templates.map((spot) => spot.dataset.id);
  const total = ids.length;
  const duration = 120_000;
  const timerEl = $('#timer');
  const hintButton = $('#hintButton');
  const startButton = $('#startButton');
  const restartButton = $('#restartButton');
  const modal = $('#resultModal');
  const soundToggle = $('#soundToggle');
  const background = [$('header'), $('main'), $('footer')];

  // Both pictures share the same five answers and a single score.
  originalScene.classList.add('playable');
  templates.forEach((spot) => originalScene.appendChild(spot.cloneNode(true)));
  const hotspots = [...document.querySelectorAll('.hotspot')];
  const labels = new Map(hotspots.map((spot) => [spot, spot.getAttribute('aria-label')]));
  let found = new Set();
  let hinted = new Set();
  let hints = 2;
  let phase = 'ready';
  let remaining = duration;
  let deadline = 0;
  let timer;
  let toastTimer;
  let soundEnabled = false;
  let audioContext;
  const missTimers = new Set();

  const formatTime = (milliseconds) => {
    const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  };

  function showToast(message) {
    $('#toast').textContent = message;
    $('#toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 1800);
  }

  function playSound(kind) {
    if (!soundEnabled || !audioContext || audioContext.state !== 'running') return;
    const notes = { found: [660, 880], miss: [180], hint: [440, 660], win: [523, 659, 784, 1047], lose: [330, 262] };
    try {
      (notes[kind] || notes.found).forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const start = audioContext.currentTime + index * 0.13;
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.09, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(start);
        oscillator.stop(start + 0.17);
      });
    } catch {
      // A device audio error must never interrupt gameplay.
      soundEnabled = false;
      updateSoundButton();
    }
  }

  function updateSoundButton() {
    soundToggle.setAttribute('aria-pressed', String(soundEnabled));
    soundToggle.setAttribute('aria-label', soundEnabled ? 'ปิดเสียง' : 'เปิดเสียง');
    $('#soundIcon').textContent = soundEnabled ? '♫' : '♪';
    $('.sound-label').textContent = soundEnabled ? 'เสียงเปิด' : 'เสียงปิด';
  }

  soundToggle.addEventListener('click', async () => {
    soundToggle.disabled = true;
    try {
      if (soundEnabled) {
        soundEnabled = false;
        await audioContext.suspend();
      } else {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) throw new Error('Audio is unavailable');
        audioContext ||= new AudioContext();
        await audioContext.resume();
        soundEnabled = audioContext.state === 'running';
        if (!soundEnabled) throw new Error('Audio is suspended');
        playSound('found');
      }
      showToast(soundEnabled ? 'เปิดเสียงแล้ว' : 'ปิดเสียงแล้ว');
    } catch {
      soundEnabled = false;
      showToast('อุปกรณ์นี้เปิดเสียงไม่ได้ แต่ยังเล่นเกมได้ตามปกติ');
    } finally {
      updateSoundButton();
      soundToggle.disabled = false;
    }
  });

  function render() {
    timerEl.textContent = formatTime(remaining);
    timerEl.classList.toggle('urgent', phase === 'playing' && Math.ceil(remaining / 1000) <= 10);
    $('#foundCount').textContent = found.size;
    const percent = Math.round(found.size / total * 100);
    $('#progressText').textContent = `${percent}%`;
    $('#progressBar').style.width = `${percent}%`;
    $('#gameProgress').setAttribute('aria-valuenow', String(found.size));
    $('#hintCount').textContent = hints;
    hintButton.disabled = phase !== 'playing' || hints === 0 || ids.every((id) => found.has(id) || hinted.has(id));
    startButton.textContent = { ready: 'เริ่มเกม', playing: 'หยุดพัก', paused: 'เล่นต่อ', finished: 'เล่นอีกครั้ง' }[phase];
    restartButton.disabled = phase === 'ready';
    const status = {
      ready: 'พร้อมแล้วแตะเริ่มเกม · หาให้ครบ 5 จุดใน 2 นาที',
      playing: 'แตะจุดต่างในภาพใดก็ได้ · ใช้คำใบ้ได้ 2 ครั้ง',
      paused: 'หยุดพักแล้ว · แตะเล่นต่อเมื่อพร้อม',
      finished: 'จบเกมแล้ว · แตะเล่นอีกครั้งเพื่อเริ่มรอบใหม่'
    }[phase];
    if ($('#gameStatus').textContent !== status) $('#gameStatus').textContent = status;
    $('.pictures').dataset.state = phase;
    hotspots.forEach((spot) => {
      const matched = found.has(spot.dataset.id);
      spot.disabled = phase !== 'playing' || matched;
      spot.classList.toggle('found', matched);
      spot.classList.toggle('hint', phase === 'playing' && hinted.has(spot.dataset.id) && !matched);
      spot.classList.toggle('revealed', phase === 'finished' && !matched);
      spot.setAttribute('aria-pressed', String(matched));
      spot.setAttribute('aria-label', `${labels.get(spot)}${matched ? ' พบแล้ว' : ''}`);
    });
  }

  function closeResult() {
    modal.hidden = true;
    background.forEach((element) => { element.inert = false; });
    startButton.focus();
  }

  function endGame(won) {
    if (phase !== 'playing') return;
    phase = 'finished';
    clearInterval(timer);
    render();
    $('#resultIcon').textContent = won ? '🏆' : '⏰';
    $('#resultLabel').textContent = won ? 'พบครบแล้ว!' : 'หมดเวลา';
    $('#resultTitle').textContent = won ? 'เก่งมาก! คุณเจอครบแล้ว' : 'หมดเวลาแล้ว!';
    $('#resultMessage').textContent = won
      ? `พบครบทั้ง ${total} จุด เหลือเวลา ${formatTime(remaining)}`
      : `พบ ${found.size} จาก ${total} จุด ดูวงสีเหลืองเพื่อดูจุดที่เหลือ แล้วลองใหม่ได้เลย`;
    modal.hidden = false;
    background.forEach((element) => { element.inert = true; });
    $('#playAgain').focus();
    playSound(won ? 'win' : 'lose');
  }

  // Recheck the real deadline before every action, including delayed clicks.
  function syncTime() {
    if (phase !== 'playing') return false;
    remaining = Math.max(0, deadline - performance.now());
    if (remaining === 0) {
      endGame(false);
      return false;
    }
    render();
    return true;
  }

  function startGame() {
    if (phase !== 'ready' && phase !== 'paused') return;
    phase = 'playing';
    deadline = performance.now() + remaining;
    clearInterval(timer);
    timer = setInterval(syncTime, 250);
    render();
    if (soundEnabled) audioContext.resume().catch(() => {});
  }

  function pauseGame() {
    if (!syncTime()) return;
    phase = 'paused';
    clearInterval(timer);
    render();
  }

  function resetGame() {
    clearInterval(timer);
    clearTimeout(toastTimer);
    missTimers.forEach((timeout) => clearTimeout(timeout));
    missTimers.clear();
    document.querySelectorAll('.miss').forEach((miss) => miss.remove());
    $('#toast').classList.remove('show');
    found = new Set();
    hinted = new Set();
    hints = 2;
    remaining = duration;
    phase = 'ready';
    closeResult();
    render();
  }

  startButton.addEventListener('click', () => {
    if (phase === 'playing') return pauseGame();
    if (phase === 'finished') resetGame();
    startGame();
  });
  restartButton.addEventListener('click', resetGame);
  $('#playAgain').addEventListener('click', () => { resetGame(); startGame(); });
  $('#closeResult').addEventListener('click', closeResult);

  hotspots.forEach((spot) => spot.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!syncTime() || found.has(spot.dataset.id)) return;
    found.add(spot.dataset.id);
    render();
    if (found.size === total) return endGame(true);
    showToast(`ถูกต้อง! พบแล้ว ${found.size} / ${total} จุด 🎉`);
    playSound('found');
  }));

  [originalScene, playScene].forEach((scene) => scene.addEventListener('click', (event) => {
    if (event.target.closest('.hotspot') || !syncTime()) return;
    const rect = scene.getBoundingClientRect();
    const miss = document.createElement('span');
    miss.className = 'miss';
    miss.setAttribute('aria-hidden', 'true');
    miss.style.left = `${event.clientX - rect.left - scene.clientLeft}px`;
    miss.style.top = `${event.clientY - rect.top - scene.clientTop}px`;
    scene.appendChild(miss);
    const timeout = setTimeout(() => { miss.remove(); missTimers.delete(timeout); }, 700);
    missTimers.add(timeout);
    playSound('miss');
  }));

  hintButton.addEventListener('click', () => {
    if (!syncTime() || hints === 0) return;
    const available = ids.filter((id) => !found.has(id) && !hinted.has(id));
    if (!available.length) return;
    hinted.add(available[Math.floor(Math.random() * available.length)]);
    hints -= 1;
    render();
    showToast('สังเกตวงสีเหลืองที่กะพริบ แล้วแตะจุดต่าง 👀');
    playSound('hint');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && phase === 'playing') pauseGame();
  });
  window.addEventListener('pagehide', () => {
    if (phase === 'playing') pauseGame();
  });
  modal.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); closeResult(); }
    if (event.key === 'Tab') {
      const first = $('#playAgain');
      const last = $('#closeResult');
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  updateSoundButton();
  render();
})();
