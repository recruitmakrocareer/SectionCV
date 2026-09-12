document.getElementById('chooseDifference').addEventListener('click', () => {
  document.body.classList.remove('choosing-game');
  document.title = 'MAKRO — เกมจับผิดภาพ';
  window.scrollTo(0, 0);
  const dialog = document.querySelector('[role=dialog]:not([hidden])');
  const target = dialog?.querySelector('button:not([disabled]), input, a') || document.getElementById('accountButton');
  target?.focus();
});
