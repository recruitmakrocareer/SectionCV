(() => {
  'use strict';
  const bounded = (promise) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('LINE ตอบกลับช้า กรุณาปิดแล้วเปิดลิงก์เกมอีกครั้ง')), 15000);
    Promise.resolve(promise).then(resolve, reject).finally(() => clearTimeout(timer));
  });
  window.initializeMakroLiff = async (liffId, request) => {
    if (!/^\d+-[A-Za-z0-9]+$/.test(liffId)) throw new Error('กรุณาตรวจการตั้งค่า LIFF ID');
    if (!window.liff) await bounded(new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('โหลด LINE ไม่สำเร็จ กรุณาเปิดลิงก์เกมอีกครั้ง'));
      document.head.appendChild(script);
    }));
    await bounded(window.liff.init({ liffId }));
    const liffUrl = `https://liff.line.me/${liffId}`;
    if (!window.liff.isLoggedIn()) return { liffUrl, user: null };
    const idToken = window.liff.getIDToken();
    if (!idToken) throw new Error('กรุณาอนุญาตข้อมูลโปรไฟล์ LINE แล้วเปิดเกมอีกครั้ง');
    const challenge = await request('api/liff/config');
    const response = await fetch('api/liff/session', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': challenge.csrf },
      body: JSON.stringify({ idToken }), signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error('ยืนยันบัญชี LINE ไม่สำเร็จ กรุณาปิดแล้วเปิดลิงก์เกมอีกครั้ง');
    return { ...await response.json(), liffUrl };
  };
})();
