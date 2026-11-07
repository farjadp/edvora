# E-033 — Live classes inside Iran: network, hosting, supply-chain research

Researcher: Claude (subagent) · Access date for all URLs: **2026-11-06** unless a publication date is given.
Conventions: **[fact]** = stated by the cited source · **[inference]** = my reasoning, not in a source · **[unverified]** = could not confirm.
Prices are quoted exactly as published (toman), not converted.

---

## 0. TL;DR for the decision

1. **UDP is the first thing Iran's filtering takes away.** In the June 2025 shutdown "almost all UDP-based protocols" were disabled, WebRTC named explicitly; only UDP/53 stayed open. After the 2026 blackout reopened (late May 2026), experts said much UDP was "almost completely blocked". → **TURN over TLS on TCP 443 (and ICE/TCP) is mandatory, not optional.**
2. **No source confirms or denies that WebRTC between an Iranian user and an Iranian server kept working during the shutdowns.** The NIN itself was reported "fully disconnected, even internally" on 8 Jan 2026, and domestic education platforms (Shad) failed under load. Treat "server in Iran = survives shutdowns" as **[unverified]**, plan a degraded mode (audio + slides, HLS fallback, recordings).
3. **ArvanCloud Iran region: server sending traffic is listed as free; receiving traffic is tiered** (first 250 GB free, then 1,800 toman/GB). A media server is egress-heavy, so this pricing is favourable — confirm the definition of "ارسال/دریافت" with Arvan sales in writing.
4. **Docker Hub blocks Iranian IPs (403, US export controls)**; BBB 4.0's install pulls an image from Docker Hub and *fails* without it. Plan mirrors (docker.arvancloud.ir, ParsPack, Runflare) or pre-load images.
5. **Bandwidth:** lecture with 720p camera + screen share ≈ 2–3.3 Mbps per viewer → ~100–165 Mbps for 50, ~410–660 Mbps for 200, ~1.0–1.65 Gbps for 500. A 500-person webinar on one 1 Gbps port needs low layers or an HLS path.

---

## 1. WebRTC / UDP in Iran

### 1.1 June 2025 shutdown (Israel–Iran war, ~17–25 June 2025)
- **[fact]** Nym report (published 2025-06-30): "Almost all UDP-based protocols have been disabled across major networks", with **WebRTC** and **QUIC** listed under protocol-level blocking. "The only notable exception is UDP port 53, used for DNS". Mobile networks "including MCI and Irancell, have gone fully offline or domestic-only multiple times". Censorship could be "applied to traffic transiting networks internal to the country". — https://nym.com/blog/nym-iran-report-2025
- **[fact]** Lantern circumvention corpus summary of the same report: between 21–25 June 2025 fixed-line partly restored; TCP (SSH, WebSockets) partially returned while "mobile networks and UDP-based protocols remained heavily restricted"; DPI at Tehran IX filters domestic-only transit traffic. (Page notes it is AI-extracted.) — https://corpus.lantern.io/findings/2025-piotrowska-nym-iran-blackout__iran-tcp-websocket-survived-udp-blocked/
- **[fact]** Paderborn University paper "Insights into an Iranian Internet Shutdown" (FOCI 2026, PDF dated 2026-07-02): shutdown enforced with fine-grained techniques, not a single switch; **QUIC censorship began before the shutdown and persisted after**; post-shutdown DNS-over-UDP blocking reported at 89% (attributed to general UDP instability). Full text not machine-readable here; figures from abstract/secondary summaries → treat details as **[unverified]**. — https://www.petsymposium.org/foci/2026/foci-2026-0016.php · https://corpus.lantern.io/findings/2026-anon-insights-into-iranian__iran-post-shutdown-udp-instability/
- **[fact]** Aryapour, "Iran's Stealth Internet Blackout" (arXiv 2507.14183, July 2025): BGP announcements stayed stable while encrypted and UDP traffic was throttled/blocked via DPI; whitelist model appeared ~22–23 June. — https://arxiv.org/abs/2507.14183
- **[fact]** QUIC/HTTP-3 blocking in Iran pre-dates 2025: OONI (2022) found HTTP/3 censorship targets UDP endpoints. — https://ooni.org/post/2022-http3-measurements-paper/

