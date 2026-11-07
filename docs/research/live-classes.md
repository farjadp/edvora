# E-033 · Live online classes: build on open source or buy?

**Task:** E-033 (board item E-007, Skyroom vs BigBlueButton) · **Date:** 2026-11-06 · **For:** Farjad (build/buy approval gate)
**Feeds:** Phase 2 section D (`docs/product/phase-2.md`), `docs/adr/012-live-classes.md`, `packages/integrations/live-class/`

**How this was made.** Six research passes ran on 2026-11-06 (four, then a wider GitHub sweep and a webinar-streaming pass) using the web, the GitHub REST API and the vendors' own
source code and price data. Each pass is kept as a cited appendix: every fact has a URL and an access or publication
date there. This page is the synthesis and adds no new facts. Arithmetic and judgement are labelled **[estimate]**
or **[judgement]**. `[unverified]` means no primary source was found.

| Appendix | Scope |
| --- | --- |
| [A](live-classes/a-bigbluebutton-jitsi.md) | BigBlueButton 4.0 (+ Scalelite, webhooks), Jitsi Meet (+ Jibri) |
| [B](live-classes/b-livekit-sfu-stacks.md) | LiveKit (+ Egress), OpenVidu 3, Galène, mediasoup, edumeet, MiroTalk, Janus, Element Call, Nextcloud Talk, Ant Media, OpenMeetings |
| [C](live-classes/c-iranian-services.md) | Skyroom, Adobe Connect resellers, Iranian BBB hosts, Alocom, who Iranian universities use |
| [D](live-classes/d-iran-network-hosting.md) | UDP/WebRTC filtering, Iranian VMs and prices, Arvan Object Storage and VOD, Docker Hub, mirrors, bandwidth math |
| [E](live-classes/e-github-sweep.md) | Wider GitHub sweep: **plugNmeet**, OpenTalk, La Suite Meet, Mattermost Calls, Kopano, Agora Flat; BBB satellites (Greenlight, PILOS, Scalelite, b3scale, bbblb, LTI); Iranian repos; topic pages (virtual-classroom, video-conferencing, bigbluebutton, livekit) |
| [F](live-classes/f-webinar-streaming.md) | 500+ webinars: MediaMTX, SRS, OvenMediaEngine, Owncast, PeerTube, Restreamer, nginx-rtmp, BBB streaming bridges, Arvan Live |

---

## 1. Answer first

1. **Recommendation [judgement]: build on open source. Self-host BigBlueButton 4.0 on one Iranian server behind our
   own adapter.** BBB is the only option that covers every D story out of the box. That includes server-side
   attendance, a "recording ready" callback and MP4 recordings. It is legal, very active (LGPL-3.0, 1,551 commits in
   the last 90 days, v4.0.2 shipped 2026-11-06), and switches to right-to-left for Persian.
2. **Shortlist of two: BigBlueButton (self-hosted) and Skyroom (buy).** Skyroom is the only buy option that is
   credible, legal and connectable. Its API cannot send webhooks, report attendance or list recordings. It deletes
   recordings 30 days after the service ends, and it charges each tenant separately for white-label.
3. **Cost for a 200-student academy [estimate, §6]:** BBB about **۱۲ میلیون تومان a month** in cash, plus
   about 3 weeks of setup engineering and 1–2 days a month of operations. Skyroom about **۱۳ میلیون تومان a month**
   unbranded or **۲۶ میلیون** branded, plus about 9 hours a month of manual work on recordings and attendance. The
   BBB server serves **several academies** at no extra cost. Skyroom's cost grows with every tenant.
4. **Biggest risk, and it applies to every option:** Iran blocked almost all UDP, WebRTC included, during the June
   2025 and Jan–May 2026 shutdowns. No source says whether a server inside Iran stays reachable from inside Iran.
   **TURN over TLS on 443 is mandatory**, and we need a degraded mode: audio + slides, recordings soon after class,
   and an SMS notice.
