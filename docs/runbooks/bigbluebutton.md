# Runbook: BigBlueButton server for live classes (ADR 012)

**Owner:** devops · **Status:** draft. It still needs a run on a real Iranian VM: every `[verify]` below is a check
to make on that first install. Sources for each step are in `docs/research/live-classes/a-bigbluebutton-jitsi.md` (§4, §6).

Why not docker-compose on a laptop: BBB 4.0 installs only on a clean Ubuntu 24.04 server (8 cores, 16 GB, public IP,
UDP ports). It doesn't run on macOS Docker. For development, use `LIVE_CLASS_PROVIDER=mock` (the default): `/live/mock`
stands in for the classroom and reports joined/left through the same code path as BBB webhooks.

## 1. Server
- ArvanCloud Iran region (or an Iranian dedicated server): **8 vCore, 16 GB RAM, 200 GB disk, 1 public IPv4**,
  ≥ 250 Mbit/s symmetric. Ubuntu 24.04, hostname e.g. `live.<academy-domain>`, with an A record.
- Firewall in: TCP 80, 443; TCP+UDP 3478; UDP 16384–32768. `[verify]` that Arvan allows the UDP range.
- Ask Arvan **in writing** whether WebRTC media sent to students counts as «ترافیک ارسال», which is listed as free.

## 2. Mirrors first (Docker Hub blocks Iranian IPs)
1. **apt:** point the installer at an apt cache or mirror with `bbb-install.sh -p <apt-cacher-host>`. `[verify]` that
   `ubuntu.bigbluebutton.org`, `deb.nodesource.com` and `download.docker.com` answer from the VM.
2. **Docker image `bigbluebutton/bbb-libreoffice`:** on a machine outside Iran, run
   `docker pull bigbluebutton/bbb-libreoffice:<tag>` and `docker save -o bbb-libreoffice.tar …`. Copy the tar to the
   VM and run `docker load -i bbb-libreoffice.tar`. Then run `apt-get install -f`. Or configure an Iranian registry
   mirror (`docker.arvancloud.ir`) in `/etc/docker/daemon.json` → `registry-mirrors`. `[verify]` which mirror works.
3. Keep every tarball and `.deb` in our object storage, so a rebuild never needs a foreign host.

## 3. Install
```bash
wget -qO- https://raw.githubusercontent.com/bigbluebutton/bbb-install/v4.0.x-release/bbb-install.sh | \
  bash -s -- -v noble-400 -s live.example.ir -e ops@example.ir -c turn.example.ir:<turn-secret> -w
```
- The `-c` option replaces the default Google STUN (`stun.l.google.com`) with our own TURN/STUN, and puts TURN over
  TLS on 443 through HAProxy. Afterwards, check `/etc/bigbluebutton/turn-stun-servers.xml` for foreign hosts.
- `-w` opens the firewall. Don't add `-g`: we don't need Greenlight, because Edvora is the front end.
- Let's Encrypt `[verify]` from Iran. If it fails, use `-d` with a domestic certificate in `/local/certs/`.

## 4. Settings that keep it inside Iran
- Live captions: in `/etc/bigbluebutton/bbb-html5.yml` set `public.app.audioCaptions.provider: webspeech`, or
  disable captions. Without this, `speechProcessing: cloud` sends audio to Google. `[verify]` the exact 4.0 key.
- Remove or replace the help links that point to bigbluebutton.org (`helpLink`) in the same file.
- Persian by default: `public.app.defaultSettings.application.overrideLocale: fa`. About 80% of strings are
  translated; the rest show in English until we contribute them.
- Recordings as MP4: install `bbb-playback-video` and enable the `video` format in
  `/usr/local/bigbluebutton/core/scripts/bigbluebutton.yml` (`steps`). Process recordings at night if CPU is tight.

## 5. Webhooks and Edvora
1. `apt-get install bbb-webhooks`. Edvora's webhook URL is `https://<academy-host>/live/webhook/bigbluebutton`.
   Register it **globally** in the bbb-webhooks config (`hooks.permanentURLs`), so hooks survive restarts. bbb-webhooks
   drops a hook after about 12 failed deliveries.
2. `bbb-conf --secret` prints the URL and the shared secret. Set them on the Edvora instance:
   ```
   LIVE_CLASS_PROVIDER=bigbluebutton
   BBB_URL=https://live.example.ir/bigbluebutton/
   BBB_SECRET=<secret>
   BBB_CHECKSUM=sha256
   ```
3. The Edvora tenant needs the **Live classes** module turned on (Tenants → Enabled modules). An admin then schedules
   classes in `/admin` → کلاس‌های زنده. The instructor starts the class from `/staff/teaching`, and students join from
   the course page.

## 6. Monitoring and backups
- Prometheus `bigbluebutton-exporter` (mirror the image) + node exporter; Uptime Kuma check on `https://live…/bigbluebutton/api`.
- Alerts: CPU > 70% during a class (audio degrades at 80%), disk > 80%, any recording stuck in processing for more than 2 h.
- Recordings live on the BBB disk until the copy to Arvan Object Storage lands (E-017). Until then, snapshot the disk weekly.

## 7. Upgrades
- Minor releases: re-run `bbb-install.sh` with the same options, outside class hours.
- **A major release (4.x → 5.0) can't upgrade in place.** Build a new server with this runbook, test it, move DNS,
  then retire the old one (blue-green).

## 8. Before the first real class (pilot checklist)
- [ ] Join from MCI 4G, Irancell 4G, a corporate network and an iPhone (Safari). Check that media connects when UDP
      is blocked (TURN/443).
- [ ] Run a 200-user load test with 5 webcams and screen share, and watch CPU.
- [ ] Time MP4 processing for a 3-hour class.
- [ ] Open the browser's network tab in the room: no requests to hosts outside the academy and the BBB server.
