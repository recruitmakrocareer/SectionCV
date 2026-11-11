/*
 * Thai / English language switcher shared by every page.
 *
 * Pages are written in Thai. When English is selected this script translates
 * visible text and accessibility attributes in place and keeps translating
 * text that the game scripts write later (via a MutationObserver). Switching
 * back to Thai restores the original text, so game logic never needs to know
 * which language is active. The choice is remembered per browser and can be
 * forced with ?lang=en or ?lang=th.
 */
(() => {
  'use strict';
  if (window.MAKRO_I18N) return;

  const STORAGE_KEY = 'makro-lang';
  const THAI = /[฀-๿]/;
  const ATTRIBUTES = ['aria-label', 'placeholder', 'alt', 'title'];

  // Exact phrases (whitespace is collapsed before lookup). A key written as
  // "ctx|phrase" only applies inside the matching CONTEXTS selector.
  const EN = {
    // ---- Shared ----
    'ผู้เล่น': 'Player',
    'อันดับ': 'Rank',
    'คะแนน': 'Score',
    'กดผิด': 'Wrong taps',
    'เวลารวม': 'Total time',
    'พบจุด': 'Found',
    'ก่อนหน้า': 'Previous',
    'ถัดไป': 'Next',
    'เริ่มเกม': 'Start game',
    'เล่นอีกครั้ง': 'Play again',
    'ออกจากระบบ': 'Log out',
    'กำลังเล่น': 'Playing',
    'หมดเวลา!': "Time's up!",
    'หมดเวลา': "Time's up",
    'เวลาที่เหลือ': 'Time left',
    'เวลาที่ดีที่สุด': 'Best time',
    'เลือกเกม': 'Choose a game',
    '← เลือกเกม': '← Choose a game',
    'เลือกเกมอื่น': 'Choose another game',
    '← เลือกเกมอื่น': '← Choose another game',
    'วิธีเล่น': 'How to play',
    'เสียง': 'Sound',
    'กำลังโหลด…': 'Loading…',
    'กำลังโหลดอันดับ…': 'Loading leaderboard…',
    'โหลดข้อมูลไม่สำเร็จ': 'Could not load data',
    'โหลดไม่สำเร็จ': 'Could not load',
    'เชื่อมต่อไม่สำเร็จ': 'Could not connect',
    'เชื่อมต่อไม่สำเร็จ กรุณาลองอีกครั้ง': 'Could not connect. Please try again.',
    'กรุณาลองอีกครั้ง': 'Please try again.',
    'เข้าสู่ระบบด้วย LINE': 'Log in with LINE',
    'กลับหน้าแรกเพื่อเชื่อมต่อ LINE': 'Back to the home page to connect LINE',
    'Makro เกมจับคู่': 'Makro Memory Match',
    'เกมจับคู่': 'Memory Match',

    // ---- Home page / game lobby ----
    'สนุกกับเกมจับคู่และเกมจัดออเดอร์แม็คโคร เล่นบนมือถือได้': 'Enjoy the Makro memory match and order-packing games, playable on mobile.',
    'MAKRO — เลือกเกมที่อยากเล่น': 'MAKRO — Pick a game to play',
    'เลือกเกมแม็คโคร': 'Choose a Makro game',
    'เล่นเกมหยิบให้ไว จัดให้ครบ': 'Play Pick Fast, Pack It All',
    'หยิบให้ไว': 'Pick fast',
    'จัดให้ครบ!': 'Pack it all!',
    'เล่นเกมจับคู่': 'Play Memory Match',

    // ---- Spot the difference ----
    'เมนูหลัก': 'Main menu',
    'อันดับผู้เล่น': 'Leaderboard',
    'สถิติของฉัน': 'My stats',
    'เปิดหรือปิดเสียง': 'Turn sound on or off',
    '90 SECOND CHALLENGE · 3 ด่าน': '90 SECOND CHALLENGE · 3 STAGES',
    'เกม': 'Spot the ',
    'จับผิดภาพ': 'Difference',
    'เกมจับผิดภาพ': 'Spot the Difference',
    'ภาพละ 1 นาที 30 วินาที · หาให้ไว ก่อนเวลาจะหมด!': '1 min 30 sec per photo · Find them before time runs out!',
    'เวลาจัดอันดับ': 'Ranking time',
    'ฝึกซ้อม · ไม่บันทึกอันดับ': 'Practice · Not ranked',
    'โหมดฝึกซ้อม · ไม่บันทึกอันดับ': 'Practice mode · Not ranked',
    'กำลังโหลดภาพ…': 'Loading photos…',
    'เริ่มด่านนี้ใหม่': 'Restart this stage',
    'ข้อมูลผู้เล่น': 'Player info',
    'กรุณาเปิด JavaScript ในเบราว์เซอร์เพื่อเล่นเกมนี้': 'Please enable JavaScript in your browser to play this game.',
    'ความคืบหน้า 3 ด่าน': 'Progress across 3 stages',
    'ความคืบหน้า': 'Progress',
    'จุดต่างที่พบ': 'Differences found',
    'พบในภาพนี้': 'Found in this photo',
    'จุดแตกต่าง': 'differences',
    'ภาพต้นฉบับ': 'Original photo',
    'ภาพต้นฉบับ แตะเพื่อเลือกจุดแตกต่าง': 'Original photo, tap to pick a difference',
    'ภาพเสมือนจริงของโซนผักและผลไม้': 'Realistic photo of the fruit and vegetable zone',
    'ภาพที่แตกต่าง · 5 จุด': 'Different photo · 5 spots',
    'ภาพที่แตกต่าง แตะเพื่อเลือกจุดแตกต่าง': 'Different photo, tap to pick a difference',
    'ภาพเปรียบเทียบที่มีจุดแตกต่าง 5 จุด': 'Comparison photo with 5 differences',
    'แตะจุดต่างได้ทั้งสองภาพ': 'Tap differences on either photo',
    'ใช้สองนิ้วซูมเพื่อดูรายละเอียด': 'Pinch with two fingers to zoom in',
    'ใช้คำใบ้': 'Use hint',
    'อัปเดตสถิติ': 'Refresh stats',
    'เข้าสู่ระบบด้วย LINE เพื่อดูประวัติการเล่นของคุณ': 'Log in with LINE to see your play history',
    'ผลงานที่ดีที่สุด': 'Best result',
    'อันดับของคุณ': 'Your rank',
    'เล่นจบ 3 ด่าน': 'Finished all 3 stages',
    'ประวัติ 10 รอบล่าสุด · เวลาไทย': 'Last 10 rounds · Bangkok time',
    'เริ่มเล่น': 'Started',
    'ผลการเล่น': 'Result',
    'อันดับจากกติกา 90 วินาที · พบจุดมากกว่าอยู่อันดับดีกว่า เมื่อเท่ากันใช้เวลารวมและโทษกดผิด': 'Ranked under the 90-second rules · More spots found ranks higher; ties go to total time plus wrong-tap penalties',
    'อันดับผู้เล่นทั้งหมด': 'All players leaderboard',
    'อัปเดตอันดับ': 'Refresh leaderboard',
    'พบจุดมากที่สุด → เวลารวม + กดผิดครั้งละ 5 วินาที · ใช้ผลงานที่ดีที่สุดคนละ 1 อันดับ': 'Most spots found → total time + 5 seconds per wrong tap · Each player’s best result counts once',
    'stats|ผู้เล่น': 'Players',
    'stats|คน': '',
    'stats|เล่นจบ': 'Completed',
    'stats|รอบ': 'rounds',
    'stats|พบเฉลี่ย': 'Avg. found',
    'stats|/ 15 จุด': '/ 15 spots',
    'แสดงเฉพาะชื่อและสถิติการเล่น เบอร์ติดต่อดูได้เฉพาะผู้ดูแลกิจกรรม': 'Only names and play stats are shown. Phone numbers are visible to event staff only.',
    'วิธีเล่นง่าย ๆ': 'Easy to play',
    '90 วินาทีต่อภาพ': '90 seconds per photo',
    'เวลานับถอยหลังต่อเนื่อง': 'A nonstop countdown',
    'เห็นชัดตลอดการเล่น': 'always in view while you play',
    'แตะจุดต่าง': 'Tap the differences',
    'กดถูกได้จุด กดผิด +5 วินาที': 'Right taps score a spot; wrong taps add +5 seconds',
    'ในเวลาที่ใช้จัดอันดับ': 'to your ranking time',
    'ลุ้นอันดับของคุณ': 'Chase your rank',
    'หมดเวลาหรือหาครบ ไปภาพถัดไป': 'Time up or all found? On to the next photo',
    'จบ 3 ด่าน ดูผลและอันดับทันที': 'Finish 3 stages and see your result and rank right away',
    'สนุกทุกช้อป คุ้มทุกวัน ที่แม็คโคร': 'Fun every shop, great value every day at Makro',
    'Makro · เกมจับผิดภาพเสมือนจริง': 'Makro · Realistic spot-the-difference game',
    'พร้อมจับผิดภาพแล้วหรือยัง?': 'Ready to spot the differences?',
    'ภาพละ': 'Each photo gets',
    '1 นาที 30 วินาที': '1 min 30 sec',
    'เวลาถอยหลังตลอด': 'on a nonstop countdown',
    'หาครบหรือหมดเวลา ไปด่านถัดไปอัตโนมัติ': 'Find them all or run out of time to move on automatically',
    'กดผิด 1 ครั้ง': 'Each wrong tap adds',
    '+5 วินาที': '+5 seconds',
    'ในเวลาจัดอันดับ': 'to your ranking time',
    'แข่งกับเวลา': 'Race the clock',
    '90 วินาที': '90 seconds',
    'ทั้งหมด': 'In total',
    '3 ภาพ · 15 จุด': '3 photos · 15 spots',
    'หาให้มาก': 'Find the most',
    'แล้วแข่งความไว': 'then be the fastest',
    'กำลังตรวจการเข้าสู่ระบบ…': 'Checking your login…',
    'ถ้าขึ้น Error ใน LINE ให้เปิดเกมใน Chrome/Safari แล้วเข้าสู่ระบบอีกครั้ง': 'If LINE shows an error, open the game in Chrome/Safari and log in again.',
    'เปิดเกมใน Chrome/Safari': 'Open the game in Chrome/Safari',
    'เข้าสู่ระบบด้วย LINE แบบสำรอง': 'Log in with LINE (backup method)',
    'ชื่อที่ใช้ในกิจกรรมและตารางอันดับ': 'Name for the event and leaderboard',
    'เบอร์ติดต่อ': 'Phone number',
    'ใช้ข้อมูลเพื่อระบุตัวผู้เล่น บันทึกสถิติ และติดต่อเกี่ยวกับกิจกรรมนี้ เบอร์โทรไม่แสดงต่อผู้เล่นอื่น': 'We use this to identify players, save stats and contact you about this event. Your phone number is never shown to other players.',
    'ยินยอมให้จัดเก็บชื่อ เบอร์ติดต่อ และสถิติตามวัตถุประสงค์ข้างต้น': 'I agree to the storage of my name, phone number and stats for the purposes above',
    'บันทึกข้อมูลผู้เล่น': 'Save player info',
    'ดูสถิติของฉัน': 'View my stats',
    'รอภาพพร้อมก่อนเริ่มจับเวลา': 'The timer starts once the photos are ready',
    'ดูข้อมูลผู้เล่น': 'View player data',
    'จบทั้ง 3 ด่านแล้ว!': 'All 3 stages done!',
    'จุดที่พบ': 'Spots found',
    'เวลารวมโทษกดผิด': 'Time incl. penalties',
    'ลองบันทึกสถิติอีกครั้ง': 'Try saving stats again',
    'อันดับของคุณและผู้เล่นทั้งหมด': 'Your rank and all players',
    'อันดับของคุณ · จากผลงานที่ดีที่สุด': 'Your rank · based on your best result',
    'ประวัติของฉัน': 'My history',
    'ปิดผลลัพธ์': 'Close results',
    'การเชื่อมต่อสะดุด กำลังเก็บรายการที่รอส่งไว้ในรอบนี้': 'Connection hiccup. Pending taps are kept for this round.',
    'กำลังบันทึกสถิติ… กรุณาอย่าเพิ่งปิดหน้านี้': 'Saving stats… Please don’t close this page yet.',
    'ปิดเสียง': 'Mute',
    'เปิดเสียง': 'Unmute',
    'เสียงเปิด': 'Sound on',
    'เสียงปิด': 'Sound off',
    'เปิดเสียงแล้ว': 'Sound turned on',
    'ปิดเสียงแล้ว': 'Sound turned off',
    'อุปกรณ์นี้เปิดเสียงไม่ได้ แต่ยังเล่นเกมได้ตามปกติ': 'Sound isn’t available on this device, but you can still play normally.',
    'เล่นใหม่ทั้ง 3 ด่าน': 'Replay all 3 stages',
    'เริ่มใหม่ทั้ง 3 ด่าน': 'Restart all 3 stages',
    'กำลังไปภาพถัดไป': 'Moving to the next photo',
    '10 วินาทีสุดท้าย!': 'Final 10 seconds!',
    'ลองโหลดภาพอีกครั้ง': 'Try loading the photos again',
    'กำลังไปด่านถัดไป…': 'Moving to the next stage…',
    'กำลังเตรียมเกม…': 'Preparing the game…',
    'เล่นต่อ': 'Continue',
    'โหลดภาพไม่สำเร็จ ตรวจการเชื่อมต่อแล้วแตะลองโหลดภาพอีกครั้ง': 'Photos failed to load. Check your connection and tap “Try loading the photos again”.',
    'กดผิด +5 วินาทีในเวลาจัดอันดับ · คำใบ้ 2 ครั้งต่อด่าน': 'Wrong tap: +5 seconds ranking time · 2 hints per stage',
    'จบด่านแล้ว · กำลังไปภาพถัดไปอัตโนมัติ': 'Stage done · Moving to the next photo automatically',
    'จบทั้ง 3 ภาพแล้ว! ดูผลงานและอันดับของคุณได้เลย': 'All 3 photos done! Check your result and rank.',
    'สุดยอด! เจอครบทั้ง 15 จุด': 'Amazing! You found all 15 spots',
    'จบชาเลนจ์ทั้ง 3 ด่านแล้ว!': 'You finished all 3 challenge stages!',
    'พบครบแล้ว!': 'All found!',
    '90 SECOND CHALLENGE · ผลของคุณ': '90 SECOND CHALLENGE · YOUR RESULT',
    'กำลังบันทึกผลและอัปเดตอันดับ…': 'Saving your result and updating the leaderboard…',
    '+1 จุด': '+1 spot',
    'เวลายังคงนับถอยหลังระหว่างดูสถิติ': 'The timer keeps running while you view stats',
    'กดผิด +5 วินาทีในเวลาจัดอันดับ': 'Wrong tap: +5 seconds ranking time',
    '+5 วินาทีปรับ': '+5 s penalty',
    'สังเกตวงสีเหลืองที่กะพริบ แล้วแตะจุดต่าง 👀': 'Look for the flashing yellow circle, then tap the difference 👀',
    'ยังโหลดภาพไม่ได้': 'Photos could not load yet',
    // Levels
    'โซนผักและผลไม้': 'Fruit & vegetable zone',
    'ผักและผลไม้': 'Fruit & veg',
    'รอยสุกบนเปลือกกล้วย': 'Ripe spots on the banana peel',
    'กะหล่ำปลีเปลี่ยนสี': 'Cabbage changed color',
    'พริกหวานเปลี่ยนสี': 'Bell pepper changed color',
    'มะเขือเทศเปลี่ยนสี': 'Tomato changed color',
    'ส้มเปลี่ยนเป็นสีเขียว': 'Orange turned green',
    'มุมเบเกอรี่อบสด': 'Fresh bakery corner',
    'เบเกอรี่': 'Bakery',
    'รอยบากบนขนมปัง': 'Score marks on the bread',
    'งาบนขนมปังก้อน': 'Sesame on the bread loaf',
    'ปลายครัวซองต์เคลือบช็อกโกแลต': 'Chocolate-dipped croissant tip',
    'หน้ามัฟฟินเปลี่ยนสี': 'Muffin top changed color',
    'น้ำตาลบนขนมปังเกลียวหายไป': 'Sugar missing from the twist bread',
    'ชั้นเครื่องปรุงและของแห้ง': 'Condiments & dry goods shelf',
    'เครื่องปรุง': 'Condiments',
    'ฉลากขวดซอสเปลี่ยนสี': 'Sauce bottle label changed color',
    'ฝาขวดน้ำมันเปลี่ยนสี': 'Oil bottle cap changed color',
    'กระป๋องเปลี่ยนสี': 'Can changed color',
    'กระเทียมเปลี่ยนเป็นมะกอก': 'Garlic turned into olives',
    'ฝาโหลเครื่องปรุงเปลี่ยนสี': 'Spice jar lid changed color',
    // Account / leaderboard (account.js)
    'ระบบบันทึกข้อมูลยังไม่พร้อม': 'The save system isn’t ready yet',
    'เข้าสู่ระบบ LINE ผ่านเบราว์เซอร์': 'Log in to LINE via browser',
    'เปิดเกมใน LINE': 'Open the game in LINE',
    'บันทึกและเริ่มเกม': 'Save and start',
    'เข้าสู่ระบบด้วย LINE แล้วกรอกข้อมูลเพื่อร่วมจัดอันดับ': 'Log in with LINE and fill in your details to join the leaderboard',
    'เปิดให้ฝึกซ้อมได้ ระบบ LINE และการบันทึกอันดับยังไม่เปิดใช้งาน': 'Practice is open. LINE login and ranking aren’t enabled yet.',
    'เล่นจบทั้ง 3 ภาพแล้วบันทึกผล · พบจุดมากกว่า อันดับดีกว่า': 'Finish all 3 photos to save your result · More spots found ranks higher',
    'กรุณาเข้าสู่ระบบและบันทึกชื่อกับเบอร์ติดต่อก่อนเริ่มเกม': 'Please log in and save your name and phone number before starting',
    'โหมดฝึกซ้อม ไม่ส่งข้อมูลส่วนตัวและไม่บันทึกอันดับ': 'Practice mode: no personal data is sent and nothing is ranked',
    'โหมดฝึกซ้อม · ระบบอันดับยังไม่เปิดใช้งาน': 'Practice mode · Ranking isn’t enabled yet',
    'เข้าสู่ระบบบนเว็บกิจกรรมเพื่อร่วมจัดอันดับ': 'Log in on the event site to join the leaderboard',
    'กติกา 90 วินาที · ผลงานที่ดีที่สุดคนละ 1 อันดับ': '90-second rules · Each player’s best result counts once',
    'ยังไม่มีผลการเล่นในกติกา 90 วินาที': 'No results under the 90-second rules yet',
    'เล่นจบทั้ง 3 ภาพเพื่อร่วมจัดอันดับ': 'Finish all 3 photos to join the leaderboard',
    'โหลดอันดับไม่สำเร็จ กดอัปเดตอันดับเพื่อลองอีกครั้ง': 'Couldn’t load the leaderboard. Tap “Refresh leaderboard” to try again.',
    'ยังโหลดอันดับรวมไม่ได้ กดอัปเดตอันดับ': 'Couldn’t load overall rankings yet. Tap “Refresh leaderboard”.',
    'กำลังโหลดสถิติของคุณ…': 'Loading your stats…',
    'เริ่มรอบใหม่ก่อนเล่นครบ': 'Restarted before finishing',
    'สถิติที่บันทึกไว้ของคุณ · ดูได้แม้ไม่ติด 10 อันดับแรก': 'Your saved stats · visible even outside the top 10',
    'ยังไม่มีรอบที่เล่นครบ 3 ด่าน ดูผลแต่ละรอบได้ด้านล่าง': 'No full 3-stage rounds yet. See each round below.',
    'ยังไม่มีประวัติการเล่นที่บันทึกในบัญชี LINE นี้': 'No saved play history for this LINE account yet',
    'โหลดสถิติไม่สำเร็จ กดอัปเดตสถิติเพื่อลองอีกครั้ง': 'Couldn’t load stats. Tap “Refresh stats” to try again.',
    'เข้าสู่ระบบ LINE ไม่สำเร็จ กรุณาลองอีกครั้ง': 'LINE login failed. Please try again.',
    'บันทึกข้อมูลแล้ว พร้อมเริ่มเกม': 'Saved. Ready to start!',
    'กรุณาบันทึกชื่อและเบอร์ติดต่อก่อน': 'Please save your name and phone number first',
    'เกมกำลังอัปเดตกติกา กรุณาโหลดหน้าใหม่แล้วเริ่มอีกครั้ง': 'The game rules are being updated. Please reload the page and start again.',
    'ยังบันทึกครบ 3 ด่านไม่สำเร็จ กรุณาลองอีกครั้ง': 'Couldn’t save all 3 stages yet. Please try again.',
    // LIFF
    'LINE ตอบกลับช้า กรุณาปิดแล้วเปิดลิงก์เกมอีกครั้ง': 'LINE is responding slowly. Please close and reopen the game link.',
    'กรุณาตรวจการตั้งค่า LIFF ID': 'Please check the LIFF ID setting',
    'โหลด LINE ไม่สำเร็จ กรุณาเปิดลิงก์เกมอีกครั้ง': 'LINE failed to load. Please open the game link again.',
    'กรุณาอนุญาตข้อมูลโปรไฟล์ LINE แล้วเปิดเกมอีกครั้ง': 'Please allow access to your LINE profile and open the game again.',
    'ยืนยันบัญชี LINE ไม่สำเร็จ กรุณาปิดแล้วเปิดลิงก์เกมอีกครั้ง': 'Couldn’t verify your LINE account. Please close and reopen the game link.',

    // ---- Order Rush ----
    'แตะให้ไว จัดให้ครบ! เกมจัดออเดอร์ 90 วินาที แข่งกับเพื่อน ทำคอมโบ และขึ้นอันดับประจำวัน': 'Tap fast, pack it all! A 90-second order game: race friends, build combos and top the daily leaderboard.',
    'Order Rush — แตะให้ไว จัดให้ครบ! | makro': 'Order Rush — Tap fast, pack it all! | makro',
    'makro หน้าหลัก': 'makro home',
    'เมนูเกม': 'Game menu',
    'เสียง: ปิด': 'Sound: Off',
    'เสียง: เปิด': 'Sound: On',
    'แตะให้ไว': 'Tap fast',
    'เปิดร้านรับความสนุก! แตะของสดให้ตรงใจ': 'Open the shop for fun! Tap the right fresh goods,',
    'แข่งกับเพื่อน แล้วขึ้นแท่นนักจัดออเดอร์มือโปร': 'race your friends and become a pro order packer',
    '◷ 90 วินาที': '◷ 90 seconds',
    '↗ ต่อคอมโบ': '↗ Build combos',
    '♛ แข่งอันดับสด': '♛ Live rankings',
    'แตะให้ครบ จบออเดอร์!': 'Tap them all, finish the order!',
    'พร้อมเปิดร้านหรือยัง?': 'Ready to open the shop?',
    'ดูออเดอร์': 'Read the order',
    'เช็กสินค้าและขนาด': 'Check items and sizes',
    'แตะสินค้าที่ถูกต้อง': 'Tap the right items',
    'ดูขนาดและจำนวน': 'Mind the size and quantity',
    'แตะครบ รับแต้ม!': 'Complete it, score points!',
    'ครบออร์เดอร์ สินค้าสลับที่': 'Items shuffle after each order',
    'กำลังโหลดข้อมูลผู้เล่น…': 'Loading player info…',
    'ชื่อเล่นของคุณ': 'Your nickname',
    'เช่น น้องมะม่วง': 'e.g. Mango',
    'เข้าห้องรอ': 'Join the waiting room',
    'ใช้ชื่อ 2–30 ตัวอักษร แล้วไปสนุกด้วยกัน': 'Use 2–30 characters, then let’s play!',
    'ชื่อสำหรับรอบนี้': 'Name for this round',
    'บันทึกชื่อ': 'Save name',
    'เปลี่ยนชื่อได้ก่อนกดพร้อมในแต่ละรอบ · ใช้ชื่อ 2–30 ตัวอักษร': 'You can change your name before marking ready each round · 2–30 characters',
    'ห้องรอผู้เล่น': 'Player waiting room',
    'ลองเชื่อมต่ออีกครั้ง': 'Try connecting again',
    'แต้ม คอมโบ และสิ่งที่ต้องระวัง': 'Points, combos and what to watch out for',
    'แตะครบออเดอร์': 'Complete an order',
    'สูงสุด +100': 'Up to +100',
    'โบนัสคอมโบ': 'Combo bonus',
    'สูงสุด +200': 'Up to +200',
    'โบนัสความเร็ว': 'Speed bonus',
    'คอมโบเพิ่มครั้งละ 20 สูงสุด +100 ต่อออเดอร์ · โบนัสเร็วลดลง 1 คะแนนทุก 0.1 วินาที (จัดใน 5 วินาทีได้ +150)': 'Combos add 20 each, up to +100 per order · The speed bonus drops 1 point every 0.1 s (finish within 5 s for +150)',
    'แตะผิด −60 คะแนน / −5 วินาที · แตะของหมดอายุ −100 คะแนน / −8 วินาที และคอมโบเริ่มใหม่ คะแนนไม่ต่ำกว่า 0': 'Wrong tap −60 points / −5 s · Expired item −100 points / −8 s and your combo resets. Score never drops below 0',
    'ทุกออร์เดอร์มีสินค้า 2–4 รายการ · จำนวนรวมเพิ่มทีละชิ้นทุก 3 ออเดอร์ · ครบทั้งออร์เดอร์แล้วสินค้าจะสลับตำแหน่ง · เวลาเดินต่อแม้สลับหน้าจอ': 'Every order has 2–4 products · The total count grows by one item every 3 orders · Items shuffle after each completed order · The clock keeps running if you switch screens',
    'ต้องมีผู้เล่นอย่างน้อย 1 คน และทุกคนในห้องต้องกดเตรียมพร้อมครบ แล้วรอ Admin กดเริ่มเกม': 'At least 1 player is needed, everyone in the room must mark ready, then wait for the Admin to start the game',
    '🏁 Top 5 รอบล่าสุด': '🏁 Top 5 last round',
    '🏆 Top 5 ประจำวัน': '🏆 Top 5 today',
    'เกมจัดออเดอร์': 'Order game',
    'คะแนนของคุณ': 'Your score',
    'คอมโบต่อเนื่อง': 'Combo streak',
    'ออเดอร์ลูกค้า': 'Customer order',
    'ยิ่งเร็ว โบนัสยิ่งมาก': 'The faster, the bigger the bonus',
    'เลือกสินค้าจากชั้น': 'Pick items from the shelf',
    'ครบออร์เดอร์แล้วสินค้าสลับที่': 'Items shuffle after each order',
    'รถร้านค้า Makro': 'Makro shop truck',
    'ลองยืนยันอีกครั้ง': 'Try confirming again',
    'กลับห้องรอ': 'Back to waiting room',
    '🏆 ทำเนียบนักจัดมือโปร': '🏆 Pro packers hall of fame',
    'คะแนนสูงสุดของแต่ละคน · คะแนนเท่ากันใช้จำนวนแตะผิดน้อยกว่า แล้วรอบที่จบก่อน': 'Each player’s top score · Ties go to fewer wrong taps, then the earlier finish',
    '← ก่อนหน้า': '← Previous',
    'ถัดไป →': 'Next →',
    '↻ โหลดอันดับใหม่': '↻ Reload leaderboard',
    'จัดให้ครบ สนุกให้สุด': 'Pack it all, have a blast',
    'จัดเต็มแล้ว รอบนี้!': 'You nailed this round!',
    'คะแนนรอบนี้': 'This round’s score',
    'ลองบันทึกอีกครั้ง': 'Try saving again',
    '🏁 Top 5 รอบนี้': '🏁 Top 5 this round',
    'กลับห้องรอ เล่นอีกครั้ง →': 'Back to waiting room, play again →',
    'ดูอันดับทั้งหมด': 'See full leaderboard',
    'แอปเปิล': 'Apples',
    'นม': 'Milk',
    'แครอต': 'Carrots',
    'ปลา': 'Fish',
    '500 กรัม': '500 g',
    '1 กก.': '1 kg',
    '1 ลิตร': '1 L',
    '1 ลิตร · หมดอายุ': '1 L · Expired',
    '1 กก. · หมดอายุ': '1 kg · Expired',
    'ครบแล้ว กำลังยืนยันออร์เดอร์…': 'Complete! Confirming the order…',
    'ถูกต้อง! หาสินค้าชิ้นถัดไป': 'Correct! Find the next item',
    'หมดอายุ! เลือกของสดแทนนะ': 'Expired! Pick a fresh one instead',
    'ไม่ตรงออร์เดอร์หรือครบแล้ว ลองเลือกใหม่': 'Not in the order or already complete. Try again.',
    'ชิ้นนี้หมดอายุแล้ว ลองเลือกของสดแทนนะ': 'This one has expired. Pick a fresh one instead.',
    'เช็กวันหมดอายุอีกนิด แล้วหยิบชิ้นใหม่กัน!': 'Check the expiry date and grab another one!',
    'ชื่อเหมือนกัน แต่ขนาดต่างกัน เช็กป้ายอีกนิด!': 'Same name, different size. Check the label!',
    'ชิ้นนี้ยังไม่ได้สั่งนะ ลองเลือกใหม่': 'That item isn’t in the order. Try again.',
    'ลองดูรายการด้านบน แล้วเลือกใหม่อีกนิดนะ': 'Check the list above and pick again',
    'สินค้านี้ครบแล้ว ลองดูรายการที่เหลือนะ': 'You have enough of this one. Check the remaining items.',
    'ใกล้ครบแล้ว! เช็กจำนวนตามออเดอร์อีกครั้งนะ': 'Almost there! Double-check the quantities in the order.',
    'ตั้งชื่อแล้วเข้าห้องรอได้เลย ไม่ต้องเชื่อมต่อ LINE': 'Pick a name and join the waiting room. No LINE needed.',
    'กำลังเข้าห้องรอ…': 'Joining the waiting room…',
    'โหลดบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง': 'Couldn’t load your account. Please try again.',
    'กรุณาตั้งชื่ออย่างน้อย 2 ตัวอักษร': 'Please use at least 2 characters',
    'กำลังบันทึกชื่อ…': 'Saving name…',
    'บันทึกชื่อแล้ว': 'Name saved',
    'Admin นำคุณออกจากห้องรอแล้ว หากต้องการเข้าร่วมใหม่ กรุณาโหลดหน้านี้ใหม่': 'The Admin removed you from the waiting room. Reload this page to join again.',
    'เปิดเกมอยู่ในหน้าจออื่น กรุณาโหลดหน้านี้ใหม่หากต้องการเล่นที่นี่': 'The game is open on another screen. Reload this page to play here.',
    'การเชื่อมต่อสะดุด กำลังเข้าห้องรอใหม่…': 'Connection hiccup. Rejoining the waiting room…',
    'โหลดผลรอบนี้ไม่สำเร็จ ดูอันดับประจำวันได้ที่ห้องรอ': 'Couldn’t load this round’s results. See today’s ranking in the waiting room.',
    'ไม่มีคะแนนในรอบนี้': 'No scores this round',
    'รอผู้เล่นคนอื่นจบรอบ…': 'Waiting for other players to finish…',
    'รอผู้เล่นคนอื่นจบรอบ': 'Waiting for other players to finish',
    '✓ พร้อม': '✓ Ready',
    'รอกดพร้อม': 'Not ready',
    'เตรียมตัว…': 'Get ready…',
    'รอรอบถัดไป': 'Wait for the next round',
    'ยกเลิกการพร้อม': 'Cancel ready',
    'กดเตรียมพร้อม': 'I’m ready',
    'โหลดผลรอบล่าสุดไม่สำเร็จ': 'Couldn’t load the last round’s results',
    'ไม่มีคะแนนในรอบล่าสุด': 'No scores in the last round',
    'รอผู้เล่นเข้าห้องและกดเตรียมพร้อม': 'Waiting for players to join and mark ready',
    'พร้อมครบแล้ว รอ Admin กดเริ่มเกม': 'Everyone is ready. Waiting for the Admin to start.',
    'เกมกำลังจะเริ่ม!': 'The game is about to start!',
    'รอบนี้กำลังจะเริ่ม รอรอบถัดไปนะ': 'This round is about to start. Please wait for the next one.',
    'รอบนี้กำลังแข่งอยู่ รอรอบถัดไปนะ': 'This round is in progress. Please wait for the next one.',
    'เข้ารอบนี้ไม่สำเร็จ กรุณารอรอบถัดไป': 'Couldn’t join this round. Please wait for the next one.',
    'แตะสินค้าให้ตรงออเดอร์ · ครบออร์เดอร์แล้วสินค้าจะสลับที่': 'Tap items that match the order · Items shuffle after each order',
    'โค้งสุดท้าย! เร่งทำคอมโบกัน!': 'Final stretch! Build those combos!',
    'แตะให้ไว! ยิ่งเร็ว โบนัสยิ่งมาก': 'Tap fast! The faster, the bigger the bonus',
    'มีสินค้าหมดอายุ! คะแนนและเวลาลดลง': 'Expired item! Points and time lost',
    'เลือกผิด! คะแนนและเวลาลดลง': 'Wrong pick! Points and time lost',
    'Admin จบรอบแล้ว': 'The Admin ended the round',
    'โบนัสความเร็วรวม': 'Total speed bonus',
    'ออเดอร์สำเร็จ': 'Orders completed',
    'ความแม่นยำ': 'Accuracy',
    'แตะผิด': 'Wrong taps',
    'คอมโบสูงสุด': 'Best combo',
    'กำลังยืนยันและบันทึกคะแนน…': 'Confirming and saving your score…',
    'บันทึกคะแนนแล้ว': 'Score saved',
    'ยังไม่มีคะแนนในวันนี้ มาเป็นคนแรกกัน!': 'No scores yet today. Be the first!',
    'ยังไม่มีคะแนนในวันนี้': 'No scores yet today',
    'เล่นให้จบ 1 รอบ เพื่อบันทึกอันดับของคุณ': 'Finish 1 round to record your rank',
    'โหลดอันดับไม่สำเร็จ กดโหลดอันดับใหม่ได้': 'Couldn’t load the leaderboard. Tap reload to try again.',

    // ---- Memory match ----
    'พลิกการ์ด หาคู่ภาพที่เหมือนกันให้ครบ 8 คู่ใน 90 วินาที': 'Flip the cards and find all 8 matching pairs in 90 seconds',
    'กำลังโหลดชื่อจากบัญชี LINE…': 'Loading your name from LINE…',
    'ลองโหลดข้อมูลอีกครั้ง': 'Try loading again',
    '⏱ เหลือเวลา': '⏱ Time left',
    '⭐ จำนวนครั้ง': '⭐ Moves',
    '🏁 จับคู่แล้ว': '🏁 Pairs',
    'เริ่มนับเวลาเมื่อเปิดใบแรก · 90 วินาที': 'The timer starts when you flip the first card · 90 seconds',
    'แตะการ์ดเพื่อเริ่มเล่น ✨': 'Tap a card to start ✨',
    '↻ เริ่มใหม่': '↻ Restart',
    '🔀 สลับการ์ด': '🔀 Shuffle',
    '🏆 สถิติของเครื่องนี้': '🏆 Stats on this device',
    'จำนวนครั้งน้อยที่สุด': 'Fewest moves',
    'ล้างประวัติสถิติ': 'Clear stats history',
    'สถิติจะบันทึกไว้ในเบราว์เซอร์ของอุปกรณ์นี้อัตโนมัติ': 'Stats are saved automatically in this device’s browser',
    '🎉 สำเร็จ!': '🎉 Well done!',
    '⏰ หมดเวลา!': "⏰ Time's up!",
    'แชร์เกม': 'Share game',
    'ดูสถิติ': 'View stats',
    'ยังไม่มีสถิติ ลองเล่นให้จบ 1 รอบครับ': 'No stats yet. Finish a round to see them.',
    'เวลา': 'Time',
    'ครั้ง': 'Moves',
    'วันที่': 'Date',
    'ใกล้หมดเวลาแล้ว!': 'Almost out of time!',
    'จับคู่ให้ครบก่อนเวลาหมด': 'Match all pairs before time runs out',
    'กำลังตรวจสอบบัญชี LINE…': 'Checking your LINE account…',
    '🏆 จับคู่ครบทั้ง 8 คู่แล้ว!': '🏆 All 8 pairs matched!',
    'หมดเวลาแล้ว ลองใหม่อีกครั้ง!': 'Time’s up. Try again!',
    'เลือกอีกใบเพื่อจับคู่': 'Pick another card to match',
    'ถูกต้อง! ได้ 1 คู่ 🎉': 'Correct! 1 pair 🎉',
    'ยังไม่เหมือนกัน จำไว้แล้วลองใหม่': 'Not a match. Remember them and try again.',
    'ล้างประวัติสถิติทั้งหมดในเครื่องนี้?': 'Clear all stats history on this device?',
    'มาลองเล่น Makro เกมจับคู่กัน!': 'Come play Makro Memory Match!',
    'คัดลอกลิงก์นี้เพื่อแชร์': 'Copy this link to share',
    'กรุณาเชื่อมต่อ LINE จากหน้าแรกก่อนเล่น': 'Please connect LINE from the home page before playing',
    'เชื่อมต่อ LINE แล้วใช้ชื่อบัญชีได้ทันที': 'Connect LINE to use your account name right away',
    'โหลดบัญชี LINE ไม่สำเร็จ กรุณาลองอีกครั้ง': 'Couldn’t load your LINE account. Please try again.',
    'ยังไม่ได้เริ่มจับเวลา': 'The timer hasn’t started',

    // ---- Live scoreboard (staff) ----
    'Makro — คะแนนสด Order Rush': 'Makro — Order Rush live scores',
    'คะแนนสด Order Rush': 'Order Rush live scores',
    'สำหรับผู้ดูแลกิจกรรม': 'For event staff',
    'รหัสผ่าน admin': 'Admin password',
    'ดูคะแนนสด': 'View live scores',
    'หยุดเกมและสรุปคะแนน': 'Stop game and tally scores',
    'กำลังตรวจสอบความพร้อม…': 'Checking readiness…',
    'กำลังนำ': 'Leading',
    'เลือกผิด': 'Wrong picks',
    'คอมโบ': 'Combo',
    'สถานะ': 'Status',
    'ห้องรอ': 'Waiting room',
    'เข้าสู่ระบบไม่สำเร็จ': 'Login failed',
    'การเชื่อมต่อสะดุด กำลังลองใหม่…': 'Connection hiccup, retrying…',
    'กำลังนับถอยหลัง': 'Counting down',
    'กำลังแข่งอยู่': 'In progress',
    'หมดเวลา · กำลังสรุปผล': 'Time’s up · Tallying results',
    'จบรอบแล้ว · ผลรอบล่าสุด': 'Round over · Latest results',
    'รอผู้เล่นทุกคนกดเตรียมพร้อมสำหรับรอบถัดไป': 'Waiting for every player to mark ready for the next round',
    'ยังไม่มีรอบที่แข่ง': 'No rounds played yet',
    'รอผู้เล่นอย่างน้อย 1 คน และกดเตรียมพร้อมครบทุกคน': 'Waiting for at least 1 player, with everyone marked ready',
    'ผู้เล่นพร้อมครบแล้ว': 'All players are ready',
    'กดเริ่มเกมเพื่อเริ่มนับถอยหลังพร้อมกัน': 'Press Start game to begin the countdown for everyone',
    'กดหยุดเกมและสรุปคะแนนได้ทันที โดยไม่ต้องรอหมดเวลา': 'You can stop the game and tally scores now without waiting for time to run out',
    'ยังไม่มีผู้เล่นในห้อง ให้ผู้เล่นเข้าเกมและกดเตรียมพร้อมก่อน': 'No players in the room yet. Players need to join and mark ready first.',
    'จบแล้ว': 'Finished',
    'ผู้เล่นกำลังเข้ารอบ…': 'Players are joining the round…',
    'ยังไม่มีคะแนน รอรอบแรกเริ่ม': 'No scores yet. Waiting for the first round.',
    'นำออก': 'Remove',
    'นำผู้เล่นออกไม่สำเร็จ': 'Couldn’t remove the player',
    'กำลังหยุดเกมและบันทึกคะแนน…': 'Stopping the game and saving scores…',
    'หยุดเกมไม่สำเร็จ': 'Couldn’t stop the game',
    'หยุดเกมและบันทึกคะแนนแล้ว': 'Game stopped and scores saved',
    'กำลังเริ่มเกม…': 'Starting the game…',
    'เริ่มเกมไม่สำเร็จ': 'Couldn’t start the game',
    'เริ่มนับถอยหลังแล้ว': 'Countdown started',

    // ---- Admin player data (staff) ----
    'ข้อมูลผู้เล่น — Makro': 'Player data — Makro',
    'ข้อมูลผู้เล่นสำหรับผู้ดูแลกิจกรรม': 'Player data for event staff',
    'ข้อมูลผู้เข้าร่วมเกม': 'Game participants',
    'กำลังตรวจสิทธิ์ผู้ดูแล…': 'Checking staff access…',
    'ดาวน์โหลดรายชื่อ CSV': 'Download CSV',
    'ชื่อ': 'Name',
    'ชื่อ LINE': 'LINE name',
    'จำนวนรอบ': 'Rounds',
    'ข้อมูลส่วนนี้ไม่แสดงในตารางอันดับสาธารณะ': 'This data is not shown on the public leaderboard.',
    'ระบบผู้ดูแลยังไม่เปิดใช้งาน': 'Staff tools aren’t enabled yet',
    'ยังไม่ผ่านครบ 3 ด่าน': 'Hasn’t finished all 3 stages',

    // ---- Server messages shown to players ----
    'Admin จบรอบนี้แล้ว กรุณารอรอบถัดไป': 'The Admin ended this round. Please wait for the next one.',
    'LIFF ยังไม่เปิดใช้งาน': 'LIFF isn’t enabled yet',
    'LINE ยืนยันตัวตนไม่สำเร็จ': 'LINE couldn’t verify your identity',
    'LINE ไม่พร้อม': 'LINE isn’t ready',
    'LINE ไม่ได้ส่งข้อมูลยืนยัน': 'LINE didn’t send verification data',
    'กติกาเปลี่ยนแล้ว กรุณาปิดและเปิดเกมใหม่': 'The rules changed. Please close and reopen the game.',
    'กรุณาตั้งค่า URL ของระบบให้ถูกต้อง': 'Please configure the system URL correctly',
    'กรุณาตั้งชื่อ 2–30 ตัวอักษร': 'Please use a name of 2–30 characters',
    'กรุณาบันทึกชื่อ เบอร์ติดต่อ และการยินยอมก่อนเริ่มเกม': 'Please save your name, phone number and consent before starting',
    'กรุณายืนยันการจัดเก็บข้อมูลก่อนเริ่มเกม': 'Please consent to data storage before starting',
    'กรุณารอสักครู่แล้วส่งอีกครั้ง': 'Please wait a moment and send again',
    'กรุณาระบุชื่อ 2–80 ตัวอักษร': 'Please enter a name of 2–80 characters',
    'กรุณาระบุเบอร์ติดต่อในประเทศไทยให้ถูกต้อง': 'Please enter a valid Thai phone number',
    'กรุณาเข้าสู่ระบบด้วย LINE': 'Please log in with LINE',
    'กรุณาเข้าห้องรอเพื่อเริ่มพร้อมผู้เล่นคนอื่น': 'Please join the waiting room to start with the other players',
    'กรุณาเปิดลิงก์เกมหลัก': 'Please open the main game link',
    'กรุณาเปิดเกมใหม่จาก LINE': 'Please reopen the game from LINE',
    'กรุณาโหลดเกมเวอร์ชันล่าสุด': 'Please load the latest version of the game',
    'ข้อมูลผู้เล่นไม่ถูกต้อง': 'Invalid player data',
    'ข้อมูลมีขนาดใหญ่เกินไป': 'The data is too large',
    'ข้อมูลยืนยัน LINE ไม่ถูกต้อง': 'Invalid LINE verification data',
    'ข้อมูลรอบเกมไม่ถูกต้อง': 'Invalid round data',
    'ข้อมูลสินค้าไม่ถูกต้อง': 'Invalid product data',
    'ข้อมูลออเดอร์ไม่ถูกต้อง': 'Invalid order data',
    'ข้อมูลเปลี่ยน กรุณาลองส่งอีกครั้ง': 'The data changed. Please send again.',
    'ข้อมูลเปลี่ยน กรุณาลองอีกครั้ง': 'The data changed. Please try again.',
    'ข้อมูลเปลี่ยน กรุณาโหลดเกมใหม่': 'The data changed. Please reload the game.',
    'ข้อมูลไม่ถูกต้อง': 'Invalid data',
    'คำขอเข้าสู่ระบบหมดอายุ': 'The login request expired',
    'คำขอไม่ถูกต้อง กรุณาโหลดหน้าใหม่': 'Invalid request. Please reload the page.',
    'คำขอไม่ถูกต้อง': 'Invalid request',
    'คำตอบไม่ได้อยู่ในด่านนี้': 'That answer isn’t in this stage',
    'คุณไม่ได้อยู่ในรอบนี้ กรุณารอรอบถัดไป': 'You aren’t in this round. Please wait for the next one.',
    'ด่านนี้ไม่ได้กำลังเล่น': 'This stage isn’t in play',
    'ด่านไม่ถูกต้อง': 'Invalid stage',
    'ต้องมีผู้เล่นอย่างน้อย 1 คน และทุกคนต้องกดพร้อมก่อนเริ่ม': 'At least 1 player is needed and everyone must be ready before starting',
    'ต้องเล่นตามลำดับด่าน': 'Stages must be played in order',
    'นำผู้เล่นออกได้เฉพาะตอนอยู่ห้องรอ': 'Players can only be removed while in the waiting room',
    'บันทึกชื่อไม่สำเร็จ กรุณาลองอีกครั้ง': 'Couldn’t save the name. Please try again.',
    'ผู้เล่น LINE': 'LINE player',
    'ผู้เล่นคนนี้กดพร้อมแล้ว ไม่สามารถนำออกได้': 'This player is already ready and can’t be removed',
    'ผู้เล่นออกจากห้องแล้ว กรุณาตรวจรายชื่ออีกครั้ง': 'The player already left. Please check the list again.',
    'ยกเลิกการเข้าสู่ระบบ': 'Login cancelled',
    'ยังไม่ถึงเวลาเริ่ม': 'It isn’t time to start yet',
    'ยังไม่หมดเวลา': 'Time isn’t up yet',
    'ยังไม่ได้ตั้งรหัสผ่าน admin ใน Cloudflare': 'The admin password isn’t set in Cloudflare yet',
    'รหัสผ่านไม่ถูกต้อง': 'Incorrect password',
    'รหัสรายการถูกใช้กับข้อมูลอื่นแล้ว': 'This entry ID is already used for other data',
    'รหัสรายการไม่ถูกต้อง': 'Invalid entry ID',
    'รอบนี้จบแล้ว หรือมีรอบใหม่เริ่มอยู่ กรุณาตรวจสถานะอีกครั้ง': 'This round has ended or a new one has started. Please check the status again.',
    'รอบนี้นับเวลาต่อเนื่อง ไม่มีการหยุดพัก': 'The clock runs continuously this round, with no pauses',
    'รอบนี้สิ้นสุดแล้ว กรุณาเริ่มเกมใหม่': 'This round has ended. Please start a new game.',
    'รอบเกมหมดอายุ กรุณาเริ่มใหม่': 'The round expired. Please start again.',
    'ระบบ LINE Login ยังไม่เปิดใช้งาน': 'LINE Login isn’t enabled yet',
    'ระบบบันทึกข้อมูลขัดข้อง กรุณาลองอีกครั้ง': 'The save system had a problem. Please try again.',
    'ระบบบันทึกข้อมูลยังไม่เปิดใช้งาน': 'The save system isn’t enabled yet',
    'รายการเล่นมาไม่ครบ กรุณาลองส่งอีกครั้ง': 'Some taps are missing. Please send again.',
    'รายการเล่นเปลี่ยนไปแล้ว กรุณาลองส่งอีกครั้ง': 'The taps changed. Please send again.',
    'รายการเล่นไม่ถูกต้อง': 'Invalid taps',
    'วันที่ไม่ถูกต้อง': 'Invalid date',
    'สำหรับผู้ดูแลกิจกรรมเท่านั้น': 'For event staff only',
    'หยุดเกมไม่สำเร็จ กรุณาลองอีกครั้ง': 'Couldn’t stop the game. Please try again.',
    'ห้องรอยังไม่เปิดใช้งาน': 'The waiting room isn’t open yet',
    'เกมยังไม่ได้เริ่ม': 'The game hasn’t started',
    'เกมไม่ได้หยุดพัก': 'The game isn’t paused',
    'เปลี่ยนชื่อได้ในห้องรอก่อนกดเตรียมพร้อมเท่านั้น': 'You can only change your name in the waiting room before marking ready',
    'เริ่มด่านนี้ไม่ได้': 'Can’t start this stage',
    'เริ่มเกมบ่อยเกินไป กรุณารอสักครู่': 'Too many game starts. Please wait a moment.',
    'เวลาของด่านนี้ยังไม่หมด': 'This stage’s time isn’t up yet',
    'เวลาของรอบนี้ยังไม่หมด': 'This round’s time isn’t up yet',
    'ไม่พบข้อมูลยืนยัน LINE': 'LINE verification data not found',
    'ไม่พบผู้เล่น': 'Player not found',
    'ไม่พบรอบเกม': 'Round not found',
    'ไม่พบรายการ': 'Entry not found',
    'ไม่พบหน้าที่ต้องการ': 'Page not found'
  };

  // Text built from numbers or names. Captured groups passed through T() are
  // translated too; others (names, numbers, times) are kept as they are.
  const plural = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;
  const T = (text) => translate(text) ?? text;
  const PATTERNS = [
    [/^บันทึกแล้ว · เวลาจัดอันดับ (\S+)(?: · อันดับที่ (\d+))?$/, (m) => `Saved · Ranking time ${m[1]}${m[2] ? ` · Rank #${m[2]}` : ''}`],
    [/^ยังบันทึกสถิติไม่สำเร็จ: (.+)$/, (m) => `Couldn’t save stats yet: ${T(m[1])}`],
    [/^กดผิด (\d+) ครั้ง · \+(\d+) วินาที$/, (m) => `${plural(m[1], 'wrong tap', 'wrong taps')} · +${m[2]} s`],
    [/^ด่านที่ (\d+) \/ (\d+) · 5 จุดใน 1 นาที 30 วินาที$/, (m) => `Stage ${m[1]} / ${m[2]} · 5 spots in 1 min 30 sec`],
    [/^ด่าน(?:ที่)? (\d+) \/ (\d+)$/, (m) => `Stage ${m[1]} / ${m[2]}`],
    [/^ด่าน (\d+) · (.+)$/, (m) => `Stage ${m[1]} · ${T(m[2])}`],
    [/^รวม (\d+) \/ 15 จุด$/, (m) => `Total ${m[1]} / 15 spots`],
    [/^เริ่มด่านที่ (\d+)$/, (m) => `Start stage ${m[1]}`],
    [/^เริ่มเกม · ด่านที่ (\d+)$/, (m) => `Start game · Stage ${m[1]}`],
    [/^เริ่มเกมฝึกซ้อม · ด่านที่ (\d+)$/, (m) => `Start practice · Stage ${m[1]}`],
    [/^กำลังเตรียมภาพด่านที่ (\d+)…$/, (m) => `Preparing stage ${m[1]} photos…`],
    [/^เวลาที่ใช้ (\S+) \+ โทษกดผิด (\d+) วินาที$/, (m) => `Time used ${m[1]} + wrong-tap penalty ${m[2]} s`],
    [/^(\d+) \/ 5 จุด$/, (m) => `${m[1]} / 5 spots`],
    [/^(\d+) \/ 15 จุด$/, (m) => `${m[1]} / 15 spots`],
    [/^(\S+) · หมดเวลา$/, (m) => `${m[1]} · Time’s up`],
    [/^(\S+) · พบครบ$/, (m) => `${m[1]} · All found`],
    [/^พบ (\d+) \/ 5 จุด · ต่อไป: (.+)$/, (m) => `Found ${m[1]} / 5 · Next: ${T(m[2])}`],
    [/^จุดแตกต่างที่ (\d+)$/, (m) => `Difference ${m[1]}`],
    [/^(.+) พบแล้ว$/, (m) => `${T(m[1])} — found`],
    [/^ถูกต้อง! พบแล้ว (\d+) \/ (\d+) จุด 🎉$/, (m) => `Correct! Found ${m[1]} / ${m[2]} 🎉`],
    [/^ภาพเปรียบเทียบ (.+) มีจุดแตกต่าง 5 จุด$/, (m) => `Comparison photo of the ${T(m[1]).toLowerCase()} with 5 differences`],
    [/^ภาพเสมือนจริง (.+)$/, (m) => `Realistic photo of the ${T(m[1]).toLowerCase()}`],
    [/^ผู้เล่น: (.+)$/, (m) => `Player: ${m[1]}`],
    [/^เชื่อมต่อ LINE แล้ว: (.+)$/, (m) => `Connected to LINE: ${m[1]}`],
    [/^(.+) \(คุณ\)$/, (m) => `${m[1]} (you)`],
    [/^หน้า (\d+) \/ (\d+)$/, (m) => `Page ${m[1]} / ${m[2]}`],
    [/^คุณอยู่ที่อันดับ (\d+) · ผลงานดีที่สุด (\d+) \/ 15 จุด · (\S+)$/, (m) => `You’re ranked #${m[1]} · Best: ${m[2]} / 15 spots · ${m[3]}`],
    [/^จากผู้เล่น ([\d,]+) คน$/, (m) => `out of ${m[1]} players`],
    [/^จบ 3 ด่าน · (\d+) \/ 15 จุด · บันทึกแล้ว( \(กติกาเดิม\))?$/, (m) => `Finished 3 stages · ${m[1]} / 15 spots · Saved${m[2] ? ' (old rules)' : ''}`],
    [/^หมดเวลาในด่านที่ (\d+)$/, (m) => `Time ran out on stage ${m[1]}`],
    [/^ยังเล่นไม่ครบ · ด่านที่ (\d+)$/, (m) => `Not finished · Stage ${m[1]}`],
    [/^(\d+) ครั้ง$/, (m) => plural(m[1], 'time', 'times')],
    // Live scoreboard
    [/^ผู้เล่นในรอบนี้ (\d+) คน( · คะแนนอัปเดตทุก 2 วินาที)?$/, (m) => `${plural(m[1], 'player', 'players')} this round${m[2] ? ' · Scores update every 2 seconds' : ''}`],
    [/^พร้อมครบ (\d+)\/(\d+) คน · Admin กดเริ่มเกมได้เลย$/, (m) => `All ready ${m[1]}/${m[2]} · The Admin can start the game`],
    [/^พร้อม (\d+)\/(\d+) คน · รอทุกคนกดเตรียมพร้อม(?: · ยังไม่พร้อม: (.+))?$/, (m) => `Ready ${m[1]}/${m[2]} · Waiting for everyone to mark ready${m[3] ? ` · Not ready: ${m[3]}` : ''}`],
    [/^ห้องรอ · (\d+) คน · พร้อม (\d+) คน$/, (m) => `Waiting room · ${plural(m[1], 'player', 'players')} · ${m[2]} ready`],
    [/^กำลังนำ (.+) ออกจากห้องรอ…$/, (m) => `Removing ${m[1]} from the waiting room…`],
    [/^นำ (.+) ออกจากห้องรอแล้ว$/, (m) => `Removed ${m[1]} from the waiting room`],
    [/^นำ (.+) ออกจากห้องรอ$/, (m) => `Remove ${m[1]} from the waiting room`],
    [/^อัปเดตล่าสุด (.+)$/, (m) => `Last updated ${m[1]}`],
    // Admin
    [/^ผู้เข้าร่วม (\d+) คน$/, (m) => plural(m[1], 'participant', 'participants')],
    [/^([\d.]+) วินาที$/, (m) => `${m[1]} s`],
    // Order Rush
    [/^(-?[\d,]+) คะแนน$/, (m) => `${m[1]} pts`],
    [/^แตะถูก (\d+)\/(\d+) ชิ้น$/, (m) => `Correct taps ${m[1]}/${m[2]} items`],
    [/^แตะ(แอปเปิล|นม|แครอต|ปลา) (.+) · ถูกแล้ว (\d+) จาก (\d+) ชิ้น$/, (m) => `Tap ${T(m[1])} ${T(m[2])} · ${m[3]} of ${m[4]} picked`],
    [/^แตะ(แอปเปิล|นม|แครอต|ปลา) (.+)$/, (m) => `Tap ${T(m[1])} ${T(m[2])}`],
    [/^ขนาดยังไม่ตรงนะ ออเดอร์นี้ต้องการ (.+)$/, (m) => `Wrong size. This order needs ${T(m[1])}`],
    [/^\+(\d+) คะแนน · โบนัสเร็ว \+(\d+)$/, (m) => `+${m[1]} pts · speed bonus +${m[2]}`],
    [/^ในห้อง (\d+) คน · พร้อมแล้ว (\d+) คน$/, (m) => `In the room: ${m[1]} · Ready: ${m[2]}`],
    [/^รอทุกคนกดเตรียมพร้อม \((\d+)\/(\d+)\)$/, (m) => `Waiting for everyone to mark ready (${m[1]}/${m[2]})`],
    [/^เหลือ (\d+) วินาที! แตะให้ทัน!$/, (m) => `${m[1]} seconds left! Hurry!`],
    [/^เหลือ (\d+) วินาที! รีบจับคู่ให้ครบ$/, (m) => `${m[1]} seconds left! Match them all, fast!`],
    [/^เหลือ (\d+) วินาที$/, (m) => `${m[1]} s left`],
    [/^โบนัสเร็วตอนนี้ \+(\d+)$/, (m) => `Speed bonus now +${m[1]}`],
    [/^โบนัสเร็ว \+(\d+)$/, (m) => `Speed bonus +${m[1]}`],
    [/^อีก (\d+) คะแนน ทำลายสถิติตัวเอง!$/, (m) => `${m[1]} more points to beat your best!`],
    [/^ครบออเดอร์! \+(\d+) คะแนน 🎉$/, (m) => `Order complete! +${m[1]} pts 🎉`],
    [/^(.+) · แตะลองยืนยันอีกครั้ง$/, (m) => `${T(m[1])} · Tap to confirm again`],
    [/^(.+) · ยังไม่ยืนยันว่าบันทึกแล้ว$/, (m) => `${T(m[1])} · Save not confirmed yet`],
    [/^(.+) · (\d+) ผู้เล่น$/, (m) => `${m[1]} · ${plural(m[2], 'player', 'players')}`],
    [/^อันดับดีที่สุดของคุณ: (\d+) \/ (\d+) คน · (-?\d+) คะแนน$/, (m) => `Your best rank: ${m[1]} / ${m[2]} · ${m[3]} pts`],
    [/^บันทึกคะแนนแล้ว · (.+)$/, (m) => `Score saved · ${T(m[1])}`],
    // Memory match
    [/^การ์ดใบที่ (\d+)$/, (m) => `Card ${m[1]}`],
    [/^จับคู่ (\d+)\/8 คู่ • ใช้เวลา (\d+) วินาที$/, (m) => `Matched ${m[1]}/8 pairs • ${m[2]} seconds`],
    [/^เปิด (\d+) ครั้ง • คอมโบสูงสุด (\d+)$/, (m) => `${m[1]} flips • Best combo ${m[2]}`],
    // Error message + generic retry suffix (keep last)
    [/^(.+) กรุณาลองอีกครั้ง$/, (m) => `${T(m[1]).replace(/[.!?]?$/, '.')} Please try again.`]
  ];

  // Text inside these elements uses "ctx|phrase" keys first.
  const CONTEXTS = [['.community-stats', 'stats']];

  const normalize = (text) => text.replace(/\s+/g, ' ').trim();
  function translate(raw, element) {
    const text = normalize(raw);
    if (!text || !THAI.test(text)) return null;
    if (element && element.closest) {
      for (const [selector, ctx] of CONTEXTS) {
        const key = `${ctx}|${text}`;
        if (key in EN && element.closest(selector)) return EN[key];
      }
    }
    if (text in EN) return EN[text];
    for (const [pattern, build] of PATTERNS) {
      const match = text.match(pattern);
      if (match) return build(match);
    }
    return null;
  }

  // ---- Language state ----
  const storage = {
    get() { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } },
    set(value) { try { localStorage.setItem(STORAGE_KEY, value); } catch { /* private mode */ } }
  };
  const fromQuery = (() => { try { return new URLSearchParams(location.search).get('lang'); } catch { return null; } })();
  let lang = fromQuery === 'en' || fromQuery === 'th' ? fromQuery : (storage.get() === 'en' ? 'en' : 'th');
  if (fromQuery === 'en' || fromQuery === 'th') storage.set(lang);

  // Original Thai text per node so switching back restores it exactly.
  const textOriginals = new WeakMap();
  const attrOriginals = new WeakMap();
  const tracked = new Set();

  const skip = (element) => !element || element.closest('script,style,noscript,[translate="no"],.lang-switch');

  function translateTextNode(node) {
    const parent = node.parentElement;
    if (skip(parent)) return;
    const saved = textOriginals.get(node);
    if (saved && node.data === saved.en) return;
    const result = translate(node.data, parent);
    if (result === null) return;
    const lead = node.data.match(/^\s*/)[0];
    const trail = node.data.match(/\s*$/)[0];
    const en = lead + result + (result ? trail : '');
    textOriginals.set(node, { th: node.data, en });
    tracked.add(node);
    node.data = en;
  }

  function translateAttributes(element) {
    if (skip(element)) return;
    let saved = attrOriginals.get(element);
    for (const name of ATTRIBUTES) {
      const value = element.getAttribute(name);
      if (value === null || (saved?.[name] && saved[name].en === value)) continue;
      const result = translate(value, element);
      if (result === null) continue;
      if (!saved) { saved = {}; attrOriginals.set(element, saved); tracked.add(element); }
      saved[name] = { th: value, en: result };
      element.setAttribute(name, result);
    }
    if (element.matches('meta[name="description"]')) {
      const value = element.getAttribute('content');
      const result = value && saved?.content?.en !== value ? translate(value) : null;
      if (result !== null) {
        if (!saved) { saved = {}; attrOriginals.set(element, saved); tracked.add(element); }
        saved.content = { th: value, en: result };
        element.setAttribute('content', result);
      }
    }
  }

  function translateTree(root) {
    if (root.nodeType === Node.TEXT_NODE) { translateTextNode(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE) translateAttributes(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
      else translateAttributes(node);
    }
  }

  function restoreThai() {
    for (const node of tracked) {
      const text = textOriginals.get(node);
      if (text) {
        if (node.data === text.en) node.data = text.th;
        textOriginals.delete(node);
      }
      const attrs = attrOriginals.get(node);
      if (attrs) {
        for (const [name, value] of Object.entries(attrs)) {
          if (node.getAttribute(name) === value.en) node.setAttribute(name, value.th);
        }
        attrOriginals.delete(node);
      }
      tracked.delete(node);
    }
  }

  const observer = new MutationObserver((mutations) => {
    if (lang !== 'en') return;
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') translateTextNode(mutation.target);
      else if (mutation.type === 'attributes') translateAttributes(mutation.target);
      else mutation.addedNodes.forEach(translateTree);
    }
  });

  // Dialog messages from the games (e.g. "clear history?") follow the language too.
  for (const name of ['alert', 'confirm', 'prompt']) {
    const original = window[name];
    if (typeof original !== 'function') continue;
    window[name] = function (message, ...rest) {
      const text = lang === 'en' && typeof message === 'string' ? (translate(message) ?? message) : message;
      return original.call(window, text, ...rest);
    };
  }

  // ---- Switcher UI ----
  const style = document.createElement('style');
  style.textContent = `
.lang-switch{display:inline-flex;align-items:center;gap:2px;padding:3px;border-radius:999px;background:#fff;border:1px solid #e3d6d2;box-shadow:0 2px 8px #0000000f;font-family:inherit;line-height:1;vertical-align:middle;flex:none}
.lang-switch .lang-btn{appearance:none;margin:0;border:0;border-radius:999px;background:transparent;color:#5d5459;font:inherit;font-size:13px;font-weight:700;min-width:44px;min-height:32px;padding:0 10px;cursor:pointer;box-shadow:none;text-transform:none;letter-spacing:0;width:auto}
.lang-switch .lang-btn[aria-pressed="true"]{background:#d71920;color:#fff}
.lang-switch .lang-btn:focus-visible{outline:3px solid #226dbd;outline-offset:2px}
.lang-switch-floating{position:fixed;top:max(10px,env(safe-area-inset-top));right:max(10px,env(safe-area-inset-right));z-index:9999}
.lobby-lang{display:flex;justify-content:flex-end}
html[lang="en"] .pictures[data-state='loading'] .scene-wrap::after{content:'Loading photos…'}
html[lang="en"] .pictures[data-state='error'] .scene-wrap::after{content:'Photos could not load yet'}`;
  document.head.appendChild(style);

  function buildSwitch(host) {
    host.classList.add('lang-switch');
    host.setAttribute('role', 'group');
    host.setAttribute('aria-label', 'ภาษา / Language');
    host.setAttribute('translate', 'no');
    host.replaceChildren();
    for (const [code, label, title] of [['th', 'ไทย', 'ภาษาไทย'], ['en', 'EN', 'English']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lang-btn';
      button.dataset.lang = code;
      button.lang = code;
      button.textContent = label;
      button.title = title;
      button.addEventListener('click', () => setLanguage(code));
      host.append(button);
    }
  }

  function syncSwitches() {
    document.querySelectorAll('.lang-switch .lang-btn').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
    });
  }

  function setLanguage(next) {
    if (next !== 'en' && next !== 'th') return;
    const changed = next !== lang;
    lang = next;
    storage.set(lang);
    document.documentElement.lang = lang;
    if (lang === 'en') translateTree(document.documentElement);
    else restoreThai();
    syncSwitches();
    if (changed) document.dispatchEvent(new CustomEvent('makro:languagechange', { detail: { lang } }));
  }

  function init() {
    const hosts = document.querySelectorAll('[data-lang-switch]');
    if (hosts.length) hosts.forEach(buildSwitch);
    else {
      const floating = document.createElement('div');
      floating.className = 'lang-switch-floating';
      document.body.append(floating);
      buildSwitch(floating);
    }
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRIBUTES, 'content'] });
    setLanguage(lang);
  }

  window.MAKRO_I18N = {
    get lang() { return lang; },
    get locale() { return lang === 'en' ? 'en-GB' : 'th-TH'; },
    setLanguage,
    translate: (text) => (lang === 'en' ? (translate(text) ?? text) : text)
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
