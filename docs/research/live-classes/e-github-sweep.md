# E-033 — Wider GitHub sweep: open-source virtual-classroom / webinar / meeting apps

Access date for every URL below: **2026-11-06** unless a publication date is given.
Star counts and dates come from the GitHub REST API (`api.github.com/repos/<o>/<r>`, `/releases/latest`, `/contributors`) queried on that date.
`[unverified]` = not confirmed from a primary source. "Inference:" = my reasoning, not a sourced fact.
Excluded (already evaluated): BigBlueButton, Jitsi/Jibri, LiveKit/Egress, OpenVidu 3, Galène, mediasoup, edumeet, MiroTalk, Janus, Element Call, Nextcloud Talk, Ant Media CE, OpenMeetings, Skyroom, Adobe Connect resellers.

---

## 1. Bottom line

- **No candidate displaces BigBlueButton 4.0.** Only **plugNmeet** is a feature-complete classroom alternative, and it is a credible **second option / fallback adapter**, not a replacement. Reasons: one-maintainer bus factor, Docker Hub + Google-hosted (Chrome apt repo, GitHub releases) install path, Google STUN in the sample LiveKit config, whiteboard library items fetched from excalidraw.com by default, and a partial Persian locale (89% of keys) with an Inter-only font stack.
- **OpenTalk** is well engineered (EUPL-1.2, Rust, LiveKit, German gov/edu market) but has **only `de` and `en` locales**, no Persian/RTL evidence, and its whole image set comes from a German company registry (`registry.heinlein.group`). Not a fit for an Iranian Persian-first deployment without heavy work.
- **La Suite Meet (DINUM, MIT, LiveKit)** is the highest-starred new find (2,470★) but is a *meeting* app: no whiteboard, polls or breakouts; ships `posthog-js`. Not a classroom.
- Everything else is either a BBB satellite (Greenlight, PILOS, Scalelite, b3scale, bbblb, LTI apps — useful **around** BBB), dormant (Kopano Meet, nettu-meet, edrys), tied to a foreign cloud (Agora Flat), or not a classroom (Mattermost Calls, chat suites).
- Practical value of this sweep for Edvora: (a) plugNmeet's **BBB-compatible API** means our BBB adapter could in principle target plugNmeet as a fallback with the same code path — test it; (b) **Greenlight 3 and PILOS ship `fa` locales**, and **Scalelite/b3scale/bbblb** cover multi-server BBB later.

---

## 2. plugNmeet (mynaparrot) — serious candidate

| Item | Fact | Source |
| --- | --- | --- |
| Licence | **MIT** for server, client and recorder (no commercial limits from the licence) | GitHub API `license.spdx_id` for `mynaparrot/plugNmeet-server`, `-client`, `-recorder` |
| Stars | server 575 · client 44 · recorder 23 | GitHub API |
| Latest release | server **v2.5.7 (2026-11-03)** · client **v2.5.6 (2026-11-03)** · recorder **v2.3.2 (2026-10-30)** | `/releases/latest` |
| Created | 2022-02-25 | GitHub API `created_at` |
| Owner | MynaParrot (company); also sells plugnmeet.cloud | https://github.com/mynaparrot · client source references `plugnmeet.cloud` |
| Contributors | server: `jibon57` 1,736 commits, next human 2. client: `jibon57` 3,362, `Abdulkader69` 455, others ≤8. recorder: `jibon57` 463 | `/contributors` |
| **Bus factor** | **1** (effectively one developer; a second on the client) | derived from the above |
| Stack | Go server, React/Redux client, LiveKit SFU, NATS, Redis, MariaDB; optional LibreOffice + mupdf for office files | https://github.com/mynaparrot/plugNmeet-server/blob/main/README.md |

