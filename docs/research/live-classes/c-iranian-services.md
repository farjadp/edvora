# E-033: "Buy" baseline for live classes and webinars inside Iran

Researcher: Claude (subagent), 2026-11-06. Applies to Edvora, tenant #1 Iran Brand Academy (IBA). Typical class is 20–60 people, peak 200, open webinar up to 500.

**Method.** I fetched pages from outside Iran with curl/WebFetch on 2026-11-06 (UTC) and used web search in Persian and English. Most Iranian vendor sites loaded. University sites (`*.ac.ir`) blocked me with 403 or failed DNS, so for those I used search snippets, labelled as such. **All prices are copied exactly as published, in toman** (every vendor below quotes toman). I have not converted any of them. `[unverified]` marks anything I could not confirm from a primary source.

---

## 0. TL;DR

| | Skyroom | Adobe Connect (Iranian "resellers") | BigBlueButton hosts (Iranian) | Alocom |
|---|---|---|---|---|
| Who | Mahbang Fanavari-haye Pars (+ Nasim Ertebat Damavand for enterprise) | adobeconect.ir, Roomeet, Madyar, Tehran Server, Mobinhost … | bigbluebuton.ir, Roomeet, Famaserver, Hostida, Atenahost, Qaemhost … | Alocom (alocom.co) |
| Legal status | Domestic product, e-Namad listed | **Pirated.** adobeconect.ir says new Adobe Connect versions reach Iranian companies "after being cracked". Adobe licence terms bar Iran. | Open source (LGPL), legal to self-host | Domestic |
| Published price, 50 concurrent, monthly | 2,990,000 toman (edu, 4 cams) | 1,040,000 toman (5 cams) | 2,550,000 toman (with recording, 5 cams) | not obtainable (JS/API) |
| API | Yes. REST, documented, 23 actions, **no webhooks** | Only on 300+ user plans (adobeconect.ir) | Only on ≥150/200-user plans (bigbluebuton.ir); BBB API is standard | "Free plugin and API" claimed |
| White-label | Paid add-ons: iframe / custom domain / personalisation | [unverified] | Roomeet VIP: logo | Logo + custom domain claimed |
| Self-host / on-prem | Yes, "enterprise version on the organisation's own server" (price on request) | Possible but pirated | Yes (open source) | "Full server access for organisations" claimed |
| Who uses it | Sharif (since 1396/2017), Gilan Univ., Shahroud MUMS, Ayandegan; Skyroom also lists Univ. of Tehran and TUMS as customers | Many medical universities (Shiraz MUMS 2024 manual, Iran MUMS), Hamedan Univ. of Technology (1404–1405) | Smaller academies via hosts | [unverified] |

**Bottom line.** Skyroom is the only domestic vendor that clears all three bars: credible, legal, and integrable. It has a public price list (verified today), a documented API, in-browser clients on Android and iOS, domestic servers and real university references. For IBA-size classes the service runs about **8.7–17.6 M toman/month** depending on concurrency and prepay (§6). Recording, not seats, is the biggest variable cost. Adobe Connect in Iran is **cracked software**, so a multi-tenant SaaS should not build on it. BBB hosts are cheap but each one is a thin reseller of an open-source product Edvora could run itself, which is the "build" option for a separate memo.

---

## 1. Skyroom (اسکای‌روم), skyroom.online

### 1.1 Company
- Legal owner: **شرکت مهبانگ فن آوری های پارس** (Mahbang Fanavari-haye Pars). The footer on most pages names it. The order page and enterprise page add **شرکت نسیم ارتباط دماوند** as co-provider of the "enterprise solutions". Sources: https://www.skyroom.online/skyroom/order and https://www.skyroom.online/راهکار-سازمانی-اسکای-روم/ (accessed 2026-11-06).
- About page (stats "last updated Mehr 1405"): 13 years active, 100k+ customers, 433k+ organisers, 44M+ events, 806M+ person-hours, 95k+ active organisers. Timeline: 1392 Faramoon, 1393 Skyroom born, 1395 web version, 1404 online-event feature, 1405 marketplace. Support line 021-57605000, 8:00–22:00, 7 days a week. https://www.skyroom.online/about/ (accessed 2026-11-06).
- Zoomit (31 Mordad 1405, about 2026-08-22) quotes Skyroom's marketing director. School usage in spring 1405 was up "8,000%" year on year. Peak load was "33,000 simultaneous events and 540,000 users". These are company-supplied figures. https://www.zoomit.ir/iran-news/465734-skyroom-schools-online-education-growth/

