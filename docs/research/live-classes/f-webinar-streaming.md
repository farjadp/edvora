# E-033: one-to-many webinars (500+ viewers): streaming servers and players

Access date for all sources: 2026-11-06, unless a publication date is given.
GitHub figures come from the GitHub REST API (`/repos/{owner}/{repo}`, `/releases/latest`, `/contributors`) on 2026-11-06.
`[unverified]` means I could not confirm it from a primary source. **Inference** marks my own reasoning.

## TL;DR

- **Feed out of BBB:** the only maintained bridge is **THM-Health/BBB-Streaming-Server** (LGPL-3.0, v1.1.1, 2025-06-16). v1.1.0 fixed audio for BBB 3.0 with LiveKit. **BBB 4.0 has not been tested** `[unverified]`. Every older add-on (aau-zid, bbb-streaming, bbb-recorder) is abandoned (last pushed 2023–2024) and has no confirmed 3.0/4.0 support.
- **Server:** **MediaMTX** (MIT, one static binary on GitHub Releases, LL-HLS by default, JWT/HTTP auth, read hooks, fMP4 recording) is easiest to run inside Iran. **SRS** (MIT) is the most proven and has HLS per-viewer `on_play`/`on_stop` hooks. **OvenMediaEngine** has the best feature fit: built-in ABR, LL-HLS plus WebRTC, SignedPolicy, AdmissionWebhooks with `closing`. But it is **AGPL-3.0**, ships images on **Docker Hub only**, and its default config points at **Google STUN**.
- **Bandwidth:** 500 × 720p at 2.5 Mbps = 1.25 Gbps, which one 1 Gbps port cannot carry. **500 × 480p at about 1.0 Mbps = 0.5 Gbps** fits with headroom. For 1,000+ viewers, or as a fallback, use **Arvan Live**. Its API has push ingest, time-limited and IP-bound secure links, and archive-to-VOD. RTMP is not named in the spec I could read `[unverified]`.

---

## 1. Getting the BBB room out as a stream

