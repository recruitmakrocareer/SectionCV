(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const levels = window.MAKRO_LEVELS;
  const playScene = $('#playScene');
  const originalScene = $('[data-scene="original"]');
  const pictures = $('.pictures');
  const originalImage = $('#originalImage');
  const comparisonImage = $('#comparisonImage');
  const differenceImage = $('#differenceImage');
  const duration = 120_000;
  const timerEl = $('#timer');
  const hintButton = $('#hintButton');
  const startButton = $('#startButton');
  const restartButton = $('#restartButton');
  const modal = $('#resultModal');
  const soundToggle = $('#soundToggle');
  const background = [$('header'), $('main'), $('footer')];
  const completed = Array(levels.length).fill(null);
  const missTimers = new Set();
  let levelIndex = 0;
  let level = levels[0];
  let ids = [];
  let hotspots = [];
  let found = new Set();
  let hinted = new Set();
  let hints = 2;
  let phase = 'loading';
  let remaining = duration;
  let deadline = 0;
  let timer;
  let toastTimer;
  let loadGeneration = 0;
  let roundWon = false;
  let soundEnabled = false;
  let audioContext;
  const preloaded = new Map();

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

  function nextActionLabel() {
    if (!roundWon) return 'ลองด่านนี้อีกครั้ง';
    return levelIndex < levels.length - 1 ? `ไปด่านที่ ${levelIndex + 2}` : 'เริ่มใหม่ทั้ง 3 ด่าน';
  }

  function render() {
    timerEl.textContent = formatTime(remaining);
    timerEl.classList.toggle('urgent', phase === 'playing' && Math.ceil(remaining / 1000) <= 10);
    $('#foundCount').textContent = found.size;
    const percent = Math.round(found.size / Math.max(1, ids.length) * 100);
    $('#progressText').textContent = `${percent}%`;
    $('#progressBar').style.width = `${percent}%`;
    $('#gameProgress').setAttribute('aria-valuenow', String(found.size));
    $('#hintCount').textContent = hints;
    hintButton.disabled = phase !== 'playing' || hints === 0 || ids.every((id) => found.has(id) || hinted.has(id));
    startButton.textContent = {
      loading: 'กำลังโหลดภาพ…', error: 'ลองโหลดภาพอีกครั้ง', ready: `เริ่มด่านที่ ${levelIndex + 1}`,
      playing: 'หยุดพัก', paused: 'เล่นต่อ', finished: nextActionLabel()
    }[phase];
    startButton.disabled = phase === 'loading';
    restartButton.disabled = ['loading', 'error', 'ready'].includes(phase);
    const status = {
      loading: `กำลังเตรียมภาพด่านที่ ${levelIndex + 1}…`,
      error: 'โหลดภาพไม่สำเร็จ ตรวจการเชื่อมต่อแล้วแตะลองโหลดภาพอีกครั้ง',
      ready: `ด่านที่ ${levelIndex + 1} / ${levels.length} · พร้อมแล้วแตะเริ่มด่าน · 5 จุดใน 2 นาที`,
      playing: 'แตะจุดต่างในภาพใดก็ได้ · คำใบ้ 2 ครั้งต่อด่าน',
      paused: 'หยุดพักแล้ว · แตะเล่นต่อเมื่อพร้อม',
      finished: roundWon ? (levelIndex === levels.length - 1 ? 'ผ่านครบทั้ง 3 ด่านแล้ว!' : `ผ่านด่านที่ ${levelIndex + 1} แล้ว · ไปต่อด่านถัดไปได้เลย`) : 'หมดเวลาแล้ว · ลองด่านนี้ใหม่ได้เลย'
    }[phase];
    if ($('#gameStatus').textContent !== status) $('#gameStatus').textContent = status;
    pictures.dataset.state = phase;
    pictures.setAttribute('aria-busy', String(phase === 'loading'));
    $('#levelLabel').textContent = `ด่านที่ ${levelIndex + 1} / ${levels.length}`;
    $('#levelTitle').textContent = level.title;
    [...$('#levelTracker').children].forEach((item, index) => {
      item.classList.toggle('current', index === levelIndex);
      item.classList.toggle('completed', completed[index] !== null);
      if (index === levelIndex) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
      item.querySelector('b').textContent = completed[index] !== null ? '✓' : index + 1;
    });
    hotspots.forEach((spot) => {
      const matched = found.has(spot.dataset.id);
      spot.disabled = phase !== 'playing' || matched;
      spot.classList.toggle('found', matched);
      spot.classList.toggle('hint', phase === 'playing' && hinted.has(spot.dataset.id) && !matched);
      spot.classList.toggle('revealed', phase === 'finished' && !matched);
      spot.setAttribute('aria-pressed', String(matched));
      spot.setAttribute('aria-label', `${spot.dataset.label}${matched ? ' พบแล้ว' : ''}`);
    });
  }

  function closeResult() {
    modal.hidden = true;
    background.forEach((element) => { element.inert = false; });
    if (!startButton.disabled) startButton.focus();
  }

  function endGame(won) {
    if (phase !== 'playing') return;
    phase = 'finished';
    roundWon = won;
    clearInterval(timer);
    if (won) completed[levelIndex] = duration - remaining;
    const finishedAll = completed.every((elapsed) => elapsed !== null);
    render();
    $('#resultIcon').textContent = won ? '🏆' : '⏰';
    $('#resultLabel').textContent = finishedAll ? 'สำเร็จทั้ง 3 ด่าน' : won ? `ผ่านด่านที่ ${levelIndex + 1}` : 'หมดเวลา';
    $('#resultTitle').textContent = finishedAll ? 'สุดยอด! พบครบทั้ง 15 จุด' : won ? 'เก่งมาก! เจอครบ 5 จุดแล้ว' : 'ลองอีกครั้งนะ!';
    $('#resultMessage').textContent = finishedAll
      ? `ผ่านครบ ${levels.length} ด่าน ใช้เวลารวม ${formatTime(completed.reduce((sum, elapsed) => sum + elapsed, 0))}`
      : won
        ? `เหลือเวลา ${formatTime(remaining)} · ด่านถัดไป: ${levels[levelIndex + 1].title}`
        : `พบ ${found.size} จาก ${ids.length} จุด วงสีเหลืองแสดงจุดที่เหลือ ลองด่านนี้อีกครั้งได้โดยไม่ต้องกลับไปด่านแรก`;
    $('#playAgain').textContent = nextActionLabel();
    modal.hidden = false;
    background.forEach((element) => { element.inert = true; });
    $('#playAgain').focus();
    playSound(won ? 'win' : 'lose');
  }

  function syncTime() {
    if (phase !== 'playing') return false;
    remaining = Math.max(0, deadline - performance.now());
    if (remaining === 0) { endGame(false); return false; }
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
    // Fetch the next scene only after play starts; current photos take priority.
    const next = levels[levelIndex + 1];
    if (next) [next.original, next.edited].forEach((src) => {
      if (preloaded.has(src)) return;
      const image = new Image();
      image.src = src;
      preloaded.set(src, image);
    });
  }

  function pauseGame() {
    if (!syncTime()) return;
    phase = 'paused';
    clearInterval(timer);
    render();
  }

  function clearRound() {
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
    roundWon = false;
  }

  function resetRound() {
    if (phase === 'loading' || phase === 'error') return;
    clearRound();
    completed[levelIndex] = null;
    phase = 'ready';
    render();
    closeResult();
  }

  function waitForImage(image, src) {
    return new Promise((resolve, reject) => {
      const finish = () => {
        image.onload = null;
        image.onerror = null;
        if (!image.naturalWidth || !image.naturalHeight) return reject(new Error('Invalid image'));
        resolve();
      };
      image.onload = finish;
      image.onerror = () => { image.onload = null; image.onerror = null; reject(new Error('Image could not load')); };
      image.src = src;
      if (image.complete && image.naturalWidth) finish();
    });
  }

  function createHotspots() {
    hotspots.forEach((spot) => spot.remove());
    hotspots = [];
    ids = level.differences.map((difference) => difference.id);
    [originalScene, playScene].forEach((scene) => {
      level.differences.forEach((difference, index) => {
        const spot = document.createElement('button');
        spot.className = 'hotspot';
        spot.type = 'button';
        spot.dataset.id = difference.id;
        spot.dataset.label = `จุดแตกต่างที่ ${index + 1}`;
        spot.style.setProperty('--x', `${difference.x}%`);
        spot.style.setProperty('--y', `${difference.y}%`);
        spot.style.setProperty('--size', `${difference.targetSize || Math.max(6, difference.width * 0.7)}%`);
        spot.disabled = true;
        spot.addEventListener('click', (event) => {
          event.stopPropagation();
          if (!syncTime() || found.has(spot.dataset.id)) return;
          found.add(spot.dataset.id);
          render();
          if (found.size === ids.length) return endGame(true);
          showToast(`ถูกต้อง! พบแล้ว ${found.size} / ${ids.length} จุด 🎉`);
          playSound('found');
        });
        scene.appendChild(spot);
        hotspots.push(spot);
      });
    });
  }

  function loadLevel(index, autoStart = false) {
    const generation = ++loadGeneration;
    clearRound();
    closeResult();
    levelIndex = index;
    level = levels[index];
    phase = 'loading';
    createHotspots();
    [originalImage, comparisonImage, differenceImage].forEach((image) => {
      image.width = level.width;
      image.height = level.height;
    });
    pictures.style.setProperty('--photo-aspect', `${level.width} / ${level.height}`);
    originalImage.alt = `ภาพเสมือนจริง ${level.title}`;
    comparisonImage.alt = `ภาพเปรียบเทียบ ${level.title} มีจุดแตกต่าง 5 จุด`;
    // Both panels use the SAME original photograph. Only the five authored
    // regions show the edited photograph, avoiding incidental AI changes elsewhere.
    const mask = level.differences.map((difference) =>
      `radial-gradient(ellipse ${difference.width / 2}% ${difference.height / 2}% at ${difference.x}% ${difference.y}%, #000 76%, transparent 100%)`
    ).join(', ');
    differenceImage.style.maskImage = mask;
    differenceImage.style.webkitMaskImage = mask;
    render();
    return Promise.all([
      waitForImage(originalImage, level.original),
      waitForImage(comparisonImage, level.original),
      waitForImage(differenceImage, level.edited)
    ]).then(() => {
      if (generation !== loadGeneration || phase !== 'loading') return;
      if ([originalImage, comparisonImage, differenceImage].some((image) => image.naturalWidth !== level.width || image.naturalHeight !== level.height)) {
        throw new Error('The photo dimensions do not match the answer coordinates');
      }
      phase = 'ready';
      render();
      if (autoStart && !document.hidden) startGame();
    }).catch(() => {
      if (generation !== loadGeneration) return;
      phase = 'error';
      render();
    });
  }

  function proceed() {
    if (phase !== 'finished') return;
    if (roundWon && levelIndex < levels.length - 1) return loadLevel(levelIndex + 1, true);
    if (roundWon) {
      completed.fill(null);
      return loadLevel(0, true);
    }
    resetRound();
    startGame();
  }

  startButton.addEventListener('click', () => {
    if (phase === 'error') return loadLevel(levelIndex);
    if (phase === 'playing') return pauseGame();
    if (phase === 'finished') return proceed();
    startGame();
  });
  restartButton.addEventListener('click', resetRound);
  $('#playAgain').addEventListener('click', proceed);
  $('#closeResult').addEventListener('click', closeResult);

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

  levels.forEach((entry, index) => {
    const item = document.createElement('li');
    const number = document.createElement('b');
    const name = document.createElement('span');
    number.textContent = index + 1;
    name.textContent = entry.shortTitle;
    item.append(number, name);
    $('#levelTracker').appendChild(item);
  });
  updateSoundButton();
  loadLevel(0);
})();