### 1.2 Price list (verified live, 2026-11-06)
**Source:** the plan JSON embedded in https://www.skyroom.online/skyroom/order, fetched 2026-11-06 22:56 UTC. Its server timestamp is `time: 1794005785`. The currency is **toman**: the order UI renders through `formatCurrency(..., 'تومان')`. **10% VAT is added at checkout** (`مالیات (۱۰٪)`). Prepay bonuses: 3 months +10 days, 6 months +25 days, 9 months +40 days, 12 months +60 days. Service attributes are `user_limit` (concurrent online users), `video_limit` (simultaneous webcams per room) and `time_limit`. `time_limit` is null on every plan, meaning unlimited hours.

**Educational services (سرویس‌های آموزشی), 4 simultaneous videos**

| Plan | Concurrent users | 1 month | 3 months | 6 months | 12 months |
|---|---|---|---|---|---|
| 5edu | 5 | 555,000 | 1,665,000 | 3,330,000 | 6,660,000 |
| 30edu | 30 | 2,000,000 | 5,700,000 | 10,800,000 | 19,440,000 |
| 50edu | 50 | 2,990,000 | 8,142,000 | 15,540,000 | 28,512,000 |
| 100edu | 100 | 5,680,000 | 15,561,000 | 30,300,000 | 53,400,000 |
| 150edu | 150 | 8,300,000 | 22,740,000 | 44,220,000 | 79,560,000 |
| 250edu | 250 | 12,835,000 | 35,760,000 | 67,440,000 | 125,112,000 |
| 350edu | 350 | 17,800,000 | 48,180,000 | 92,580,000 | 170,160,000 |
| 500edu | 500 | 25,000,000 | 67,800,000 | 130,170,000 | 238,800,000 |
| 750edu | 750 | 33,400,000 | 93,780,000 | 178,050,000 | 318,600,000 |
| 1000edu | 1000 | 42,269,000 | 118,680,000 | 226,200,000 | 399,480,000 |
| 1500edu | 1500 | 63,730,000 | 179,100,000 | 341,460,000 | 603,120,000 |
| 2000edu | 2000 | 84,960,000 | 238,833,000 | 455,220,000 | 804,360,000 |
| 3000edu | 3000 | 127,460,000 | 358,170,000 | 682,920,000 | 1,194,000,000 |

**"Special" services (سرویس‌های ویژه), 10 simultaneous videos, aimed at meetings**

| Plan | Users | 1 month | 3 months | 6 months | 12 months |
|---|---|---|---|---|---|
| business10 | 10 | 2,690,000 | 7,110,000 | 13,914,000 | 25,440,000 |
| business20 | 20 | 5,122,000 | 13,890,000 | 27,360,000 | 48,900,000 |
| business30 | 30 | 7,480,000 | 20,910,000 | 39,300,000 | 71,376,000 |
| business50 | 50 | 11,840,000 | 33,360,000 | 63,660,000 | 112,680,000 |
| business100 | 100 | 20,800,000 | 56,340,000 | 106,560,000 | 194,880,000 |
| business250 | 250 | 43,186,000 | 116,820,000 | 221,370,000 | 398,364,000 |
| business500 | 500 | 66,354,000 | 184,740,000 | 349,194,000 | 627,264,000 |
| business900 | 900 | 95,590,000 | 268,650,000 | 512,190,000 | 904,200,000 |

**Daily / webinar services (سرویس‌های روزانه), 4 videos**

| Plan | Users | 1 day | 2 days | 3 days |
|---|---|---|---|---|
| webinar150 | 150 | 915,000 | 1,830,000 | 2,745,000 |
| webinar250 | 250 | 1,460,000 | 2,920,000 | 4,344,000 |
| webinar500 | 500 | 2,540,000 | 5,080,000 | 7,620,000 |
| webinar1000 | 1000 | 5,000,000 | 10,000,000 | 15,000,000 |
| webinar1500 | 1500 | 6,950,000 | 13,900,000 | 20,850,000 |
| webinar2000 | 2000 | 9,270,000 | 18,540,000 | 27,810,000 |
| webinar3000 | 3000 | 13,900,000 | 27,800,000 | 41,700,000 |

