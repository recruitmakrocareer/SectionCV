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
  const duration = 90_000;
  const timerEl = $('#timer');
  const hintButton = $('#hintButton');
  const startButton = $('#startButton');
  const restartButton = $('#restartButton');
  const modal = $('#resultModal');
  const startModal = $('#startModal');
  const popupStartButton = $('#popupStartButton');
  const account = window.MAKRO_ACCOUNT;
  const penaltyMs = 5000;
  const completedMisses = Array(levels.length).fill(0);
  const completedFound = Array(levels.length).fill(0);
  let misses = 0;
  let starting = false;
  let campaignStarted = false;
  let ranked = false;
  let savingScore = false;
  let confirmedScore = null;
  let resultGeneration = 0;
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
  let transitionTimer;
  let transitionCountTimer;
  let toastTimer;
  let loadGeneration = 0;
  let soundEnabled = false;
  let audioContext;
  const preloaded = new Map();

  const formatTime = (milliseconds) => {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  };

  const formatScore = (ms) => {
    const n = Math.max(0, Math.round(ms / 10));
    return `${String(Math.floor(n / 6000)).padStart(2, '0')}:${String(Math.floor(n / 100) % 60).padStart(2, '0')}.${String(n % 100).padStart(2, '0')}`;
  };
  const totalMisses = () => completedMisses.reduce((sum, n) => sum + n, 0) + (completed[levelIndex] === null ? misses : 0);
  const totalFound = () => completedFound.reduce((sum, n) => sum + n, 0) + (completed[levelIndex] === null ? found.size : 0);
  const score = () => confirmedScore ?? (completed.reduce((sum, n) => sum + (n || 0), 0) + (completed[levelIndex] === null ? duration - remaining : 0) + totalMisses() * penaltyMs);
  function syncBackground() {
    background.forEach((element) => { element.inert = !modal.hidden || !startModal.hidden; });
  }
  function openStart() {
    modal.hidden = true;
    startModal.hidden = false;
    syncBackground();
    render();
    if (!popupStartButton.disabled) popupStartButton.focus();
  }
  function closeStart() { startModal.hidden = true; syncBackground(); }
  function record(type, data) {
    if (!ranked) return;
    account.event(type, { level: levelIndex, ...data }).catch(() => {
      showToast('การเชื่อมต่อสะดุด กำลังเก็บรายการที่รอส่งไว้ในรอบนี้');
    });
  }
  async function saveScore() {
    if (savingScore) return;
    const generation = resultGeneration;
    $('#retryScore').hidden = true;
    if (!ranked) { $('#saveScoreStatus').textContent = 'โหมดฝึกซ้อม · ไม่บันทึกอันดับ'; return; }
    savingScore = true;
    render();
    $('#saveScoreStatus').textContent = 'กำลังบันทึกสถิติ… กรุณาอย่าเพิ่งปิดหน้านี้';
    try {
      const result = await account.saveResult();
      if (generation !== resultGeneration) return;
      confirmedScore = result.scoreMs;
      if (result.stages) result.stages.forEach((stage) => {
        completed[stage.level] = stage.elapsedMs; completedFound[stage.level] = stage.foundCount; completedMisses[stage.level] = stage.misses;
      });
      renderResultMetrics(result.stages);
      $('#resultRank').textContent = result.rank ? `#${result.rank}` : '—';
      $('#saveScoreStatus').textContent = `บันทึกแล้ว · เวลาจัดอันดับ ${formatScore(result.scoreMs)}${result.rank ? ` · อันดับที่ ${result.rank}` : ''}`;
      $('#scoreTime').textContent = formatScore(result.scoreMs);
    } catch (error) {
      if (generation !== resultGeneration) return;
      $('#saveScoreStatus').textContent = `ยังบันทึกสถิติไม่สำเร็จ: ${error.message}`;
      $('#retryScore').hidden = false;
    } finally {
      if (generation === resultGeneration) { savingScore = false; render(); }
    }
  }

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
    return 'เล่นใหม่ทั้ง 3 ด่าน';
  }

  function render() {
    $('#scoreTime').textContent = formatScore(score());
    $('#penaltySummary').textContent = `กดผิด ${totalMisses()} ครั้ง · +${totalMisses() * 5} วินาที`;
    timerEl.textContent = formatTime(remaining);
    $('#timerTenths').textContent = `.${Math.floor(Math.max(0, remaining) % 1000 / 100)}`;
    $('#countdownBar').style.transform = `scaleX(${Math.max(0, remaining / duration)})`;
    $('#countdownHud').dataset.urgency = remaining <= 10000 ? 'critical' : remaining <= 30000 ? 'warning' : 'normal';
    $('#countdownHud').dataset.running = String(phase === 'playing');
    $('#countdownLabel').textContent = phase === 'transition' ? 'กำลังไปภาพถัดไป' : phase === 'playing' && remaining <= 10000 ? '10 วินาทีสุดท้าย!' : 'เวลาที่เหลือ';
    $('#hudLevel').textContent = `ด่าน ${levelIndex + 1} / 3`;
    $('#totalFoundLabel').textContent = `รวม ${totalFound()} / 15 จุด`;
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
      playing: 'กำลังเล่น', transition: 'กำลังไปด่านถัดไป…', finished: nextActionLabel()
    }[phase];
    startButton.disabled = ['loading', 'playing', 'transition'].includes(phase) || starting || savingScore;
    startButton.hidden = ['loading', 'error'].includes(phase);
    popupStartButton.disabled = starting || savingScore || ['loading', 'playing', 'transition'].includes(phase) || (account && !account.canPlay());
    popupStartButton.textContent = starting ? 'กำลังเตรียมเกม…' : phase === 'loading' ? 'กำลังโหลดภาพ…' : phase === 'error' ? 'ลองโหลดภาพอีกครั้ง' : phase === 'paused' ? 'เล่นต่อ' : phase === 'finished' ? nextActionLabel() : account?.state.lineReady ? `เริ่มเกม · ด่านที่ ${levelIndex + 1}` : `เริ่มเกมฝึกซ้อม · ด่านที่ ${levelIndex + 1}`;
    restartButton.textContent = 'เริ่มใหม่ทั้ง 3 ด่าน';
    restartButton.disabled = starting || savingScore || ['loading', 'error', 'ready', 'transition'].includes(phase);
    $('#accountButton').disabled = starting || ['playing', 'transition'].includes(phase);
    $('#playAgain').disabled = starting || savingScore;
    $('#startViewStats').disabled = starting;
    const status = {
      loading: `กำลังเตรียมภาพด่านที่ ${levelIndex + 1}…`,
      error: 'โหลดภาพไม่สำเร็จ ตรวจการเชื่อมต่อแล้วแตะลองโหลดภาพอีกครั้ง',
      ready: `ด่านที่ ${levelIndex + 1} / ${levels.length} · 5 จุดใน 1 นาที 30 วินาที`,
      playing: 'กดผิด +5 วินาทีในเวลาจัดอันดับ · คำใบ้ 2 ครั้งต่อด่าน',
      transition: 'จบด่านแล้ว · กำลังไปภาพถัดไปอัตโนมัติ',
      finished: 'จบทั้ง 3 ภาพแล้ว! ดูผลงานและอันดับของคุณได้เลย'
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
      item.querySelector('b').textContent = completed[index] !== null ? `${completedFound[index]}/5` : index + 1;
    });
    hotspots.forEach((spot) => {
      const matched = found.has(spot.dataset.id);
      spot.disabled = phase !== 'playing' || matched;
      spot.classList.toggle('found', matched);
      spot.classList.toggle('hint', phase === 'playing' && hinted.has(spot.dataset.id) && !matched);
      spot.classList.toggle('revealed', ['transition', 'finished'].includes(phase) && !matched);
      spot.setAttribute('aria-pressed', String(matched));
      spot.setAttribute('aria-label', `${spot.dataset.label}${matched ? ' พบแล้ว' : ''}`);
    });
  }

  function closeResult() {
    modal.hidden = true;
    syncBackground();
    if (!startButton.disabled) startButton.focus();
  }

  function renderResultMetrics(stages) {
    $('#resultTitle').textContent = totalFound() === 15 ? 'สุดยอด! เจอครบทั้ง 15 จุด' : 'จบชาเลนจ์ทั้ง 3 ด่านแล้ว!';
    $('#resultFound').textContent = `${totalFound()} / 15`;
    $('#resultTime').textContent = formatScore(score());
    $('#resultMisses').textContent = `${totalMisses()} ครั้ง`;
    $('#resultMessage').textContent = `เวลาที่ใช้ ${formatScore(completed.reduce((sum, elapsed) => sum + (elapsed || 0), 0))} + โทษกดผิด ${totalMisses() * 5} วินาที`;
    $('#resultStages').replaceChildren();
    levels.forEach((entry, index) => {
      const item = document.createElement('li');
      const title = document.createElement('span'); title.textContent = `ด่าน ${index + 1} · ${entry.shortTitle}`;
      const value = document.createElement('strong'); value.textContent = `${completedFound[index]} / 5 จุด`;
      const detail = document.createElement('small');
      detail.textContent = `${formatScore(completed[index] || 0)} · ${(stages?.[index]?.timedOut ?? completedFound[index] < 5) ? 'หมดเวลา' : 'พบครบ'}`;
      item.append(title, value, detail); $('#resultStages').appendChild(item);
    });
  }

  function endGame(won) {
    if (phase !== 'playing') return;
    clearInterval(timer);
    completed[levelIndex] = won ? duration - remaining : duration;
    completedMisses[levelIndex] = misses;
    completedFound[levelIndex] = found.size;
    if (!won) { remaining = 0; record('timeout'); }
    if (levelIndex < levels.length - 1) {
      phase = 'transition';
      $('#stageTransitionIcon').textContent = won ? '✓' : '⏱';
      $('#stageTransitionTitle').textContent = won ? 'พบครบแล้ว!' : 'หมดเวลา!';
      $('#stageTransitionText').textContent = `พบ ${found.size} / 5 จุด · ต่อไป: ${levels[levelIndex + 1].title}`;
      $('#stageTransitionCount').textContent = '2';
      $('#stageTransition').hidden = false;
      render();
      transitionCountTimer = setTimeout(() => { $('#stageTransitionCount').textContent = '1'; }, 1000);
      transitionTimer = setTimeout(() => loadLevel(levelIndex + 1, true), 2000);
      playSound(won ? 'win' : 'lose');
      return;
    }
    phase = 'finished'; render();
    $('#resultIcon').textContent = totalFound() === 15 ? '🏆' : '🎯';
    $('#resultLabel').textContent = '90 SECOND CHALLENGE · ผลของคุณ';
    renderResultMetrics();
    $('#playAgain').textContent = nextActionLabel();
    modal.hidden = false; startModal.hidden = true; syncBackground();
    $('#resultViewStats').hidden = !ranked;
    $('#resultRank').textContent = '—';
    $('#resultRankNote').textContent = ranked ? 'กำลังบันทึกผลและอัปเดตอันดับ…' : 'โหมดฝึกซ้อม · ไม่บันทึกอันดับ';
    saveScore();
    if (!ranked) account?.refreshLeaderboard(1);
    (ranked ? $('#resultViewStats') : $('#playAgain')).focus();
    playSound(totalFound() === 15 ? 'win' : 'found');
  }

  function syncTime() {
    if (phase !== 'playing') return false;
    remaining = Math.max(0, deadline - performance.now());
    if (remaining === 0) { endGame(false); return false; }
    render();
    return true;
  }

  function startGame() {
    if (starting) return;
    if (phase !== 'ready') return;
    if (!account) { campaignStarted = true; return activateGame(); }
    if (!account.canPlay()) return openStart();
    starting = true;
    render();
    (async () => {
      if (!campaignStarted) { ranked = await account.startRun(); campaignStarted = true; }
      if (ranked) {
        const sentAt = performance.now();
        const result = await account.event('begin', { level: levelIndex });
        if (result?.remainingMs !== undefined) remaining = Math.max(0, Math.min(remaining, result.remainingMs) - (performance.now() - sentAt));
      }
      starting = false;
      activateGame();
    })().catch((error) => {
      starting = false;
      $('#profileStatus').textContent = error.message;
      openStart();
    });
  }

  function activateGame() {
    closeStart();
    phase = 'playing';
    deadline = performance.now() + remaining;
    clearInterval(timer);
    timer = setInterval(syncTime, 100);
    render();
    $('#countdownHud').scrollIntoView?.({ behavior: 'smooth', block: 'start' });
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

  function clearRound() {
    clearInterval(timer);
    clearTimeout(transitionTimer); clearTimeout(transitionCountTimer);
    $('#stageTransition').hidden = true;
    clearTimeout(toastTimer);
    missTimers.forEach((timeout) => clearTimeout(timeout));
    missTimers.clear();
    document.querySelectorAll('.miss, .tap-feedback').forEach((effect) => effect.remove());
    [originalScene, playScene].forEach((scene) => scene.classList.remove('tap-wrong'));
    $('#toast').classList.remove('show');
    found = new Set();
    hinted = new Set();
    hints = 2;
    misses = 0;
    remaining = duration;
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
          showTapFeedback(scene, difference.x, difference.y, '+1 จุด', 'correct');
          record('hit', { answer: spot.dataset.id });
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
      if (autoStart) startGame();
      else openStart();
    }).catch(() => {
      if (generation !== loadGeneration) return;
      phase = 'error';
      render();
      openStart();
    });
  }

  function proceed() {
    if (starting || savingScore) return;
    if (phase !== 'finished') return;
    return resetCampaign(true);
  }

  function resetCampaign(autoStart = false) {
    resultGeneration += 1;
    confirmedScore = null;
    completed.fill(null);
    completedMisses.fill(0);
    completedFound.fill(0);
    campaignStarted = false;
    return loadLevel(0, autoStart);
  }

  startButton.addEventListener('click', () => {
    if (phase === 'error') return loadLevel(levelIndex);
    if (phase === 'finished') return proceed();
    startGame();
  });
  popupStartButton.addEventListener('click', () => {
    if (phase === 'error') return loadLevel(levelIndex);
    if (phase === 'finished') return proceed();
    startGame();
  });
  window.addEventListener('account:change', render);
  $('#accountButton').addEventListener('click', () => {
    if (starting || ['playing', 'transition'].includes(phase)) return;
    openStart();
  });
  $('#retryScore').addEventListener('click', saveScore);
  restartButton.addEventListener('click', () => resetCampaign());
  $('#playAgain').addEventListener('click', proceed);
  $('#closeResult').addEventListener('click', closeResult);
  document.querySelectorAll('[data-view-stats]').forEach((button) => button.addEventListener('click', (event) => {
    event.preventDefault();
    if (starting) return;
    if (phase === 'playing') showToast('เวลายังคงนับถอยหลังระหว่างดูสถิติ');
    modal.hidden = true;
    closeStart();
    account?.refreshPersonalStats();
    const stats = $('#personalStats');
    stats.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    stats.focus({ preventScroll: true });
  }));

  function showTapFeedback(scene, x, y, label, kind) {
    const effect = document.createElement('span');
    effect.className = `tap-feedback ${kind}`; effect.textContent = label; effect.setAttribute('aria-hidden', 'true');
    effect.style.left = `${Math.max(8, Math.min(92, x))}%`;
    effect.style.top = `${Math.max(15, Math.min(90, y))}%`;
    scene.appendChild(effect);
    if (kind === 'wrong') {
      scene.classList.remove('tap-wrong'); void scene.offsetWidth; scene.classList.add('tap-wrong');
    }
    const timeout = setTimeout(() => { effect.remove(); scene.classList.remove('tap-wrong'); missTimers.delete(timeout); }, 800);
    missTimers.add(timeout);
  }

  [originalScene, playScene].forEach((scene) => scene.addEventListener('click', (event) => {
    if (event.target.closest('.hotspot') || !syncTime()) return;
    misses += 1;
    record('miss');
    render();
    showToast('กดผิด +5 วินาทีในเวลาจัดอันดับ');
    const rect = scene.getBoundingClientRect();
    showTapFeedback(scene, rect.width ? (event.clientX - rect.left) / rect.width * 100 : 50,
      rect.height ? (event.clientY - rect.top) / rect.height * 100 : 50, '+5 วินาทีปรับ', 'wrong');
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
    // The deadline keeps running even when this tab is in the background.
    if (phase === 'playing') syncTime();
  });
  window.addEventListener('pagehide', () => {
    if (phase === 'playing') syncTime();
  });
  modal.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); closeResult(); }
    if (event.key === 'Tab') {
      const buttons = [...modal.querySelectorAll('button:not(:disabled)')].filter((button) => !button.hidden);
      const first = buttons[0];
      const last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  startModal.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusable = [...startModal.querySelectorAll('button:not(:disabled), a[href], input')].filter((el) => !el.hidden && !el.closest('[hidden]'));
    const first = focusable[0]; const last = focusable.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
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
  syncBackground();
  loadLevel(0);
})();