| Project | Licence | Stars | Last release / push | Bus factor | BBB 3.0 / 4.0 | Notes |
|---|---|---|---|---|---|---|
| [THM-Health/BBB-Streaming-Server](https://github.com/THM-Health/BBB-Streaming-Server) | LGPL-3.0 | 11 | v1.1.1, 2025-06-16; pushed 2026-02-02 | Low: small university team (THM, also behind PILOS) | **3.0 yes**: v1.1.0 (2025-05-12) "fixes issues joining audio and BBB 3.0 server with listenOnlyMode=false and/or livekit enabled". **4.0 `[unverified]`** | Controller API plus workers. The worker joins as a bot with Puppeteer and FFmpeg and pushes to RTMP. Per stream it recommends **2 CPU, 2 GB RAM, ≥10 Mbit/s upstream**. `FFMPEG_BITRATE` defaults to 10 Mbps, so lower it. Images on Docker Hub (`pilos/bbb-streaming-server`). Source: README and releases |
| [aau-zid/BigBlueButton-liveStreaming](https://github.com/aau-zid/BigBlueButton-liveStreaming) | GPL-3.0 | 205 | No releases; last push 2024-03-23 | Dead | Issue #169 (2023-05-29) "Anyone get this working with BBB 2.6?". No 3.0 evidence | Does not reconnect if the BBB connection drops (README, via search) |
| [manishkatyan/bbb-streaming](https://github.com/manishkatyan/bbb-streaming) | none | 33 | Last push 2023-08-18 | Dead | none | — |
| [asyncwebio/bigbluebutton-streaming](https://github.com/asyncwebio/bigbluebutton-streaming) | none | 36 | Last push 2024-03-26 | Dead | none | — |
| [jibon57/bbb-recorder](https://github.com/jibon57/bbb-recorder) | MIT | 257 | Last push 2024-03-06 | Dead | none | Puppeteer recorder with RTMP output |
| BBB core | LGPL-3.0 | 9,270 | **v4.0.2, 2026-11-06** | — | — | BBB 4.0 uses LiveKit as the default media stack ([what's new in 4.0](https://bigbluebutton.com/docs/4.0/getting-started/whats-new-in-bigbluebutton-4-0.md)). That page does not mention livestreaming, RTMP or egress. In a Feb-2024 dev-list reply the BBB team said there was no live streaming solution planned for 3.0 ([bigbluebutton-dev](https://groups.google.com/g/bigbluebutton-dev/c/osrlh_tWVrY)) |

**Inference:** BBB 4.0 ships LiveKit, so LiveKit Egress could in principle publish the room. But a LiveKit room-composite layout would not render BBB's whiteboard and slides, which live in BBB's own HTML5 client. A headless browser that joins BBB as a viewer, which is what THM does, is still the practical bridge. Budget about 2 vCPU per live webinar on a separate box. For a presenter who doesn't need BBB, **OBS → RTMP/SRT/WHIP** straight into the server avoids the bot entirely.

## 2. Streaming servers

### 2.1 Summary table

| | SRS | OvenMediaEngine | MediaMTX | Owncast | PeerTube live | Restreamer | nginx-http-flv / nginx-rtmp |
|---|---|---|---|---|---|---|---|
| Repo | [ossrs/srs](https://github.com/ossrs/srs) | [OvenMediaLabs/OvenMediaEngine](https://github.com/OvenMediaLabs/OvenMediaEngine) | [bluenviron/mediamtx](https://github.com/bluenviron/mediamtx) | [owncast/owncast](https://github.com/owncast/owncast) | [Chocobozzz/PeerTube](https://github.com/Chocobozzz/PeerTube) | [datarhei/restreamer](https://github.com/datarhei/restreamer) | [winshining/nginx-http-flv-module](https://github.com/winshining/nginx-http-flv-module) / [arut/nginx-rtmp-module](https://github.com/arut/nginx-rtmp-module) |
| SPDX | MIT | **AGPL-3.0-only**. README: "if you need another license, please feel free to email us" (contact@ovenmedialabs.com); an Enterprise edition exists | MIT | MIT | **AGPL-3.0** | Apache-2.0 | BSD-2-Clause (both) |
| Stars | 29,428 | 3,300 | 20,637 | 11,649 | 15,390 | 5,233 | 2,926 / 14,023 |
| Latest stable | v6.0-r3, 2026-10-31 (v7/v8 pre-releases same week) | v0.21.0, 2026-08-13 (pushed 2026-11-06) | v1.21.3, 2026-10-25 | v0.3.0, 2026-09-03 | v8.3.2, 2026-10-26 | **v2.12.0, 2024-09-13** (last commit 2026-05-22, "Bundle with FFmpeg 8") | v1.2.15, 2026-11-01 / **tag v1.2.2, 2021-05-25**, last commit 2024-12-24 |
| Bus factor (top contributor commits) | Low-ish: winlinvip 8,145 vs next 101 | 3 core devs (getroot 2,027, dimiden 1,526, Keukhan 798) at one company | **1**: aler9 2,654, rest bots | **1**: gabek 3,564, next human 349 | 1 lead (Chocobozzz) plus Framasoft funding | Small (ioppermann 236) | 1 (winshining) / arut inactive |
| Ingest | RTMP, WebRTC/WHIP, SRT, GB28181 | WebRTC, WHIP (simulcast), SRT, RTMP, E-RTMP, MPEG-TS/UDP; pull RTSP/OVT | MoQ, SRT, WebRTC/WHIP, RTSP, RTMP, HLS, MPEG-TS, RTP | RTMP | RTMP / RTMPS (1935/1936) | RTMP/S, SRT, HLS, network or devices | RTMP |
| Egress | RTMP, HTTP-FLV, HLS, DASH, WebRTC/WHEP, SRT | **LL-HLS, WebRTC**, HLS v3, LL-DASH, SRT; push re-stream SRT/RTMP/TS | MoQ, SRT, WebRTC/WHEP, RTSP, RTMP, **LL-HLS** | HLS | HLS (+ P2P over WebRTC) | HLS, RTMP, SRT | RTMP, HTTP-FLV, HLS |
| Latency (vendor claim) | RTMP "about 0.8-3s"; HLS "usually more than 5 seconds … can be over 15" ([low-latency doc](https://ossrs.io/lts/en-us/docs/v6/doc/low-latency)); WebRTC sub-second `[unverified]` | "Sub-Second Latency" over WebRTC; LL-HLS low latency, no number given (README). OvenRtcTester: about 14–24 ms avg video delay with 5–97 clients ([perf tuning](https://ovenmedia.com/docs/ome/performance-tuning)) | Default `hlsVariant: lowLatency`, `hlsSegmentDuration: 1s`, `hlsPartDuration: 200ms` (mediamtx.yml). Glass-to-glass not published `[unverified]` | Opt-in "Lower-latency setting in the player" in v0.3.0. No number in docs ([video docs](https://owncast.online/docs/video/)) | Config has `latency_setting` (small/default/high); "Small latency live streams cannot use P2P" (config/default.yaml) | `[unverified]` | HLS: segment-bound; FLV ~1–3 s `[unverified]` |
| Viewers per server (published) | RTMP: 2,500 clients at 72.9 % CPU on a 3-vCPU VirtualBox VM; "6k clients … 4Gbps for 522kbps" for SRS2 ([performance](https://ossrs.io/lts/en-us/docs/v6/doc/performance)). No HLS or WebRTC numbers | WebRTC: 1,000 players with `StreamWorkerCount=8` described only as "stable"; no hardware given ([perf tuning](https://ovenmedia.com/docs/ome/performance-tuning)) | None published | Docs example: 25 viewers, 5 Mbps in, peak 102 Mbps out | None; "test how many parallel lives" | None | None |
| ABR / transcoding | Via FFmpeg `transcode` directives (external process) | **Built-in transcoder**: H.264, VP8, AV1, H.265 (HW only), Opus/AAC; ABR for LL-HLS and WebRTC | **None** (remux only), so build the ladder at the source | FFmpeg ladder, 5 CPU levels, passthrough | FFmpeg per live, configurable resolutions | FFmpeg, HW accel (VAAPI/CUDA) | Via `exec` FFmpeg |
| Foreign runtime deps | README carries a tracking pixel (`ossrs.net/gif`) on GitHub only; server telemetry `[unverified]`. Self-hosted console and players | **Default `<StunServer>stun.l.google.com:19302`** for public-IP discovery (docs/configuration). Set IceCandidates by hand. OvenPlayer docs suggest the jsDelivr CDN, but it can be self-hosted (npm) | WebRTC ICE servers empty by default (Google STUN only as a comment). hls.js is downloaded at build time and served locally (`hls.min.js`) | Plugin browser and opt-in directory reach the internet `[unverified]` | Default STUN: stunprotocol.org, framasoft.org, freeswitch.org (config). **Disable P2P or self-host STUN** | **Player site loads Google Fonts** (`restreamer-ui/public/_playersite/index.html`) | none |
| Docker Hub reliance / binaries | Docker Hub (`ossrs/srs`) **and** a GitHub release with a source tarball plus CentOS7 zip | **Docker Hub only** (`ovenmedialabs/` and `airensoft/`). No binaries. Build from source on Ubuntu 22.04/24.04/26.04, RHEL 9 and similar | **Static binaries on GitHub Releases** (linux amd64/arm64/armv6/armv7) plus Docker Hub | **Binaries on GitHub Releases** (linux 64/arm64/arm7) | Release tarball (Node.js app plus FFmpeg) | **Docker only** ("as long as Docker is available") | Compile into nginx |
| Signed playback | HTTP hooks (`on_play` can reject) | **SignedPolicy** (HMAC-SHA1 policy and signature in URL query; WebRTC, LL-HLS) | **JWT (JWKS) or HTTP-callback auth**. For HLS/WebRTC the token goes in `Authorization: Bearer` or Basic password, not in the query ([auth docs](https://mediamtx.org/docs/features/authentication)) | None built in (v0.3.0 suggests "Authentication plugins") | Internal, password-protected or private video privacy | "Private content can be shared through a secret link" | `secure_link` (nginx core) in front of HLS |
| Viewer join/leave webhooks | `on_play`/`on_stop`. **HLS sessions tracked with `hls_ctx` (default on)**; timeout 2 × `hls_window`. DASH gets no callbacks (full.conf) | **AdmissionWebhooks** `opening`/`closing`. For LL-HLS a session ends after about 3 s with no connections ([admission webhooks](https://ovenmedia.com/docs/ome/access-control/admission-webhooks)) | `runOnRead`/`runOnUnread` with `MTX_READER_TYPE/ID`, `MTX_QUERY`. Per-HLS-viewer firing **not documented** ([hooks](https://mediamtx.org/docs/features/hooks)) | Webhooks for chat and stream events; per-viewer `[unverified]` | none | Viewer and bandwidth monitoring | `on_play`/`on_done` (RTMP/FLV only) |
| Chat | none | none | none | **Built-in chat** plus moderation | Comments only (no live chat in core) `[unverified]` | none | none |
| Recording | DVR to FLV/MP4 | File recording plus "Dump for VoD" | **fMP4 or MPEG-TS** segments, playback server | Object storage (S3) for HLS distribution | Replay saved as VOD (`allow_replay`) | yes | `record` (FLV) |

### 2.2 Notes per project

- **SRS:** MIT, very active (three release lines published 2026-10-31). Supports HLS session hooks for attendance and auth (`hls_ctx`, `hls_ts_ctx`). Warning in its own config: these make "NGINX edge cache always missed". **Inference:** if you put an nginx cache in front for bandwidth, you lose the per-viewer callbacks. There is also SRS's all-in-one [ossrs/oryx](https://github.com/ossrs/oryx) (MIT, v7.15.26, 2026-09-14) `[not evaluated in depth]`.
- **OvenMediaEngine:** best feature fit (ABR, LL-HLS, WebRTC with TURN-over-TCP, SignedPolicy, webhooks, origin-edge clustering). Repo moved from AirenSoft to **OvenMediaLabs**. **AGPL inference (not legal advice):** running an unmodified OME as a separate service doesn't make Edvora's code AGPL. If we patch OME and expose it over the network, we must publish the patches. A commercial licence is available on request (price not published `[unverified]`). OvenPlayer is MIT (v0.10.55, 2026-11-03).
- **MediaMTX:** easiest to operate (single binary, no interpreter, hot reload, Prometheus metrics). No transcoding, so ABR needs FFmpeg upstream. **Inference:** native iOS Safari HLS cannot add an `Authorization` header, so token-gating iPhone viewers needs an nginx `secure_link` or cookie layer in front, or MediaMTX HTTP auth keyed on a session cookie `[unverified]`.
- **Owncast:** a complete product (player plus chat), but **single-user, single-stream** by design ("single user live video streaming and chat server"). There is no paid or authenticated viewing out of the box, so it doesn't fit multi-tenant paid webinars.
- **PeerTube live:** AGPL-3.0, heavy (Node, Postgres, Redis, FFmpeg). Default limits are `max_instance_lives: 20` and `max_user_lives: 3`. P2P could cut bandwidth, but it needs STUN (default servers are abroad) and is off for small-latency mode. This is a video platform, not a webinar component.
- **Restreamer:** Docker-only, last release 2024-09. Its player page pulls Google Fonts, which breaks our no-foreign-runtime rule. Rejected.
- **nginx-rtmp / nginx-http-flv:** nginx-rtmp has had no tag since 2021. nginx-http-flv is maintained by one person. Fine as a dumb HLS fan-out tier, with no ABR, auth or webhooks of its own beyond nginx `secure_link`.
- **LiveKit Egress → HLS:** [livekit/egress](https://github.com/livekit/egress) is Apache-2.0, v1.15.0 (2026-10-06). Room composite gives MP4/HLS (TS or fMP4)/RTMP/SRT. Its default `room_composite_cpu_cost: 3.0` means about 3 CPUs per composite (README). Because BBB 4.0 uses LiveKit, this is technically reachable, but see the layout caveat in §1.
- **Something else credible: LiveKit SFU itself for viewers.** LiveKit's benchmark shows **1 publisher → 3,000 subscribers at 720p on a 16-core c2-standard-16, 92 % CPU, 531 MBps out** ([benchmark](https://docs.livekit.io/home/self-hosting/benchmark/)). It has token auth built in and webhooks `participant_joined` / `participant_left` / `participant_connection_aborted` ([webhooks](https://docs.livekit.io/home/server/webhooks/)). **Inference:** that's attendance and paid-access control for free, at sub-second latency. The cost is WebRTC, which needs UDP and TURN for Iranian mobile networks, and bitrate per viewer is higher than HLS. 531 MBps is about 4.2 Gbps, or about 1.4 Mbps per viewer.
- **Ant Media Server Community** (licence NOASSERTION on GitHub; ams-v3.1.0, 2026-08-31): Community HLS latency is 8–12 s; WebRTC playback is Enterprise-only ([editions](https://antmedia.io/docs/get-started/enterprise-and-community-edition)). Not recommended.

## 3. Players and mobile playback

- **hls.js** ([video-dev/hls.js](https://github.com/video-dev/hls.js)): Apache-2.0 (LICENSE file; the API reports NOASSERTION), 17,035 stars, v1.7.4 (2026-10-28). Self-host it from npm.
- **Video.js** v10.3.0 (2026-11-04). **OvenPlayer** MIT v0.10.55 (LL-HLS, WebRTC, LL-DASH, automatic fallback).
- **iOS Safari:** plays HLS natively (no MSE needed). LL-HLS support on current iOS is expected `[unverified: not checked against Apple docs today]`. HTTP-FLV (flv.js, last release 2021-09-13) needs MSE, so **avoid FLV for iPhone viewers** (inference).
- **Android Chrome:** use hls.js (MSE) or WebRTC. Both work in the browser with no app install (inference from standard browser support).
- **Recommendation (inference):** HLS/LL-HLS as the default path for every device, plus optional WebRTC for "interactive" viewers.

## 4. Arvan Video Platform: live

- `docs.arvancloud.ir` returned **HTTP 307 redirect loops / a "transferring to site" interstitial** to my fetcher. I did not try to get past it, so **nothing here comes from docs.arvancloud.ir**.
- Source used: the Arvan **Live 2.0 OpenAPI spec** (`servers: https://napi.arvancloud.ir/live/2.0`), mirrored in [hamidfzm/arvancloud-go `live/api/openapi.yaml`](https://github.com/hamidfzm/arvancloud-go/blob/main/live/api/openapi.yaml). It is an unofficial MIT client last pushed 2023-08-27, so **the spec may be stale**. Cross-checked with [erfnzdeh/arvancloud-agent-skill products.md](https://github.com/erfnzdeh/arvancloud-agent-skill) (pushed 2026-09-28; its author made read-only calls on 2026-09-13).
  - **Ingest:** `mode: pull | push` ("Way to receive input stream"); `input_url` for pull. **The push protocol (RTMP) is not named in the spec, so RTMP ingest is `[unverified]`.** **Inference:** push to a live CDN almost always means RTMP, but confirm in the Arvan panel.
  - **Latency:** `type: normal | low_latency`.
  - **Signed playback: yes.** Stream fields `secure_link_enabled`, `secure_link_key`, `secure_link_with_ip`. Listing streams takes `secure_ip` and `secure_expire_time` ("If stream is secure default is 24 hours later from now"). So: expiring links, optionally IP-bound.
  - **Recording:** `archive_enabled` ("archive the stream as a VoD"), `archive_mode: auto|manual`, `channel_id`, `/streams/{id}/start-record`, `/stop-record`. DVR via `timeshift`, catch-up via `catchup_enabled`.
  - **ABR:** `convert_info[]` (array of renditions).
  - **Attendance:** **no viewer webhooks in the spec.** Only metrics: `concurrent-viewers`, `watch-time`, `ttff`, `rebuffer-ratio`, plus reports on geo, user-agent and visitors. **Inference:** per-student attendance has to come from Edvora (player heartbeat), not Arvan.
  - Prerequisite: "Nothing works until the Live product domain exists" (agent-skill notes).
- **Price:** "۱۰۸٬۰۰۰ تومان per stream-hour" comes from the earlier pass. **Not re-verified here `[unverified]`.** Egress traffic billing `[unverified]`.

## 5. Bandwidth math (1 Gbps Iranian port)

| Rendition (H.264 + AAC) | Per viewer | 500 viewers | 1,000 viewers | Fits 1 Gbps (keep ~20 % headroom, so ≤ 800 Mbps)? |
|---|---|---|---|---|
| 720p30 | 2.5 Mbps | **1.25 Gbps** | 2.5 Gbps | No |
| 720p30, tuned for slides (inference) | 1.5 Mbps | 750 Mbps | 1.5 Gbps | Barely at 500; no at 1,000 |
| **480p30** | **1.0 Mbps** | **500 Mbps** | 1.0 Gbps | **Yes at 500**; no at 1,000 |
| 360p | 0.6 Mbps | 300 Mbps | 600 Mbps | Yes |
| Audio-only fallback | 0.064 Mbps | 32 Mbps | 64 Mbps | Yes |

- Add about 5–10 % HLS/HTTP overhead (inference).
- Ingest is small: one 720p feed of about 2.5–3 Mbps. THM's 10 Mbit/s recommendation is for its default 10 Mbps bitrate; set `FFMPEG_BITRATE` to about 3.
- ABR ladder 720p + 480p + 360p: viewers on 4G will mostly settle on 480p/360p, so the **real average is probably 0.8–1.2 Mbps** (inference, not measured).
- **Rule (inference):** one origin on 1 Gbps handles about 500–700 viewers with 480p as the top rendition. Past that, add an nginx HLS cache edge per 1 Gbps (cheap; loses SRS per-viewer hooks) or **push the same feed to Arvan Live** and hand those viewers the Arvan secure link.

## 6. Recommendation

1. **Pipeline:** BBB 4.0 room (≤200 interactive) → **THM BBB-Streaming-Server** worker (2 vCPU, separate VM; **test on 4.0 first**) → RTMP → **MediaMTX** (MIT, single binary from GitHub Releases, no Docker Hub needed) → LL-HLS → self-hosted **hls.js** in Edvora's webinar page. OBS presenters push RTMP/SRT/WHIP straight to MediaMTX.
2. **ABR:** have the worker's FFmpeg (or a sidecar FFmpeg) publish **480p (1.0 Mbps) as top** plus 360p and audio-only. Keep 720p only if the port is ≤50 % used.
3. **Paid access:** Edvora issues short-lived signed URLs. Enforce them with **MediaMTX HTTP auth** (callback into Edvora) or nginx `secure_link` in front, because iOS native HLS can't send Bearer headers. **Attendance:** a player heartbeat to Edvora every 30 s, which is server-agnostic and works with any CDN, plus `runOnRead`/`runOnUnread` where it fires.
4. **Chat / Q&A:** none of the servers have it, except Owncast, which doesn't fit. Build a small Edvora Q&A panel (Payload collection plus SSE). The presenter reads it in a second tab (inference).
5. **Scale or failover past ~700 viewers:** push a second RTMP output to **Arvan Live** (secure links with expiry and IP binding, archive to VOD) once RTMP ingest and the price are confirmed in the Arvan panel. Keep it behind a provider-agnostic `StreamingProvider` adapter (`packages/integrations/streaming/`, with a mock).
6. **Alternatives:** if we need sub-second or WebRTC, use **OvenMediaEngine**. Build it from source, set `IceCandidate` by hand, remove Google STUN, and accept AGPL for an unmodified binary. Or skip HLS and let viewers subscribe to **LiveKit** directly: 3,000 subscribers on 16 cores, with native join/leave webhooks, at the cost of UDP/TURN on Iranian mobile networks. **SRS** is the conservative MIT fallback if MediaMTX's one-maintainer bus factor worries us.

## Open questions

- Does THM BBB-Streaming-Server work on BBB 4.0.x? Needs a test on staging.
- Arvan Live: is push ingest RTMP or SRT? Current price per stream-hour and per GB? Is there a viewer webhook? Confirm in the panel, since the docs could not be reached.
- Does MediaMTX fire `runOnRead`/`runOnUnread` per HLS viewer, or once per HLS muxer? Test it.
- LL-HLS behaviour on iOS Safari and Android Chrome over Iranian 4G (MCI/Irancell). Do a field test.
