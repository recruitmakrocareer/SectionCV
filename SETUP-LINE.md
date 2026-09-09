# เปิดใช้ LINE Login และอันดับรวมแบบไม่มีค่าใช้จ่าย

ใช้ **Cloudflare Workers Free + D1 Free** สำหรับหน้าเกม เซิร์ฟเวอร์ LINE Login และฐานข้อมูลผู้เล่น ใช้ URL HTTPS `workers.dev` ที่ Cloudflare ออกให้ จึงไม่ต้องซื้อโดเมนหรือเช่าเครื่องรายเดือน ชุดติดตั้ง Render แบบเสียเงินถูกนำออกแล้ว

## สถานะ

- โค้ดรองรับ LINE Login, ชื่อ/เบอร์ติดต่อ, อันดับรวม 10 คน, ป๊อปอัปเริ่มเกม และกดผิด +5 วินาที
- ใช้ LINE Login Channel ID `2011516015` ตามที่ผู้ดูแลแจ้ง ยังไม่ได้ยืนยันการล็อกอินจริงกับ Channel นี้
- ผู้ดูแลสร้าง Worker `sectioncv` และเชื่อม repository แล้ว ภาพหน้าจอวันที่ 9 กันยายน 2026 แสดงการ deploy จาก `main` เป็น static assets, `workers.dev` ปิด และยังไม่มี binding จึงยังไม่ได้เปิดระบบ LINE Login หรือฐานข้อมูลเกมจริง
- [GitHub Pages เดิม](https://recruitmakrocareer.github.io/SectionCV/) ยังเป็น **โหมดฝึกซ้อมที่ไม่บันทึกอันดับ** ไม่มีข้อมูลผู้เล่นหรือบัญชี LINE จำลองในระบบจริง

## ขอบเขตแพ็กเกจฟรี

เลือกบัญชีที่เป็น **Workers Free** เท่านั้น ไม่อัปเกรด Workers Paid ไม่เปิดบริการเสริมที่คิดเงิน และใช้โดเมนฟรี `workers.dev` ตรวจแผนบัญชีก่อนสร้างบริการ เพราะบัญชีที่เป็น Paid อยู่แล้วใช้เงื่อนไขเรียกเก็บเงินของ Paid

| ทรัพยากร | ขีดจำกัด Free ที่เกี่ยวกับเกม |
| --- | --- |
| Worker API/LINE Login | 100,000 คำขอต่อวัน, CPU 10 ms ต่อคำขอ |
| ไฟล์หน้าเกมและภาพ | การเรียก static assets ฟรี ไม่จำกัดจำนวนคำขอ |
| D1 อ่านข้อมูล | 5 ล้านแถวต่อวัน |
| D1 เขียนข้อมูล | 100,000 แถวต่อวัน รวมงานอัปเดตดัชนี |
| ขนาดฐานข้อมูลเกม | สูงสุด 500 MB ต่อฐานข้อมูล (รวมทั้งบัญชีสูงสุด 5 GB) |

จำนวนคำขอไม่เท่ากับจำนวนผู้เล่น: หนึ่งเกมเรียก API หลายครั้ง เมื่อ D1 Free ใช้โควตารายวันหมด การบันทึก/อ่านจะขัดข้องจนโควตารีเซ็ต ไม่เปลี่ยนเป็นการคิดเงินส่วนเกินใน Free หากพื้นที่เต็มต้องจัดการข้อมูลก่อน ระบบเกมแสดงสถานะบันทึกไม่สำเร็จและให้ลองใหม่ ไม่รายงานว่าบันทึกแล้ว

ราคาตรวจวันที่ 9 กันยายน 2026: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)

## ติดตั้งบน Cloudflare Free

ไฟล์ `wrangler.json` ระบุ Worker หนึ่งตัวและ D1 หนึ่งฐานข้อมูล ไม่มีบริการแบบเสียเงินเพิ่ม และยังไม่มี database ID จริง การติดตั้งใหม่ต้องบันทึก ID ที่ Cloudflare ออกให้ไว้กับโครงการเพื่อให้ deploy ครั้งต่อไปใช้ฐานข้อมูลเดิม

### ผ่านหน้า Cloudflare

