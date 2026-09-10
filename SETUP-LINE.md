# เปิดใช้ LINE Login และอันดับรวมแบบไม่มีค่าใช้จ่าย

ใช้ **Cloudflare Workers Free + D1 Free** สำหรับหน้าเกม เซิร์ฟเวอร์ LINE Login และฐานข้อมูลผู้เล่น ใช้ URL HTTPS `workers.dev` ที่ Cloudflare ออกให้ จึงไม่ต้องซื้อโดเมนหรือเช่าเครื่องรายเดือน ชุดติดตั้ง Render แบบเสียเงินถูกนำออกแล้ว

## สถานะ

- โค้ดรองรับ LINE Login, ชื่อ/เบอร์ติดต่อ, อันดับรวม 10 คน, ป๊อปอัปเริ่มเกม และกดผิด +5 วินาที
- ใช้ LINE Login Channel ID `2011516015` ตามที่ผู้ดูแลแจ้ง ยังไม่ได้ยืนยันการล็อกอินจริงกับ Channel นี้
- ผู้ดูแลสร้าง Worker `sectioncv` และเชื่อม `DB` กับ D1 `makro-player-data` แล้ว บันทึก Database ID จริงใน `wrangler.json` ภาพ D1 Studio ล่าสุดยืนยันว่ามีครบ 5 ตารางและ 5 ดัชนี รวมดัชนี `idx_runs_one_active`
- รวม PR #3 เข้า `main` เมื่อ 10 กันยายน 2026 ที่ commit `b3c7d498b6cb636bc309253d43a74bf673c5542f` และ [Cloudflare Workers Build](https://dash.cloudflare.com/98ce6428552408440b1d95e76cda8e04/workers/services/view/sectioncv/production/builds/b3d91398-2267-4dd0-8046-864b223416d5) รายงานสำเร็จ พร้อม Version ID `9963e42a-7fd6-4c2e-9fd8-9724afb1efaa`
- กำหนด `APP_ORIGIN` เป็น `https://sectioncv.recruitcpaxtramakro.workers.dev` จากชื่อ Worker และ subdomain ที่ Cloudflare รายงานแล้ว ยังไม่ได้ยืนยันการตอบกลับ HTTP ของเว็บจริง การตั้งค่า Secret และการล็อกอิน LINE แบบครบขั้นตอน
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

ไฟล์ `wrangler.json` ระบุ Worker `sectioncv` และฐานข้อมูลเดิม `makro-player-data` ด้วย Database ID `1adbee78-8771-44f9-bc9d-6e5c4d231b22` แล้ว การ deploy ในบัญชีนี้ใช้ฐานข้อมูลเดิมและ migration ที่มีอยู่ ไม่ต้องสร้างฐานข้อมูลใหม่

### ผ่านหน้า Cloudflare

1. ตรวจว่า Workers เป็น **Free** แล้วเปิด Worker `sectioncv` ที่สร้างไว้ → **Settings → Build** ใช้ repository `recruitmakrocareer/SectionCV` และ Git/Production branch `main` ซึ่งรวมโค้ดเกมจาก PR #3 แล้ว หากตั้งเป็นสาขา PR ตามขั้นตอนก่อนหน้านี้ ให้เปลี่ยนกลับเป็น `main` และปิด Builds for non-production branches หากยังไม่ได้เชื่อม Builds ให้กด Connect แล้วเลือก repository และ branch เดียวกัน
2. ชื่อ Worker ใน `wrangler.json` คือ `sectioncv` ตรงกับโครงการที่ผู้ดูแลสร้าง ตั้ง build command เป็น `npm run build`, deploy command เป็น `npm run deploy` และ root directory เป็นราก repository ใช้ Node.js 24 ขึ้นไปในสภาพแวดล้อม build ตัว deploy command จะสร้างตารางด้วย migration ก่อนเปิดเวอร์ชันใหม่ ต้องตั้งค่าฐานข้อมูลในข้อ 3 ให้เสร็จก่อนเริ่ม build
3. ตรวจในแท็บ **Bindings** ว่า `DB` ชี้ไปยัง `makro-player-data` ที่มี ID ตรงกับไฟล์ `wrangler.json` ซึ่งตั้งค่าให้แล้ว ตรวจว่า API token ที่เลือกสำหรับ Workers Builds มีสิทธิ์ **Account → D1 → Edit** ในบัญชีนี้เพื่อรัน migration หาก build แจ้งไม่มีสิทธิ์ ให้แก้ token เดิมในบัญชี Cloudflare โดยตรง ไม่ส่ง token ในแชตหรือ GitHub จากนั้นเริ่ม build ของ `main` ด้วย deploy command `npm run deploy` และตรวจว่าขั้นตอน migration สำเร็จ ตารางที่สร้างด้วยมือแล้วใช้คำสั่ง `IF NOT EXISTS` ชุดเดียวกัน จึงรัน migration ซ้ำได้
4. หลัง deploy `main` สำเร็จ ตรวจว่ามี D1 binding `DB` และ `workers.dev` เปิดใช้งาน (`workers_dev: true` เตรียมไว้ในไฟล์แล้ว) URL ของ Worker นี้คือ `https://sectioncv.recruitcpaxtramakro.workers.dev` และตั้ง `APP_ORIGIN` ไว้ในไฟล์แล้ว ไปที่ Worker → Settings → Variables and Secrets ตั้ง Secret ตามตารางด้านล่าง แล้วกด Deploy การที่ build สำเร็จเพียงอย่างเดียวยังไม่ยืนยันว่า API และ LINE Login ใช้งานได้จริง
5. ใน LINE Developers ของ Channel `2011516015` → แท็บ **LINE Login** → **Callback URL** ใส่ `https://sectioncv.recruitcpaxtramakro.workers.dev/auth/line/callback` แล้วบันทึก
6. ทดสอบด้วยบัญชี Admin/Tester ของ Channel ก่อน: ล็อกอิน → กรอกชื่อ/เบอร์และยินยอม → เล่นครบสามด่าน → ตรวจอันดับและหน้าผู้ดูแล จากนั้นตั้ง Channel เป็น **Published** เมื่อพร้อมให้บุคคลทั่วไปใช้ แล้วแชร์ URL ของ Worker

