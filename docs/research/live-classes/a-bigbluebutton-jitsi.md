# E-033 Research: BigBlueButton vs Jitsi Meet for Edvora live classes

Researcher: AI agent · Date accessed for all sources: **2026-11-06** unless another date is given.
Context: Edvora (multi-tenant, must run inside Iran, no foreign runtime deps). IBA cohorts: 20–60 typical, 200 peak, 500 open webinar.
Convention: `[unverified]` = no primary source found; "source-grep" = I read the project's source code at the stated branch on 2026-11-06.

---

## 0. TL;DR

| Question | BigBlueButton (BBB) | Jitsi Meet |
| --- | --- | --- |
| Built for | Virtual classrooms (slides, whiteboard, polls/quizzes, breakouts, learning analytics, recordings) | General video meetings |
| Licence | LGPL-3.0 (core), AGPL-3.0 (Scalelite) | Apache-2.0 |
| Latest release | v4.0.2, 2026-11-06 (3.0 line still patched: v3.0.40, 2026-10-28) | stable/jitsi-meet_11248, 2026-09-14 |
| Official per-session ceiling | "no single sessions [over] two-hundred (200) users" | No official number; "visitors" mode (WIP) for very large audiences |
| Slides/PDF upload | Yes, native | No native slide presenter (screen share; optional file-sharing service) |
| Attendance data | Built-in: Learning Analytics Dashboard + `meta_analytics-callback-url` JSON (joins/leaves/duration/talk time) + bbb-webhooks (`user-joined`/`user-left`) | Not built-in; needs community Prosody module `event_sync` (joined_at/left_at) or client-side iframe events |
| Recording | Server-side, HTML "presentation" playback by default; optional `video` format outputs MP4 | Jibri: one Chrome+ffmpeg box per concurrent recording; MP4 1920x1080 |
| E2EE | None (SRTP/DTLS transport only) | Optional E2EE (Chromium insertable streams); max mode limited around 20 participants; blocks server-side transcription |
| Persian UI | fa_IR ~80% of keys; client flips to `dir=rtl` for `fa` | main-fa.json ~97% of keys; no code found that sets document `dir=rtl` |
| Mobile web | Android 6+ Chrome, iOS 14.5+ Safari, no app; no screen share on mobile | Works in browser, but shows an "open in app / download app" page by default; disable with `deeplinking.disabled: true` |
| Iran blockers | Docker Hub needed for `bbb-libreoffice` image (Docker Hub blocks Iranian IPs); default STUN in bbb-web is `stun.l.google.com` unless overridden | Default P2P STUN `meet-jit-si-turnrelay.jitsi.net:443`; Jibri install pulls Google Chrome from `dl.google.com`; Docker images default to ghcr.io |

---

## 1. Licence, project health, ownership

### 1.1 GitHub stats (GitHub REST API, accessed 2026-11-06)

| Repo | SPDX | Stars | Latest release (tag, date) | Commits on default branch, last 90 days (since 2026-08-08) |
| --- | --- | --- | --- | --- |
| bigbluebutton/bigbluebutton | LGPL-3.0 | 9,269 | v4.0.2, 2026-11-06 | 1,551 incl. merges / 1,191 non-merge (branch `v4.0.x-develop`) |
| bigbluebutton/greenlight | LGPL-3.0 | 850 | release-3.9.1, 2026-11-05 | not measured |
| blindsidenetworks/scalelite | AGPL-3.0 | 507 | v1.8.7, 2026-11-04 | not measured |
| bigbluebutton/bbb-webhooks | LGPL-3.0 | 6 | v3.8.0, 2026-10-30 | not measured |
| jitsi/jitsi-meet | Apache-2.0 | 30,208 | stable/jitsi-meet_11248, 2026-09-14 | 392 (branch `master`) |
| jitsi/jitsi-videobridge | Apache-2.0 | 3,110 | stable/jitsi-meet_11248, 2026-09-14 | ~42 (Link header page count) |
| jitsi/jibri | Apache-2.0 | 672 | no GitHub "release"; latest tag `v8.0` | ~15 (Link header page count) |
| jitsi/docker-jitsi-meet | Apache-2.0 | 3,623 | stable-11248-3, 2026-11-02 | not measured |
| jitsi-contrib/prosody-plugins | Apache-2.0 | 94 | n/a; last push 2026-09-20 | not measured |

Sources: `https://api.github.com/repos/<repo>`, `/releases/latest`, `/releases?per_page=8`, `/commits?since=2026-08-08T00:00:00Z&per_page=1` (Link `rel="last"` count), plus a `git clone --shallow-since=2026-08-08` for the BBB and jitsi-meet counts.

Recent BBB releases (API): v4.0.0 2026-10-14, v4.0.1 2026-10-29, v4.0.2 2026-11-06; v3.0.38 2026-10-01, v3.0.39 2026-10-02, v3.0.40 2026-10-28. So **both 3.0 and 4.0 lines are being patched**. I found no official 3.0 EOL date `[unverified]`.
Recent Jitsi stable releases: 10655 (2025-11-24), 10710 (2026-01-14), 10741 (2026-02-02), 10888 (2026-03-30), 10978 (2026-05-20), 11031 (2026-06-08), 11146 (2026-08-03), 11248 (2026-09-14). That is about one every 1–2 months.