**Add-on packages.** Source: `packages` in https://data.skyroom.online/themes/skyroom/assets/js/script.min.js?v0.3.9, fetched 2026-11-06. The same recording prices appear on https://www.skyroom.online/record/.

| Add-on | Price (toman) |
|---|---|
| Cloud recording (ضبط رویداد), by hours | 5 h 615,000 · 10 h 1,160,000 · 20 h 2,120,000 · 50 h 4,850,000 · 100 h 9,700,000 · 500 h 27,500,000 · 1000 h 42,000,000 |
| iFrame embed | 1 mo 6,971,000 · 3 mo 13,944,000 · 6 mo 23,700,000 · 1 yr 41,832,000 |
| Custom domain (دامنه اختصاصی) | 1 mo 13,520,000 · 3 mo 27,060,000 · 6 mo 46,020,000 · 1 yr 81,600,000 |
| Personalisation / white-label (شخصی‌سازی) | 1 mo 24,500,000 · 3 mo 46,710,000 · 6 mo 79,470,000 · 1 yr 139,428,000 |

Older third-party snapshots are much lower (e.g. "30 users 260,000/month") and are **obsolete**. Ignore them.

- Free trial: 5 days with all features, per https://www.skyroom.online/online-education/. Older sources say 10 days.
- Capacity: plans go up to 3,000 concurrent. The webinar landing text says "private webinar up to 3000". For events over 1,000 users, Skyroom asks for 24 hours' notice via ticket (home-page FAQ, https://www.skyroom.online/).

### 1.3 Features
Sources: https://www.skyroom.online/online-education/ , https://www.skyroom.online/ , https://www.skyroom.online/support/ , https://www.skyroom.online/record/ (all accessed 2026-11-06).