### 1.2 2026 blackout (8 Jan – 26 May 2026)
- **[fact]** Wikipedia "2026 Internet blackout in Iran": began 8 Jan 2026 during protests; relaxed 28 Jan with whitelist; renewed after 28 Feb strikes; connectivity at ~4% (28 Feb) and ~1% through March (NetBlocks); 7 Apr "most residents could only use a slow, restricted intranet"; partial restoration 26 May 2026 "slow and with restrictions". Cybersecurity experts reported the **"National Information Network was also fully disconnected, even internally within Iran"** (early phase). Telephone (land + mobile) also affected. — https://en.wikipedia.org/wiki/2026_Internet_blackout_in_Iran
- **[fact]** Zoomit (7 Khordad 1405 / 28 May 2026), after partial reconnection: expert Vahid Farid — a large part of UDP traffic "almost completely blocked" and TCP connections drop quickly; latency very high; even domestic services slow/unstable. Researcher Arian Eghbal: fixed-line better than mobile; data centres reconnected but dropped within minutes. — https://www.zoomit.ir/report/460380-iran-internet-status-after-restoring/
- **[fact]** Iran International (2026-05-19): education moved to domestic platforms; state platform **Shad** had "low speed, weak server capacity and repeated outages"; domestic apps "struggled under the surge in traffic". No mention of Skyroom/BBB. — https://www.iranintl.com/en/202605194457
- **[fact]** Iran International (2026-05-07): Rubika, Bale, Shad had repeated outages; Shad "designed so only the teacher can speak". — https://www.iranintl.com/en/202605079104

### 1.3 Does WebRTC work on the NIN during international shutdowns if the server is in Iran?
- **[unverified]** I found **no** measurement or report showing WebRTC/UDP between Iranian clients and an Iranian-hosted server during a shutdown — neither success nor failure. No source named Skyroom or a BBB instance as working during 2025 or 2026 shutdowns (searched English + Persian).
- **[fact]** Evidence against assuming it works: NIN "fully disconnected, even internally" (Jan 2026, Wikipedia above); Lantern summary mentions DPI on domestic-only transit at Tehran IX (2025).
- **[inference]** UDP blocking in 2025 was described as "across major networks" without a domestic exemption; a domestic server therefore cannot rely on UDP during an event. TCP/TLS 443 to a domestic IP is the most likely survivor (domestic HTTPS services were kept alive to some degree). Design for: TURN/TLS 443 → ICE/TCP → audio-only → HLS/recordings.
- **[fact]** Skyroom's own guidance (not shutdown-specific) says ~150–200 MB internet per one-hour class and recommends a backup mobile connection. — https://www.skyroom.online/troubleshooting/most-important-problems-online-class/ (via search summary; exact figure source page **[unverified]**)

---

## 2. Iranian cloud VMs / dedicated servers for a media server

### 2.1 ArvanCloud Cloud Server (ابر آروان) — https://www.arvancloud.ir/fa/pricing/cloud-server (accessed 2026-11-06)
**[fact]** Prices exactly as shown on the page (toman, monthly):

| Plan | vCPU | RAM | Disk | Monthly |
|---|---|---|---|---|
| eco-small1 | 1 | 1 GB | 25 GB | ۹۹۷,۷۴۰ تومان |
| eco-small2 | 1 | 2 GB | 25 GB | ۱,۱۳۵,۰۸۰ تومان |
| eco-small3 | 1 | 3 GB | 30 GB | ۱,۳۶۲,۴۲۰ تومان |
| eco-small4 | 2 | 2 GB | 30 GB | ۱,۴۰۱,۴۸۰ تومان |
| g1-medium1 / g1-medium2 | 4 | 12 GB | 75 GB | ۴,۹۴۶,۴۰۰ تومان |
| ls1-medium1 | 4 | 12 GB | 128 GB | ۶,۸۲۲,۰۰۰ تومان |
| g1-medium5 | 6 | 24 GB | 75 GB | ۷,۸۰۴,۸۰۰ تومان |