### 1.2 Commercial-use limits
- BBB LGPL-3.0: commercial hosting is fine; changes to LGPL components that you distribute must be released under LGPL. Running it as a hosted service is not "distribution" under LGPL (this is standard licence reading, not legal advice).
- **Scalelite is AGPL-3.0**: if Edvora modifies Scalelite and users reach it over a network, the modified source must be offered. Using it unmodified carries no extra obligation.
- Jitsi Apache-2.0: permissive, with no copyleft.
- Trademarks: "Jitsi is a trademark of 8x8, Inc." (https://jitsi.org/about/). If we white-label, we should remove the Jitsi name and watermark (config `SHOW_JITSI_WATERMARK`, `APP_NAME`; see §5).

### 1.3 Owners and contributors (bus factor)
| | BBB | Jitsi |
| --- | --- | --- |
| Owner | BigBlueButton project. Docs footer reads "Copyright © 2026 BigBlueButton Inc." (https://docs.bigbluebutton.org/new-features). Historically Blindside Networks, Ottawa (https://en.wikipedia.org/wiki/BigBlueButton). Scalelite is under the `blindsidenetworks` org. | 8x8, Inc. bought Jitsi from Atlassian in 2018 (https://jitsi.org/about/) |
| All-time top contributors (API `/contributors`) | antobinary 9,402; ritzalam 7,123; ramonlsouza 3,634; ffdixon 2,157; gustavotrott 1,964; KDSBrowne 1,937; prlanzarin 1,827; capilkey 1,464; Tainan404 1,404; GhaziTriki 1,244 | jitsi-meet: damencho 2,100; saghul 2,093; hristoterezov 1,191; Calinteodor 660; paweldomas 658. JVB: bgrozev 1,639; bbaldino 1,125; gpolitis 754. Jibri: bbaldino 349, bgrozev 63 |
| Top authors, last 90 days (git log) | Anton Georgiev 314; Paul Trudel 230; prlanzarin 165; "Claudio Promptoso" 159; guiiBecker 82; germanocaumo 45; Arthurk12 33; Ramón Souza 29 | damencho 74; Hristo Terezov 41; dependabot 30; Jaya Allamsetty 30; Muskan Kumari 29; bgrozev 28; Дамян Минков 23; Calin-Teodor 21 |
| Bus-factor reading | Several active committers, but about 26% of the last 90 days' non-merge commits come from one person. The Brazilian contributors match Mconf `[unverified affiliation]`. | Work is concentrated in 8x8 staff. Jibri is barely maintained: ~15 commits in 90 days, and one person wrote most of it historically. |

---

## 2. Features vs our stories

Legend: ✅ native · ⚙️ needs config/extra component · ❌ not available

| Story | BBB 4.0 | Source | Jitsi Meet | Source |
| --- | --- | --- | --- | --- |
| Screen share | ✅ desktop only. "Safari Mobile does not support screen sharing on iOS"; same on Android Chrome | docs FAQ https://docs.bigbluebutton.org/support/faq | ✅ (`toggleShareScreen`) | iframe commands https://github.com/jitsi/handbook/blob/master/docs/dev-guide/iframe-commands.md |
| Whiteboard | ✅ tldraw v2 (BBB fork, Apache-2.0); multi-user whiteboard; experimental infinite whiteboard | https://docs.bigbluebutton.org/3.0/new-features/ | ⚙️ Excalidraw. Needs a self-hosted `excalidraw-backend` (`whiteboard.collabServerBaseUrl`); sample config `userLimit: 25` | jitsi-meet `config.js` lines ~2125–2140 (master) |
| Slides / PDF upload | ✅ presenter uploads PDF/Office; `create` can pre-upload up to 10 docs; `insertDocument` API for live insert | https://docs.bigbluebutton.org/development/api | ❌ no slide presenter. Teacher screen-shares. Optional file-sharing service (`jitsi-meet-file-sharing-service`) for handing out files | https://github.com/jitsi/handbook/blob/master/docs/devops-guide/file-sharing.md |
| Chat | ✅ public + private; pinned messages (4.0) | new-features | ✅ (`sendChatMessage`, private chat) | iframe commands |
| Polls / quizzes | ✅ polls; quizzes with correct answers (3.0+); results in Learning Dashboard | 3.0 new-features | ✅ polls (`mod_polls_component`); no quiz scoring found `[unverified]` | config.js |
| Breakout rooms | ✅ with per-breakout Learning Dashboard (4.0); moderators can listen in (LiveKit) | new-features | ✅ (`addBreakoutRoom`, `autoAssignToBreakoutRooms`, `sendParticipantToRoom`; `mod_muc_breakout_rooms`) | iframe commands; prosody-plugins list |
| Hand raise | ✅ raised-hands list in left panel | 3.0 new-features | ✅ (`toggleRaiseHand`, `raiseHandUpdated`) | iframe API |
| Mute all / mute on start | ✅ "Mute all except presenter", `muteOnStart`, `allowModsToUnmuteUsers`, new `requireUserConsentBeforeUnmuting` (4.0). Note: 3.0 removed the plain "Mute all users" button | API docs; 3.0 new-features | ✅ `muteEveryone`, `muteRemoteParticipant`, A/V moderation (`toggleModeration`, `askToUnmute`, `approveVideo`) | iframe commands |
| Kick | ✅ remove user (UI); ban via guest policy `[unverified API]` | – | ✅ `kickParticipant` | iframe commands |
| Lock settings | ✅ `lockSettingsDisableCam/Mic/PrivateChat/PublicChat/Notes`, `HideUserList`, `LockOnJoin`, `lockSettingsPresenterPolicy` (4.0) | API docs | ⚙️ password (`password`), lobby, A/V moderation; no per-feature lock matrix like BBB `[unverified]` | iframe commands |
| Waiting room / guest approval | ✅ `guestPolicy=ASK_MODERATOR` (also `ALWAYS_ACCEPT`/`ALWAYS_DENY`); queue position shown. **4.0 caveat:** phone dial-in on LiveKit bypasses the lobby | API docs; customize; new-features | ✅ lobby (`toggleLobby`, `answerKnockingParticipant`, `knockingParticipant` event); needs up-to-date Prosody from packages.prosody.im | quickstart https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-quickstart |
| Cloud recording | ✅ server-side. Default `presentation` format = HTML5 web player (slides + audio + webcams + chat). Optional `video` format (pkg `bbb-playback-video`) outputs **MP4** (WebM optional). `presentation` can also add MP4 via `video_formats` | https://docs.bigbluebutton.org/administration/customize ; https://docs.bigbluebutton.org/development/recording | ⚙️ Jibri: Chrome in a virtual framebuffer + ffmpeg. `recording-format = "mp4"`, default 1920x1080 @30fps, preset `ultrafast`. "Only one recording at a time is supported on a single jibri." | https://github.com/jitsi/jibri (README, reference.conf) |
| Attendance tracking | ✅ Learning Analytics Dashboard (moderator-only, `learningDashboard` endpoint); `meta_analytics-callback-url` POSTs JSON at meeting end with per-attendee `joins`, `leaves`, `duration`, engagement (`talk_time`, `talks`, …); bbb-webhooks events `user-joined`, `user-left`, `meeting-created`, `meeting-ended`, `poll-responded`, `user-raise-hand-changed`, … | API docs; bbb-webhooks `src/process/event.js` | ⚙️ not built in. Options: (a) jitsi-contrib `event_sync` Prosody module POSTs `muc-room-created/destroyed`, `muc-occupant-joined/left` with `joined_at`/`left_at` and the JWT user `id/name/email`; (b) `mod_muc_census` (room counts only, no auth); (c) `mod_speakerstats_component`; (d) client-side iframe events `participantJoined`/`participantLeft` (not trustworthy for attendance) | https://github.com/jitsi-contrib/prosody-plugins/tree/main/event_sync ; jitsi-meet prosody-plugins |
| Shared notes | ✅ BlockNote (Etherpad removed in 4.0), LaTeX/Mermaid (4.0.2) | new-features | ❌ (Etherpad integration exists historically `[unverified current]`) | – |
| Live captions | ⚙️ browser speech API. **Default `speechProcessing: cloud` → "Chrome sends the audio to Google's speech recognition servers"**; options `local`/`auto`; Gladia (cloud) or self-hosted bbb-livekit-stt | customize | ⚙️ Jigasi/transcriber backends (Vosk etc.) | config.js |

---

## 3. Scale

### 3.1 Official guidance
| | BBB | Jitsi |
| --- | --- | --- |
| Per server | "the server should be able to support 200 simultaneous users" on minimum spec (FAQ). Scalelite README: one minimum server "supports around 200 concurrent users", e.g. "4 simultaneous classes of 50 users, or 8 simultaneous meetings of 25 users". | No number. Handbook: "For big meetings it's suggested to go the scalable way over getting huge amounts of memory"; "don't expect to have 20 users using 4K on a server with 100Mbits/s". |
| Per session | "As of BigBlueButton 2.5, we recommend no single sessions [over] two-hundred (200) users." | No official limit. Quickstart: for ">100 participants" raise `DefaultLimitNOFILE/NPROC/TasksMax=65000`. |
| CPU guard | Audio degrades "once the CPU reaches 80%"; keep CPU "below 70%" | Prosody "can only use ONE (1) core" |
| Media architecture | 4.0: **LiveKit** is the default SFU for audio, camera and screen (mediasoup/FreeSWITCH still available) | jitsi-videobridge SFU with simulcast (`doc/simulcast.md`); bridges cascade via "relays (aka secure octo)" over ICE/DTLS-SRTP |
| Webcam bitrate | 320x240 ≈0.25, 640x480 ≈0.40, 1280x720 ≈0.60 Mbit/s per stream; 20 users all on webcam = 400 streams | 180p ≈200 kbit/s, 360p ≈500 kbit/s, 720p ≈2500 kbit/s |

Sources: https://docs.bigbluebutton.org/support/faq ; https://github.com/blindsidenetworks/scalelite (README) ; https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-requirements ; https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-quickstart ; https://github.com/jitsi/jitsi-videobridge/blob/master/doc/relay.md

### 3.2 Minimum hardware
| | BBB 4.0 (production) | Jitsi |
| --- | --- | --- |
| OS | Ubuntu 24.04 64-bit, kernel 6.x, latest Docker | Debian 12+ or Ubuntu 24.04+, OpenJDK 17 |
| CPU | 8 cores, high single-thread performance | "4 dedicated cores can be enough" (basic); scalable: signalling node 4 CPU/8 GB, each JVB "4 or 8 CPU with 8 GB RAM" |
| RAM | 16 GB with swap | 8 GB suggested (4 GB small meetings) |
| Disk | 500 GB with recordings; 50 GB without | 20 GB |
| Bandwidth | 250 Mbit/s symmetrical | "1 Gbits/s will often be enough"; "for a serious server 10 Gbits/s is advisable" |
| Ports | TCP 80/443, TCP+UDP 3478 (built-in TURN), UDP 16384–32768 | TCP 80/443, UDP 10000, TCP 5349 (coturn fallback), optional UDP 3478 |
| Recording | runs on the BBB server itself | Jibri: one machine/container per concurrent recording; 8 GB RAM (720p), 12 GB (1280x1024) |

Sources: https://docs.bigbluebutton.org/administration/install ; Jitsi requirements and scalable pages above.

### 3.3 Sizing for IBA (none of these is vendor-certified)
| Scenario | BBB | Jitsi |
| --- | --- | --- |
| 50 students, 1 class | Fits one minimum server (Scalelite's own example: 4×50 per server). | One all-in-one server is plausible; no official figure `[unverified]`. |
| 200 students in one class | At the **official per-session ceiling** of 200. Needs a dedicated server, few webcams on (`webcamsOnlyForModerator`), and a load test. | No official figure. Needs several JVBs and a load test `[unverified]`. |
| 500 open webinar | **Above BBB's recommendation** (200/session). No built-in fan-out/streaming tier found in the docs `[unverified]`. Would need RTMP/HLS streaming via a community add-on `[unverified]`. | "Visitors" mode: participants above a configured threshold join as view-only "visitors" on extra Prosody nodes; "2000 participants per visitor node a safe value"; README is marked "Work In Progress" with no promotion to speaker yet (TODO: polls, speaker stats). |
| Many parallel classes | Scalelite: places each new meeting on the least-loaded server (min. 3 BBB servers recommended; plus Postgres, Redis, NFS for recordings). | Add JVBs behind one signalling node; jicofo balances. Relays/cascading for multi-region. |

Visitors source: https://github.com/jitsi/jitsi-meet/blob/master/resources/extra-large-conference/README.md (source-grep).

---

## 4. Running inside Iran (no foreign runtime dependencies)

### 4.1 Runtime third-party calls (what the browser or server contacts by default)
| Item | BBB 4.0 | Jitsi |
| --- | --- | --- |
| Default STUN | **`stun:stun.l.google.com:19302`** in shipped `bigbluebutton-web/grails-app/conf/spring/turn-stun-servers.xml` (source-grep, v4.0.x-release). `bbb-install.sh -c` rewrites it to your own host (`turn:<host>:3478`, `turns:<host>:443?transport=tcp`). Override file: `/etc/bigbluebutton/turn-stun-servers.xml`. LiveKit template ships `use_external_ip: false`. | **`stun:meet-jit-si-turnrelay.jitsi.net:443`** is the P2P STUN default in `config.js` (master). Must replace with own coturn. JVB/coturn creds come via Prosody `mod_external_services`. |
| Fonts/CDN | No Google Fonts or CDN found in client settings (source-grep) | No Google Fonts/CDN found in web source (source-grep) |
| Google services | Live captions default `speechProcessing: cloud` (Chrome → Google). Set `local` or disable captions. | Gravatar avatars by default (`gravatar.baseUrl` https://www.gravatar.com/avatar/) unless `disableThirdPartyRequests: true`. Google Calendar/YouTube only if `googleApiApplicationClientID` is set. Giphy only if configured. |
| Telemetry/analytics | None by default found `[unverified exhaustively]` | Analytics block commented out by default (Amplitude/Matomo/rtcstats are opt-in) |
| Links in UI | `helpLink: https://bigbluebutton.org/html5/`, iOS App Store link, error-help links to bigbluebutton.org (settings.yml). These are links, not runtime requests; override them. | Help centre `web-cdn.jitsi.net`, privacy/terms on jitsi.org, app store links in `deeplinking` (override them). `JITSI_WATERMARK_LINK: https://jitsi.org` |
| Other | Plugin manifests load from URLs you configure (`pluginManifests`). Self-host them. | Excalidraw backend, file-sharing service, transcription: all self-hostable |

### 4.2 Install-time dependencies
| | BBB 4.0 | Jitsi |
| --- | --- | --- |
| Install method | `bbb-install.sh` (GitHub raw, branch `v4.0.x-release`); `-v noble-400` | apt from `https://download.jitsi.org stable/` + Prosody `http://packages.prosody.im/debian`; or docker-jitsi-meet |
| Package repos | `ubuntu.bigbluebutton.org` (default `PACKAGE_REPOSITORY`); `-r packages-eu.bigbluebutton.org` alternative; `deb.nodesource.com`; `download.docker.com` | download.jitsi.org, packages.prosody.im |
| Container images | **`bbb-libreoffice-docker` builds `bbb-soffice` "from the image `bigbluebutton/bbb-libreoffice` on Docker Hub"; if the server can't reach Docker Hub, the package's post-install script fails.** The docs' fix: a proxy for docker.service, or `docker load` the image and run `apt-get install -f`. Greenlight `bigbluebutton/greenlight:v3`, LTI images and Scalelite (`blindsidenetwks/scalelite`) all come from Docker Hub. | docker-jitsi-meet now defaults to `ghcr.io/jitsi/*` (web, prosody, jicofo, jvb, jibri). ghcr.io reachability from Iran `[unverified]`. |
| Mirroring support | `-p <host>[:port]` apt proxy (apt-cacher-ng, default port 3142) and `-r <host>` alternative repo are built into bbb-install.sh. Docker images: `docker save` outside Iran → `docker load` inside, or a private registry. | Standard apt mirror (aptly/apt-cacher-ng) of download.jitsi.org + prosody; mirror ghcr images to a private registry. |
| Google downloads | none required | **Jibri README installs `google-chrome-stable` from `dl.google.com` and chromedriver from `googlechromelabs.github.io`.** Whether these work from Iranian IPs is `[unverified]`. Mirror the .deb, or use the Jibri Docker image (pulls from ghcr). |
| TLS | Let's Encrypt via certbot (needs outbound access to Let's Encrypt; reachability from Iran `[unverified]`); `-d` uses own certs from `/local/certs/` | Let's Encrypt recommended; own certs possible. "Mobile apps require a valid certificate" |

**Docker Hub and Iran:** Docker's 403 message, quoted in a 2024-05-30 post: "Since Docker is a US company, we must comply with US export control regulations… we now block all IP addresses that are located in Cuba, Iran, North Korea, Republic of Crimea, Sudan, and Syria." (https://acuifex.pages.dev/blog/docker-hub-registry-http-403-forbidden, published 2024-05-30). I found no official Docker page with a current status `[unverified current]`.
Whether `ubuntu.bigbluebutton.org`, `packages-eu.bigbluebutton.org`, `download.jitsi.org`, `packages.prosody.im`, `deb.nodesource.com`, `download.docker.com` and `ghcr.io` answer Iranian IPs: **all `[unverified]`**. Test from an Iranian VPS before choosing. Plan an offline mirror either way.

### 4.3 TURN over 443/TCP
- **BBB:** first-class. bbb-install.sh puts HAProxy on 443 and routes ALPN `stun.turn` to coturn; client entry `turns:<host>:443?transport=tcp`. 4.0 also ships an optional `bbb-coturn` package (coturn 4.16.0), not installed by default. (https://docs.bigbluebutton.org/administration/turn-server ; bbb-install.sh)
- **Jitsi:** default TURN is UDP 3478 + TLS 5349. The handbook documents "Use TURN server on port 443" with an nginx `stream` SNI multiplexer and Prosody `{ type = "turns", host = ..., port = "443", transport = "tcp" }`. (https://github.com/jitsi/handbook/blob/master/docs/devops-guide/turn.md)

### 4.4 Mobile browsers without an app
| | BBB | Jitsi |
| --- | --- | --- |
| Android Chrome | Yes, "Android 6.0+", no app | Yes, "Same support as the desktop version" |
| iOS Safari | Yes, "iOS 14.5+", no app | Yes, Safari 14.3+ ("Best results with 15.4") |
| App push | Settings link to "BigBlueButton tablet" iOS app (optional) | **By default, mobile browsers get `DeepLinkingMobilePage` (Join in app / Download app / "Join in browser" if supported).** Set `deeplinking: { disabled: true }` (replaces deprecated `disableDeepLinking`) to go straight into the web app. Setting only `MOBILE_APP_PROMO: false` shows the `NoMobileApp` page instead, so use `deeplinking.disabled`. |
| Screen share on mobile | No (OS/browser limitation) | Same browser limitation `[unverified for Jitsi specifically]` |

Sources: BBB FAQ; https://jitsi.github.io/handbook/docs/user-guide/supported-browsers ; jitsi-meet `react/features/deep-linking/functions.web.ts` and `components/DeepLinkingMobilePage.web.tsx` (source-grep, master).

---

## 5. Integration with Edvora

| Capability | BBB | Jitsi |
| --- | --- | --- |
| Server API | REST/XML, `checksum` = hash(callName + query + shared secret), SHA-1 base, SHA-256/384/512 via `supportedChecksumAlgorithms`. Calls: `create`, `join`, `end`, `isMeetingRunning`, `getMeetings`, `getMeetingInfo`, `getRecordings`, `publishRecordings`, `deleteRecordings`, `updateRecordings`, `insertDocument`, `sendChatMessage`, text-track calls | No REST meeting API in OSS core. Rooms are created on join. Control happens via JWT plus Prosody modules (e.g. `mod_muc_end_meeting`, `mod_muc_kick_participant`, `mod_muc_census`) and the client-side iframe API |
| Per-user join with role | `join?fullName&meetingID&role=MODERATOR|VIEWER&userID&avatarURL&createTime&userdata-*` signed server-side. `createTime` rejects reused URLs. Passwords deprecated. | JWT (`jitsi-meet-tokens` package; `mod_auth_token`), HS256 shared secret or RS256 with `asap_key_server`. Claims `iss`, `aud`, `sub` (domain/tenant), `room`, `exp`; `context.user {id,name,email,avatar}`. **Role:** `mod_token_affiliation` (now in core repo) gives owner/moderator when `context.user.affiliation` is `owner`/`moderator`/`teacher` or `context.user.moderator == true`. Lobby bypass via contrib `token_lobby_bypass`. Every participant needs a token unless a guest domain is configured. |
| Webhooks | `bbb-webhooks` (apt `bbb-webhooks`): `hooks/create?callbackURL&meetingID&eventID&getRaw`. Callbacks carry a checksum over URL + body + secret; retries; hook removed after ~12 failures in ~5 min. Events include `meeting-created`, `meeting-ended`, `user-joined`, `user-left`, `user-audio-muted/unmuted`, `user-cam-broadcast-start/end`, `user-raise-hand-changed`, `poll-started`, `poll-responded`, `meeting-recording-started/stopped`, `rap-archive-*`, `rap-process-*`, `rap-publish-ended`, `rap-published`, `rap-deleted`, `chat-group-message-sent`. Also an xAPI output module. | No official webhook service in OSS. Community `event_sync` (jitsi-contrib, Apache-2.0, 94★) POSTs room created/destroyed and occupant joined/left. Recording-done: Jibri `finalize-script` runs on the Jibri box after each recording, so we write our own upload + notify step. |
| Recording-ready callback | `meta_bbb-recording-ready-url` on `create`. POST `signed_parameters` = JWT HS256 (shared secret) with `meeting_id`, `record_id`; 2XX = ok, 401 secret mismatch, 410 deleted | Jibri `finalize-script` (above) |
| Meeting-end / analytics callback | `meetingEndedURL` (supported; `meta_endCallbackUrl` deprecated, since meta values can leak to users). `meta_analytics-callback-url` sends Learning Dashboard JSON at meeting end. | `event_sync` `muc-room-destroyed` |
| Embedding | Join URL in an iframe works with `allow="camera *; microphone *; display-capture *"` (community-documented; HTTPS required). 4.0 adds `X-Frame-Options: SAMEORIGIN` on bbb-web responses, but "Joining a meeting is not affected, including from an LMS or any other site that embeds BigBlueButton in a frame"; client/slides/recordings are served by nginx without these headers. No official JS SDK; HTML5 plugin SDK (`bigbluebutton-html-plugin-sdk` 1.0.0-beta.3) for in-client extensions. | First-class iframe API: `<script src='https://<your-domain>/external_api.js'>` + `new JitsiMeetExternalAPI(domain, {roomName, jwt, configOverwrite, interfaceConfigOverwrite, lang, userInfo})`; ~70 commands, ~80 events. Also lib-jitsi-meet for a fully custom UI. |
| Persian / RTL | Locale `fa_IR.json` on `v4.0.x-release`: **1,496 of 1,863 English keys (80.3%)**, by my key-diff on 2026-11-06. Client sets `dir="rtl"` for `ar, dv, fa, he` (`imports/startup/client/intlAdapter.tsx`). Locale per user via `userdata-bbb_*`. | `lang/main-fa.json` on master: **1,602 of 1,656 keys (96.7%)**, by my key-diff. **No code found that sets document `dir=rtl`** (only a CSS mixin keyed on `body[dir=rtl]`), so expect an LTR layout with Persian strings `[partially verified by source-grep]`. Set via `defaultLanguage: 'fa'` or `lang`. |
| Branding per tenant | `logo` / `darklogo`, `bannerText`/`bannerColor` per `create`; `displayBrandingArea`; per-user custom CSS via `userdata-bbb_custom_style_url`; `public.app.clientTitle`; `clientSettingsOverride`. So per-tenant branding is possible per meeting. | `configOverwrite`/`interfaceConfigOverwrite` per embed (`APP_NAME`, `SHOW_JITSI_WATERMARK`, `defaultLogoUrl`), plus `dynamicBrandingUrl`-style config `[unverified exact key in current release]`. Per-tenant via JWT `sub` tenants. |
| Disable features | `disabledFeatures` list (e.g. `learningDashboard`, `webcamGrid`, `pinChatMessage`…) | `toolbarButtons`, `hiddenPremeetingButtons`, many `config.js` flags |

Sources: https://docs.bigbluebutton.org/development/api ; https://docs.bigbluebutton.org/development/webhooks ; https://github.com/bigbluebutton/bbb-webhooks ; https://docs.bigbluebutton.org/administration/customize ; https://docs.bigbluebutton.org/new-features ; https://github.com/jitsi/lib-jitsi-meet/blob/master/doc/tokens.md ; https://github.com/jitsi/jitsi-meet/blob/master/resources/prosody-plugins/mod_token_affiliation.lua ; https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe ; iframe discussion https://groups.google.com/g/bigbluebutton-setup/c/z6gsUDiV1gc and https://www.bigbluemeeting.com/docs/iframe (third-party vendor docs).

---

## 6. Operations

| | BBB | Jitsi |
| --- | --- | --- |
| Install | `bbb-install.sh -v noble-400 -s <fqdn> -e <email> [-g Greenlight] [-c turn]` on clean Ubuntu 24.04 | apt `jitsi-meet` (+ `jitsi-meet-tokens`, `jitsi-meet-turnserver`) or docker-compose |
| Upgrade path | Minor: re-run bbb-install / `apt full-upgrade`. **Major: "Upgrading from an earlier version of BigBlueButton (2.6, 2.7, 3.0) directly is not supported"** for 4.0, so each major means a new server and migrating recordings. | Rolling `apt upgrade` of stable packages roughly every 1–2 months; docker tags `stable-NNNNN` |
| Monitoring | Docs recommend Prometheus + Grafana + Alertmanager: community `greenstatic/bigbluebutton-exporter` (Docker Hub image, port 9688), node exporter, systemd exporter, LiveKit metrics on port 6789 (firewall it), GraphQL middleware `127.0.0.1:8378/metrics`, webrtc-recorder `127.0.0.1:3200`, `bbbctl` CLI (4.0) | JVB `/colibri/stats` and Prometheus `/metrics` on the private HTTP interface (`curl 0:8080/metrics`); Prosody `mod_muc_census` (no auth, keep internal); log analyser docs |
| Recording pipeline | Capture → Archive → Sanity → Process → Publish → Playback. "Processing and publishing the media for playback after the end of your session may take a few minutes"; `--rebuildall` "may take a long time". Hard numbers for processing time vs session length: `[unverified]`. Raw → `/var/bigbluebutton/recording/...`, published → `/var/bigbluebutton/published/<format>/<id>/`. | Jibri records live (no post-processing beyond ffmpeg finalise) to `recordings-directory` (default `/tmp/recordings`), then `finalize-script`. Encoder preset `ultrafast` → large files `[file sizes unverified]`. |
| Recording capacity | Processing runs on the same BBB box (CPU contention with live classes) `[operational inference]` | 1 Jibri per concurrent recording. Ten parallel recorded classes need ten Jibri instances (8–12 GB RAM each). |
| S3-compatible storage | **No native S3 in BBB docs.** Community pattern: `post_publish` script uploads + rewrites `metadata.xml` playback link (bigbluebutton-dev thread, Feb 2026, https://groups.google.com/g/bigbluebutton-dev/c/goa38tluix8). **Scalelite code has `S3_RECORDING` / `S3_BUCKET_NAME` support** (`lib/recording_importer.rb`, `bigbluebutton_api_controller.rb`; source-grep) but it's not in its `docs/` folder. Playback from S3 is still a feature request (https://groups.google.com/g/bigbluebutton-dev/c/bGgbDfHZw4g, Nov 2025). MinIO-compatible endpoint config `[unverified]`. | Jibri `finalize-script`: our own upload to MinIO/ArvanCloud S3. Recording is a plain MP4, so storage and playback are simple. |
| Admin front-end | Greenlight v3 (LGPL-3.0, Docker Hub image) optional. Edvora would call the API directly. | Built-in welcome page; disable it (`ENABLE_WELCOME_PAGE=0`) |

---

## 7. Security

| | BBB | Jitsi |
| --- | --- | --- |
| Transport | "media packets are encrypted using the Secure Real-Time Protocol"; HTTPS. **No E2EE claimed** (FAQ). | DTLS-SRTP; JVB decrypts the outer layer in memory |
| E2EE | ❌ none found | ✅ optional, passphrase/olm-based; needs insertable streams (Chromium 83+, Electron per jitsi.org). Source: `MAX_MODE_LIMIT = 20`, `MAX_MODE_THRESHOLD = 5`, so the UI limits E2EE around 20–25 participants (`react/features/e2ee/constants.ts`). Recording dialog blocks server-side transcription with E2EE (`'e2ee': end-to-end encryption is on; nothing server-side can transcribe the media`). Jibri recording under E2EE `[unverified]`. Safari/Firefox E2EE support `[unverified]`. |
| Join-link security | Checksum-signed join URLs; `createTime` stops reuse after the meeting is recreated; `allowRequestsWithoutSession=false` default | JWT `exp`, `room`, `sub` claims; `allow_empty_token = false` |
| Student watermark (name overlay) | ❌ no built-in. A 2019–21 bigbluebutton-dev thread asked for per-user moving watermarks and no solution was given (https://groups.google.com/g/bigbluebutton-dev/c/EsKyE2LAoPg). Possible build paths: HTML5 plugin SDK overlay or custom CSS (`userdata-bbb_custom_style`) for the live client; ffmpeg overlay in a post-publish script for MP4 recordings. All `[unverified feasibility]`. A client-side overlay only deters casual capture. | ❌ no built-in. Only the static logo watermark (`SHOW_JITSI_WATERMARK`, `defaultLogoUrl`). Per-user overlay would need a fork of jitsi-meet web or a wrapper overlay on our page around the iframe `[unverified feasibility]`. Jibri MP4 can be ffmpeg-overlaid in `finalize-script`, but that is one recording for everyone, not per student. |

---

## 8. Known use in Iran

| Claim | Evidence | Strength |
| --- | --- | --- |
| Iranian medical universities used **Navid, Adobe Connect and SkyRoom** during COVID-19 | Dastani M., *Jundishapur J Health Sci* 2021, doi:10.5812/jjhs.116958 (https://repository.brieflands.com/items/a8cf8da5-e0e5-42c5-b25b-ad114fb4119a). BBB **not** mentioned. | Peer-reviewed narrative review |
| Iranian medical students' instructors used Adobe Connect and SkyRoom | Heliyon 2022 (https://pmc.ncbi.nlm.nih.gov/articles/PMC8853985) | Peer-reviewed |
| Iranian resellers sell BBB-based classes | Mehr News, 28 Shahrivar 1400 (~2021-09-19), labelled "این مطلب، یک خبر آگهی بوده" (paid advert) naming BigBlueButton, Adobe Connect, Skyroom (https://www.mehrnews.com/news/5308392/); Roshka sales page on Virgool (https://virgool.io/@roshka/خرید-کلاس-مجازی-بیگ-بلو-باتن-با-روشکا-myu4kohsihti); Roomit described as a BBB derivative (search result, not opened) | Advertorial / vendor claims only |
| BBB hosted on an Iranian domain | training.istt.ir appears in a search result as a BBB instance (https://training.istt.ir/s/ZuYKTtl0) | Weak: one search hit, not opened |
| Any Iranian university running BBB or Jitsi officially | Not found `[unverified]` | – |
| Jitsi use in Iran | Not found `[unverified]` | – |

---

## 9. Implications for Edvora (analysis, not sourced fact)

1. **Feature fit:** BBB matches the classroom stories out of the box: slides, quizzes, breakouts, a lobby, lock settings, a server-side attendance JSON, and webhooks. Jitsi needs community Prosody modules for attendance, an Excalidraw backend for the whiteboard, and has no slide presenter.
2. **Persian:** BBB has real RTL layout switching but ~80% string coverage, so we fill the gaps (and can contribute them back). Jitsi has better string coverage but apparently no RTL layout, which hurts an executive audience more.
3. **Iran blockers for BBB:** (a) Docker Hub for `bigbluebutton/bbb-libreoffice`, so `docker save/load` it; (b) default Google STUN in `turn-stun-servers.xml`, so override it (bbb-install `-c` does); (c) live captions default to Google cloud speech, so set `speechProcessing: local` or disable; (d) all apt repos reachable `[unverified]`, so plan an apt mirror (`-p` proxy flag exists).
4. **Iran blockers for Jitsi:** (a) default STUN `meet-jit-si-turnrelay.jitsi.net`; (b) Jibri depends on Google Chrome from dl.google.com; (c) gravatar unless `disableThirdPartyRequests`; (d) mobile app-download page unless `deeplinking.disabled`.
5. **Scale:** 20–60 and 200 are inside BBB's documented envelope (200/session, ~200/server). **500 in one BBB session is outside it.** That needs either a streaming tier (not researched here) or Jitsi-style visitors (WIP). Load-test before promising 500.
6. **Recording:** BBB recording is cheap (no extra boxes) but post-processed. MP4 needs the `video` format enabled. Jitsi MP4 recording costs one 8–12 GB machine per concurrent recorded class.
7. **Upgrades:** BBB majors need a fresh server (no in-place 3.0 → 4.0 upgrade). Budget a migration each major release.

## 10. Open questions to verify by test (from an Iranian VPS)
- Reachability: `ubuntu.bigbluebutton.org`, `packages-eu.bigbluebutton.org`, `download.jitsi.org`, `packages.prosody.im`, `deb.nodesource.com`, `download.docker.com`, `ghcr.io`, `dl.google.com`, Let's Encrypt ACME.
- Real BBB 4.0/LiveKit capacity with 200 users (5 webcams, 1 presenter) on 8 vCPU/16 GB at an Iranian DC.
- BBB `video` (MP4) format processing time for a 3-hour class.
- Scalelite `S3_RECORDING` against MinIO/ArvanCloud (custom endpoint env).
- Jitsi RTL rendering with `lang=fa` (visual check).
- Jitsi E2EE + Jibri interaction.