### Classroom features (from README and client source tree)
README lists: screen share, virtual backgrounds, collaborative whiteboard with office files (PDF, DOCX, PPTX), shared notepad, polls, breakout rooms, E2EE (optional), MP4 recording, RTMP/RTMPS out, RTMP/WHIP ingress, SIP dial-in, AI transcription/translation/summaries. Source: https://github.com/mynaparrot/plugNmeet-server/blob/main/README.md

Client `src/components/` contains: `breakout-room`, `chat`, `countdown-timer`, `polls`, `reactions`, `shared-notepad`, `waiting-room`, `whiteboard` (Excalidraw `0.18.0-3c916c5`), `external-media-player`, `display-external-link`, `translation-transcription`, `insights-ai`, `export-hub`. Source: shallow clone of https://github.com/mynaparrot/plugNmeet-client (main, 2026-11-06).

- Moderator controls: `is_admin` role, per-user `lock_settings` (mic, webcam, screen share, chat, chat send, file share), hidden/spectator join. Source: https://www.plugnmeet.org/docs/api/room/join
- Hand raise: exercised in the vendor benchmark ("raising hands"). Source: https://www.plugnmeet.org/docs/benchmark
- Recording: **one standard MP4 per recording** (vs BBB's multi-format playback). Recorder is headless Chrome + Xvfb + PulseAudio + FFmpeg. Sources: https://www.plugnmeet.org/docs/tutorials/migration-from-bbb ; installer `install_recorder()` in https://raw.githubusercontent.com/mynaparrot/plugNmeet-install/main/install.sh
- Attendance/analytics: analytics API (fetch/download/delete) and `analytics_proceeded` webhook. Sources: https://www.plugnmeet.org/docs/api/analytics/fetch ; https://www.plugnmeet.org/docs/others/webhooks
- Inference: no BBB-style "slides" pod; PDF/PPTX go onto the whiteboard. Whether it matches BBB's presenter/annotation workflow for MBA lectures is untested.

### Scale guidance
- Vendor benchmark (Sept 2026): 4 vCore / 16 GB single server, 300 and 500 users in one room clean, ~900 per room ceiling; cluster ran 1,000 in one room. **Simulated users** joined, chatted, drew, raised hands; the page gives no video/bandwidth figures. Source: https://www.plugnmeet.org/docs/benchmark
  - Inference: this measures signalling/data fan-out, not 60 webcams + screen share. Our 200/500 sizes would need our own media load test.
- Production minimum 4 cores / 4 GB / 100 Mbit/s; recorder 8+ cores / 8 GB+. Source: https://www.plugnmeet.org/docs/installation
- Scale-out: multiple LiveKit nodes behind LB (LiveKit clustering + Redis), recorders announce over NATS (modes `recorderOnly` / `transcoderOnly` / `both`), MariaDB Galera, shared storage or S3 via hooks. Source: https://www.plugnmeet.org/docs/developer-guide/scalable-setup
- LiveKit: a room must fit on a single node. Source: https://docs.livekit.io/transport/self-hosting/distributed.md

### Iran fit
| Check | Finding | Source |
| --- | --- | --- |
| Docker Hub | **Yes.** Installer compose pulls `livekit/livekit-server`, `livekit/ingress`, `livekit/sip`, `nats:2.15-alpine`, `mynaparrot/plugnmeet-server` (all Docker Hub) and runs `natsio/nats-box:latest` | https://raw.githubusercontent.com/mynaparrot/plugNmeet-install/main/install-files/docker-compose.yaml ; install.sh lines ~409–421 |
| Other foreign fetches at install | `download.docker.com`, `dl.google.com` (Chrome for recorder), `github.com/BtbN/FFmpeg-Builds`, GitHub release zips (client, recorder), `packages.redis.io`, `dlm.mariadb.com`, `haproxy.debian.net`, `ipv4.icanhazip.com`, Let's Encrypt | install.sh (downloaded as text, 671 lines) |
| Mitigation | Server is Go (build from source), client ships as `client.zip`, recorder ships linux amd64/arm64 zips → all mirrorable to an Iranian registry/artifact store. Inference: doable, but every upgrade means re-mirroring. | `/releases/latest` assets |
| STUN | Repo sample `livekit_sample.yaml` sets `stun.l.google.com:19302`. Installer's `livekit.yaml` sets no STUN servers but `use_external_ip: true`. | https://github.com/mynaparrot/plugNmeet-server/blob/main/livekit_sample.yaml ; https://raw.githubusercontent.com/mynaparrot/plugNmeet-install/main/install-files/livekit.yaml |
| | Inference (same as our LiveKit evaluation): with `use_external_ip` and no `stun_servers`, LiveKit uses its default (Google) STUN for IP discovery → set `node_ip` explicitly or point to our own STUN. `[unverified for this version]` | — |
| TURN / 443 | Embedded LiveKit TURN enabled, `udp_port: 443`, `tls_port: 5349`, `external_tls: true` behind HAProxy on a separate `turn.` subdomain; installer opens 443/tcp and 443/udp | installer `livekit.yaml`; install.sh lines ~627–630 |
| CDNs / fonts in client | `index.html`: no external URLs. `login.html` (copied into the build) loads **Google Fonts (Inter)** — a dev/test login page, but it is served. Main UI uses self-hosted `plugnmeet-font.css` (Inter + icon font). | client `src/index.html`, `src/login.html`, `src/styles/plugnmeet-font.css`, `vite.config.ts` |
| Whiteboard | Default preloaded library items are fetched from `libraries.excalidraw.com`; overridable via `whiteboardPreloadedLibraryItems` config. | client `src/components/whiteboard/helpers/utils.ts` |
| | Stock Excalidraw 0.18 falls back to `esm.sh` for font assets unless `EXCALIDRAW_ASSET_PATH` is set; plugNmeet uses a forked build and does not set that variable in source. **`[unverified]`** whether its build self-hosts the fonts — check in a browser network tab. | npm `@excalidraw/excalidraw@0.18.0` dist (grep `esm.sh`); client source grep |
| AI features | Optional providers Azure, Google Gemini, OpenAI in `config_sample.yaml` — leave disabled in Iran. | https://github.com/mynaparrot/plugNmeet-server/blob/main/config_sample.yaml |
| Mobile browsers | "Chrome, Firefox, and Safari for iOS, with no downloads required" (vendor claim) | README |

### Integration
- Native REST API (room create/join/end/is-active/info, recordings, artifacts, analytics, polls, whiteboard upload). Join returns a **short-lived, one-time token**; client URL takes `access_token` query param or `pnm_access_token` cookie. Role via `is_admin`. Source: https://www.plugnmeet.org/docs/api/room/join ; https://www.plugnmeet.org/docs/api/intro
- **Webhooks**: `room_created`, `room_started`, `room_finished`, `session_ended`, `participant_joined`, `participant_left`, `track_published/unpublished`, `start/end_recording`, `recording_proceeded`, `start/end_rtmp`, `artifact_created`, `analytics_proceeded`; signed JWT carrying SHA-256 of body (LiveKit style). Global or per-meeting URL. Source: https://www.plugnmeet.org/docs/others/webhooks ; `config_sample.yaml` `webhook_conf`
- **BBB-compatible API**: routes at `/:apiKey/bigbluebutton/api/{create,join,isMeetingRunning,getMeetingInfo,getMeetings,end,getRecordings,deleteRecordings,updateRecordings,publishRecordings}`. Source: `pkg/app/router.go` `registerBBBRoutes()` in https://github.com/mynaparrot/plugNmeet-server
  - Vendor calls it "a bridge" and recommends native SDKs; no published list of unsupported parameters. `[unverified]`: BBB `meta_*`, `logoutURL`, presentation preupload, BBB webhooks API (`hooks/create`) — not in the route list, so `hooks/*` is **not** supported. Source: https://www.plugnmeet.org/docs/tutorials/migration-from-bbb
- SDKs: PHP, JavaScript/Node/Deno. Plugins: Moodle (`mynaparrot/moodle-mod_plugnmeet`, 3★, pushed 2026-11-04), WordPress, Joomla, LTI. Source: README; GitHub API
- Embedding: web client is a standalone SPA joined by URL+token; iframe use `[unverified]` (not documented on pages read). Custom CSS/branding: https://www.plugnmeet.org/docs/developer-guide/design-customisation

### Persian / RTL
- **`fa-IR` locale exists** (`src/assets/locales/fa-IR/translation.json`, listed as "فارسی" in `src/helpers/languages.ts`). Coverage on 2026-11-06: **890 of 1,001 English keys; 112 missing** (fall back to English). Computed by flattening both JSON files.
- **RTL is implemented**: `components/app/index.tsx` sets `document.documentElement.dir = i18n.dir()` and watches for changes; toasts get `rtl`. Tailwind logical utilities (`ms-/me-/ps-/pe-/start-/end-`) appear ~229 times vs ~28 physical (`ml-/mr-/pl-/pr-/left-/right-`), and 19 files use `rtl:` variants. Source: client source grep.
- Inference: Inter has no Arabic-script glyphs, so Persian text falls back to the OS font; we would inject self-hosted Vazirmatn/Fontiran fonts via design customisation.

### Ops
- Install: interactive `install.sh` on clean Ubuntu/Debian; systemd services `plugnmeet` and `plugnmeet-recorder`; config `/opt/plugNmeet/config.yaml`; needs main domain + TURN subdomain + Let's Encrypt email. Updates via `update.sh` from GitHub. Source: https://www.plugnmeet.org/docs/installation
- Storage: local `storage_path`; S3/GCS via hook scripts (not native). Source: `config_sample.yaml` lines ~223–363
- Monitoring: `[unverified]` (no Prometheus endpoint found in pages read; LiveKit itself exposes Prometheus).
- Release cadence: frequent (three components released 2026-10-30 → 2026-11-03).

**Verdict:** Best non-BBB classroom app found. Strong on licence (MIT), modern stack, MP4 recordings, webhooks, BBB-API bridge, fa + RTL. Weak on bus factor (1), Docker Hub/Google install chain, a few external URLs to strip, and unproven media load at 200–500. **Keep as plan B; spike it behind our BBB-API adapter.**

---

## 3. OpenTalk (OpenTalk GmbH / Heinlein group) — serious candidate, poor Iran fit

| Item | Fact | Source |
| --- | --- | --- |
| Licence | **EUPL-1.2** (controller); web frontend repo carries EUPL-1.2 plus Apache-2.0, MIT, OFL-1.1, CC0, and one **CC-BY-NC-ND-4.0** file (likely branding assets — `[unverified]` which files) | GitLab API tree `LICENSES/` for projects 799 and 788 on https://gitlab.opencode.de |
| | EUPL-1.2 is copyleft incl. network use (Art. 1 "Communication to the public"); compatible with AGPL/GPL. Inference: fine for self-hosting; modifications served to users must be published. | — |
| Hosting | Not on GitHub. Mirrors at gitlab.opencode.de (`opentalk/controller` etc.); controller README: moved to monorepo **git.opentalk.dev/opentalk/opentalk**, old repo backports only | https://gitlab.opencode.de/opentalk/controller (README) |
| Stars | 1 (controller), 1 (web-frontend), 5 (ot-setup) on opencode.de — not meaningful | GitLab API |
| Latest release | **v26.2.0 (2026-09-01)**: web-frontend v2.9.2, controller v0.34.4, recorder v0.17.1, new roomserver v0.1.3; earlier v26.1.1 (2026-08-11), v25.4.10 (2026-07-17) | https://docs.opentalk.eu/releases/26.2.0/ ; https://docs.opentalk.eu/releases/26.1.1/ ; https://lists.opentalk.eu/pipermail/opentalk-announce/2026-July/000021.html |
| | ot-setup `docker-compose.yaml` on 2026-11-06 pins controller **v0.35.3**, web-frontend **v2.10.2**, recorder v0.18.2, livekit-server v1.13.10 (newer than 26.2.0) | https://gitlab.opencode.de/opentalk/ot-setup (`docker-compose.yaml`) |
| Maintainers | Company team: controller 18 contributors (top: W. Silbermayr 778 commits), web-frontend 30, recorder 24 | GitLab API `/repository/contributors` |
| Bus factor | Inference: **company-backed, ~5+ active devs** — healthier than plugNmeet | — |
| Stack | Rust controller, React web frontend, LiveKit, Postgres, Redis, RabbitMQ, Keycloak (OIDC required), Garage (S3), Etherpad, Spacedeck/Excalidraw, obelisk (SIP) | ot-setup compose |

**Features:** breakout rooms (frontend v2.9.0), polls (incl. moderator-prepared), waiting room, Excalidraw whiteboard (Spacedeck deprecated), meeting notes (Etherpad), reactions, guest access toggle, grid up to 24 tiles, moderator rights, dial-in, coffee-break timer, recording and streaming modules. Sources: https://docs.opentalk.eu/releases/26.2.0/ ; https://docs.opentalk.eu/admin/controller/advanced/modules/ ; https://opentalk.eu/en/features
- Recording format: `[unverified]` (not stated in release notes read).
- Slides/PDF presentation pod: `[unverified]`.
- Scale: no per-room figure found; hosted Standard plan caps 50 participants (a tariff, not a technical limit). Source: https://opentalk.eu/en/features (pricing section, via search snippet) `[unverified detail]`

**Iran fit**
- Images: **all** from `registry.heinlein.group/opentalk/*` (not Docker Hub). Inference: avoids Docker Hub's Iran block but depends on a German company registry whose access from Iranian IPs is `[unverified]`; mirror it.
- Keycloak is mandatory → another heavy component.
- STUN/TURN defaults: `[unverified]` (env.sample shows no STUN/TURN lines).
- Frontend `index.html`: only a comment URL; bundles fonts, Excalidraw assets (`app/public/excalidraw-assets`), tflite models locally. Source: GitLab tree of project 788.

**Persian/RTL:** frontend locales are **only `de` and `en`** (Fluent `.ftl`). No RTL evidence. Source: GitLab tree `app/public/locales`.
**Integration:** REST API + OIDC; Outlook add-in; webhooks/LTI `[unverified]`.
**Verdict:** Good engineering and governance, wrong locale and ecosystem. **Not a fit** unless we fund a full fa translation + RTL pass.

---

## 4. Other notable finds

### La Suite Meet / "Visio" (suitenumerique/meet) — French government
- MIT, **2,470★**, release **v1.37.0 (2026-11-02)**, Django + React + LiveKit. Top contributor `lebaudantoine` 1,902 commits, next 126 → bus factor ~1–2 within DINUM. Source: GitHub API; https://github.com/suitenumerique/meet
- Features dirs: chat, lobby (waiting room), reactions, recording, subtitles, participants, files, pip. **No whiteboard, polls or breakout rooms** found in `src/frontend/src`. Source: shallow clone.
- Frontend depends on `posthog-js` (telemetry, config-gated `[unverified]`) and references Crisp support and French gov services. Locales: en, fr, de, nl, es — **no fa**. OIDC (ProConnect/Keycloak) required.
- **Verdict:** clean modern meeting app; not a classroom; no Persian.

### Mattermost Calls / rtcd
- Licence: compiled binaries MIT; source AGPL-3.0 **or** commercial (dual). Sources: `LICENSE.txt` in https://github.com/mattermost/rtcd and https://github.com/mattermost/mattermost-plugin-calls
- Calls plugin 149★, v1.12.6 (2026-10-15); rtcd 35★, v1.2.6 (2026-06-29).
- Group calls need Professional+; recording/transcription/live captions need Enterprise; rtcd needs Enterprise; free tier 1:1 only (40 min). Sources: https://docs.mattermost.com/deployment-guide/calls/calls-deployment-guide ; https://docs.mattermost.com/product-overview/editions-and-offerings ; https://forum.mattermost.com/t/calls-needed-in-v10-free-edition/23146
- **Verdict:** not a classroom; licence-gated. Reject.

### Kopano Meet (Kopano-dev/meet)
- 28★, licence NOASSERTION, last push **2022-12-09**, no releases. Source: GitHub API. **Verdict: dormant. Reject.**

### Pexip / Vidyo
- No open-source edition found for either; both are proprietary. Pexip's OSS output is SDKs, not a server `[unverified beyond search]`. **Reject.**

### Agora Flat (netless-io/flat)
- MIT, **6,442★**, pushed 2026-10-30. Client for Agora's cloud RTC + Netless whiteboard. Inference: runtime depends on Agora/Netless cloud (Chinese/US) → violates "no foreign runtime". **Reject.**

### Nebulynk (sapientorius/Nebulynk)
- 310★, licence NOASSERTION, created 2026-03-06. Team chat + meetings + AI. Too new, unclear licence. **Watch only.**

### Iranian projects
- `sunmobiir/persianmeet` (40★, no licence): README + images only, **no source code** — marketing page for "Adobe Connect alternative". Reject.
- `alchkalbasi/persian-bbb` (0★, 2026-08-01): Ansible playbook for BBB + Greenlight with Persian defaults, TURN, SSL. Small but **directly relevant to our BBB ops**; read before writing our own playbook.
- `nimah79/bbb-persian` (5★, 2025-11-10): guide for BBB in Iran; uses an HTTP proxy (`fodev.org:8118`) for `download.docker.com`, `repo.mongodb.org`, `ubuntu.bigbluebutton.org` — evidence that **BBB's own install path also needs a proxy/mirror in Iran**.
- `tahabornoosh/bbb-panel-lite` (PHP Farsi BBB panel, 2021) — stale.
- `SkyroomOnline/webservice`, `SkyroomOnline/wordpress-plugin` (pushed 2026-09-26) — Skyroom API samples (already evaluated).
- `aminsaedi/qr-tunnel` (7★): tunnels traffic over **Bale** video calls "using LiveKit DataChannels". Inference: Bale (Iranian messenger) runs LiveKit inside Iran → LiveKit-based stacks are operable on Iranian networks.
- Searches for "کلاس مجازی متن باز", "virtual classroom iran", "bbb fa_IR" returned only scrapers/attendance bots/empty repos.
Sources: GitHub search API, READMEs.

---

## 5. BBB satellites (useful around BBB, not replacements)

| Project | Licence | ★ | Latest | Note | Source |
| --- | --- | --- | --- | --- | --- |
| Greenlight 3 (bigbluebutton/greenlight) | LGPL-3.0 | 850 | release-3.9.1 (2026-11-05) | Ships **`fa.json` and `fa_IR.json`** (fa_IR 45 KB vs en 33 KB). We integrate via API, so Greenlight is optional. | GitHub API, `app/assets/locales` |
| PILOS (THM-Health/PILOS) | LGPL-2.1 | 69 | v4.19.0 (2026-10-28) | Multi-server BBB front-end with built-in load balancing; **`fa` locale**. | GitHub API, `lang/` |
| Scalelite (blindsidenetworks) | AGPL-3.0 | 507 | v1.8.7 (2026-11-04) | Reference BBB load balancer; recording import. | GitHub API |
| b3scale (b3scale/b3scale) | AGPL-3.0 | 21 | v1.3.0 (2025-04-25) | **Multi-tenant** BBB LB — matches Edvora's tenant model. | GitHub API |
| bbblb (defnull/bbblb) | AGPL-3.0 | 6 | no release; pushed 2026-09-15 | "Modern" LB, young. | GitHub API |
| b3lb (DE-IBH/b3lb) | AGPL-3.0 | 19 | 3.3.2 (2025-06-11) | Django LB; last push 2025-12-17. | GitHub API |
| bbb-app-rooms (bigbluebutton) | LGPL-3.0 | 12 | pushed 2026-10-29 | Official **LTI** rooms app. | GitHub API |
| moodle-mod_bigbluebuttonbn | GPL-3.0 | 95 | pushed 2025-09-25 | BBB is in Moodle core since 4.0; this repo is the legacy plugin. `bbbext_bnx` extension pushed 2026-11-05. | GitHub API |
| openfun/marsha | MIT | 152 | pushed 2026-11-07 | LTI LCMS (video + BBB classrooms). Inference: overlaps Edvora; reference only. | GitHub API |
| `yunify/bbb-lb` | — | — | — | Repo not found (404). | GitHub API |

AGPL note (inference): running Scalelite/b3scale unmodified as a separate service does not affect Edvora's code; modifications served to users must be published.

---

## 6. Topic-page sweep (≥ ~250★, sorted by stars, GitHub search API `topic:<t> stars:>=250`)

Only complete meeting/classroom apps get a verdict; libraries/infra/unrelated are marked "n/a".

**topic:virtual-classroom** (3 repos ≥250★)
- netless-io/flat 6,442 MIT — Agora-cloud dependent. Reject.
- classroomio/classroomio 1,736 AGPL-3.0 — LMS for customer training, not live classes. n/a.
- edrys-org/edrys 334 MPL-2.0, last push 2024-08-12 — modular remote-lab teaching; stale. Reject.

**topic:webrtc-conference** — 0 repos ≥250★.

**topic:video-conferencing** (30 repos ≥250★)
- jitsi/jitsi-meet 30,208; docker-jitsi-meet 3,623; jitsi-meet-electron 1,636 — already evaluated.
- ossrs/srs 29,428 MIT — streaming server (useful for 500-seat webinar fan-out via HLS), not a classroom. n/a.
- ether/etherpad 18,621 — notepad component. n/a.
- tinode/chat 13,555; tinode/tindroid — messaging. n/a.
- bigbluebutton/bigbluebutton 9,270 — current choice.
- miroslavpejic85/mirotalk 4,831, mirotalksfu 3,148, call-me 767, mirotalkc2c 521, mirotalkwebrtc 364 — already evaluated (MiroTalk family).
- **suitenumerique/meet 2,470 MIT — meeting app, no classroom tools, no fa. Reject (see §4).**
- fmeringdal/nettu-meet 2,409 AGPL-3.0, last push 2023-08-30 — tutoring app with whiteboard; dormant. Reject.
- jeremyckahn/chitchatter 2,343 — P2P chat. n/a.
- OpenVidu/openvidu 2,143 — already evaluated.
- jech/galene 1,431 — already evaluated.
- kevinshen56714/SkyOffice 1,317 — virtual office game. n/a.
- open-webrtc-toolkit/owt-server 1,155 — **archived**. Reject.
- **mynaparrot/plugNmeet-server 575 MIT — candidate (§2).**
- jashandeep-sohi/webcam-filters 553 — n/a.
- Teamlinker/Teamlinker 521 GPL-3.0, last push 2024-07-08 — team suite. n/a.
- SuperViz/superviz 380 — SDK, cloud. n/a.
- trailofbits/tubertc 354 — archived. n/a.
- waterbustech/waterbus 340 Apache-2.0 — SFU showcase. n/a.
- sapientorius/Nebulynk 310 — watch (§4).
- gjovanov/roomler 294 AGPL-3.0 — Janus-based team tool, last push 2026-05-01; below threshold. Reject.
- srtucker22/glipchat 278 (2017), Dirvann/mediasoup-sfu-webrtc-video-rooms 272 — demos. n/a.

**topic:bigbluebutton** (3 repos ≥250★): bigbluebutton 9,270; greenlight 850; bbb-install 663 (install script — note it pulls from foreign repos; see `nimah79/bbb-persian` proxy workaround).

**topic:livekit** (16 repos ≥250★): suitenumerique/meet 2,470 and plugNmeet-server 575 are the only complete meeting apps. The rest are voice-AI agents, SDKs, components (voicemode, QuickVoice, components-js, server-sdk-go, node-sdks, client-sdk-react-native, petal, openspline, Resonate, meetdo, agentring, etc.). n/a.

---

## 7. Recommendation for ADR 012

1. **Keep BigBlueButton 4.0** as primary. Nothing found beats it on classroom completeness + maturity + Persian, and the alternatives share the same mirroring problem.
2. **Add plugNmeet as the documented fallback**: because it exposes `create/join/end/getMeetingInfo/getRecordings` under a BBB-compatible path, our provider-agnostic adapter's BBB implementation can be pointed at it with a config change. Spike: run plugNmeet on an Iranian VPS from mirrored artifacts, point the adapter at `/<apiKey>/bigbluebutton/api`, run a 60-webcam + screen share load test, and capture the network tab for any foreign hosts (excalidraw.com, esm.sh, Google Fonts on `/login.html`).
3. **Ops reuse:** read `alchkalbasi/persian-bbb` (Ansible + Persian defaults); plan Scalelite or **b3scale (multi-tenant)** for the multi-server stage; Greenlight/PILOS optional since both have `fa`.
4. **Do not pursue** OpenTalk, La Suite Meet, Mattermost Calls, Kopano Meet, Agora Flat, nettu-meet, edrys, Pexip, Vidyo.

Open items: plugNmeet BBB-bridge parameter coverage `[unverified]`; plugNmeet Excalidraw font source `[unverified]`; OpenTalk recording format `[unverified]`; registry.heinlein.group reachability from Iran `[unverified]`.

---

## 8. Projects Farjad sent (checked 2026-11-06)

### edrispapi/straming-python: https://github.com/edrispapi/straming-python
| Item | Fact (GitHub REST API and file contents, accessed 2026-11-06) |
| --- | --- |
| Description | «پلتفرم آموزشی آنلاین با قابلیت کلاس زنده و آرشیو ویدئو» |
| Licence | **None** (no LICENSE file; API `license: null`). Legally, all rights reserved, so the code cannot be reused |
| Activity | Created 2025-07-18; all 17 commits by `edrispapi` (Tehran) in about 20 minutes that day; no releases; 0 stars, 0 forks; nothing pushed since 2025-07-18 |
| Size | 4,634 bytes of Python in 16 files, most of them 150–400 bytes; README 4.4 KB |
| What the code is | One-file snippets per technology named in the README: Django REST views, a Course model, a Celery app, a Zarinpal call, Sentry/Prometheus/Elasticsearch/Mongo clients |
| "Live class" | **No video conferencing at all.** There is no WebRTC, SFU, rooms, roles, whiteboard or recording. `livechat/consumers.py` is a Django Channels chat where every user joins one global group `"classroom"`, with no authentication or room isolation. `deploy/nginx.conf` proxies `/live/` over HTTP to `streaming:1935`, which is the RTMP port and would not work as written. `arvan_utils.py` fetches a stream URL from `napi.arvancloud.com/live/{channel_id}/stream` (Arvan Live API). `ffmpeg_ops.py` runs a single `ffmpeg -c:v libx264` transcode |
| Verdict | **Not a candidate.** It is a README-level architecture sketch, not a working platform, and it has no licence. The one idea that matters, Arvan Live as a one-to-many streaming path, is already covered in App. F and §5.5 of the main document |