5. **Not covered by BBB:** a 500-person open webinar. BBB's own guidance stops at 200 users per session. Two routes
   (§5.5): self-hosted streaming, where a bot streams the BBB room over RTMP into **MediaMTX** (MIT, single binary)
   and viewers watch LL-HLS at 480p, about 0.5 Gbps for 500; or a Skyroom webinar day pass (۲٬۵۴۰٬۰۰۰ تومان a day
   for 500 users). Either is a configuration choice, not a rewrite.
6. **Plan B for classes: plugNmeet** (MIT, built on LiveKit), found in the wider GitHub sweep. It is the only
   complete alternative classroom: whiteboard with PDF/PPTX, polls, breakouts, waiting room, MP4 recording, signed
   webhooks, a Persian locale with real RTL, and a **BBB-compatible API**, so our BBB adapter can point at it. It
   scores 76. It does not displace BBB: one developer wrote almost all of it, the installer depends on Docker Hub and
   Google, and its load test used simulated users with no video.

---

## 2. Gates applied before scoring

An option that fails a gate is dropped, whatever its score.

| Gate | Fails |
| --- | --- |
| **Legal to use commercially, no cracked software** | **Adobe Connect via Iranian resellers.** adobeconect.ir says on its own homepage that new versions reach Iranian companies "after being cracked", and Adobe's licence bars Iran (App. C §2). |
| **No payment or phone-home through sanctioned services** | **OpenVidu PRO** reports usage to `accounts.openvidu.io` and bills through Stripe. **MiroTalk's commercial licence** is sold through Stripe, which leaves AGPL as the only legal route (App. B §2, §4.3). |
| **Can run with zero foreign runtime requests (ADR 002)** | None fail outright. Each option has things to switch off: the table in §4 lists them. |
| **Enough public information to evaluate** | **Alocom**: prices and API were not reachable from outside Iran (App. C §4). Kept as a quote request, not scored. |

---

## 3. Scoring matrix

**Weights, fixed before scoring [judgement]:**

| # | Criterion | Weight | What a 5 means |
| --- | --- | --- | --- |
| W1 | Runs inside Iran | **20** | Fully self-hosted or domestic, no foreign runtime calls, TURN/TLS on 443, works in mobile browsers with no app |
| W2 | Fit to the D stories and classroom features | **20** | Slides, whiteboard, polls, breakouts, hand raise, lobby, moderation and recording all work out of the box |
| W3 | Integration with Edvora | **15** | Server API, per-user signed join with a role, webhooks for joined/left/recording-ready, embeddable |
| W4 | Operations effort | **10** | Little to install, upgrade, monitor or run as a recording pipeline |
| W5 | Scale for 50/200/500 | **10** | Documented to handle all three sizes |
| W6 | Persian/RTL and tenant branding | **10** | Persian with real RTL layout, brandable per tenant at no extra cost |
| W7 | Cash cost (§6) | **5** | Lowest cost |
| W8 | Licence and project health | **5** | Permissive or LGPL, active, more than one maintainer |
| W9 | Security (E2EE, student watermark) | **5** | E2EE and a per-student watermark both possible |

Scores run 1–5. Total = Σ(weight × score) ÷ 5, giving a score out of 100. Each score rests on the cited facts in the
appendix named in the row.