PAYG unit prices, **Iran region** (page does not state the period next to the unit; **[inference]** monthly, matching the plan table):
- vCore: Basic ۲۵۲٬۰۰۰ · Standard ۳۲۷٬۶۰۰ · Premium ۴۷۸٬۸۰۰ · Premium Plus ۵۹۲٬۲۰۰ تومان
- RAM per GB: Basic ۱۹۶٬۲۰۰ · Standard ۲۵۵٬۰۶۰ · Premium ۳۷۲٬۷۸۰ · Premium Plus ۳۷۲٬۷۸۰ تومان
- Block storage per GB: Warm ۸٬۶۴۰ · Local ۲۵٬۲۰۰ · Eco ۱۸٬۰۰۰ · Hot-SSD ۱۸٬۰۰۰ تومان; backup ۱۷٬۲۸۰; snapshot ۱۸٬۰۰۰
- **Public IPv4:** first IPv4 ۲۳۴٬۰۰۰ تومان, each additional ۴۶۸٬۰۰۰ تومان (fixed, monthly). IPv6 free (product page).
- **Traffic (Iran region, per user account):** «ترافیک ارسال» (send) — **رایگان (free)**. «ترافیک دریافت» (receive): up to 250 GB free; 250 GB–10 TB ۱٬۸۰۰ تومان/GB; 10–100 TB ۱٬۲۰۰ تومان/GB; >100 TB ۱٬۰۵۰ تومان/GB. (Europe region is billed per instance on send+receive.)
- Dedicated cloud server: "calculated based on resources specified in the panel" — no public price.
- Billing is PAYG, hourly or daily possible (product page https://www.arvancloud.ir/fa/products/cloud-server).
- **[fact]** History: Arvan support (Dec 2022) said cloud-server traffic had been free/unlimited and that from 1 Bahman (Jan 2023) part of traffic cost would be charged due to upstream datacentre policies. — https://twitter.com/ArvanSupport/status/1607721520356548608
- **[inference]** Iranian hosting convention: "upload/send" = data the server sends to users (free), "download/receive" = data the server pulls in (metered, because it is usually international). OnlineServer.ir states this explicitly (below). For an SFU, server **egress (to students) is free**, ingress (presenter + student uplinks) is small. **Confirm in writing with Arvan** that WebRTC/UDP egress to domestic users counts as «ارسال».

**Firewall / UDP:**
- **[fact]** Arvan cloud firewall default group: blocks all inbound, allows all outbound, opens TCP 22, 3389 and ICMP; rules take protocol + port range. — https://docs.arvancloud.ir/en/cloud-server/firewall/
- **[unverified]** Whether Arvan permits opening large UDP ranges (e.g. 16384–32768 for BBB, 50000–60000 for LiveKit) on cloud servers: docs show protocol/port-range rules but no explicit UDP statement or restriction found. **[inference]** port-range rules suggest it is supported; test on a trial VM.
- **[unverified]** Any Arvan per-VM bandwidth cap (Mbps) — not published on the pricing page.

### 2.2 ParsPack — https://parspack.com/servers (accessed 2026-11-06)
**[fact]** "Starting from" prices: Iran VPS ۹۵۵٬۰۰۰ تومان/month (up to 32 vCPU / 64 GB); **Iran cloud server ۳۷٬۸۰۰ تومان/day** (up to 32 vCPU / 64 GB, daily billing); **bare-metal (unmanaged physical) ۱۵٬۱۰۰٬۰۰۰ تومان/month** (up to 36 vCPU / 128 GB / 8000 GB HDD); Iran dedicated ۳٬۵۱۵٬۰۰۰ تومان/month (up to 72 vCPU / 128 GB); Hybrid ۳٬۵۱۵٬۰۰۰; Macro ۱۲٬۲۶۰٬۰۰۰; PowerVM-NVMe ۶٬۷۶۵٬۰۰۰ تومان/month. Traffic terms, port speed, UDP policy not shown on this page **[unverified]**.
- **[fact]** Older article: ParsPack VPS bandwidth 100–2000 GB/month, up to 1000 GB extra purchasable (date unclear). — https://virgool.io/@parspack/سرور-مجازی-پارس-پک-s8wjjx11oxmn

### 2.3 OnlineServer.ir (Shatel / Soroush Rasaneh datacentres) — https://onlineserver.ir/dedicated-server/iran (accessed 2026-11-06)
**[fact]** Iran dedicated, 1 IPv4, **1 Gbps port (10 Gbps at Shatel, paid)**, delivery 1–3 days, setup ۴۰۰٬۰۰۰ تومان:
- 2×Xeon E5-2620 v2, 16 GB, 1 TB SATA, 400 GB download/month — ۶٬۸۴۰٬۰۰۰ تومان/month (discounted from ۷٬۶۰۰٬۰۰۰)
- 2×E5-2620 v2, 32 GB, 2×1 TB SATA, 650 GB download — ۷٬۷۴۰٬۰۰۰
- 2×E5-2670 v2, 32 GB, 2×500 GB SSD, 650 GB download — ۹٬۰۰۰٬۰۰۰ تومان/month
- **Only download (inbound to server) is metered; "upload" is unlimited and free — "visits to your site, users downloading from your server … free and unlimited".** Extra download ۱٬۶۰۰٬۰۰۰ تومان/TB (temporary ۱٬۲۰۰٬۰۰۰). Prices exclude VAT.
- **[inference]** Ivy Bridge (2013) CPUs have weak single-thread performance; BBB 4.0 asks for "high single-thread performance".

### 2.4 IranServer — https://www.iranserver.com/dedicated-servers/ (accessed 2026-11-06)
**[fact]** Iran dedicated "starting from 6,210,000 تومان"; specs, port, traffic not on landing page **[unverified]**.

### 2.5 Pars.host — https://pars.host/server-dedicated/iran/
**[fact, via search snippet ~Sept 2026]** Iran dedicated IRD6 ~18.33M, IRD7 ~21.39M, IRD8 ~24.45M تومان/month, advertised "ترافیک نامحدود". Not opened directly → **[unverified]**.

### 2.6 Asiatech, Afranet, Hamravesh, Liara
- **[unverified]** No current public toman price list found for Asiatech cloud/dedicated or Afranet dedicated (only 2022 promotional articles, e.g. https://digiato.com/promoted/buying-guide-for-iranian-vps-cloud-asiatech). Ask sales directly.
- **[inference]** Liara/Hamravesh are PaaS/container platforms; media servers need host networking + large UDP ranges, which PaaS typically does not expose → VM/dedicated is the realistic target.

---

## 3. ArvanCloud Object Storage and Video Platform

### 3.1 Object Storage (S3-compatible)
- **[fact]** Endpoints: `https://s3.ir-thr-at1.arvanstorage.ir` (Simin region) and `https://s3.ir-tbz-sh1.arvanstorage.ir` (Shahriar region). Official SDK examples use the **AWS SDKs** (boto3, JS v3 `S3Client`, Go, .NET, PHP) with a custom endpoint; PHP example sets `use_path_style_endpoint => true`; JS/Go examples use region `"default"`. — https://docs.arvancloud.ir/en/developer-tools/sdk/object-storage · https://docs.arvancloud.ir/fa/developer-tools/sdk/object-storage/credentials
- **[fact]** Pre-signed upload (POST) and download (GET) URLs documented with AWS SDK presigners. — https://docs.arvancloud.ir/en/developer-tools/sdk/object-storage/upload-presigned/ · https://docs.arvancloud.ir/en/developer-tools/sdk/object-storage/download-presigned/
- **[fact]** Pricing, https://www.arvancloud.ir/fa/pricing/cloud-storage (accessed 2026-11-06), toman:
  - Plans: Basic free (5 GB storage, 20 GB traffic) · Growth ۱٬۸۰۰٬۰۰۰/month (500 GB, 2 TB traffic) · Pro ۱۸٬۰۰۰٬۰۰۰/month (5 TB, 20 TB traffic) · Enterprise custom.
  - Overage storage (standard) per GB: ≤5 GB free; 5 GB–5 TB ۳٬۶۰۰; 5–50 TB ۳٬۰۶۰; 50–500 TB ۲٬۷۰۰; >500 TB ۲٬۳۴۰. Hiops ۱۰٬۸۰۰. (**[inference]** per GB-month.)
  - Download traffic per GB: ≤20 GB free; 20 GB–20 TB ۹۶۵; 20–200 TB ۸۲۰; 200 TB–2 PB ۶۷۵; >2 PB ۵۸۰.
  - Read requests per 10,000: ۶۳۰ (first tier); write requests per 10,000: ۶٬۸۴۰ (first tier).
  - Access Point ۹۶ تومان/GB; antivirus ۱۱٬۲۵۰ تومان/GB.

### 3.2 Arvan Video Platform (VOD) — https://www.arvancloud.ir/fa/pricing/video-platform (accessed 2026-11-06)
- **[fact]** Plans: Basic free (3 h video storage, 50 watch-hours) · Growth ۲٬۱۶۰٬۰۰۰/month (80 h storage, 2,000 watch-hours, 10 live hours) · Pro ۲۱٬۶۰۰٬۰۰۰/month (800 h, 15,000 watch-hours, 100 live hours, 4K) · Enterprise custom.
- **[fact]** Overage: storage ۱۸٬۰۰۰ تومان per hour of media (≤1,000 h), down to ۱۰٬۸۰۰; watch time ۹۰۰ تومان/hour (50–20,000 h), ۴۹۵ (20k–100k), ۳۶۰, ۲۲۵; **live streaming ۱۰۸٬۰۰۰ تومان per stream-hour** (≤100 h) down to ۵۴٬۰۰۰ (>900 h); speech-to-text ۱٬۷۰۰ تومان/min beyond quota.
- **[fact]** Feature table: "لینک امن" (secure link) for VOD shown as "–" on Basic and (icon) on other plans; watermark listed for VOD on all plans; live-stream secure link and live watermark only on Pro/Enterprise. Icons do not render as text → plan-by-plan ticks are **[inference]** from "–" vs. blank.
- **[fact]** Secure Link docs: per-channel key; signed URL limited by **user IP and Unix expiry timestamp**, mismatch blocks access. — https://docs.arvancloud.ir/en/vod/secure-link
- **[fact]** Watermark is applied at upload (position selectable; profile-level auto-apply). — https://docs.arvancloud.ir/en/vod/media/video/
- **[inference]** This is a static logo watermark, not a per-viewer (student name/ID) dynamic watermark; per-viewer watermark would need player overlay in Edvora. **[unverified]**
- **[inference]** IP-bound secure links can break for mobile users whose IP changes (carrier NAT); test.

---

## 4. Supply-chain access from Iran

- **[fact]** Docker Hub returns 403 for Iranian IPs, citing US export controls: "we now block all IP addresses that are located in Cuba, Iran, North Korea, Republic of Crimea, Sudan, and Syria" (discussion opened 2024-05-30). — https://github.com/werf/werf/discussions/6166
- **[fact]** A 2026 GitHub PR fixes "Docker Hub 403 on fresh Iranian site installs" by switching to an Iranian mirror — evidence the block persists in 2026. — https://github.com/deltashopsiavash/sanashop/pull/17
- **[fact]** **BBB 4.0** install: `bbb-libreoffice-docker` builds from `bigbluebutton/bbb-libreoffice` on Docker Hub; if Docker Hub is unreachable the post-install script fails (fix: proxy or `docker load`). BBB 4.0 requires Ubuntu 24.04, 16 GB RAM, 8 cores, 250 Mbit/s symmetric. Installer `bbb-install.sh` is on GitHub. — https://docs.bigbluebutton.org/administration/install/
- **Iranian Docker mirrors** (community/vendor sources; current reliability **[unverified]** — I am not inside Iran and could not test):
  - `docker.arvancloud.ir` (pull `docker.arvancloud.ir/<image>` or as `registry-mirrors`) — https://wiki.parchlinux.com/en/Docker · https://ahmadallish.substack.com/p/using-docker-registry-from-iran-65e1a4efffcc
  - `mirror-docker.runflare.com` — https://mirrors.arash-hatami.ir/
  - `focker.ir`, `docker.mobinhost.com`, `docker.kernel.ir` — same lists
  - `registry.docker.ir` — https://webdade.com/blog/docker-hub-403-iran-server
  - `docker.novin.cloud` (vendor marketing) — https://novin.cloud/en/blog/docker-hub-mirror-iran
  - Hamdocker (`hub.hamdocker.ir`): **[unverified]**, no source found.
  - **[fact]** `registry-mirrors` only covers Docker Hub; ghcr.io / quay.io need separate handling. — webdade link above
- **[fact]** ParsPack runs mirrors (Digiato, 7 Ordibehesht 1405 ≈ 27 Apr 2026 [date conversion = inference]) for Docker registry + Docker Engine packages, npm, PyPI, Composer, NuGet, Maven, Go, Ubuntu, Debian, AlmaLinux, CentOS 7, EPEL, NGINX. — https://digiato.com/tech/parspack-developer-repositories-mirror · https://docs.parspack.com/reference/mirror/
- **[fact]** ArvanCloud hosts `mirror.arvancloud.ir` (listed as an official Arch Linux mirror). Ubuntu path under it **[unverified]**. — https://archlinux.org/mirrors/arvancloud.ir/
- **[fact]** GitHub got a US licence and restored full access for developers in Iran (announced Jan 2021). — https://github.blog/engineering/advancing-developer-freedom-github-is-fully-available-in-iran/
- **[unverified]** Current reachability from Iranian IPs of: `ghcr.io`, `quay.io`, `packages-eu.bigbluebutton.org` / `ubuntu.bigbluebutton.org`, `download.jitsi.org`, `registry.npmjs.org`. No reports found either way. Note: these depend also on Iran's *own* filtering and on international connectivity, which was cut during 2025/2026 events. **[inference]** Mirror everything into a self-hosted registry/apt cache (or Arvan Object Storage) so a rebuild never needs foreign hosts.
- **[fact]** Jitsi packages come from `https://download.jitsi.org` (stable suite); Ubuntu 24.04+ / Debian 12+. — https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-quickstart/

---

## 5. TURN over TLS 443 and restrictive networks

- **[fact]** BBB: TURN lets users behind "a restrictive firewall that prevents outgoing UDP connections" connect via **port 443**; bundled HAProxy on 443 splits TURN-over-TLS to coturn and the rest to nginx; dedicated TURN ports TCP/UDP 3478, TCP/UDP 443, relay UDP 32769–65535; `bbb-coturn` ships coturn 4.16.0 (sic, as in docs). — https://docs.bigbluebutton.org/administration/turn-server/
- **[fact]** BBB 4.0 ports: TCP 80/443, TCP+UDP 3478 (built-in TURN), UDP 16384–32768. — https://docs.bigbluebutton.org/administration/install/
- **[fact]** LiveKit: ICE/UDP 50000–60000 (two ports per participant), **ICE/TCP 7881** fallback "when the client could not connect via UDP (e.g. VPN, corporate firewalls)", TURN/TLS 5349 — "needs to be set to 443" without a load balancer — TURN/UDP 3478. — https://docs.livekit.io/home/self-hosting/ports-firewall/
- **[fact]** Jitsi: UDP 10000 for media; TCP 5349 via coturn "fallback for audio/video over TCP when UDP is blocked"; installer skips TURN if nginx already holds 443. — https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-quickstart/
- **[fact]** Iranian mobile operators: MCI (AS197207) and Irancell (AS44244) were reported among the last to come back in June 2025 (forum post, no primary source), and "mobile networks and UDP-based protocols remained heavily restricted" (Nym/Lantern). Pre-8 Jan 2026 Filterwatch saw traffic drops on TCI, MCI, Irancell during protest hours. — https://ntc.party/t/network-shutdown-in-iran-since-2025-06-18/17068/2 · Wikipedia 2026 link above
- **[unverified]** No source found documenting **routine** (non-crisis) UDP blocking by MCI/Irancell. Zoomit (May 2026) says fixed-line performs better than mobile.
- **[inference]** Why it matters: TURN/TLS on 443 looks like HTTPS to DPI; it is the only path likely to survive "UDP sweeps", corporate firewalls of executive-MBA students' employers, and mobile carriers under stress. Cost: TCP head-of-line blocking → higher latency and worse quality under loss; relay bandwidth is added to the server's egress. Use a separate IP/hostname for TURN so 443 is not shared with the web app (or use BBB's HAProxy split).

---

## 6. Mobile browsers and app stores

- **[fact]** BBB HTML5 client runs in Safari on iOS 12.2+ and Chrome on Android 6.0+, no app needed (via BBB docs/search summary). — https://docs.bigbluebutton.org/
- **[fact]** Apple removed Iranian-developer apps (Snapp, Digikala…) in Aug 2017 citing US sanctions; Google followed in Sept 2017; Google removed Divar in 2023 (Digikala, Tapsi also suspended, some reinstated after legal action). — https://www.engadget.com/2017/08/25/apple-removes-apps-iran-us-sanctions/ · https://iranintl.com/en/202306151026
- **[fact]** A 2023 report said Google Play had been unavailable to users in Iran since Oct 2022 (Iranian government filtering). Current 2026 status **[unverified]**. — https://iranintl.com/en/202306151026
- **[fact]** Domestic Android stores: Cafe Bazaar (34M active users at time of interview), Myket. — https://www.mobileworldlive.com/?p=183698 · https://myket.ir/app/online.skyroom (Skyroom distributes via Myket)
- **[fact]** Safari historically hides host ICE candidates until getUserMedia permission is granted, pushing some sessions to TURN; early Safari (11 preview, 2017) lacked TURN/TLS. — https://webrtchacks.com/safari-webrtc/
- **[unverified]** Current iOS Safari TURN/TLS behaviour — no 2025/2026 source found; test on current iOS.
- **[inference]** Browser-only join (PWA, no store) is the right default: iOS App Store publishing by an Iranian entity is blocked by sanctions, and Google Play is filtered inside Iran. Android APK via Bazaar/Myket is possible later.

---

## 7. Bandwidth math

### 7.1 Bitrates (sources)
- **[fact] LiveKit JS SDK defaults** (`src/room/track/options.ts`, main branch, accessed 2026-11-06): VideoPresets h180 320×180 **160 kbps**, h360 640×360 **450 kbps**, h540 **800 kbps**, h720 1280×720 **1.7 Mbps** @30fps, h1080 3 Mbps. Default simulcast layers when blank: h180, h360 (+ the published resolution). ScreenShare presets: h720fps15 **1.5 Mbps**, h1080fps15 **2.5 Mbps**, h1080fps30 5 Mbps. AudioPresets: speech **24 kbps**, music (default) **48 kbps**; DTX and RED on by default. — https://github.com/livekit/client-sdk-js/blob/main/src/room/track/options.ts · https://github.com/livekit/client-sdk-js/blob/main/src/room/defaults.ts
- **[fact] BBB 3.0 `settings.yml`** (v3.0.x-release): camera profiles low **100**, medium **200**, high **500**, hd **800**, fhd **1500** kbps; screenshare bitrate **1500** kbps; BBB 3.0 also ships a **LiveKit** media path with audio maxBitrate 48 kbps and screenshare simulcast 500 kbps@5fps + 1.5 Mbps@15fps. — https://github.com/bigbluebutton/bigbluebutton/blob/v3.0.x-release/bigbluebutton-html5/private/config/settings.yml
- **[fact]** BBB 4.0 server: 250 Mbit/s symmetric minimum. — https://docs.bigbluebutton.org/administration/install/
- Opus recommended settings (xiph wiki) could not be fetched (TLS certificate expired) **[unverified]**; using LiveKit/BBB values above.

### 7.2 Per-viewer downstream (SFU, lecture mode) — **[inference]** using the bitrates above
| Component | Typical | Worst case |
|---|---|---|
| Presenter camera | 0.45 Mbps (h360 layer, when screen share active) | 1.7 Mbps (h720) |
| Screen share | 1.5 Mbps | 1.5 Mbps (2.5 at 1080p) |
| Audio (1–3 active speakers, Opus 48 kbps, DTX) | 0.05 Mbps | 0.15 Mbps |
| **Total per viewer** | **≈ 2.0 Mbps** | **≈ 3.35 Mbps** |
Add ~5–10% for RTP/SRTP/UDP/IP headers (**[inference]**, more over TURN/TLS).

### 7.3 Server egress — **[inference]**
| Participants | Audio + slides only (BBB whiteboard, ~0.1 Mbps) | Camera only 720p (~1.8 Mbps) | Camera + screen share typical (~2.0) | Worst case (~3.35) |
|---|---|---|---|---|
| 50 | ~5 Mbps | ~90 Mbps | ~100 Mbps | ~170 Mbps |
| 200 | ~20 Mbps | ~360 Mbps | ~400 Mbps | ~670 Mbps |
| 500 | ~50 Mbps | ~900 Mbps | ~1.0 Gbps | ~1.7 Gbps |

- **Student webcams multiply fast** (**[inference]**): K student cams at BBB "medium" 200 kbps seen by N viewers ≈ K×N×0.2 Mbps → 20 cams × 50 viewers = 200 Mbps extra. Cap visible tiles / use lowest simulcast layer for thumbnails.
- **Monthly volume** (**[inference]**): 2 Mbps ≈ 0.9 GB per viewer-hour. One 3-hour class of 50 ≈ 135 GB; 8 such classes/week ≈ 4.3 TB/month server egress. On Arvan Iran region egress («ارسال») is listed free; on OnlineServer "upload" is free.
- **500-person webinar** (**[inference]**): exceeds a single 1 Gbps port in the worst case. Options: force h360 + 1.5 Mbps share (~2 Mbps → ~1 Gbps still tight), audio+slides mode, or push an RTMP/HLS stream to Arvan Video Platform live (۱۰۸٬۰۰۰ تومان per stream-hour, unlimited concurrent viewers on paid plans) for passive viewers, keeping WebRTC for ~50 interactive seats.

---

## 8. Open questions to settle with providers (before choosing)
1. Arvan: definition of «ارسال» vs «دریافت» for UDP media; per-VM bandwidth cap; allowed UDP ranges; whether domestic (NIN) traffic is billed differently.
2. Arvan / ParsPack / OnlineServer: port speed guarantees (shared vs dedicated 1 Gbps), behaviour during shutdowns (do domestic users still reach the DC over TCP 443? over UDP?).
3. Pilot test from MCI, Irancell, Rightel, and a corporate network: UDP direct vs ICE/TCP vs TURN/TLS 443 success rates.
4. Test pull of BBB/LiveKit/Jitsi images and apt repos from an Iranian VM via each mirror; record which hosts are reachable directly.