| ค่าบน Worker | ค่าและวิธีกรอก |
| --- | --- |
| `APP_ORIGIN` | `https://sectioncv.recruitcpaxtramakro.workers.dev` เตรียมไว้ใน `wrangler.json` แล้ว หากย้ายโดเมนให้แก้ค่านี้และ Callback URL ให้ตรงกัน |
| `LINE_CHANNEL_ID` | `2011516015` เตรียมไว้ในโค้ดแล้ว |
| `LINE_CHANNEL_SECRET` | เลือกชนิด **Secret** แล้วกรอก Channel Secret จาก Basic settings ของ LINE Login Channel ลง Cloudflare โดยตรง ไม่ส่งในแชตหรือ GitHub |
| `ADMIN_LINE_USER_IDS` | เลือกชนิด **Secret** แล้วกรอก **Your user ID** ของผู้ดูแลจาก Channel เดียวกัน หลายคนคั่นด้วย comma หากเว้นว่างจะไม่มีใครเปิดรายชื่อ/เบอร์ผู้เล่นได้ |

ก่อนใส่ Channel Secret ระบบแสดงโหมดฝึกซ้อม ไม่เปิด LINE Login อัตโนมัติจาก URL ที่ผู้เล่นส่งมา `keep_vars: true` ช่วยรักษาค่าอื่นที่ตั้งบน dashboard ระหว่าง deploy ส่วน `APP_ORIGIN` และ `LINE_CHANNEL_ID` ใช้ค่าจากไฟล์ และ Secret จะไม่อยู่ในไฟล์เว็บ

หากหน้าเกมยังแสดงโหมดฝึกซ้อม ให้เปิด [สถานะการตั้งค่า](https://sectioncv.recruitcpaxtramakro.workers.dev/api/setup-status) ดูรายการ `missing` ระบบคืนเฉพาะชื่อค่าที่ขาดหรือมีรูปแบบไม่ถูกต้อง ไม่คืนค่าลับหรือข้อมูลผู้เล่น และไม่อ่านหรือเขียนฐานข้อมูล หากมี `LINE_CHANNEL_SECRET` ให้ตั้ง Secret ที่ Worker → Settings → Variables and Secrets แล้วกด Deploy; ค่าที่ใส่ใน Builds → Build variables and secrets ไม่ถูกส่งให้ Worker ขณะให้บริการ หากมี `DB` ให้ตรวจ binding ฐานข้อมูล ส่วน `APP_ORIGIN` และ `LINE_CHANNEL_ID` ให้ตรวจว่าเผยแพร่ `main` ล่าสุดแล้ว หลังแก้ไขให้โหลดหน้าเกมใหม่ `lineReady: true` และ `missing: []` ยืนยันเพียงว่าค่าที่จำเป็นมีครบ ยังต้องทดสอบ LINE Login จริงเพื่อยืนยันความถูกต้องของ Secret และ Callback

อ้างอิงการตั้งค่า: [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/), [Wrangler configuration และการสร้างทรัพยากร](https://developers.cloudflare.com/workers/wrangler/configuration/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)

### ผ่านเครื่องผู้ติดตั้ง

ใช้ Node.js 24 ขึ้นไป เริ่มจาก checkout `main` แล้วทำตามนี้หลังตรวจบัญชี Free:

```bash
npm ci --ignore-scripts
npx wrangler login
```

ตรวจว่าเข้าสู่บัญชีที่มีฐานข้อมูล `makro-player-data` ตาม ID ใน `wrangler.json` แล้ว จากนั้น:

```bash
npm run deploy
```

ตั้งค่าบน dashboard และตั้ง Callback URL ตามขั้นตอนด้านบน การ deploy ครั้งต่อไปใช้คำสั่งเดิมและฐานข้อมูลเดิม คำสั่ง migrations บันทึกว่าเคยสร้างตารางแล้ว ไม่ล้างผลการเล่น

หากนำโครงการไปติดตั้งในอีกบัญชี ให้สร้าง D1 ของบัญชีนั้นและเปลี่ยน `database_id` เป็น ID จริงที่ Cloudflare ออกให้ก่อน deploy; ID ในโครงการนี้เป็นของบัญชีผู้ดูแลเกมปัจจุบัน

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
