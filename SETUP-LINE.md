# เปิดใช้ LINE Login และอันดับรวม

ตัวเกมและระบบบันทึกข้อมูลอยู่ในโครงการเดียวกัน ใช้ Node.js 24 ขึ้นไปและ SQLite บนดิสก์ถาวร ไม่ต้องซื้อแพ็กเกจฐานข้อมูลแยก แต่ต้องมีโฮสต์ที่รันเซิร์ฟเวอร์ได้และมี HTTPS

## สถานะ

- หน้าเกมเดิมบน GitHub Pages เปิดป๊อปอัปเริ่มเกมและใช้กติกากดผิด +5 วินาทีได้ เป็น **โหมดฝึกซ้อมที่ไม่บันทึกอันดับ**
- เซิร์ฟเวอร์ที่เพิ่มไว้รองรับ LINE Login, ชื่อและเบอร์ติดต่อ, อันดับร่วมกัน และหน้าผู้ดูแล
- ต้องตั้งค่า LINE Login Channel และนำเซิร์ฟเวอร์ไปเปิดบนโฮสต์ก่อน จึงจะเข้าสู่ระบบ LINE และเก็บข้อมูลคนเล่นจริงได้
- ไม่มีการฝังบัญชีทดสอบหรือข้อมูลผู้เล่นตัวอย่างลงในระบบจริง
- ค่า `LINE_CHANNEL_ID` ใน `.env.example` และชุดติดตั้ง Render ระบุ `2011516015` ตามที่ผู้ดูแลแจ้ง ยังไม่ได้ยืนยันการล็อกอินกับ LINE จริง

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

## ติดตั้งบน Render

ชุดติดตั้ง `render.yaml` เตรียมเว็บเซิร์ฟเวอร์ Node.js 24 หนึ่งเครื่องที่สิงคโปร์ พร้อมดิสก์ถาวร 1 GB สำหรับข้อมูลผู้เล่น ใช้โค้ดจาก branch ของ PR นี้และปิดการ deploy อัตโนมัติ

**มีค่าใช้จ่ายเมื่ออนุมัติสร้างบริการ:** ค่าเครื่อง `0.5c-512mb` เริ่มต้น US$7/เดือน และดิสก์ 1 GB US$0.25/เดือน รวมค่าเครื่องและดิสก์ US$7.25/เดือน ตามราคาที่ตรวจวันที่ 9 กันยายน 2026 ไม่รวมภาษี ค่าแพ็กเกจ workspace หากเลือกแบบเสียเงิน และการใช้งานเกินโควตา ตรวจยอดในหน้า Render ก่อนกดอนุมัติ

[เปิดหน้าตรวจชุดติดตั้งบน Render](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Frecruitmakrocareer%2FSectionCV%2Ftree%2Fcodex%2Fcreate-makro-sprite-spot-the-difference-game)

1. หลังยืนยันเลือกใช้โฮสต์นี้ เปิดลิงก์ด้านบน เข้าสู่บัญชี Render ของผู้ดูแล แล้วตรวจว่ารายการมีเว็บเซิร์ฟเวอร์หนึ่งเครื่องและดิสก์ 1 GB
2. กรอก `LINE_CHANNEL_SECRET` ของ LINE Login Channel `2011516015` ในช่องของ Render โดยตรง ไม่ส่งผ่านแชตหรือ GitHub
3. กรอก `ADMIN_LINE_USER_IDS` จาก **Your user ID** ใน Basic settings ของ LINE Login Channel เพื่อให้บัญชีนั้นดูชื่อและเบอร์ติดต่อในหน้าผู้ดูแลได้ ใส่หลายคนคั่นด้วย comma
4. ตรวจค่าใช้จ่ายแล้วอนุมัติสร้างบริการ รอจนแสดงสถานะ Live จากนั้นคัดลอก URL HTTPS ที่ Render ออกให้ ห้ามเดา URL จากชื่อบริการ
5. ไปที่ Channel `2011516015` ใน LINE Developers → แท็บ **LINE Login** → **Callback URL** กรอก URL จากข้อก่อนตามด้วย `/auth/line/callback`
6. ทดสอบเข้าสู่ระบบ กรอกข้อมูล และเล่นครบสามด่านด้วยบัญชีผู้ดูแลก่อน เปลี่ยน Channel เป็น **Published** เมื่อพร้อมให้ผู้เล่นทั่วไปใช้ แล้วแชร์ URL ของ Render