1. ตรวจว่า Workers เป็น **Free** แล้วเปิด Worker `sectioncv` ที่สร้างไว้ → **Settings → Build** ใช้ repository `recruitmakrocareer/SectionCV` และเปลี่ยน Git/Production branch เป็น `codex/create-makro-sprite-spot-the-difference-game` ซึ่งมีโค้ดเกมและชุดติดตั้งนี้ หากยังไม่ได้เชื่อม Builds ให้กด Connect แล้วเลือก repository และ branch เดียวกัน
2. ชื่อ Worker ใน `wrangler.json` คือ `sectioncv` ตรงกับโครงการที่ผู้ดูแลสร้าง ตั้ง build command เป็น `npm run build`, deploy command เป็น `npm run deploy` และ root directory เป็นราก repository ใช้ Node.js 24 ขึ้นไปในสภาพแวดล้อม build ตัว deploy command จะสร้างตารางด้วย migration ก่อนเปิดเวอร์ชันใหม่ ต้องตั้งค่าฐานข้อมูลในข้อ 3 ให้เสร็จก่อนเริ่ม build
3. Cloudflare สามารถสร้าง D1 binding ที่ยังไม่มี ID ให้ระหว่างตั้งค่าโครงการได้ หากหน้าติดตั้งยังไม่ได้สร้างฐานข้อมูล ให้สร้าง D1 `makro-player-data` ในบัญชี Free ก่อน แล้วนำ **Database ID จริง** ใส่ `d1_databases[0].database_id` ใน `wrangler.json` และบันทึกลง branch นี้ ห้ามใช้ ID ตัวอย่าง เมื่อระบบสร้างให้เองจากหน้าเว็บ ให้คัดลอก ID กลับมาเก็บในไฟล์นี้หลังติดตั้งด้วย
4. หลัง deploy จาก branch เกมสำเร็จ ตรวจว่ามี D1 binding `DB` และ `workers.dev` เปิดใช้งาน (`workers_dev: true` เตรียมไว้ในไฟล์แล้ว) คัดลอก **URL HTTPS จริงที่ Cloudflare แสดง** แล้วไปที่ Worker → Settings → Variables and Secrets ตั้งค่าตามตารางด้านล่าง กดบันทึก/deploy ค่าตั้งแต่ละรายการ การสร้าง Worker หรือมีข้อความ Deploy สำเร็จจาก `main` เพียงอย่างเดียวยังไม่ยืนยันว่า API เกมพร้อม
5. ใน LINE Developers ของ Channel `2011516015` → แท็บ **LINE Login** → **Callback URL** ใส่ `<URL จริงของ Worker>/auth/line/callback` ไม่มี `/` ซ้อนกัน ไม่ใช้ URL ของ GitHub Pages
6. ทดสอบด้วยบัญชี Admin/Tester ของ Channel ก่อน: ล็อกอิน → กรอกชื่อ/เบอร์และยินยอม → เล่นครบสามด่าน → ตรวจอันดับและหน้าผู้ดูแล จากนั้นตั้ง Channel เป็น **Published** เมื่อพร้อมให้บุคคลทั่วไปใช้ แล้วแชร์ URL ของ Worker

| ค่าบน Worker | ค่าและวิธีกรอก |
| --- | --- |
| `APP_ORIGIN` | URL HTTPS จริงของ Worker ไม่มี `/` ท้าย เช่นค่าที่คัดลอกจากหน้า deployment |
| `LINE_CHANNEL_ID` | `2011516015` เตรียมไว้ในโค้ดแล้ว |
| `LINE_CHANNEL_SECRET` | เลือกชนิด **Secret** แล้วกรอก Channel Secret จาก Basic settings ของ LINE Login Channel ลง Cloudflare โดยตรง ไม่ส่งในแชตหรือ GitHub |
| `ADMIN_LINE_USER_IDS` | เลือกชนิด **Secret** แล้วกรอก **Your user ID** ของผู้ดูแลจาก Channel เดียวกัน หลายคนคั่นด้วย comma หากเว้นว่างจะไม่มีใครเปิดรายชื่อ/เบอร์ผู้เล่นได้ |

ก่อนใส่ `APP_ORIGIN` และ Channel Secret ระบบแสดงโหมดฝึกซ้อม ไม่เปิด LINE Login อัตโนมัติจาก URL ที่ผู้เล่นส่งมา `keep_vars: true` ช่วยรักษาค่าที่ตั้งบน dashboard ระหว่าง deploy ส่วน Secret จะไม่อยู่ในไฟล์เว็บ

