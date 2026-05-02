<claude-mem-context>
# Memory Context

# [omv-jdownloader-dashboard] recent context, 2026-04-28 12:21am GMT+7

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 45 obs (17,765t read) | 349,148t work | 95% savings

### Apr 27, 2026
1 10:08p 🔵 Zero-size file bug in M3U8 direct download API
4 " 🔵 Frontend M3U8 download flow: hardcoded backend port with _blank anchor injection
5 " 🔴 Fixed zero-size M3U8 download: stderr deadlock + missing CDN Referer/Origin headers
2 10:09p 🔵 M3U8 download endpoint architecture: FFmpeg-via-subprocess streaming to browser
3 " 🔵 M3U8AdFilter: master playlist resolution and ad segment filtering
6 10:13p 🔵 Pre-fix curl test confirmed: download endpoint returns HTTP 200 but only 5 bytes of data
7 10:14p 🔵 Post-reload download still produces zero-byte file — fix unconfirmed as of 15:14
8 " 🔵 FFmpeg 8.0.1 rejects -user_agent flag: "Option user_agent not found"
9 10:15p 🔵 FFmpeg 8.0.1 breaks both -user_agent and -headers as global pre-input options
10 " 🔵 Confirmed working FFmpeg 8.0.1 command: strip -user_agent and -headers entirely
11 10:18p 🔵 FFmpeg pipe:1 streaming confirmed working: 678,699 bytes output to stdout
12 " 🔴 Removed incompatible FFmpeg 8.x flags from download_m3u8 endpoint
13 " 🔄 Cleaned up dead code in download_m3u8: removed unused urlparse and origin variables
14 " 🔴 M3U8 download fix verified: full episode downloaded as valid 16-minute MP4
S6 Post-bugfix skill cleanup: reviewing and planning removal of unused globally-installed Claude Code skills (Apr 27 at 10:19 PM)
S3 Fix zero-byte file bug in M3U8 direct download feature for duinch-cinema app (Apr 27 at 10:19 PM)
S7 Global Claude Code skill cleanup: removed 99 unused skills, keeping only 4 relevant ones (Apr 27 at 10:21 PM)
S4 Fix zero-byte M3U8 download bug (completed), then user inspected installed Claude skills (Apr 27 at 10:21 PM)
S5 Post-bugfix: user reviewing installed Claude skills and considering cleanup to reduce context token usage (Apr 27 at 10:21 PM)
S8 Session wrap-up: checked TUI fullscreen setting after skill cleanup (Apr 27 at 10:22 PM)
15 10:22p 🔵 Global Claude Code settings.json structure: permissions, plugin, and marketplace config
S9 Fix JDownloader detection failing ("báo không tồn tại") — investigate and repair the full detection chain in omv-jdownloader-dashboard (Apr 27 at 10:23 PM)
16 10:25p 🔵 JDownloader Detection Bug Investigation in omv-jdownloader-dashboard
17 " 🔵 JDownloader Detection Uses MyJDownloader Cloud API, Not Local Process Check
18 10:26p 🔵 Root Cause Found: MyJD Credentials Are Placeholder Values in .env File
19 " 🔵 Confirmed: duinch-downloader Microservice Not Running — JDownloader App IS Running
20 " 🔵 duinch-downloader Has No .env File — Credentials Must Be Set via Shell or Docker
21 " 🔵 JDownloader Remote Control API Is Active on Port 9666 — Local API Available
22 " 🔵 JDownloader Remote Control Server Confirmed as AppWork GmbH HttpServer with Open CORS
24 " 🔵 myjdapi v1.1.10 Installed in Project venv — Cloud API Library Ready but Not Started
23 10:27p 🔵 JDownloader Port 9666 API Requires Authentication — Raw Endpoints Return Empty Responses
25 " 🔵 duinch-downloader Has python-dotenv Dependency But main.py Never Calls load_dotenv()
26 10:30p ✅ Added myjdapi to duinch-cinema/backend/requirements.txt
27 " ✅ JD_DEVICE_NAME Config Added to Cinema Backend config.py
28 10:31p 🟣 JDDirectClient Class Added to Cinema Backend — Eliminates duinch-downloader Microservice Dependency
29 " 🟣 add_download() Now Uses Microservice-First with Direct myjdapi Fallback
30 " 🔴 JDownloader Health Check Fixed with Two-Layer Detection: Microservice → Direct myjdapi Fallback
31 " ✅ myjdapi Import Validated — JDDirectClient and DownloaderUseCase Load Successfully
32 " 🔵 Health Endpoint Still Returns Offline — Real MYJD Credentials Still Needed in .env
33 " 🔵 Project Has a Unified Launcher Script (./run) — No duinch-downloader Startup in Option 1
35 10:32p 🔄 JDDirectClient Removed from downloader.py — myjdapi Logic Being Relocated
34 10:33p 🔵 scripts/start_all.sh Confirmed: Only Starts Backend + Frontend, Never Starts duinch-downloader
36 " 🔄 downloader.py Use Case Reverted to Original — JD Logic Being Extracted to Dedicated Module
37 " ⚖️ Full Rollback of myjdapi Integration — All Cinema Backend Changes Reverted to Original State
S10 User asked "dùng jd account mới được à?" (can I use a new JD account?) — confirming whether a fresh MyJDownloader account would work to fix the EMAIL_INVALID error (Apr 27 at 10:33 PM)
38 10:35p 🔵 Shared .env file coupling across 3 subprojects
S11 User confirmed: "dùng jd account mới được à?" — answered yes, new MyJDownloader account works; provided full setup instructions for registering and connecting (Apr 27 at 10:41 PM)
39 10:44p 🔵 Three subprojects use three different .env loading mechanisms
40 10:45p 🔵 duinch-crawler _project_root resolves to monorepo root, not subproject root
41 " 🔵 No .env exists at monorepo root — duinch-crawler runs with no credentials loaded
42 11:39p 🔵 App.tsx Footer & DownloaderContext Pre-Refactor State
43 11:40p 🟣 Backend /downloader/config Proxy Endpoint Added
44 " 🔄 DownloaderContext.tsx Expanded with Typed Status, Email, and updateConfig
45 " 🟣 JDownloader Settings Modal and Footer Refactor in App.tsx

## Agent skills

### Issue tracker

Chúng ta theo dõi công việc qua **GitHub Issues**. Xem chi tiết tại `docs/agents/issue-tracker.md`.

### Triage labels

Sử dụng hệ thống nhãn mặc định: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. Xem chi tiết tại `docs/agents/triage-labels.md`.

### Domain docs

Dự án sử dụng cấu trúc **Multi-context** với file `CONTEXT-MAP.md` tại gốc dự án để điều hướng. Xem chi tiết tại `docs/agents/domain.md`.