เซิร์ฟเวอร์ใช้ `RENDER_EXTERNAL_URL` ที่ Render ตั้งให้โดยอัตโนมัติ จึงไม่ต้องกรอก `APP_ORIGIN` ในการติดตั้งครั้งแรก หากเพิ่มโดเมนของตัวเองภายหลัง ให้กำหนด `APP_ORIGIN` เป็น origin ของโดเมนนั้นและแก้ Callback URL ให้ตรงกัน

ฐานข้อมูลอยู่ที่ `/var/data/makro/makro.sqlite` บนดิสก์ถาวร เก็บบริการนี้ไว้หนึ่ง instance และสำรองฐานข้อมูลก่อนดำเนินการกับดิสก์ ช่วง deploy จะมีการหยุดบริการชั่วครู่ตามข้อจำกัดของโฮสต์ที่มีดิสก์ จึงควร deploy นอกช่วงจัดกิจกรรม

อ้างอิง: [Render Blueprint](https://render.com/docs/blueprint-spec), [ตัวแปร URL ของ Render](https://render.com/docs/environment-variables), [ราคาเครื่อง](https://render.com/pricing), [ค่าดิสก์](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses), [ข้อจำกัดดิสก์](https://render.com/docs/disks)

## ขั้นตอนเปิดใช้งาน

1. นำโครงการไปเปิดบนโฮสต์ที่รองรับ Node.js 24 พร้อมดิสก์ถาวร โดยรัน `npm start` หรือใช้ `Dockerfile` ที่เตรียมไว้ ต้องเก็บ `/app/data` บน persistent volume หากใช้ Docker ห้ามเก็บ SQLite บนพื้นที่ชั่วคราวของ serverless หรือบน filesystem ที่ไม่รองรับ SQLite locking
2. ใช้ **โดเมนเดียวกัน** สำหรับหน้าเกมและ API ไม่ต้องเปิด CORS และไม่ส่งข้อมูลผู้เล่นไปยัง GitHub เลือก URL ที่มี HTTPS แล้วกำหนด `APP_ORIGIN` เป็น origin เช่น `https://game.example.com` (ตัวอย่างนี้ไม่ใช่ URL ที่ใช้งานจริง) โดยไม่มี `/` ท้าย URL
3. ใน [LINE Developers Console](https://developers.line.biz/console/) สร้างหรือใช้ **LINE Login Channel** สำหรับ Web app ภายใต้ผู้ให้บริการขององค์กร ตั้ง callback URL เป็น `<APP_ORIGIN>/auth/line/callback` และเปิดสถานะ Published เมื่อพร้อมให้ผู้เล่นทั่วไปใช้
4. ตั้งค่าฝั่งโฮสต์: `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`, `APP_ORIGIN`, `NODE_ENV=production`, `DATA_DIR` และ `ADMIN_LINE_USER_IDS` ตาม `.env.example` เก็บ Channel Secret ในช่อง secret/environment ของโฮสต์ ไม่ใส่ใน HTML, GitHub, screenshot หรือข้อความแชต
5. `ADMIN_LINE_USER_IDS` คือ LINE user ID ที่ผ่านการยืนยันของผู้ดูแล (รูปแบบ `U` ตามด้วย 32 ตัวอักษร) ใส่หลายคนคั่นด้วย comma ถ้าเว้นว่างจะไม่มีใครเปิดข้อมูลติดต่อหรือส่งออก CSV ได้ อย่าตั้งคนแรกที่เข้าสู่ระบบเป็นผู้ดูแลโดยอัตโนมัติ
6. ก่อนใช้จริง ให้ผู้ดูแลล็อกอินผ่าน LINE จริง กรอกชื่อและเบอร์ที่ยินยอมให้ทดสอบ เล่นครบสามด่าน และตรวจการแสดงอันดับกับสิทธิ์ของบัญชีที่ไม่ใช่ผู้ดูแล การทดสอบอัตโนมัติในโครงการจำลองเฉพาะการตอบกลับจาก LINE จึงไม่ทดแทนขั้นตอนนี้
7. แชร์ URL ของโฮสต์ใหม่ให้ผู้เล่น หรือค่อยเปลี่ยนลิงก์จากเว็บ GitHub Pages หลังระบบ LINE พร้อมใช้งานแล้ว

## ข้อมูลและกติกา

- LINE Login ขอเฉพาะ `openid profile` ไม่ขออีเมล เบอร์ติดต่อให้ผู้เล่นกรอกเอง เพราะ LINE Login ปกติไม่ได้ให้เบอร์โดยอัตโนมัติ
- ผู้เล่นต้องกรอกชื่อและเบอร์ที่ถูกต้อง พร้อมยืนยันการจัดเก็บข้อมูลก่อนเริ่มรอบจัดอันดับ
- ชื่อที่กรอกจะแสดงในอันดับ เบอร์โทรและ LINE user ID แสดงเฉพาะหน้าผู้ดูแลที่ `admin.html` หลังผ่านสิทธิ์จากเซิร์ฟเวอร์
- เวลาจัดอันดับ = เวลาจริงที่เล่นครบทั้งสามด่าน + จำนวนกดผิด × 5 วินาที เวลาคงเหลือด่านละสองนาทีไม่ได้เพิ่มขึ้นเมื่อกดผิด
- เซิร์ฟเวอร์วัดเวลาจากรายการเริ่ม/พัก/เล่นต่อ/พบคำตอบ ไม่รับคะแนนหรือเวลารวมที่ส่งมาจากผู้เล่น แต่ไม่ใช่ระบบป้องกันบอตสำหรับการแข่งขันที่มีรางวัลมูลค่าสูง
- ไม่นับช่วงหยุดพักและโหลดด่าน การพักซ่อนภาพ คะแนนต้องผ่านครบสามด่านตามลำดับ หากหมดเวลา รอบนั้นไม่เข้าอันดับ และต้องเริ่มใหม่ทั้งสามด่าน
- เก็บผลดีที่สุดคนละหนึ่งอันดับ เรียงเวลาน้อยที่สุดก่อน ถ้าเวลาเท่ากันใช้จำนวนกดผิดน้อยกว่า ตามด้วยเวลาที่บันทึกสำเร็จก่อน และรหัสรอบเพื่อให้ลำดับคงที่
- รายการที่ส่งซ้ำเพราะเน็ตสะดุดใช้รหัสเดิม จึงไม่เพิ่มเวลาปรับหรือสถิติซ้ำ หากส่งไม่สำเร็จหน้าสรุปจะแจ้งให้ลองบันทึกใหม่ อย่าปิดหรือโหลดหน้าใหม่จนยืนยันว่าบันทึกแล้ว
- ฐานข้อมูลส่วนตัวอยู่ใน `DATA_DIR` และถูกกันออกจาก Git กับไฟล์เผยแพร่ ผู้ดูแลโฮสต์ต้องดูแลสิทธิ์ดิสก์ สำรองข้อมูล และกำหนดระยะเวลาเก็บตามการใช้งานจริงขององค์กร

## ทดสอบในเครื่อง

```bash
npm ci --ignore-scripts
npm test
npm run build
npm start
```

หากไม่มี LINE Channel ให้เปิด `http://localhost:8000` เพื่อฝึกซ้อมได้ เซิร์ฟเวอร์จะไม่สร้างการยืนยัน LINE จำลองเพื่อให้ผ่านล็อกอิน

เอกสารต้นทาง: [LINE Login สำหรับ Web app](https://developers.line.biz/en/docs/line-login/integrate-line-login/), [LINE Login API](https://developers.line.biz/en/reference/line-login/), [GitHub Pages เป็น static hosting](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
