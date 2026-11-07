# ADR 012 — Live classes: self-hosted BigBlueButton behind a provider-agnostic adapter

**Status:** accepted (2026-11-06). Farjad approved building on BigBlueButton in chat. The server budget and account owner are still open. Closes board item E-007.
**Research:** `docs/research/live-classes.md` (E-033) and its appendices A–F.

## Context
- Phase 2 D: schedule a class, one-click join per enrolled student, instructor as moderator, recording added to the
  lessons automatically, attendance recorded, reschedule invalidates old links.
- Iranian tenants run inside Iran with no foreign runtime dependencies (ADR 002). Every outside service sits behind an
  adapter with a mock (ADR 003). Edvora is multi-tenant (ADR 004), so the provider's cost and branding must work per tenant.
- Facts that drive the choice (cited in the research):
  - **BigBlueButton 4.0** (LGPL-3.0, very active) covers every D story out of the box. That includes server-side
    attendance (webhooks from the separate `bbb-webhooks` package, plus the analytics callback), a signed
    recording-ready callback, MP4 output (the non-default `video` format, which must be enabled), per-meeting
    branding and an RTL Persian UI (80% of strings translated). Its documented limit is 200 users per session.
  - **Skyroom** is the only domestic product that is credible and legal to buy. Its API has no webhooks, attendance or
    recordings. It deletes recordings 30 days after the service ends. White-label costs ۲۴٫۵ میلیون تومان a month per account.
  - **LiveKit** (Apache-2.0) is the best media infrastructure, but we would have to build the whole classroom UI.
    BBB 4.0 uses LiveKit as its default media server for audio, camera and screen (BBB docs "new features", research
    appendix A §3.1).
  - Iran blocked almost all UDP, WebRTC included, during the 2025 and 2026 shutdowns. TURN over TLS on 443 is mandatory
    for every option.

## Decision
1. **Build on open source:** run **BigBlueButton 4.0, self-hosted** on one Iranian VM (ArvanCloud Iran region,
   8 vCore / 16 GB) for all live cohort classes. One server is shared by all tenants on that instance, so they also
   share its ceiling of about 200 concurrent users. Branding is set per meeting from the tenant's settings.
2. **Edvora owns the business side; the provider owns media.** Enrollment, tenant and join-window checks, the schedule,
   attendance records and recording lessons all live in Edvora. The provider sees only opaque ids
   (`<tenantId>:<liveSessionId>` and our user id; ids, not slugs) and a display name. Nothing secret goes into BBB
   `meta_*` values: participants can see them.
3. **Adapter:** `packages/integrations/live-class/` exports `LiveClassProvider`:
   - `createRoom`: idempotent on `externalRoomId` while the room runs. Called right before every join, because BBB
     creates meetings lazily and ends them when empty; a re-create gets a new `createTime`.
   - `getJoinTicket`: per user and per role, returning either a redirect URL or a token + server URL. **BBB join URLs
     do not expire** while the meeting runs (`expiresAt: null`, no `ticketExpiry` capability). The real gate is our
     join route handler: it checks tenant, enrollment and the window, then answers with a 303 (ADR 005). The URL is
     never put in page HTML.
   - `getRoomStatus`, `endRoom`, `listRecordings`, `getRecording`, `deleteRecording`
   - `parseWebhook`: verifies the signature and returns normalised `room.started/ended`, `participant.joined/left`,
     `recording.ready` (id only; details via `getRecording`) and `attendance.summary` events. The summary comes from
     BBB's analytics callback and wins over join/leave events, which can arrive out of order. Each event has an
     `eventId`, derived deterministically when the provider has none.
   - `capabilities`: lets the UI and flows degrade, e.g. no `attendanceWebhooks` means admins mark attendance by hand

   `LIVE_CLASS_PROVIDER` selects `mock` (now), then `bigbluebutton` (Phase 3). Adding `skyroom` (redirect) needs a
   new adapter file only. Adding `livekit` (token) also needs a classroom client page in `apps/web`.
4. **Recordings are copied, never linked.** On `recording.ready` a job downloads the MP4 to Arvan Object Storage (S3)
   and creates a lesson played through the protected player (Phase 2 B), which adds the per-student watermark.