| Option (appendix) | W1 | W2 | W3 | W4 | W5 | W6 | W7 | W8 | W9 | **Total** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **BigBlueButton 4.0, self-hosted** (A) | 4 | 5 | 5 | 3 | 4 | 4 | 4 | 5 | 2 | **84** |
| BBB on an Iranian host, e.g. bigbluebuton.ir (C §3) | 4 | 5 | 3 | 5 | 4 | 4 | 4 | 2 | 2 | **79** |
| plugNmeet, self-hosted (E §2) | 3 | 5 | 5 | 3 | 3 | 4 | 4 | 2 | 3 | **76** |
| **Skyroom** (C §1) | 4 | 4 | 2 | 5 | 5 | 3 | 3 | 4 | 2 | **73** |
| LiveKit + Egress with our own classroom UI (B §1) | 4 | 2 | 5 | 3 | 5 | 3 | 2 | 5 | 4 | **72** |
| OpenTalk (E §3) | 3 | 4 | 3 | 2 | 4 | 1 | 3 | 4 | 3 | **61** |
| Galène (B §3) | 5 | 2 | 2 | 4 | 4 | 1 | 4 | 2 | 2 | **60** |
| Jitsi Meet + Jibri (A) | 3 | 3 | 3 | 2 | 3 | 2 | 3 | 4 | 4 | **58** |
| OpenVidu 3 CE + Meet (B §2) | 2 | 3 | 4 | 3 | 3 | 1 | 3 | 3 | 4 | **56** |
| MiroTalk SFU, AGPL (B §4.3) | 1 | 4 | 4 | 3 | 3 | 3 | 2 | 1 | 2 | **55** |
| edumeet (B §4.2) | 3 | 3 | 2 | 2 | 3 | 1 | 3 | 2 | 2 | **49** |
| Janus (B §5) | 4 | 1 | 2 | 2 | 4 | 1 | 1 | 3 | 3 | **47** |
| Element Call (B §6) | 3 | 1 | 1 | 2 | 4 | 1 | 2 | 3 | 4 | **42** |
| La Suite Meet (E §4) | 2 | 2 | 3 | 3 | 4 | 1 | 3 | 4 | 3 | **51** |

Also checked and not scored, because a gate or a basic fact rules them out (App. E §4–§6):
- **Mattermost Calls:** group calls, recording and rtcd are under paid licences.
- **Kopano Meet:** no activity since 2022.
- **Agora Flat:** needs Agora's cloud at runtime.
- **Pexip and Vidyo:** no open-source edition.
- **nettu-meet, edrys, owt-server:** dormant or archived.
- **persianmeet:** no source code.

