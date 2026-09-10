(() => {
  'use strict';
  const status = document.querySelector('#adminStatus');
  fetch('api/admin/players', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
    .then(async (response) => {
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('ระบบผู้ดูแลยังไม่เปิดใช้งาน');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      status.textContent = `ผู้เข้าร่วม ${data.players.length} คน`;
      for (const player of data.players) {
        const row = document.createElement('tr');
        for (const value of [player.name, player.phone, player.lineName, player.attempts, player.bestScoreMs === null ? 'ยังไม่ผ่านครบ 3 ด่าน' : `${(player.bestScoreMs / 1000).toFixed(2)} วินาที`]) {
          const cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell);
        }
        document.querySelector('#playersRows').appendChild(row);
      }
      document.querySelector('#playersTable').hidden = !data.players.length;
      document.querySelector('#exportPlayers').hidden = false;
    }).catch((error) => { status.textContent = error.message || 'โหลดข้อมูลไม่สำเร็จ'; });
})();