5. **Network:** TURN/TLS on TCP 443 (BBB's HAProxy split) and our own STUN. No Google STUN and no cloud captions.
   Images and packages come from our own registry and apt mirror. Students join in the browser only; no app is required.
6. **Large webinars (over 200)** are out of scope for BBB itself. The preferred self-hosted path is a streaming
   bot (THM-Health/BBB-Streaming-Server, LGPL-3.0) that pushes the BBB room over RTMP into **MediaMTX** (MIT, single
   binary). Viewers watch LL-HLS at 480p through short-lived signed URLs, about 0.5 Gbps for 500. The fallback is a
   Skyroom webinar day pass. Both are a per-session choice through the same adapter, built when the first request
   arrives (D7, P3). The bridge on BBB 4.0 is untested.
7. **Plan B for classes: plugNmeet** (MIT, LiveKit-based). It has a BBB-compatible API, a Persian locale with RTL,
   and native webhooks. If BBB fails the Iranian load test, the BBB adapter is pointed at plugNmeet's BBB routes, and
   a small native-webhook parser covers `hooks/*`, which plugNmeet lacks. Spike it on the same trial VM.

## Alternatives considered
| Option | Why not (now) |
| --- | --- |
| Skyroom as the main provider | No webhooks, attendance or recording API, so D4 and D5 become manual work. Recordings are deleted after the service ends. Branding is paid per tenant, so cost grows with each academy. Data and uptime are a vendor's. Kept as a fallback or for webinars |
| Managed BBB from an Iranian host (e.g. bigbluebuton.ir) | Same adapter, no operations for us. But the API needs the 200-user plan (۸٫۷۵ میلیون a month), the server is shared, webhooks are `[unverified]`, and recordings are kept only 3 months. **A good stop-gap if the Iranian server is late**, or as the backup link |
| plugNmeet (MIT, LiveKit-based) as the main provider | Full classroom features, fa + RTL, BBB-compatible API. But one developer wrote almost all of it, the installer depends on Docker Hub and Google, Google STUN and Google Fonts must be stripped, and the load test used simulated users only. **Plan B** (decision 7) |
| OpenTalk, La Suite Meet | No Persian or RTL; Keycloak and a foreign image registry (OpenTalk); PostHog telemetry and no classroom features (La Suite Meet) |
| LiveKit + Egress with our own UI | Strongest infrastructure and E2EE, but months of UI work (whiteboard, slides, polls, lobby, RTL). Revisit for a native Edvora classroom or very large rooms |
| Jitsi Meet + Jibri | No slide presenter. Attendance only through a community plugin. No RTL layout. One recording server per concurrent recording, and Jibri is barely maintained |
| OpenVidu, Galène, edumeet, MiroTalk, Janus, Element Call | See the research doc, §3: UI or Persian gaps, a single maintainer, CDN or analytics calls, sanctioned payments, or too low-level |
| Adobe Connect via Iranian resellers | Pirated builds (the reseller says so). Rejected on legal grounds |

## Consequences
- **We take on operations:** install, a mirror, TURN, monitoring (bbb-exporter + Uptime Kuma), and a fresh server for
  each BBB major release (blue-green). This needs a named person with server access in Iran.
- **Cost for a 200-student academy** is about ۱۲ میلیون تومان a month in cash (server, staging, storage) plus about
  10–15 person-days of setup. An extra academy on the same instance costs only storage while all academies together
  stay under about 200 concurrent users. Beyond that, add a server (Scalelite needs 3 or more).
- **Edvora keeps the data:** attendance, recordings and links are ours. Switching to Skyroom or LiveKit later means a new
  adapter file, not a schema change.
- **Accepted gaps:** no E2EE; no per-student watermark inside the live room (deterrent overlay at most); join URLs
  that don't expire while the meeting runs; 200-user ceiling per session; behaviour during a national-network
  shutdown is unknown (degraded mode in D8).
- **Data model** (Phase 3, after approval):
  - `liveSessions` adds `providerRoomId` and a **list** of recordings, each with `providerRecordingId`, status and
    lesson: one session can produce several recordings, because every re-create starts a new one.
  - `liveEvents`, unique on `(tenant, provider, eventId)`, kept permanently for dedupe and replay protection.
  - `attendance.source` = `webhook | summary | manual | import`.
- **Webhook route, in this order:**
  1. Read the raw body.
  2. Find the `liveSession` by `(provider, providerRoomId)` with `overrideAccess`.
  3. Load that tenant's credentials and verify the signature with them, rebuilding the signed URL from the tenant's
     base URL, not `req.url`, because proxies change the host.
  4. Reject the event if its `externalRoomId` doesn't match the record, or if it is older than 24 h. BBB checksums
     carry no timestamp, so a captured body could otherwise be replayed.
  5. Answer 401/400 without throwing.

  Never take the tenant from the Host header or from the payload alone.
- **Ops note:** bbb-webhooks drops a hook after about 12 failed deliveries in about 5 minutes. Re-register hooks on each
  `createRoom` and reconcile with the end-of-class summary and `getRecording` polling.

## Extending BBB later (how we add features without forking)
In order of preference. Each step is used only when the one before it isn't enough.
1. **Per-meeting settings through the API:** branding, `disabledFeatures`, lock settings, `userdata-bbb_*` UI
   options, a custom stylesheet per tenant. No code in BBB.
2. **Edvora-side features on the API and webhooks:** attendance, gamification, certificates, quizzes graded in our
   LMS, reminders, recordings in the protected player. Most product work lives here, and it survives BBB upgrades
   and provider switches.
3. **The official HTML5 plugin SDK** (`bigbluebutton-html-plugin-sdk`): React plugins loaded from a manifest we host.
   They add buttons, panels and overlays inside the room, e.g. a student-name watermark overlay, a "post to Edvora
   Q&A" button, or a link to the lesson's resources. No fork. Each plugin is re-tested on every BBB release.
4. **Contribute upstream:** Persian translations, bug fixes.
5. **Fork, last resort:** LGPL-3.0 allows it, and running it as a hosted service is not distribution. But every
   upgrade means rebasing our changes, so a fork needs its own ADR.

## Phase 3
Approved. Covers the local PoC, the real BBB adapter, `/learn` join, `/staff` start and attendance. Production still
needs the Iranian server and an owner (E-005).