อ้างอิงการตั้งค่า: [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/), [Wrangler configuration และการสร้างทรัพยากร](https://developers.cloudflare.com/workers/wrangler/configuration/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)

### ผ่านเครื่องผู้ติดตั้ง

ใช้ Node.js 24 ขึ้นไป เริ่มจาก checkout branch ของ PR แล้วทำตามนี้หลังตรวจบัญชี Free:

```bash
npm ci --ignore-scripts
npx wrangler login
npx wrangler d1 create makro-player-data
```

ใส่ `database_id` จริงที่คำสั่งสร้างฐานข้อมูลคืนให้ใน binding `DB` ของ `wrangler.json` และ commit ค่านี้ (ID ไม่ใช่ Secret) จากนั้น:

```bash
npm run deploy
```

ตั้งค่าบน dashboard และตั้ง Callback URL ตามขั้นตอนด้านบน การ deploy ครั้งต่อไปใช้คำสั่งเดิมและฐานข้อมูลเดิม คำสั่ง migrations บันทึกว่าเคยสร้างตารางแล้ว ไม่ล้างผลการเล่น

## ทดสอบในเครื่อง

```bash
npm ci --ignore-scripts
npm test
npm run check:worker
npm run dev:worker
```

`npm test` ใช้ Node, DOM จำลอง และ Miniflare/workerd พร้อม D1 ในเครื่อง ครอบคลุมการเล่นจริงผ่านหน้าเกม, การตอบกลับ LINE จำลอง, การส่งซ้ำและคำขอพร้อมกัน, สิทธิ์ข้อมูลผู้เล่น และการเก็บข้อมูลหลังเริ่ม runtime ใหม่ ไม่เชื่อม LINE จริงหรือฐานข้อมูล production

`npm run check:worker` สร้าง bundle และตรวจ config แบบ dry run ไม่สร้างบริการ Cloudflare ส่วน `npm run dev:worker` ใช้ฐานข้อมูลจำลองใน `.wrangler/` และเปิดโหมดฝึกซ้อมในเครื่อง หากต้องการตัวเลือก Node + SQLite เดิมสำหรับเครื่องที่ดูแลเอง ยังใช้ `npm start` กับ `.env.example` ได้ ข้อมูล D1 และ SQLite ในเครื่องเป็นคนละชุด ไม่มีการย้ายข้อมูลอัตโนมัติ

## สร้าง LINE Login Channel สำหรับเกม

เปิด Provider ที่ดูแลเกมใน LINE Developers Console แล้วตรวจรายการ Channels ก่อน หากมี LINE Login Channel ของเกมนี้อยู่แล้ว ให้ใช้ช่องนั้น หากยังไม่มี ให้เลือก **Create a new channel → LINE Login** แล้วกรอกค่าดังนี้

| ช่องที่ต้องกรอก | ค่าสำหรับเกม |
| --- | --- |
| Channel type | LINE Login |
| Provider | Provider ขององค์กรที่ดูแลเกม หากต้องการเชื่อมกับ LINE OA เดิม ให้ใช้ Provider เดียวกับ Messaging API ของ OA นั้น |
| Region to provide the service | Thailand |
| Company or owner's country or region | Thailand |
| Channel name | Makro Photo Game |
| Channel description | เกมจับผิดภาพแม็คโคร 3 ด่าน สำหรับลงทะเบียนผู้เล่นและบันทึกอันดับตามเวลาที่ทำได้ |
| App types | Web app |
| Email address | อีเมลของผู้ดูแลที่ใช้รับแจ้งเตือนเกี่ยวกับ Channel |

อ่านและยอมรับข้อตกลงที่หน้า LINE แสดงก่อนสร้าง Channel จากนั้นตรวจว่าแถบบนแสดง **LINE Login** และใน Basic settings แสดง **Web app**

- Channel ประเภท **Messaging API** ใช้กับ LINE Official Account และไม่ใช่ Channel ที่ระบบล็อกอินของเกมนี้ต้องใช้ อย่านำ Channel ID หรือ Channel Secret ของ Messaging API มากรอกเป็นค่าล็อกอินเกม
- การเพิ่ม LINE Login เป็นการสร้างอีก Channel ไม่ต้องเปลี่ยน Channel เดิมของแชตบอต
- Channel ใหม่เริ่มที่สถานะ **Developing** ใช้ทดสอบด้วยบัญชีที่มีบทบาท Admin หรือ Tester ก่อน แล้วค่อยเปลี่ยนเป็น **Published** เมื่อพร้อมให้ผู้เล่นทั่วไปใช้
- ส่งเฉพาะ Channel ID ให้ผู้ติดตั้งได้ เก็บ Channel Secret ไว้กรอกในช่อง secret ของโฮสต์ ห้ามส่งในแชต ภาพหน้าจอ หรือ commit
- ยังไม่ต้องเดา Callback URL ให้ใช้ URL จริงของเซิร์ฟเวอร์ที่เปิดใช้งานแล้วตามขั้นตอนด้านล่าง เส้นทางบน GitHub Pages ไม่สามารถทำหน้าที่รับ callback ของเซิร์ฟเวอร์นี้ได้

อ้างอิง: [การสร้างและตั้งค่า LINE Login Channel](https://developers.line.biz/en/docs/line-login/getting-started/)

## ข้อมูลและกติกา

- LINE Login ขอเฉพาะ `openid profile` ไม่ขออีเมล เบอร์ติดต่อให้ผู้เล่นกรอกเอง เพราะ LINE Login ปกติไม่ได้ให้เบอร์โดยอัตโนมัติ
- ผู้เล่นต้องกรอกชื่อและเบอร์ที่ถูกต้อง พร้อมยืนยันการจัดเก็บข้อมูลก่อนเริ่มรอบจัดอันดับ
- ชื่อที่กรอกจะแสดงในอันดับ เบอร์โทรและ LINE user ID แสดงเฉพาะหน้าผู้ดูแลที่ `admin.html` หลังผ่านสิทธิ์จากเซิร์ฟเวอร์
- เวลาจัดอันดับ = เวลาจริงที่เล่นครบทั้งสามด่าน + จำนวนกดผิด × 5 วินาที เวลาคงเหลือด่านละสองนาทีไม่ได้เพิ่มขึ้นเมื่อกดผิด
- เซิร์ฟเวอร์วัดเวลาจากรายการเริ่ม/พัก/เล่นต่อ/พบคำตอบ ไม่รับคะแนนหรือเวลารวมที่ส่งมาจากผู้เล่น แต่ไม่ใช่ระบบป้องกันบอตสำหรับการแข่งขันที่มีรางวัลมูลค่าสูง
- ไม่นับช่วงหยุดพักและโหลดด่าน การพักซ่อนภาพ คะแนนต้องผ่านครบสามด่านตามลำดับ หากหมดเวลา รอบนั้นไม่เข้าอันดับ และต้องเริ่มใหม่ทั้งสามด่าน
- เก็บผลดีที่สุดคนละหนึ่งอันดับ เรียงเวลาน้อยที่สุดก่อน ถ้าเวลาเท่ากันใช้จำนวนกดผิดน้อยกว่า ตามด้วยเวลาที่บันทึกสำเร็จก่อน และรหัสรอบเพื่อให้ลำดับคงที่
- รายการที่ส่งซ้ำเพราะเน็ตสะดุดใช้รหัสเดิม จึงไม่เพิ่มเวลาปรับหรือสถิติซ้ำ หากส่งไม่สำเร็จหน้าสรุปจะแจ้งให้ลองบันทึกใหม่ อย่าปิดหรือโหลดหน้าใหม่จนยืนยันว่าบันทึกแล้ว
- ข้อมูลจริงอยู่ใน D1 ที่ผูกกับ Worker ผ่าน binding `DB` ไม่อยู่ใน GitHub หรือไฟล์เว็บ ผู้ดูแลควรส่งออกสำรองข้อมูลและกำหนดระยะเวลาเก็บตามการใช้งานจริงขององค์กร การ redeploy ไม่ล้างฐานข้อมูล ห้ามลบหรือสร้าง D1 ใหม่ทับตัวเดิมระหว่างกิจกรรม


เอกสาร LINE: [LINE Login สำหรับ Web app](https://developers.line.biz/en/docs/line-login/integrate-line-login/), [LINE Login API](https://developers.line.biz/en/reference/line-login/)
