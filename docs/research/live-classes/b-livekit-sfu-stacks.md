# E-033 research: LiveKit and other self-hosted SFU stacks for Edvora live classes

Researcher: AI agent · Access date for every source: **2026-11-06** unless a publication date is given.
GitHub figures come from the GitHub REST API (`api.github.com/repos/<owner>/<repo>`, `/releases/latest`, `/tags`, `/contributors`), fetched 2026-11-06.
Labels: **[unverified]** means not confirmed from a primary source. **[derived]** means our own arithmetic on official numbers, not a vendor claim.

Context: Iran Brand Academy (tenant #1). Typical class 20–60, peak 200, open webinar up to 500. Must run inside Iran with no foreign runtime dependencies. Next.js + Payload + Postgres.

---

## 0. Executive summary

| | LiveKit OSS (+ Egress) | OpenVidu 3 CE | Galène | edumeet | MiroTalk SFU | Janus | Element Call |
|---|---|---|---|---|---|---|---|
| What it is | SFU infra + SDKs; you build the UI | LiveKit fork + ready app (OpenVidu Meet) | Complete small conferencing server (Go) | Complete conferencing app (mediasoup) | Complete conferencing app (mediasoup) | Generic WebRTC gateway (C) | Matrix calling app on LiveKit |
| Licence | Apache-2.0 | Apache-2.0 (CE); PRO proprietary | MIT | MIT | AGPL-3.0 (or $99/$499 commercial) | GPL-3.0 (commercial from Meetecho) | AGPL-3.0 (+ commercial file) |
| Classroom UI out of the box | Almost none (prefab conference, chat) | Good (recording, chat, raise hand, moderation, lobby) | Basic (chat, raise hand, ops) | Good (lobby, breakout, drawing, raise hand) | Very broad | None | Basic call UI |
| Server recording | Yes, Egress: MP4/OGG/HLS, composite or per-track, S3 custom endpoint | Yes (bundled Egress) | Per-stream to disk | Via external "bot provider" / headless page | Yes, server side, S3 option | Per-stream `.mjr` + post-processing | No (not a feature found) |
| Persian / RTL | Ours to build | No Persian locale (10 languages) | [unverified] | No Persian locale | Claims 133 languages | n/a | [unverified] |
| Foreign runtime deps by default | Google + Twilio STUN unless configured; nothing else in server | Google Fonts in Meet UI | None found | [unverified] | **Many CDN scripts + Umami analytics on by default** | n/a | Needs Matrix homeserver |
| Fit for Edvora | **Best infrastructure base**; most UI work | Fastest to a working room, but Angular UI, no RTL, PRO paid for multi-node | Small, robust, single maintainer | Feature-rich, tiny team | Feature-rich, licence and CDN problems | Too low-level | Wrong product shape |

---

## 1. LiveKit (server, Egress, components, SDKs)

### 1.1 Licence, activity, ownership

| Item | Value | Source |
|---|---|---|
| Server licence | Apache-2.0 | https://api.github.com/repos/livekit/livekit |
| Stars | 22,070 | same |
| Latest release | v1.13.11, 2026-10-25 | https://api.github.com/repos/livekit/livekit/releases/latest |
| Release assets | Single binary tarballs for linux amd64/arm64/armv7 and Windows (no Docker needed for the server) | same |
| Top contributors (commits) | boks1971 1820, davidzhao 774, cnderrauber 392, paulwe 219, frostbyte73 178 | https://api.github.com/repos/livekit/livekit/contributors |
| Owner | GitHub org `livekit` (LiveKit, the company behind LiveKit Cloud). Legal entity details [unverified] | https://github.com/livekit |
| Bus factor | Company-backed; one engineer (boks1971) holds ~50% of top-6 commits. Moderate concentration, mitigated by company | derived from contributors list |
| Egress licence / stars / release | Apache-2.0 · 372 · v1.15.0, 2026-10-06 | https://api.github.com/repos/livekit/egress |
| Egress contributors | frostbyte73 685, milos-lk 211, biglittlebigben 156 | https://api.github.com/repos/livekit/egress/contributors |
| components-js (React) | Apache-2.0 · 473 stars · active (release 2026-11-05) · lukasIO 510, ocupe 273 | https://api.github.com/repos/livekit/components-js |
| Node server SDK | `livekit-server-sdk@2.19.2`, 2026-10-22 (repo node-sdks, Apache-2.0) | https://api.github.com/repos/livekit/node-sdks/releases/latest |
| JS client SDK | `livekit-client` v2.23.0, 2026-10-16 | https://api.github.com/repos/livekit/client-sdk-js/releases/latest |
| LiveKit Meet (sample Next.js app) | Apache-2.0 · 985 stars · last commit 2026-10-19 · uses Next 15.5, components-react 2.9.24 | https://github.com/livekit/meet (package.json) |
| Helm chart | livekit/livekit-helm, 129 stars, pushed 2026-11-04 | https://api.github.com/repos/livekit/livekit-helm |

### 1.2 Features vs our class stories

LiveKit is infrastructure. The server gives rooms, tracks, permissions, data messages, RPC and webhooks; the classroom is ours to build.

| Story | Out of the box | Notes / how we would build it |
|---|---|---|
| Camera / mic | Yes (SDK) | |
| Screen share | Yes (SDK, `screen_share`, `screen_share_audio` sources) | Token can restrict who may screen share via `canPublishSources` (https://docs.livekit.io/frontends/reference/tokens-grants.md) |
| Chat | Yes, prefab `Chat` component in components-react | https://github.com/livekit/components-js/tree/main/packages/react/src/prefabs (`Chat.tsx`). Not persisted by the SFU; we persist via our backend. |
| Prefab conference UI | `VideoConference`, `AudioConference`, `ControlBar`, `PreJoin`, `MediaDeviceMenu` | same prefabs folder |
| Whiteboard | **Build it yourself** | Data channel / text streams to sync an open-source whiteboard (e.g. Excalidraw/tldraw), or screen-share a whiteboard |
| Slides / PDF | **Build it yourself** | Screen share, or synced PDF viewer over data messages |
| Polls / quizzes | **Build it yourself** | Data messages + our Payload LMS quiz model |
| Hand raise | **Build it yourself** | Participant attributes/metadata (`canUpdateOwnMetadata`) + UI |
| Moderator controls | API exists: `removeParticipant`, `mutePublishedTrack`, `updateParticipant` (change permissions), `updateSubscriptions`, `sendData` | https://github.com/livekit/node-sdks/blob/main/packages/livekit-server-sdk/src/RoomServiceClient.ts. UI is ours. |
| Breakout rooms | Primitives exist: `moveParticipant` and `forwardParticipant` (require `roomAdmin` + `destinationRoom`); implemented in OSS server (`pkg/service/roomservice.go`) | same file; https://github.com/livekit/livekit/blob/master/pkg/service/roomservice.go. Orchestration and UI are ours. |
| Waiting room / lobby | **Build it yourself** | Issue a token with `canSubscribe:false, canPublish:false` (or `hidden`) and upgrade with `updateParticipant`, or gate before issuing a token in Next.js |
| Cloud recording | Yes, Egress service (separate deploy) | §1.6 |
| Recording formats | Room Composite / Web / Track Composite: MP4, OGG, HLS (TS or fMP4 segments), RTMP(S), SRT, JPEG thumbnails. Track egress: MP4, OGG, WebM, WebSocket | https://github.com/livekit/egress/blob/main/README.md ("Supported Output") |
| Composite vs per-track | Both: Room Composite (Chrome renders a layout), Web (any URL), Track Composite (one audio + one video, no Chrome layout), Track (raw, no transcoding) | same |
| Attendance | Webhooks: `room_started`, `room_finished`, `participant_joined`, `participant_left`, `participant_connection_aborted`, `track_published`, `track_unpublished`, `egress_started`, `egress_updated`, `egress_ended`, `ingress_started`, `ingress_ended` | https://docs.livekit.io/intro/basics/rooms-participants-tracks/webhooks-events.md |
| Attendance caveat | "Delivery isn't guaranteed"; retried several times; ordered | same. Reconcile with `listParticipants` polling and `room_finished`. |

### 1.3 Scale

| Item | Value | Source |
|---|---|---|
| Official benchmark hardware | Google Cloud `c2-standard-16`, 16 vCPU | https://docs.livekit.io/home/self-hosting/benchmark/ |
| Audio-only | 10 pubs / 3,000 subs · out 23 MBps · CPU 80% | same |
| Large meeting (video 720p) | 150 pubs / 150 subs · in 50 MBps / out 93 MBps · CPU 85% | same |
| Livestream (video 720p) | 1 pub / 3,000 subs · out 531 MBps · CPU 92% | same |
| Room-to-node rule | "Each room must fit within a single node"; multi-node scales across rooms | same |
| Self-host max per room | "Up to about 3,000" users per room (Cloud: no limit) | https://docs.livekit.io/transport/self-hosting.md |
| Node track limit default | "defaults to 400 tracks in & out per CPU, up to 8000" | https://github.com/livekit/livekit/blob/master/config-sample.yaml |
| Multi-node | Set `redis.address`: "LiveKit will automatically operate in a fully distributed fashion" | config-sample.yaml |
| Simulcast | "enabled by default in all LiveKit SDKs" | https://docs.livekit.io/transport/media/advanced.md |
| SVC | VP9 and AV1 with SVC; auto `L3T3_KEY`. Dynacast pauses unused layers (whole stream only for SVC) | same |

Sizing for Edvora **[derived]** from the benchmark above (720p single layer ≈ 531 MBps / 3,000 = ~177 kB/s ≈ 1.4 Mbps per subscribed video track):

| Scenario | Shape | Est. server egress | Est. CPU | Suggested node |
|---|---|---|---|---|
| Class 50 | teacher cam + screen + ≤6 student cams; each student receives 2–6 videos (simulcast lowers small tiles) | ~50 × 3–6 Mbps ≈ 150–300 Mbps | small fraction of a 16 vCPU node | 4–8 vCPU, 1 Gbps port |
| Class 200 | teacher cam + screen, few speaker cams | ~200 × 3–4 Mbps ≈ 600–800 Mbps | well under the 150×150 benchmark (fewer publishers) | 8–16 vCPU, ≥1 Gbps (bandwidth is the bottleneck, not CPU) |
| Webinar 500 | 1–2 publishers, students view-only | ~500 × 1.4–3 Mbps ≈ 0.7–1.5 Gbps | ~1/6 of the 1×3,000 benchmark | 8–16 vCPU, 2 Gbps or multi-NIC; consider HLS via Egress for passive viewers |

Bandwidth per Iranian DC port and cost is the real constraint; confirm with the network research (research-iran-network.md).

### 1.4 Running in Iran

| Question | Finding | Source |
|---|---|---|
| Server-side STUN for public-IP discovery | With `rtc.use_external_ip: true` the server queries `stun_servers`; **if empty it uses `DefaultStunServers` = `global.stun.twilio.com:3478`, `stun.l.google.com:19302`, `stun1.l.google.com:19302`** | https://github.com/livekit/mediatransportutil/blob/master/pkg/rtcconfig/config.go and `pkg/rtcconfig/ip.go` (`determineIP`) |
| Fix | Set `rtc.node_ip: <public IP>` and `use_external_ip: false`, or set `rtc.stun_servers` to our own STUN | config-sample.yaml (`node_ip`, `stun_servers`) |
| STUN pushed to browsers | `iceServersForParticipant`: if embedded TURN UDP is enabled it counts as STUN; else if `rtc.stun_servers` is set those are sent; **otherwise clients get the Twilio/Google defaults**. Sample config: "by default LiveKit clients use Google's public STUN servers" | https://github.com/livekit/livekit/blob/master/pkg/service/roommanager.go (lines ~1062–1157) |
| Embedded TURN | `turn.enabled`, `domain`, `tls_port` ("if not using a load balancer, this must be set to 443"), `udp_port` (3478, "recommended to 443 if not running HTTP3/QUIC"), `external_tls` for L4 LB | config-sample.yaml |
| TURN/TLS URL sent to clients | `turns:<domain>:443?transport=tcp` (port 443 hard-coded in the URL) | roommanager.go |
| Ports | 443 (HTTPS + TURN/TLS), 80 (cert issuance), 7881/TCP (ICE-TCP), 3478/UDP (TURN/UDP), 50000–60000/UDP | https://docs.livekit.io/transport/self-hosting/vm.md |
| TLS certs | Generator uses Caddy with Let's Encrypt or ZeroSSL; server must be internet reachable. Whether ACME works from Iranian DCs: [unverified]. Can supply own certs instead | same |
| Server telemetry | OSS analytics service is a stub (`NullAnalyticService`, `analyticsKey: ""`); no telemetry key in config-sample.yaml | https://github.com/livekit/livekit/blob/master/pkg/telemetry/analyticsservice.go |
| Client SDK cloud logic | Region/cloud logic only activates for hostnames ending `.livekit.cloud` / `.livekit.run` | https://github.com/livekit/client-sdk-js/blob/main/src/room/utils.ts (`isCloud`) |
| LiveKit Meet sample deps | Optional Datadog browser logs (`NEXT_PUBLIC_DATADOG_CLIENT_TOKEN`), Krisp filter for Cloud only. No Google Fonts in layout | https://github.com/livekit/meet/blob/main/.env.example, `app/layout.tsx`, `package.json` |
| Docker Hub | Images `livekit/livekit-server` (8.5M pulls), `livekit/egress` (2.5M pulls), `livekit/generate`. Docker Hub blocks sanctioned regions incl. Iran (secondary sources) | https://hub.docker.com/v2/repositories/livekit/livekit-server/ ; https://huecker.io/en/reasons.html ; https://ahmadallish.substack.com/p/using-docker-registry-from-iran-65e1a4efffcc |
| Workaround | Server: GitHub release binary (no Docker). Egress: no binary release assets, Docker only; mirror image into our own registry, or build from source (build fetches Chrome at build time, `build/chrome/scripts/driver.sh`). Iranian mirrors (e.g. ArvanCloud): [unverified] | https://api.github.com/repos/livekit/egress/releases/latest |
| Mobile browsers | Official table: Chrome and Firefox on Android, Safari on iOS. iOS Safari needs a user gesture for audio: `Room.startAudio()` | https://github.com/livekit/client-sdk-js/blob/main/README.md ("Browser Support"); https://docs.livekit.io/reference/client-sdk-js/ |

### 1.5 Integration with Next.js

| Item | Finding | Source |
|---|---|---|
| Token minting | `livekit-server-sdk` `AccessToken(apiKey, secret, {identity})`, `addGrant(VideoGrant)`, `toJwt()` | https://docs.livekit.io/frontends/reference/tokens-grants.md |
| Grants | `roomCreate, roomList, roomJoin, roomAdmin, roomRecord, ingressAdmin, room, canPublish, canPublishData, canPublishSources, canSubscribe, canUpdateOwnMetadata, hidden, kind, destinationRoom` | same |
| Teacher vs student | Teacher: `roomAdmin`, `canPublish`, `roomRecord`. Student: `canPublish` with `canPublishSources:["microphone"]` or false until promoted; `canSubscribe:true`. Server can change permissions live with `updateParticipant` | same + RoomServiceClient.ts |
| Token TTL | "default to 6 hours in most server SDKs" | same |
| Identity data | `metadata` and `attributes` (key/value) in token; usable for name/phone watermark and role | same |
| Webhook verification | `Authorization` header is a signed JWT containing sha256 of the body; Node `new WebhookReceiver(key, secret).receive(rawBody, authHeader)`; needs the **raw body**; content-type `application/webhook+json` | https://docs.livekit.io/intro/basics/rooms-participants-tracks/webhooks-events.md |
| Next.js note | Route handler must read `await req.text()` (raw) before verifying. Tenant must be resolved from room name/metadata, not Host header (webhook comes from LiveKit, not the user) | our inference |
| Embedding | React components (`@livekit/components-react`) inside our app, no iframe needed. The meet sample shows `app/api/connection-details/route.ts` token route and `app/api/record/*` | https://github.com/livekit/meet |
| RTL / Persian | Ours. `components-styles` SCSS uses physical properties (`margin-left` found in `prefabs/chat.scss`, `controls/_button.scss`), so prefab CSS is not RTL-safe; plan to style with Tailwind logical utilities or our own components on top of hooks | https://github.com/livekit/components-js (code search) |
| Theming | CSS variables / own components; hooks-only approach avoids prefab CSS | [unverified] specific variable list |
| AGENTS.md fit | Client components import only `livekit-client` and components-react, not `@edvora/core` root; integration lives in `packages/integrations/live/` with a mock | repo rules |

### 1.6 Ops

| Item | Finding | Source |
|---|---|---|
| Install | `docker run --rm -it -v$PWD:/output livekit/generate` → `livekit.yaml`, `caddy.yaml`, `docker-compose.yaml`, `redis.conf`, init script; systemd `livekit-docker` | https://docs.livekit.io/transport/self-hosting/vm.md |
| Kubernetes | Helm chart `livekit/livekit-helm` | https://github.com/livekit/livekit-helm |
| Upgrades | Single Go binary / image; replace and restart (rooms on a node drop on restart unless drained) [unverified exact drain procedure] | |
| Metrics | `prometheus.port: 6789` → `:6789/metrics`. Egress: `prometheus_port` | config-sample.yaml; egress README |
| Egress needs | "at least 4 CPUs and 4 GB of memory" per instance; RoomComposite "anywhere between 2-6 CPUs"; Track egress very light ("hundreds" per instance); Helm section: "Each instance can record one room at a time" | https://docs.livekit.io/home/self-hosting/egress/ |
| Egress CPU cost defaults (code) | room composite 4, audio room composite 1, web 4, participant 2, track composite 1, track 0.5 | https://github.com/livekit/egress/blob/main/pkg/config/service.go |
| Egress Chrome | Room composite and web egress run headless Chrome, sandbox off by default (`enable_chrome_sandbox`) | egress self-hosting doc |
| Egress Redis | Required, same Redis as the server | same |
| S3 custom endpoint | `storage.s3.endpoint` "(optional) custom endpoint", plus `region`, `bucket`, keys, `proxy_config`; proto `S3Upload` has `force_path_style` | egress README; https://github.com/livekit/protocol/blob/main/protobufs/livekit_egress.proto |
| ArvanCloud Object Storage | Should work as S3-compatible with `endpoint` + `force_path_style` — **[unverified] by test** | |
| Session limits | `session_limits.file_output_max_duration` etc. | egress README |
| Sizing [derived] | 1 composite recording ≈ 1 egress instance of 4 vCPU / 4 GB. Concurrent recorded classes = number of egress instances. Track egress (raw per-track) is far cheaper but needs post-processing for a watchable file | |

### 1.7 Security

| Item | Finding | Source |
|---|---|---|
| E2EE | Supported self-hosted ("Fully supported"); shared-key provider or custom per-participant key provider; covers media and data channels; "LiveKit does not (and cannot) store or transport encryption keys for you" | https://docs.livekit.io/transport/encryption.md; self-hosting table |
| E2EE + Egress | No official statement found. Server-side Egress cannot decrypt E2EE media without the key, so **assume server recording does not work in E2EE rooms** [unverified; inferred]. LiveKit security overview says the server decrypts media for opt-in processing such as recording | https://livekit.com/security/overview |
| Transport | DTLS-SRTP always (WebRTC); signalling over TLS | standard WebRTC |
| Watermark (live) | Our UI overlays student name/phone (CSS layer over video). Deterrent only; screen capture still possible | our design |
| Watermark (recording) | Room Composite uses a web template; custom templates via `template_base` / custom base URL, so we can render an overlay (academy logo, date) into the MP4 | egress README (`template_base`, `custom_base_url`) |
| Per-viewer watermark in recordings | Not possible with one composite file; would need per-viewer HLS overlay at playback (player-side) | our inference |
| Token revocation | Self-hosted: "Access token revocation: Not available" (Cloud only) → keep TTL short, kick with `removeParticipant` | https://docs.livekit.io/transport/self-hosting.md |

### 1.8 Cost and OSS vs Cloud gating

LiveKit Cloud is not an option (sanctions). Self-hosted vs Cloud (https://docs.livekit.io/transport/self-hosting.md):

| Feature | Self-hosted | Cloud only |
|---|---|---|
| Realtime media, Egress, Ingress, SIP, E2EE, webhooks | Fully supported | |
| Architecture | Single-home SFU, one server per room, ~3,000 users/room | Global mesh, no limit |
| Analytics / dashboard | Custom or external | Cloud dashboard, Analytics API |
| Access token revocation | Not available | Included |
| Noise cancellation | Client-side WebRTC; ai-coustics with own licence | Krisp / ai-coustics enhanced |
| Managed agents, Agent Builder, Inference | Not available (Agents framework itself is OSS) | Included |

None of the Cloud-only items blocks a classroom. Software cost is zero; cost is servers, bandwidth, and engineering time for the UI.

---

## 2. OpenVidu 3

| Item | Value | Source |
|---|---|---|
| What | "Self-hosted real-time video and audio stack, built on top of LiveKit and mediasoup"; "API-compatible with LiveKit: any LiveKit client/server SDK works unchanged"; two products: OpenVidu Meet (ready app) and OpenVidu Platform | https://github.com/OpenVidu/openvidu/blob/master/README.md |
| Licence | Repo Apache-2.0; COMMUNITY "completely open-source and free"; PRO "proprietary and with a simple pay-per-use pricing model" | https://openvidu.io/pricing/ |
| Stars / release | openvidu 2,143 · v3.9.0, 2026-09-29; openvidu-meet 15 stars, Apache-2.0, v3.9.0 2026-09-29 | GitHub API |
| Contributors | pabloFuente 2937, CSantosM 923, cruizba 817 | GitHub API |
| Owner | "2026 © OpenVidu"; legal entity [unverified]. EU-funded project CPP2021-008720 | openvidu.io footer; README |
| Bus factor | ~3 core developers | derived |
| PRO-only | Multi-node (Elastic, HA), mediasoup engine ("~2x more efficient than Pion"), detailed dashboards, Grafana | https://openvidu.io/openvidu-vs-livekit/ ; https://openvidu.io/pricing/ |
| PRO price | $0.0006 per core per minute (= $0.036/core-hour [derived]); billed while cluster runs; 15-day trial; Stripe monthly | https://openvidu.io/pricing/ |
| PRO phone-home | PRO clusters "will automatically report their usage"; need outbound 443 to `accounts.openvidu.io` → **PRO unusable in Iran** (sanctions + phone-home + Stripe) | same |
| CE single node | Bundles LiveKit + Egress + Ingress + MinIO S3 + basic dashboard; Pion engine | openvidu-vs-livekit page |
| OpenVidu Meet features (features page) | Recording, screen share, chat (persisted, reactions, private), E2EE, live captions, raise hand, reactions, locked rooms (moderator approval), file sharing; page also lists whiteboard, shared notes, breakout rooms | https://openvidu.io/latest/meet/ |
| Conflict | Release notes list breakout rooms only as future direction (3.4.0) and do not mention whiteboard → **whiteboard/breakout shipped: [unverified]**. Lobby code exists (`meeting-lobby` components) | https://openvidu.io/latest/meet/releases/ ; https://github.com/OpenVidu/openvidu-meet |
| Meet 3.9.0 | Meetings REST API, moderator mute, multiple webhook endpoints, participant join/leave webhooks, per-room participant/duration limits, auto-recording | releases page |
| Embedding | `<iframe>` or web component, REST API + webhooks | README |
| Languages | 10 locales: cn, de, en, es, fr, hi, it, ja, nl, pt. **No Persian, no RTL** | https://github.com/OpenVidu/openvidu-meet (lang/*.json) |
| Foreign runtime deps | Meet `index.html` and web component load **Google Fonts** (Roboto, Material Icons, Material Symbols) from fonts.googleapis.com | `meet-ce/frontend/src/index.html`, `meet-ce/frontend/webcomponent/src/main.wc.ts` |
| UI stack | Angular (openvidu-components-angular) — different from our React/Next | repo tree |
| Docker | Images on Docker Hub (`openvidu/*`) → same mirroring problem | README badges |

Verdict: CE is LiveKit with batteries; useful as a reference deployment (Egress + MinIO wiring). Meet would need fonts self-hosted, a Persian locale and RTL work in Angular — we would be forking an Angular app.

---

## 3. Galène

| Item | Value | Source |
|---|---|---|
| Licence | MIT | https://api.github.com/repos/jech/galene |
| Stars / release | 1,434 · Galene 1.2.1, 8 Sep 2026 (tags only, no GitHub releases) | GitHub API; https://github.com/jech/galene/blob/master/CHANGES |
| Contributors | jech 1479, takdj 42, MisterDA 21 | GitHub API |
| Owner / bus factor | Juliusz Chroboczek (jech), individual; **bus factor 1** | derived |
| Scale claims | "For a typical lecture (100 students), Galene needs roughly 1/4 of a CPU core"; ~20 participants per core for meetings | https://galene.org/ |
| Deployments | Université de Paris, Sorbonne Université (lectures, seminars) | same |
| Features | Built-in TURN, simulcast, SVC (VP8/VP9), screen + window share, chat (history not saved to disk), raise hand (user status), permissions `op`/`present`/`message`/`observe`, auto-subgroups (usable as breakout-like rooms), tokens/invites, LDAP/OAuth2 via crypto tokens | galene.org; https://github.com/jech/galene/blob/master/galene.md |
| Recording | Server "recording to disk" per stream (diskwriter); "Only Opus can be recorded to disk" for audio; no composite | galene.md |
| Missing | Whiteboard, polls, composite recording, webhooks [unverified for webhooks] | |
| Foreign deps | None found; single Go binary built with `CGO_ENABLED=0 go build` | README |
| Integration | Crypto tokens (JWT) from our backend; admin API via `galenectl` | galene.md |

---

## 4. mediasoup and mediasoup-based apps

### 4.1 mediasoup (library)

| Item | Value | Source |
|---|---|---|
| Licence | ISC | https://api.github.com/repos/versatica/mediasoup |
| Stars / release | 7,415 · Node 3.32.2 (2026-11-04), Rust 0.33.2 (2026-11-04) | GitHub API releases |
| Contributors | ibc 3338, jmillan 639, nazar-pc 273 | GitHub API |
| Nature | SFU library for Node/Rust; no signalling, rooms, recording, TURN or UI. Everything is build-it-yourself, more than LiveKit | https://mediasoup.org |

### 4.2 edumeet

| Item | Value | Source |
|---|---|---|
| Licence | MIT (edumeet, edumeet-client 0.2.0, room-server 1.3.0, media-node 1.0.1 package.json) | GitHub |
| Stars | edumeet 1,350; edumeet-client 18; room-server 12; media-node 9 | GitHub API |
| Latest tagged release | 4.0.0, 2024-03-14; newer work shipped as Docker `stable` tags; repos pushed 2026-11-04/06 | GitHub API; README |
| Contributors | Astagor, havfo, N7Remus, pnts-se (≈4 people) → bus factor ~2–4 | GitHub API |
| Owner | Copyright GÉANT Association (EU research network) | README |
| Features | A/V, screen share, file share (torrent), chat, local recording (disabled by default), OIDC/SAML/local auth, lobby, breakout rooms, drawing board, raise hand, headless recorder/streamer bot page, multi-tenant management server | https://github.com/edumeet/edumeet ; https://github.com/edumeet/edumeet-client |
| Server recording | Via external "bot provider" (headless browser joins `?headless=1`), not built in | edumeet-client README |
| Languages | 23 locales, **no Persian** (no fa.json) | edumeet-client `src/translations` |
| Docker | Docker Hub `edumeet/*` | README |

### 4.3 MiroTalk (SFU / P2P / C2C)

| Item | Value | Source |
|---|---|---|
| Licence | AGPL-3.0 for mirotalksfu, mirotalk (P2P), mirotalkc2c | GitHub API |
| Commercial licence | Regular $99 (private source, rebrand, one end product, users not charged); Extended $499 (users can be charged). Sold via **Stripe Checkout**; CodeCanyon mentioned for reviews | https://docs.mirotalk.com/license/ ; mirotalksfu README |
| Edvora relevance | We charge students → Extended licence. Stripe purchase from Iran blocked (sanctions); AGPL alternative forces publishing our modifications | |
| Stars / version | SFU 3,148, v2.7.71 (package.json), last commit 2026-11-06; P2P 4,831, v2.2.71; C2C 521. No GitHub releases | GitHub API |
| Contributors | miroslavpejic85 3303 of SFU commits; next is 12 → **bus factor 1** | GitHub API |
| Features | Screen share, recording, chat, whiteboard, rich text editor, file share, lobby, host protection, JWT, OIDC, REST API, webhook, iframe/widget, RTMP, "133 languages" | mirotalksfu README |
| Server recording | `recording.enabled`, optional upload to S3 (`endpoint`), 1 GB default max file | `app/src/config.template.js` |
| Scale | One mediasoup worker per CPU core (`SFU_NUM_WORKERS` ≤ cores) | config.template.js |
| **Foreign runtime deps** | `Room.html` loads ~30 assets from cdn.jsdelivr.net, cdnjs.cloudflare.com, w3schools.com (bootstrap, fabric, pdf.js, quill, livekit-client, mediapipe...). **Umami analytics enabled by default** (`STATS_ENABLED !== 'false'`, `src: https://stats.mirotalk.com/script.js`) | `public/views/Room.html`; `app/src/config.template.js` lines ~1905–1909 |

Verdict: violates our no-CDN / no-analytics rule out of the box and needs a sanctions-blocked purchase or AGPL compliance.

---

## 5. Janus WebRTC Gateway

| Item | Value | Source |
|---|---|---|
| Licence | GPL-3.0; commercial licence from Meetecho (secondary sources) | https://api.github.com/repos/meetecho/janus-gateway ; https://openvidu.io/openvidu-vs-janus/ |
| Stars / release | 9,201 · v1.4.3 (tag commit 2026-10-12) | GitHub API |
| Contributors | lminiero 3835 (Meetecho), saghul 96 → bus factor ~1–2, company-backed | GitHub API |
| Nature | C gateway with plugins (VideoRoom SFU, Streaming, etc.); no UI, no classroom features | |
| Recording | VideoRoom dumps per-stream `.mjr`; `janus-pp-rec` converts offline; no composite | secondary sources (FreeBSD port, openvidu-vs-janus) |
| Fit | Lowest-level option; more work than LiveKit, GPL copyleft on the server | |

---

## 6. Element Call (Matrix)

| Item | Value | Source |
|---|---|---|
| Licence | AGPL-3.0, plus a `LICENSE-COMMERCIAL` file | https://github.com/element-hq/element-call |
| Stars / release | 1,023 · v0.28.2, 2026-11-05 | GitHub API |
| Contributors | robintown 2158, toger5 1089, dbkr 820 (Element) | GitHub API |
| Architecture | MatrixRTC (MSC4143) with LiveKit backend (MSC4195); standalone app or widget; experimental React component mode | README |
| Fit | Needs a Matrix homeserver plus LiveKit plus a JWT service; meeting app, not classroom. Not recommended | |

---

## 7. Others (short)

| Product | Licence | Activity | Notes | Source |
|---|---|---|---|---|
| Nextcloud Talk + HPB | AGPL-3.0 (spreed, nextcloud-spreed-signaling, talk-recording) | spreed v25.0.7 2026-11-05 (2,223 stars); signaling v2.1.1 2026-03-12 (539 stars, fancycode 2221 commits) | Requires Nextcloud; HPB (signaling + Janus) for scale; recording server exists. Wrong product shape for an embedded LMS | GitHub API |
| Ant Media Server CE | NOASSERTION on GitHub (CE free) | ams-v3.1.0 2026-08-31, 4,747 stars | **SFU/MCU conferencing is Enterprise-only** per docs/specs wiki → CE unusable for classes | https://antmedia.io/docs/get-started/enterprise-and-community-edition ; https://github.com/ant-media/Ant-Media-Server/wiki/Specifications |
| Apache OpenMeetings | Apache-2.0 | 9.1.0, 2026-07-14, 688 stars, solomax 3613 commits (bus factor 1) | Java 21 + Kurento Media Server; whiteboard, chat, doc editing, recording. Kurento repo still pushed 2026-10-15 but small (442 stars) | https://github.com/apache/openmeetings |
| BigBlueButton | LGPL-3.0 | 9,269 stars, active | Classroom-specific (whiteboard, polls, breakout, recording). Out of this file's scope; covered elsewhere [if not, it should be evaluated] | GitHub API |
| Jitsi Meet | Apache-2.0 | 30,208 stars, active | Out of this file's scope | GitHub API |
| Vroom / "Plug.dev" | Not found as a credible maintained project | — | Skipped | [unverified] |

---

## 8. What Edvora would build on LiveKit (scope signal for the decision)

| Piece | Effort class | Notes |
|---|---|---|
| Token route (server action / route handler) with tenant + enrolment check | S | Zod-validate, per-role grants |
| Webhook route → attendance records in Payload | S | raw body verify; tenant from room name prefix e.g. `iba_<sessionId>` |
| Room UI (grid, speaker, screen share focus) in RTL Tailwind | M | hooks from components-react, our styling |
| Chat (persisted), hand raise, moderator panel, lobby | M | data messages + attributes + RoomService API |
| Recording control + Egress → ArvanCloud S3 → Payload media | M | test `force_path_style` with ArvanCloud |
| Whiteboard, polls, breakout UI | M–L each | breakout via `moveParticipant` |
| Ops: LiveKit + TURN/TLS 443 + Redis + Egress + Prometheus, own image registry | M | `node_ip` + own STUN to avoid Google/Twilio |

---

## 9. Open questions / to verify by test

1. ArvanCloud Object Storage with Egress `endpoint` + `force_path_style` (upload of multi-GB MP4).
2. Let's Encrypt/ZeroSSL issuance from an Iranian DC, or use a domestic CA cert.
3. UDP 50000–60000 and 3478 reachability on Iranian mobile carriers; how often clients fall back to TURN/TLS 443 (see research-iran-network.md).
4. E2EE + Egress behaviour (assumed incompatible).
5. Actual CPU per Room Composite egress at 1080p vs 720p on our chosen VM.
6. OpenVidu Meet whiteboard/breakout status (features page vs release notes conflict).