| Feature | Status | Note |
|---|---|---|
| Screen share | Yes | Desktop share. Phone screen-share-to-PC guide exists. |
| Whiteboard | Yes | |
| Slides / PDF / PPT, video playback | Yes | "show slides, PowerPoint, PDF"; "play multiple media simultaneously" |
| Chat (public + private) | Yes | Moderator can control mic, cam, public chat and private messages |
| Polls / quiz | Yes (claimed) | "live quiz mid-class, quick voting" on the online-education page |
| Breakout rooms | **[unverified]** | Not mentioned on any Skyroom page I fetched. The webinar FAQ suggests separate rooms for side workshops instead. |
| Hand raise | Yes | Room UI mock shows "۲ نفر دست بلند کرده‌اند"; a "hand tool" help article exists |
| Moderator / roles | Yes | Roles: normal user (1), presenter (2), operator (3), admin. "Operator must log in first" (`op_login_first`) |
| Waiting room / lobby | **[unverified]** | Only `op_login_first` (users wait until operator enters) and guest login/guest limit |
| Recording | Cloud and local | Cloud recording is a paid hourly pack (above). Local recording (operator's PC) is unlimited while cloud hours remain. Local saves auto-chunk every 30 min. **Quality conflict:** feature list says "Full HD", FAQ says "720". Download and share-link supported. **30 GB** storage on all packs. **Files kept only 30 days after service expiry.** Recording file format **[unverified]**: not stated. |
| Attendance report | Yes | "attendance list and time present per participant, exportable for manager/parents". Panel has a sessions/connections log. **Not exposed in the API** (see 1.5). |
| Online events / ticketing | Yes | Registration page, tickets, discount codes, marketplace (since 1404/1405) |

### 1.4 Clients and browsers
- Web-based, no install: "the room link opens on any device and browser" (online-education FAQ). Chrome or Firefox is recommended (FAQ https://www.skyroom.online/faq/category/user-help, accessed 2026-11-06).
- **iOS:** the FAQ tells iPhone/iPad users to open the link **in Safari** (not inside Telegram/WhatsApp) so mic and cam work, which means in-browser on iOS Safari. The older "advantages" page still says no app is needed on phones and tablets "except iPhone". That is a **contradiction on Skyroom's own site**, so test on a real iPhone before relying on it. https://www.skyroom.online/advantages/
- Android: browser, plus an optional Android app via Iranian stores (https://www.skyroom.online/apps-landing/; Myket listing `online.skyroom`).
- Network: **UDP 10000–20000** must be open. VPN/proxy hurts quality. Organisations behind a corporate network must ask for a port list, and Skyroom asks for an official letter listing their IPs (FAQ + home page).
- Bandwidth: Skyroom claims smart quality adaptation, reduced bandwidth and **servers in Iranian data centres** (advantages page).

### 1.5 Web service API (verified)
- Docs: **https://data.skyroom.online/help/webservice.html**. Samples: **https://github.com/SkyroomOnline/webservice** (last push 2024-02-06). WordPress plugin: https://github.com/SkyroomOnline/wordpress-plugin (last push 2026-09-26) and https://downloads.wordpress.org/plugin/skyroom-wp.1.6.5.zip. Landing page: https://www.skyroom.online/web-service/.
- Style: every request is a POST to `https://www.skyroom.online/skyroom/api/{50-char-api-key}` with body `{"action": "...", "params": {...}}`. JSON in and out. Every response returns HTTP 200 with `{ok, result}` or `{ok:false, error_code, error_message}`. Error codes run 10–15. **Rate limit 500 requests/min**; above that returns 503. Skyroom advises creating rooms and users once, storing their IDs, and **pre-generating login URLs** for big simultaneous class loads.
- **Actions (23):**
  - Services: `getServices`
  - Rooms: `getRooms`, `countRooms`, `getRoom` (by id or name), `getRoomUrl`, `createRoom`, `updateRoom`, `deleteRoom`, `getRoomUsers`, `addRoomUsers`, `removeRoomUsers`, `updateRoomUser`
  - Users: `getUsers`, `countUsers`, `getUser`, `createUser`, `updateUser`, `deleteUser`, `deleteUsers`, `getUserRooms`, `addUserRooms`, `removeUserRooms`
  - SSO-style: **`createLoginUrl`** with params `room_id, user_id, nickname, access (1–3), concurrent, language, ttl (default 3600 s)`. It returns `https://www.skyroom.online/ch/{channel}/{room}/t/{JWT}/l/{lang}`. The token in the doc example is an HS256 JWT signed by Skyroom.
- Room fields include `max_users`, `guest_login`, `guest_limit`, `op_login_first`, `session_duration`, `time_limit` and `time_usage`, the last in person-seconds.
- **Not in the API:** webhooks/callbacks, attendance/session reports, recording list/download. All three are panel-only as far as the doc shows. To get attendance and recordings into Edvora, someone would have to scrape the panel or download files by hand, unless the enterprise tier offers more `[unverified]`.
- The online-education page mentions "API and LMS plugins". The only plugin I found is the WordPress one. I found **no official Moodle plugin**, and a GitHub search hit rate limits.

### 1.6 White-label
- Add-ons (prices in 1.2): **iFrame** (embed rooms in your HTTPS site), **custom domain** (CNAME a subdomain, URLs become `yourdomain/ch/room`, your logo replaces Skyroom's, SSL included), and **personalisation** (your logo in the room and login page, Skyroom trademark/ads/help links removed, custom domain). https://www.skyroom.online/textual-guide/business-options/ , https://www.skyroom.online/custom-domain/ , https://www.skyroom.online/iframe/
- **For a multi-tenant SaaS:** branding applies per Skyroom account/service. Giving each Edvora tenant its own brand probably means one Skyroom account and add-on set per tenant `[unverified]`. Ask Skyroom enterprise sales (021-57605760).

### 1.7 On-premise / enterprise
- "Skyroom can be installed on the organisation's dedicated server, with multi-level user management and connection to your learning system via the enterprise version." There is no published price. https://www.skyroom.online/online-education/ ; the enterprise page https://www.skyroom.online/راهکار-سازمانی-اسکای-روم/ is JS-rendered and showed only contacts.

### 1.8 Uptime, outages, shutdowns
- I found **no public status page** and no independent outage reports specific to Skyroom (searched in Persian and English, 2026-11-06).
- Context: Iran had a nationwide internet shutdown from **8 January 2026**, and education moved online after strikes from 28 February 2026 (Iran International, 2026-05-19, https://www.iranintl.com/en/202605199955; CGTN 2026-03-22). Those reports name **Shad** (state platform) for failures and do not mention Skyroom.
- Digiato's 12 Farvardin 1405 list of Iranian sites usable during the international-internet cut includes Skyroom under "organisational services", but does not say outright that it works on the national network. https://digiato.com/training/most-used-iranian-sites
- A Skyroom FAQ snippet (search result, page not opened) says "currently all sessions are only internet-based (online) and not possible on internal organisational networks". That concerns intranets, not the NIN. Hosting is domestic, so it **probably** stays reachable during an international cut, but that is `[unverified]`. Ask Skyroom for written confirmation.
- Usage spike: school usage up 80× in spring 1405 (Zoomit above). That shows load capacity, but also means IBA would share infrastructure with millions of school users at peak.

---

## 2. Adobe Connect in Iran

- **Legal and sanctions status.** Adobe's download licence says users certify they are not nationals of embargoed countries, Iran included (https://www.adobe.com/support/downloads/license.html). Adobe community posts quote Adobe as "legally prohibited from providing its products and services to Iran". No Adobe distributor or reseller exists in Iran (community anecdote).
- **What Iranian "resellers" actually sell.** **adobeconect.ir** (note the misspelt domain), which calls itself the "official site" and the "Adobe Connect representative company in Iran", writes on its homepage: *"Adobe Connect releases new versions every year, which, after being cracked, become available to Iranian companies"*. https://adobeconect.ir/ (accessed 2026-11-06). **This is pirated software.** That is a legal and reputational risk, and the security risk of running cracked server builds rules it out for a commercial multi-tenant product.
- **Client.** Adobe ended Flash "Classic View" with Connect 12, and the HTML client is now standard. adobeconect.ir says **teachers must use Windows/Mac and install the app to screen-share**, while students can join from a browser. Version lag: cracked builds trail official releases "possibly several years".
- **Published prices, adobeconect.ir** (https://adobeconect.ir/order, accessed 2026-11-06, page undated, toman per month): 5u 220,000 · 10u 380,000 · 20u 560,000 · 30u/5cam 640,000 · 30u/30cam 1,040,000 · 40u 840,000 · **50u/5cam 1,040,000 · 50u/30cam 1,750,000** · 60u 1,430,000 · 80u 1,800,000 ("recording kept up to 5 months") · **100u/5cam 2,000,000** · 100u/30cam 3,200,000 · 120u 2,300,000 · 150u 2,700,000 / 4,750,000 · **200u 3,350,000 / 5,800,000** · 250u 3,750,000 · 300u 4,550,000 / 7,100,000 (first tier with **API**) · 350u 4,750,000 · 400u 5,550,000 / 9,100,000 · **500u 6,750,000** · 750u 9,650,000 / 16,000,000 · 1000u 14,500,000 · 1500u 18,900,000 · 2000u 26,000,000. All plans list "recording capability".
- **Roomeet** (roomeet.ir) Adobe Connect: 10 users / 5 webcams, 536,000 per month at 1-month term down to 375,000 per month on a year. **"Recording is not offered in Adobe Connect."** Prices exclude 10% VAT. Dedicated server inside Iran, Persian panel, API/web service, SMS reminders. https://roomeet.ir/adobe-connect/ (accessed 2026-11-06).
- Others (no prices captured): **Madyar** (madyar.org) offers Adobe Connect classes and cites Azad Tehran and the universities of Shiraz, Tabriz, Arak, Yazd and Kharazmi as customers per search snippet, with a 1-month free trial (https://cp.madyar.org/Article/202). **Tehran Server** claims to be the "first Persian Adobe Connect provider". **Mobinhost** sells Adobe Connect and BBB VPSs (https://www.mobinhost.com/vps-class/).
- Universities: Shiraz MUMS published an Adobe Connect user manual (Jan 2024) and pairs it with the **Navid** LMS (medicine.sums.ac.ir, mgsch.sums.ac.ir; both 403 from outside, known from search snippets). Iran MUMS has a guide (hospht.iums.ac.ir). Hamedan University of Technology's 1404–1405 notice names Adobe Connect or Dars-afzar (hut.ac.ir, snippet). **Medical universities are the heaviest Adobe Connect + Navid users.**

## 3. BigBlueButton hosts in Iran

| Vendor | URL | What | Published price (toman/month) | Notes |
|---|---|---|---|---|
| bigbluebuton.ir | https://bigbluebuton.ir/order | Shared BBB subscription | **No recording:** 30u 1,000,000 · 50u 1,325,000 · 100u 2,700,000 · 200u 5,400,000 · 500u 13,500,000. **With recording:** 30u 1,450,000 / 2,150,000 (30 cams) · **50u 2,550,000** / 3,650,000 · **100u 4,350,000** · 150u 6,350,000 / 8,750,000 (API) · **200u 8,750,000 (API)** · 300u 13,100,000 · 400u 17,500,000 / 25,500,000 · 600u 26,200,000 / 45,500,000 · 750u 32,800,000 · 1000u 43,700,000 / 63,700,000 · 2000u 87,400,000 / 127,500,000 | "Recordings kept at least 3 months"; "API plans can connect to other LMSs". Phone 021-44155036. Same site template and wording as adobeconect.ir, so probably the same operator `[unverified]`. Accessed 2026-11-06, page undated. |
| Roomeet | https://roomeet.ir/bigbluebutton/ | Shared or dedicated BBB | 5u/5cam: 385,000 (1 mo) down to 270,000 (1 yr) per month. **VIP dedicated server from 3,300,000/month for 25+ users**, unlimited webcams, logo. Recording priced separately (JS-loaded, not captured). +10% VAT | Moodle/LMS connection and API claimed; trial 3 days; tel 021-91090414 |
| Famaserver, Atenahost, Hostida, Qaemhost, Iranwebsv, Blueserver, Tehran Server, Mobinhost | various | BBB **VPS** (you or they install) | e.g. Tehran Server "50-user plan" 1,450,000/month (hosted at Shatel). VPS listings found in search at 3,800,000–4,200,000/month for 4–8 cores | Raw infrastructure resellers. Prices from search snippets, some pages years old. |

BBB itself is open source. In-browser WebRTC works on Android Chrome and iOS Safari, it has breakout rooms, polls, a shared notes whiteboard and recordings, and its API is standard (create/join/getMeetings/getRecordings with **callbacks**). A host only adds servers and a Persian panel, so this is really the "build/self-host" baseline and should be evaluated in the build memo.

## 4. Other Iranian platforms

| Platform | URL | Owner | Pricing | Notes |
|---|---|---|---|---|
| **Alocom (الوکام)** | https://alocom.co | Alocom (legal name not on page) | Prices page JS-rendered; API endpoint `pnlapi.alocom.co/api/v1/services` returned 404 from outside → **not obtained** | Claims 29M participants, 37M events, 300k organisers. Features: recording without install, polls/MCQ, **breakout groups (گروه‌بندی)**, speech-to-text/minutes, watermark, logo + custom domain, "free plugin and API", "full server access for organisations". Plan types: class (4 video), daily webinar, meeting (10 video), the same structure as Skyroom. Tel 021-31903000. |
| **Vadana (وادانا)** | vadamap.ec.iau.ir | Islamic Azad University (in-house) | Not for sale | Azad's own virtual-class system. Digiato reported student complaints. Not a buy option. https://www.digikala.com/mag/vadana-system-virtual-class-guide/ |
| **Shad (شاد)** | — | Ministry of Education | Not for sale | K-12 state app. Widely reported failures in 2026 (Iran International 2026-05-19). |
| **Navid (نوید)** | — | LMS used by medical universities | [unverified] | An LMS, not a live-class tool. Pairs with Adobe Connect or Skyroom. |
| **Evand webinars** | https://evand.com | Evand | JS-only page, nothing captured | Evand's CEO is quoted as a long-time Skyroom user on Skyroom's about page, so Evand probably runs its webinars on Skyroom `[unverified]`. |
| Vroom/ویروم, Kelasor, Alfa Class, iMeeting/همیار, Mahan/یکتا | — | — | — | **No credible site found.** vroom.ir and kelasor.com did not resolve or answer from outside (2026-11-06). Excluded. |

## 5. What universities and academies actually use (with sources)

| Institution | Platform | Source / date |
|---|---|---|
| Sharif University of Technology | **Skyroom.** Contract signed 31 Khordad 1396 (June 2017) for the virtual-class and webinar system | https://www.skyroom.online/news/sharif-university-lms/ (post dated 2022-08-22) |
| University of Tehran, Tehran Univ. of Medical Sciences, Sharif, Sanjesh, Ghalamchi, ministries, banks | Listed as **Skyroom customers** (vendor claim) | https://www.skyroom.online/our-customers/ (accessed 2026-11-06) |
| University of Tehran | E-learning LMS at elearn4.ut.ac.ir; live tool not confirmed | heyvagroup.com snippet `[unverified]` |
| University of Gilan | e-learning system + **Skyroom**, undergraduate classes virtual for the term | sharghdaily.com snippet (term 2, 1404–1405) |
| Shahroud Univ. of Medical Sciences (Nursing & Midwifery) | **Skyroom + Navid** | shmu.ac.ir news 5266 (snippet) |
| Ayandegan Institute (aihe.ac.ir) | **Skyroom** links | aihe.ac.ir notice (snippet) |
| Shiraz Univ. of Medical Sciences | **Adobe Connect + Navid** | medicine.sums.ac.ir manual (Jan 2024), mgsch.sums.ac.ir (Oct 2024), 403 from outside |
| Iran Univ. of Medical Sciences | **Adobe Connect** guide | hospht.iums.ac.ir PDF (snippet) |
| Hamedan Univ. of Technology | **Adobe Connect** or Dars-afzar (1404–1405) | hut.ac.ir notice (snippet) |
| Islamic Azad University | **Vadana** (in-house) | Digikala Mag, Tabnak |
| IMI (سازمان مدیریت صنعتی), exec MBA schools | **Not found.** No public source on their live-class platform | Searched 2026-11-06 |

## 6. Cost model: 200-student academy

**Assumptions:**
- 4 cohorts × 2 classes per week × 3 h = 24 class-hours/week. ×52/12 gives **104 class-hours/month** (about 34.7 sessions/month).
- 50 concurrent per class, plus 1–2 faculty/operators. A 50-seat cap is therefore tight.
- **Case A:** classes never overlap, so one 50-concurrent service is enough. **Case B:** two classes can overlap, so 100 concurrent are needed. A Skyroom service's `user_limit` is total online users across its rooms per the API doc. Whether that is enforced service-wide is `[unverified]`.
- All 104 h recorded. Recordings kept 1 year.
- Prices as published on 2026-11-06, in toman. Skyroom and Roomeet add **10% VAT**. For adobeconect.ir and bigbluebuton.ir, whether VAT is included is `[unverified]`.

### 6.1 Skyroom (edu plan, 4 webcams)
Recording needs about 104 h/month, which the hour packs cover:
- Monthly buying: 100 h pack + 5 h pack = 9,700,000 + 615,000 = **10,315,000**/month.
- Annual: 104 × 12 = 1,248 h. 1000 h + 100 h + 100 h + 50 h = 42,000,000 + 9,700,000 + 9,700,000 + 4,850,000 = 66,250,000 for 1,250 h. ÷12 = **5,520,833**/month.

| | Seats | Recording | Subtotal | +10% VAT |
|---|---|---|---|---|
| A, month-to-month | 50edu 2,990,000 | 10,315,000 | 13,305,000 | **14,635,500** |
| A, annual prepay | 28,512,000 ÷ 12 = 2,376,000 | 5,520,833 | 7,896,833 | **8,686,517** |
| B, month-to-month | 100edu 5,680,000 | 10,315,000 | 15,995,000 | **17,594,500** |
| B, annual prepay | 53,400,000 ÷ 12 = 4,450,000 | 5,520,833 | 9,970,833 | **10,967,917** |

**Optional additions:**
- White-label "personalisation": +24,500,000/month, or 139,428,000/yr = 11,619,000/month. That is more than the seats.
- Exec-style classes with 10 cams: business50 instead of 50edu, 11,840,000/month (112,680,000/yr = 9,390,000/month).
- One 500-person open webinar per month: webinar500 1 day = 2,540,000.
- **One-year retention is not possible inside Skyroom.** It includes 30 GB storage, and files are deleted 30 days after the service expires. 104 h/month of 720p video would almost certainly exceed 30 GB within a month. My rough estimate is 0.3–1 GB/h, so 30–100 GB/month `[unverified]`. Edvora would have to download each recording, by hand from the panel since the API has no recording endpoint, and store it in its own storage. For a year that is about 0.4–1.2 TB. Budget that storage separately.

### 6.2 Adobe Connect via adobeconect.ir (not recommended: pirated)
- A: 50u/5cam 1,040,000/month. B: 100u/5cam 2,000,000/month. Recording is listed as included. Retention is not stated except "up to 5 months" on the 80u/120u plans. **No API below 300 users** (4,550,000/month). Edvora needs an API, so the real price would be **4,550,000/month**.
- 500-person webinar: 500u plan 6,750,000/month (no daily plan).

### 6.3 BigBlueButton via bigbluebuton.ir
- A: 50u with recording 2,550,000/month. B: 100u with recording 4,350,000/month. With API you need the 200u plan at **8,750,000/month** (or 150u/30cam 8,750,000). Recordings kept "at least 3 months", so 1 year needs self-storage as above.
- Roomeet VIP dedicated: "from 3,300,000/month for 25 users". The price at 50–100 users is not published and needs a quote.

### 6.4 Alocom
- Pricing not public from outside Iran. Needs a quote.

### Summary (toman/month, Case B with API and recording, cheapest published term)
| Option | Monthly |
|---|---|
| Skyroom 100edu + 1,250 h/yr recording, annual, incl. VAT | **≈ 10,967,917** (no white-label; recordings must be exported) |
| Skyroom same, month-to-month, incl. VAT | ≈ 17,594,500 |
| Skyroom + personalisation (annual), incl. VAT | ≈ (9,970,833 + 11,619,000) × 1.1 = **23,748,816** |
| bigbluebuton.ir 200u + API + recording | 8,750,000 (VAT `[unverified]`) |
| adobeconect.ir 300u + API (pirated) | 4,550,000 (VAT `[unverified]`) |

---

## 7. Open questions to ask vendors (draft only, needs Farjad's approval before sending)
1. Skyroom: per-tenant white-label pricing for a reseller/platform, and whether one API key can manage branded channels for several academies.
2. Skyroom: does the enterprise tier offer webhooks, attendance and recording APIs? What do on-prem licence prices look like?
3. Skyroom: written statement on availability during an international-internet cut (NIN-only), and the 2026 incident history.
4. Skyroom: recording file format and size per hour; does `user_limit` apply per service or per room?
5. Alocom: price list and API documentation.

## 8. Source list (all accessed 2026-11-06 unless dated)
- https://www.skyroom.online/skyroom/order (embedded plan JSON) · https://data.skyroom.online/themes/skyroom/assets/js/script.min.js?v0.3.9 (add-on prices, VAT, gift days)
- https://www.skyroom.online/record/ · /textual-guide/business-options/ · /custom-domain/ · /iframe/ · /web-service/ · /plugins/ · /about/ · /our-customers/ · /advantages/ · /apps-landing/ · /online-education/ · /faq/category/user-help · /news/sharif-university-lms/
- https://data.skyroom.online/help/webservice.html · https://github.com/SkyroomOnline/webservice · https://github.com/SkyroomOnline/wordpress-plugin
- https://www.zoomit.ir/iran-news/465734-skyroom-schools-online-education-growth/ (31 Mordad 1405)
- https://digiato.com/training/most-used-iranian-sites (12 Farvardin 1405)
- https://www.iranintl.com/en/202605199955 (2026-05-19)
- https://adobeconect.ir/ · https://adobeconect.ir/order · https://www.adobe.com/support/downloads/license.html
- https://roomeet.ir/adobe-connect/ · https://roomeet.ir/bigbluebutton/ · https://bigbluebuton.ir/order · https://www.mobinhost.com/vps-class/ · https://cp.madyar.org/Article/202 · https://www.tehranserver.ir/big-blue-button.php
- https://alocom.co/ · https://alocom.co/prices/?type=educational
- https://www.digikala.com/mag/vadana-system-virtual-class-guide/ · https://snn.ir/fa/news/830203/ (1398/12/06, Sharif vclass)
- University snippets via web search (sites 403/unresolvable from outside): shmu.ac.ir, aihe.ac.ir, sharghdaily.com (Gilan), medicine.sums.ac.ir, mgsch.sums.ac.ir, hospht.iums.ac.ir, hut.ac.ir