**Why the leaders scored as they did:**
- **BBB, W1 = 4:** three known foreign calls, all fixable. The `bigbluebutton/bbb-libreoffice` image comes from
  Docker Hub, which blocks Iran: move it in with `docker save`/`docker load`. STUN defaults to `stun.l.google.com`:
  replace it with the `bbb-install.sh -c` option. Live captions send audio to Google by default: set
  `speechProcessing: local`. TURN over TCP 443 works out of the box through HAProxy. Mobile browsers work with no app
  (Android 6+ Chrome, iOS 14.5+ Safari).
  **W4 = 3:** a major upgrade means a new server (4.0 can't upgrade in place from 3.0); recordings are processed on the
  live server; copying them to S3 is a script we write. **W9 = 2:** no E2EE and no built-in watermark.
- **Skyroom, W3 = 2:** `createLoginUrl` gives per-user signed links with a role and TTL, but the API has no webhooks,
  attendance or recordings. That breaks D4 (automatic recordings) and D5 (attendance) unless staff do them by hand.
  **W6 = 3:** native Persian, but white-label "personalisation" is ۲۴٬۵۰۰٬۰۰۰ تومان a month per account. **W1 = 4:**
  domestic and legal, but it needs UDP 10000–20000 and its behaviour on TCP only is `[unverified]`. Its own help
  pages disagree on iPhone support.
- **plugNmeet, W1 = 3:** strippable but numerous foreign calls:
  - its installer pulls Docker Hub images, Chrome from `dl.google.com`, and GitHub releases
  - the sample config uses Google STUN
  - `login.html` loads Google Fonts
  - the whiteboard fetches library items from excalidraw.com
  - whether Excalidraw loads fonts from `esm.sh` is `[unverified]`

  **W5 = 3:** the vendor benchmark (500 in one room on 4 vCPU) used simulated users with no video or bandwidth
  figures. **W8 = 2:** one developer wrote about 99% of the server code. **W3 = 5:** short-lived one-time join tokens
  (better than BBB), signed webhooks, an analytics API and the BBB-compatible API.
- **LiveKit, W2 = 2:** it is infrastructure. Whiteboard, slides, polls, hand raise, lobby and the RTL UI would all be
  ours to build. It is the best base if Edvora ever wants its own classroom UI or rooms over 200 (benchmark: 1 → 3,000
  viewers on 16 vCPU). BBB 4.0 already uses LiveKit as its media server, so choosing BBB keeps that path open.

**Sensitivity (computed, including plugNmeet):** we doubled each weight in turn, one at a time. BBB self-hosted
stayed first every time. The managed BBB host came second in eight of the nine runs; plugNmeet came second when W3
(integration) was doubled. The closest call was doubling W4 (operations): 81.8 vs 80.9. That is the honest form
of the "buy" argument: if operations effort matters most, rent BBB from an Iranian host. Skyroom does not win under
any of these doublings. Doubling W3 (integration) or W9 (security) moves LiveKit above Skyroom into third.

---

## 4. Running inside Iran: findings that apply to every option

| Finding | Evidence | Design consequence |
| --- | --- | --- |
| UDP and WebRTC are the first things blocked | June 2025: "almost all UDP-based protocols" disabled, WebRTC named, only UDP/53 open (Nym, 2025-06-30). After the 2026 blackout (ended 26 May), UDP was still "almost completely blocked" (Zoomit, 2026-05-28). App. D §1. | **TURN/TLS on TCP 443 plus ICE-TCP are required.** We test every release from MCI, Irancell and a corporate network |
| A server inside Iran is not guaranteed to survive a shutdown | The national network was "fully disconnected, even internally" (Jan 2026). No report names Skyroom or BBB as working during the shutdowns. The state platform Shad failed under load. App. D §1.3, App. C §1.8 | Degraded mode: audio + slides, recordings within hours, SMS (module F) with the new time |
| Docker Hub blocks Iranian IPs | 403 citing US export controls; still happening in 2026 (App. D §4) | Private registry plus apt mirror; an install must never need a foreign host |
| Iranian app stores and sanctions | Apple and Google removed Iranian apps; Google Play reported filtered inside Iran (2023) (App. D §6) | **Join in the browser only.** No app requirement. Jitsi's "download the app" page must be disabled |
| Arvan Iran region: outbound traffic listed as free, inbound tiered | Pricing page 2026-11-06: «ترافیک ارسال» free, «دریافت» free up to 250 GB, then ۱٬۸۰۰ تومان/GB (App. D §2.1) | A media server mostly sends, so this is favourable. **Get written confirmation** that WebRTC media to students counts as «ارسال» |
| Bandwidth per viewer ≈ 2.0 Mbps typical, 3.35 Mbps worst case | LiveKit SDK presets and BBB settings (App. D §7) | 50 viewers ≈ 100–170 Mbps; 200 ≈ 400–670 Mbps; 500 ≈ 1.0–1.7 Gbps. **A 1 Gbps port covers 200, not 500** |
| Arvan Object Storage is S3-compatible | `s3.ir-thr-at1.arvanstorage.ir`, standard AWS SDKs with a custom endpoint, presigned URLs (App. D §3.1) | Recordings are copied there and played through module B's protected player |

---

## 5. The two shortlisted options in detail

### 5.1 BigBlueButton 4.0, self-hosted (recommended)

| Area | Facts (App. A unless noted) |
| --- | --- |
| Licence and health | LGPL-3.0 (Scalelite AGPL-3.0, needed only for 3+ servers). 9,269 stars. v4.0.2 on 2026-11-06; the 3.0 line is still patched (v3.0.40, 2026-10-28). 1,551 commits in 90 days; the busiest committer wrote about 26% of them |
| Classroom features | Slides/PDF/Office upload (up to 10 pre-uploaded documents, `insertDocument` live). tldraw whiteboard. Public and private chat. Polls and quizzes. Breakout rooms. Hand raise. Lock settings. Mute on start. Waiting room (`guestPolicy=ASK_MODERATOR`). Shared notes. No screen share from mobile (browser limitation) |
| Attendance | Webhooks `user-joined`/`user-left` (bbb-webhooks), plus the Learning Dashboard JSON posted to `meta_analytics-callback-url` at meeting end, with each attendee's joins, leaves and duration |
| Recording | Server-side. Default is an HTML playback page; the optional `video` format gives **MP4**. Processed after class; processing time for a 3-hour class is `[unverified]`. `meta_bbb-recording-ready-url` posts a signed JWT when it is ready |
| Integration | Signed REST API: `create`, `join` (`role=MODERATOR`/`VIEWER`, `userID`, `createTime` blocks reused links), `end`, `getMeetingInfo`, `getRecordings`, `deleteRecordings`. Opens by redirect or iframe (`allow="camera; microphone; display-capture"`) |
| Persian and branding | `fa_IR` covers 80.3% of strings; the client sets `dir="rtl"` for `fa`. Logo, banner and custom CSS can be set **per meeting**, so each tenant gets its own brand with no licence fee |
| Scale | Minimum server 8 cores, 16 GB RAM, 250 Mbit/s symmetric, supports about 200 concurrent users. **No session above 200.** Scalelite load-balances 3+ servers |
| Iran fixes | Docker Hub image → `docker save`/`load`. STUN → own host (`-c`). Captions → `speechProcessing: local`. apt mirror (`-p` proxy flag). Let's Encrypt from Iran `[unverified]` → use a domestic certificate if it fails |
| Gaps | Join URLs don't expire while the meeting runs. MP4 needs the non-default `video` format. Attendance webhooks need the separate `bbb-webhooks` package, which drops a hook after about 12 failed deliveries. No E2EE. No per-student watermark (a client overlay is possible through the plugin SDK `[unverified feasibility]`). Recordings are not stored in S3 natively, so we add a post-publish copy |

### 5.2 Skyroom (buy baseline)

| Area | Facts (App. C §1) |
| --- | --- |
| Company | Mahbang Fanavari-haye Pars, with Nasim Ertebat Damavand on enterprise. 13 years old. Claims 100k+ customers and a peak of 540k users at once (company figures) |
| Customers | Sharif since a 1396 (2017) contract. Gilan, Shahroud MUMS, Ayandegan. Vendor list includes University of Tehran and TUMS |
| Prices, 2026-11-06, toman + 10% VAT | 50 users ۲٬۹۹۰٬۰۰۰ a month or ۲۸٬۵۱۲٬۰۰۰ a year. 100 users ۵٬۶۸۰٬۰۰۰ / ۵۳٬۴۰۰٬۰۰۰. Recording by the hour: 100 h ۹٬۷۰۰٬۰۰۰, 1000 h ۴۲٬۰۰۰٬۰۰۰. iFrame embed ۶٬۹۷۱٬۰۰۰ a month. White-label ۲۴٬۵۰۰٬۰۰۰ a month or ۱۳۹٬۴۲۸٬۰۰۰ a year. Webinar 500 users ۲٬۵۴۰٬۰۰۰ a day |
| Features | Screen share, whiteboard, slides/PDF, chat, polls/quiz, hand raise, roles, attendance report in the panel. Breakout rooms and waiting room `[unverified]` |
| API | 23 actions, rooms and users, `createLoginUrl` (role 1–3, TTL, language). 500 requests a minute. **No webhooks, attendance or recordings in the API** |
| Recordings | 30 GB storage. **Deleted 30 days after the service expires.** File format `[unverified]` |
| Clients | In the browser. iOS Safari support is contradicted on Skyroom's own pages: test on a real iPhone. Needs UDP 10000–20000 open |
| On-prem | An enterprise version exists, price on request |

### 5.3 What each one means for the D stories

| Story | BBB self-hosted | Skyroom |
| --- | --- | --- |
| D1 schedule | ✅ `create` on first join (idempotent on our id) | ✅ `createRoom` |
| D2 one-click join, signed, per user | ✅ signed `join` URL, but **no expiry while the meeting runs**, so our join route (303, enrollment check) is the gate | ✅ `createLoginUrl` with TTL |
| D3 moderator only for the instructor | ✅ `role=MODERATOR` server-side | ✅ `access=3` |
| D4 recording appears automatically | ✅ recording-ready callback → copy MP4 to Arvan → lesson | ❌ manual download from the panel |
| D5 attendance | ✅ webhooks plus the analytics JSON at the end | ❌ manual export from the panel |
| D6 reschedule, old link stops | ✅ we stop issuing links; `createTime` invalidates old ones once the meeting is re-created | ⚠️ we stop issuing links; links already issued live until their TTL |
| Tenant branding | ✅ per meeting, free | ⚠️ paid add-on per account |
| 500-person webinar | ❌ above 200/session | ✅ day pass |

### 5.4 Plan B: plugNmeet (App. E §2)

| Area | Facts |
| --- | --- |
| Licence and health | MIT (server, client, recorder). 575 stars. Server v2.5.7 on 2026-11-03. Company MynaParrot. **Bus factor 1** (`jibon57` wrote 1,736 server commits; the next human wrote 2) |
| Features | Whiteboard (Excalidraw) with PDF/DOCX/PPTX, shared notepad, polls, breakouts, waiting room, lock settings, hand raise, chat, MP4 recording, RTMP out, optional E2EE |
| Integration | Native REST API with short-lived one-time join tokens, `is_admin` role, signed JWT webhooks (`participant_joined/left`, `recording_proceeded`, `analytics_proceeded`), analytics API. **BBB-compatible routes** for create, join, end, meeting info and recordings, but **not** BBB `hooks/*` |
| Persian | `fa-IR` covers 890 of 1,001 keys; the document `dir` follows i18n; Tailwind logical utilities throughout. The font is Inter, so we inject our own Persian fonts |
| Iran fit | Docker Hub, Google Chrome repo and GitHub releases at install (mirrorable). Google STUN in the sample config. Google Fonts on `login.html`. excalidraw.com library fetch, overridable. AI features use Azure/Gemini/OpenAI, so keep them off |
| Scale | 4 cores / 4 GB minimum; recorder 8 cores / 8 GB. Vendor benchmark: 500 simulated users per room on 4 vCPU / 16 GB, with no video figures |

**Why it matters [judgement]:** our adapter's BBB implementation could be pointed at plugNmeet's BBB-compatible API
for create, join and recordings. Webhooks would need a small native-webhook parser. So if BBB disappoints in the load
test, switching costs days, not weeks. Spike it on the same trial VM.

### 5.5 Webinars over 200 people (App. F)

| Piece | Choice | Why |
| --- | --- | --- |
| Bridge from the BBB room | **THM-Health/BBB-Streaming-Server** (LGPL-3.0, v1.1.1, 2025-06-16): a headless-browser bot joins the room and pushes RTMP; about 2 CPU, 2 GB, 10 Mbit/s up per stream | The only maintained bridge. Works with BBB 3.0 + LiveKit; **BBB 4.0 untested**. The aau-zid and bbb-recorder add-ons were last updated in 2023–2024 |
| Streaming server | **MediaMTX** (MIT, 20.6k stars, v1.21.3 on 2026-10-25) | One binary from GitHub releases (no Docker Hub), LL-HLS, JWT or HTTP-callback auth, fMP4 recording, read hooks. No transcoding: send 480p from the source. One main maintainer |
| Fallback server | SRS (MIT, 29.4k stars) | Proven; per-viewer `on_play`/`on_stop` hooks; HLS latency ≥ 5 s |
| Not chosen | OvenMediaEngine (AGPL, Docker Hub only, Google STUN default); Owncast (single stream, no paid access); PeerTube (AGPL, P2P needs foreign STUN); Restreamer (Google Fonts, Docker only); nginx-rtmp (no tag since 2021) | App. F |
| Viewer side in Edvora | Short-lived signed URL per viewer (iOS Safari can't send HLS auth headers); 30 s player heartbeat for attendance; a small Q&A panel, because none of the chosen servers has chat | [judgement] |
| Bandwidth [estimate] | 480p ≈ 1.0 Mbps × 500 ≈ 0.5 Gbps fits one 1 Gbps port; 720p at 2.5 Mbps × 500 ≈ 1.25 Gbps does not | App. F |
| Arvan Live | Push/pull ingest, signed links with expiry, archive to VOD per an unofficial 2023 API client; RTMP ingest and the ۱۰۸٬۰۰۰ per stream-hour price **`[unverified]`** (docs blocked from outside Iran) | App. D §3.2, F |

**Webinar options, side by side:**
- **Self-hosted** (MediaMTX on a second VM): it carries the 500 viewers' traffic, and we own the data.
- **Skyroom day pass** (۲٬۵۴۰٬۰۰۰ تومان): zero operations, but attendance has to be handled manually.

Both sit behind the same adapter (D7, P3).

---

## 6. Total cost of ownership: 200-student academy

**Assumptions [estimate]:** 4 cohorts × 2 classes a week × 3 h = **104 class-hours a month**. 50 students per
class. Up to two classes overlap (100 concurrent). Every class is recorded and kept 1 year. MP4 size 0.3–1 GB an
hour `[unverified]`, 0.5 GB used here, so about 52 GB a month and about 624 GB after a year. Prices in toman as
published on 2026-11-06 (App. C, D). Arvan's PAYG unit prices are read as monthly (App. D §2.1 inference). Whether
Arvan's prices include VAT is `[unverified]`. **People's time is shown in hours: Farjad sets the rate.**

### 6.1 BigBlueButton self-hosted on ArvanCloud (Iran region, Standard tier, PAYG)

| Item | Arithmetic | Toman a month |
| --- | --- | --- |
| Live server: 8 vCore, 16 GB, 200 GB Warm disk, 1 IPv4 | 8×327,600 + 16×255,060 + 200×8,640 + 234,000 | **8,663,760** |
| Staging/test server (eco-small4, 2 vCPU, 2 GB; can be stopped between tests) | plan price | 1,401,480 |
| Traffic out to students | listed free («ارسال»), to confirm in writing | 0 |
| Traffic in (presenter + student uplinks) | estimated under the 250 GB free tier | 0 |
| Recording storage: Arvan Object Storage Growth plan (500 GB, 2 TB download) | 1,800,000; at 624 GB: + 124×3,600 | 1,800,000 → **2,246,400** by month 12 |
| **Cash total** | | **≈ 11.9 M → 12.3 M** |
| One-off engineering | server, mirrors, TURN/443, monitoring 3–5 days; BBB adapter + webhook + recording copy 5–8 days; pilot on Iranian carriers 2 days | **≈ 10–15 person-days** |
| Running operations | updates, monitoring, recordings that fail to process | **≈ 8–16 h a month** |

Alternative host: an Iranian dedicated server at OnlineServer (Shatel), 2×E5-2670 v2, 32 GB, SSD, 1 Gbps port,
outbound unmetered: ۹٬۰۰۰٬۰۰۰ a month + VAT. Its CPUs are from 2013, and BBB asks for "high single-thread
performance", so it needs a load test first (App. D §2.3).

### 6.2 Skyroom (100 users so two classes can overlap, annual prepay, incl. 10% VAT)

| Item | Arithmetic | Toman a month |
| --- | --- | --- |
| Seats 100edu + 1,250 recording-hours a year | (53,400,000 + 66,250,000) ÷ 12 × 1.1 (App. C §6.1) | **10,967,917** |
| Our own recording storage (Skyroom deletes them) | same as 6.1 | 1,800,000 → 2,246,400 |
| **Cash total, Skyroom-branded** | | **≈ 12.8 M → 13.2 M** |
| + White-label "personalisation", annual | 139,428,000 ÷ 12 × 1.1 = 12,780,900 | **≈ 25.5 M → 26.0 M** |
| Month-to-month instead of annual | 17,594,500 + storage | ≈ 19.4 M → 19.8 M (unbranded) |
| Manual work | ~35 sessions a month × ~15 min to download, upload and mark attendance | **≈ 9 h a month** |
| One-off engineering | Skyroom adapter 2–3 days (no webhook path) | ≈ 2–3 person-days |

### 6.3 Year one side by side [estimate]

| | Cash, year 1 | People |
| --- | --- | --- |
| BBB self-hosted | ≈ 145 M toman | 10–15 days setup + 100–190 h of operations |
| Skyroom, unbranded | ≈ 156 M toman | 2–3 days setup + ≈ 108 h of manual work |
| Skyroom, branded | ≈ 309 M toman | same |
| Managed BBB host, bigbluebuton.ir 200u + API + recording | ≈ 8,750,000 a month (VAT `[unverified]`) + storage ≈ 129 M | 5–8 days (same BBB adapter); shared server, webhooks `[unverified]` |

**Second academy:** BBB is about +0 cash while classes still fit under about 200 concurrent; storage grows. Skyroom
is +13 M to +26 M a month, because each tenant needs its own branded account `[unverified]`, to ask Skyroom.

**500-person webinars, any option:** Skyroom webinar500 at ۲٬۵۴۰٬۰۰۰ a day, or Arvan live streaming at
۱۰۸٬۰۰۰ per stream-hour with RTMP from BBB `[unverified integration]`.

---

## 7. Risks

| # | Risk | Likelihood / impact | Mitigation |
| --- | --- | --- | --- |
| R1 | UDP/WebRTC blocked during unrest or shutdowns (all options) | High / high | TURN/TLS 443 + ICE-TCP; audio-only mode; recordings within hours; SMS notice; test on MCI, Irancell, Rightel and a corporate network before go-live |
| R2 | The national network itself drops (Jan 2026) | Medium / high | Nothing technical fixes it. Recordings + the async lessons (module B) carry the cohort; the academy's policy covers rescheduling |
| R3 | Docker Hub, apt or GitHub unreachable during install or rebuild | High / medium | Private registry + apt mirror on our own storage; image tarballs in the runbook; test from an Iranian VM first |
| R4 | Arvan counts media traffic as metered, or limits UDP ranges | Medium / medium | Written confirmation before contract; trial VM test; OnlineServer/ParsPack as alternatives |
| R5 | One BBB server = single point of failure | Medium / high | Backup link (D2f) to a managed BBB host or a Skyroom room; plugNmeet as plan B behind the same BBB-style adapter; snapshot-based rebuild under 2 h; Scalelite once there are 3+ servers |
| R6 | 200 per session is too few for open webinars | Certain for 500 / low | BBB → RTMP bot → MediaMTX LL-HLS at 480p (§5.5), or a Skyroom day pass; not on the critical path for cohorts |
| R7 | BBB major upgrades need a new server | Certain every major release / medium | Blue-green: build the new server, move DNS, copy recordings (they are already in S3) |
| R8 | 20% of Persian strings missing | Certain / low | We translate the rest (≈ 370 keys) and contribute them upstream |
| R9 | MP4 processing takes CPU from live classes | Medium / medium | Run processing at night; add a separate recording server if the load test shows contention |
| R10 | No per-student watermark in the live room | Certain / medium | Overlay through the BBB plugin SDK (deterrent only); recordings are watermarked per student in module B's player |
| R11 | No in-house operations in Iran | High / high | Farjad names someone with access to the Iranian server; the runbook and monitoring are part of Phase 3 |
| R12 | Let's Encrypt not reachable from Iran | Unknown / medium | Use a domestic certificate or Arvan's CDN certificate |
| R13 | Vendor lock-in or price rise (Skyroom) | Medium / medium | The adapter (ADR 012); recordings always copied out |

---

## 8. Open questions, and what to verify before Phase 3

**For Farjad / the client:**
1. Approve **build on BBB** or **buy Skyroom** (ADR 012).
2. An Iranian server: Arvan Iran region 8 vCore / 16 GB / 200 GB (≈ ۸٫۷ میلیون a month), plus Object Storage Growth
   (۱٫۸ میلیون a month) and a small staging VM. Who owns the account and pays for it?
3. Who has server access for operations (R11)?
4. IBA: typical and maximum class size, do they need webinars over 200, recording retention, and is attendance
   counted toward the certificate?

**To verify on a trial Iranian VM (one day, including plugNmeet and webinar spikes):** plugNmeet from mirrored
artefacts with a network-tab check for foreign hosts; the THM streaming bridge on BBB 4.0 into MediaMTX, with LL-HLS
on Iranian 4G; plus the BBB checks: apt/ghcr/Docker mirrors reachable; UDP ranges open; Let's Encrypt;
BBB 200-user load test; MP4 processing time for 3 hours; upload to Arvan S3; join over TURN/443 from MCI, Irancell and
an iPhone.

**To ask vendors (drafts in App. C §7, nothing sent):** Skyroom: webhooks or attendance and recording APIs in the
enterprise tier, per-tenant white-label pricing, a written statement on shutdown availability. Arvan: what «ارسال»
covers, per-VM bandwidth caps, UDP ranges. Alocom: prices and API.
