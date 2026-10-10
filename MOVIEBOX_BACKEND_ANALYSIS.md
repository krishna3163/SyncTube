# MovieBox Backend Analysis — MovieBox-Tui → SyncTube

> **Repo:** https://github.com/mesamirh/MovieBox-Tui.git  
> **Analysed commit:** `main` @ 0.1.26 (Rust edition 2024)  
> **SyncTube branch:** `arena/0efba761-synctube` (`server/src/services/movieProvider.ts` + `server/src/app.ts`)

---

## 1) TL;DR — MovieBox ka "backend" kya hai?

MovieBox-Tui ka **koi alag server backend nahi hai**. Ye ek **Rust TUI client** hai jo seedha MovieBox ke private API (`api*.aoneroom.com` + `api.inmoviebox.com`) ko hit karta hai — bilkul waise jaise Android app `com.community.oneroom` karta hai.

Matlab "backend" = **client-side scrapers/providers** jo API ko reverse-engineered signing ke saath call karte hain.

SyncTube ne isi logic ko **Node.js/TypeScript** me port kiya hai → `server/src/services/movieProvider.ts`.

```
Android App → MovieBox API (aoneroom.com)
       ↑                ↑
MovieBox-Tui (Rust)   SyncTube (Node) — same SECRET + HMAC-MD5 signing
```

---

## 2) MovieBox-Tui — Project Structure

```
Cargo.toml (0.1.26, Rust 1.90+, edition 2024)
src/
  main.rs, lib.rs, config.rs, cache.rs, net.rs, proxy.rs
  providers/
    mod.rs          → Provider + ReleaseProvider traits
    models.rs       → CatalogItem, MediaDetails, Release, SubtitleOption
    moviebox/
      client.rs     → MovieBoxClient (HOST_POOL, session, retry)
      crypto.rs     → HMAC-MD5 signing, x-client-token, x-tr-signature
      session.rs    → JWT parse, visitor-login, persisted session
      adapt.rs      → JSON → Rust structs (search, details, resources, DASH)
      title.rs      → clean_moviebox_title + language codes
    fourkhdhub/, dramachi/, bdix/, addons/, tv/  → other scrapers
  tui/              → ratatui UI (search, details, playback, downloads)
  player/           → mpv/VLC/IINA launcher
  download.rs       → multi-segment HTTP range downloader
```

**Other providers supported:** MovieBox (main), 4KHDHub, Dramachi, BDIX (CircleFTP/DhakaFlix), Stremio Addons, Live TV (m3u).

---

## 3) MovieBox Provider — Deep Dive (Rust)

### 3.1 HOST_POOL + Retry

**File:** `src/providers/moviebox/client.rs`

```rust
const HOST_POOL: &[&str] = &[
  "https://api6.aoneroom.com",
  "https://api5.aoneroom.com",
  "https://api4.aoneroom.com",
  "https://api4sg.aoneroom.com",
  "https://api3.aoneroom.com",
  "https://api6sg.aoneroom.com",
  "https://api.inmoviebox.com",
];
const RETRY_STATUS_CODES: &[u16] = &[403,406,407,429,500,502,503,504];
```

- **Round-robin + stickiness:** `active_base_idx` (AtomicUsize) pe current good host stick rehta hai.
- **Backoff:** 50ms base, 429 pe `Retry-After` header se max 3s.
- **Host rotation:** Har fail pe next host, all hosts exhausted → `HostsExhausted` error → session invalidate + retry.

**SyncTube port:** `HOST_POOL` me 5 hosts (sg variants hata diye), same retry logic but simpler `for..of` loop, `fetch` + `AbortSignal.timeout`.

### 3.2 Crypto Signing — Sabse important

**File:** `src/providers/moviebox/crypto.rs`

```rust
const DEFAULT_SECRET_BYTES: &[u8] = b"\xef\xa8\x91\x97\x4e\xec\xd3\x14\x8d\xf6\x3a\xa6\x11\x60\x2d\xef\xd1\x01\x25\x9b\xa5\x21\x02\x2c\x57\xae\x05\x66\xbd\x8e";
const SIGNATURE_BODY_MAX_BYTES: usize = 102_400;
type HmacMd5 = Hmac<Md5>;
```

1. **`generate_x_client_token(ts)`**
   ```
   ts = millis since epoch
   reversed = reverse(ts as string)
   md5 = MD5(reversed)
   token = "{ts},{md5}"
   ```

2. **`build_canonical_string(method, accept, content_type, url, body, ts)`**
   ```
   canonical_url = path + "?" + sorted_query_string(url)  // BTreeMap sorted
   body_hash = MD5(first 102400 bytes of body)  // empty if no body
   body_len  = len(body) as string
   canonical = "{METHOD}\n{accept}\n{content_type}\n{body_len}\n{ts}\n{body_hash}\n{canonical_url}"
   ```

3. **`generate_x_tr_signature(...)`**
   ```
   sig = HMAC-MD5(SECRET, canonical) → base64 STANDARD
   header = "{ts}|2|{sig}"
   ```

4. **`build_signed_headers(...)`** → header map:
   ```
   User-Agent: com.community.oneroom/500201xx (Linux; U; Android 13; ...; Cronet/135.0.7012.3)
   Accept: application/json
   Content-Type: application/json
   Connection: keep-alive
   x-client-token: {ts},{md5}
   x-tr-signature: {ts}|2|{base64_hmac}
   x-client-info: JSON {package_name, version_name=4.0.01.0813.03, version_code, os=android, device_id=32hex, gaid=uuid, brand=Redmi, model=22101316G, ... sp_code=40401, X-Play-Mode=2}
   x-client-status: 0
   x-forwarded-for: random_indian_IP (103.241/49.36/117.195 ...)
   Authorization: Bearer {visitor_token}  // if authed
   ```

**Client spoofing helpers:**
- `generate_client_info_and_ua()` → random Redmi device (7 models), Android 9-13, version_code 50020117-121, network WIFI/MOBILE, timezone rotation, `random_hex(32)` device_id, `random_uuid()` gaid.
- `random_spoofed_ip()` → Indian IP prefixes (103.241, 49.36 etc)

**SyncTube port (movieProvider.ts:340-460):** 100% same SECRET bytes, same HMAC-MD5, same canonical logic. Difference:
- UA fixed to `22101316G/Android13/50020120` (random nahi, ek hi value per server instance)
- `device_id`/`gaid` per-constructor random (Rust har client instance pe random)
- `spoofedIp` one-time random `103.x.x.x`
- Body hash same but SyncTube me `crypto.createHash('md5')` + `createHmac('md5', SECRET)`

### 3.3 Session Management

**File:** `src/providers/moviebox/session.rs`

```rust
pub struct MovieBoxSession { token, user_id, expires_at, created_at }
```

- `visitor-login`: `POST /wefeed-mobile-bff/user-api/visitor-login` body `{}` → `{token, uid}`.
- Token JWT hai → `parse_jwt_claims()` se `userId` + `exp` nikalta hai (payload base64url decode).
- `is_valid()` → `now+60 < exp` else `now < created_at+7days`.
- **Persisted cache:** `~/.cache/moviebox-tui/moviebox_session.bin` (rmp-serde, 30d TTL, `cache.rs` LRU).
- `x-user` response header se bhi token absorb karta hai (`absorb_x_user`).
- 401/403 pe `invalidate_session()` + fresh login retry.

**SyncTube port:** in-memory only (`cachedToken` + `tokenExpiresAt`), no file cache. TTL 7 days hardcoded. `ensureSession()` same host loop 6s timeout, json `data.token`. No `x-user` header absorption. Retry on 401/403 supported (2 attempts).

### 3.4 API Endpoints (wefeed-mobile-bff)

| Method | Path | Rust function | SyncTube function | Purpose |
|--------|------|---------------|-------------------|---------|
| `POST` | `/user-api/visitor-login` | `fetch_fresh_session()` | `ensureSession()` | Visitor token |
| `POST` | `/subject-api/search/v2` `{keyword, page, perPage:15, subjectType:0/1/2}` | `search()` | `searchMedia()` | Search |
| `GET` | `/subject-api/get?subjectId=` | `get_details()` | `getMediaDetails()` | Details |
| `GET` | `/subject-api/season-info?subjectId=` | (inside `get_details` if stype==2) | `getMediaDetails()` | Seasons/episodes |
| `GET` | `/subject-api/resource?subjectId=&page=&perPage=&resolution=` | `get_resources()` + `fetch_collection_resolutions()` + `fetch_resource_page()` | `getStreamSources()` | Per-resolution MP4/HLS links + `collectionResolutions` ladder |
| `GET` | `/subject-api/play-info/v2?subjectId=&se=&ep=` | `get_play_info()` | `getStreamSources()` (parallel) | DASH `streams[]` + `signCookie` + `resolutions`, `displayResolutions` |
| `GET` | `/subject-api/ext-captions?subjectId=&resourceId=` | `get_ext_captions()` | (via `extCaptions` inside resource) | Subtitles |
| `GET` | `/tab-operating?page=&tabId=&version=` | `get_homepage()` | `getTrendingMedia()` | Home/trending (tabId=0) |

**SyncTube extras:** `browseMedia(category)` — keyword rotation (`movies: action/comedy/...`, `series: drama/tv series/...`, `anime: anime/...`) + trending fallback, kyunki upstream `tab-operating` categories ka mapping public nahi hai.

### 3.5 adapt.rs — JSON → Typed Models

Key functions (SyncTube ne same logic TS me likha):

- `moviebox_subject_json_to_catalog_item` → `Max` field fallbacks: `subjectId|id`, `title|name`, `subjectType|stype` (2=series), `releaseDate|year|releaseInfo` → 4-digit year, `cover.url|coverUrl|poster|pic`, `season` → `season_count`.
- `moviebox_search_json_to_catalog` → handles both `data.results[0].subjects` and `data.list`.
- `moviebox_homepage_json_to_catalog` → walks `banner.banners[].subject` + `customData.items[].subject` + `subjects[]`, dedup + `BrowseMetrics` trending score.
- `moviebox_details_json_to_media_details` → `subject|data.subject`, episodes from `episodeNumbers[]` or `maxEp` range, dubs, genres, rating.
- `moviebox_resource_item_to_release` / `moviebox_play_info_json_to_releases`:
  - `resolution` → `"1080p"` label
  - `resourceLink|url` → `SourceMirror`
  - `is_deprecation_notice_url` filter → blocks hashes `1c7de0bd...`, `9a0461bc...`, `b164fbfb...`, `/notice.mp4`, `macdn.aoneroom.com/other/`
  - `size` filtering for subs (≤50 bytes = junk)
- **DASH handling:**
  ```rust
  fn resolve_dash_manifest_from_policy(signCookie) -> Option<String>
    // 1) urlprefix=BASE64:xxx → base64 decode → https://.../index.mpd
    // 2) CloudFront-Policy=BASE64_JSON → json.Statement[0].Resource → https://.../index.mpd
  ```
  SyncTube ne exact same `resolveDashManifestFromPolicy` + `isDeprecationNoticeUrl` port kiya (Buffer base64, `urlprefix` + `CloudFront-Policy` branches).

**Quality ladder:**
- Rust: `fetch_collection_resolutions()` → `collectionResolutions[].resolution` desc sorted (fallback 1080/720/480/360), then per-resolution page fetches with `&resolution=`.
- SyncTube:`getStreamSources()` me `knownHeights`/`adaptiveHeights` tracking, `collectionResolutions` + `displayResolutions` + `playInfo.streams[].resolutions` sab collect, DASH → `adaptive=true` + `Auto` quality, top sort `height desc, adaptive first`, missing heights → `Promise.allSettled` per-resolution fetch (max 5, only if no adaptive).

### 3.6 title.rs

`clean_moviebox_title()` → leading `[Dub][1080p]` strip, trailing `[2021]`, ` - Hindi Dub`, ` S01`, ` Season 2`, `_1080P` etc clean karta hai, lekin `(2010)` year preserve. SyncTube me iska direct use nahi — display title raw hi.

---

## 4) SyncTube — Node Port kaise kaam karta hai

**File:** `server/src/services/movieProvider.ts` (1020 lines) + `server/src/app.ts` (MovieBox routes)

### Routes (app.ts)

```
GET  /api/movies/trending          → movieProvider.getTrendingMedia()
GET  /api/movies/search?q=&page=   → movieProvider.searchMedia(q, page)
GET  /api/movies/browse?type=&page → movieProvider.browseMedia(trending|movies|series|anime, page)
GET  /api/movies/details/:id       → movieProvider.getMediaDetails(id)
GET  /api/movies/streams?id=&season=&episode= → movieProvider.getStreamSources(id, se, ep)
ALL  /api/movies/dash/:token/:file → DASH manifest/segment proxy (token=base64url {m,c})
GET  /api/movies/proxy?url=&title= → direct MP4/HLS proxy (SSRF validated)
```

### Proxy + SSRF Guards

- `validateSafeUrl()` (`utils/ssrfValidator.ts`) → blocks private IPs, loopback, metadata.
- DASH proxy: `decodeDashToken(token)` → `manifestUrl`, validate, `referer: https://sportslive.wine`, forward `CloudFront-*` cookies from `signCookie`.
- MP4 proxy: allow-list `macdn.aoneroom.com`, `api*.aoneroom.com`, `commondatastorage.googleapis.com`, `storage.googleapis.com`, `archive.org`, `sportslive.wine` etc.
- DASH rewriting: manifest XML me segment URLs ko `/api/movies/dash/{token}/segment` me rewrite taaki auth cookie hamesha lage.

### Fixture Mode

`MOVIEBOX_FIXTURE=1` → 10-entry offline catalogue (Neon Horizon, Glass Empire etc) `data:image/svg` posters + `server/fixture-media/sample_{480,720,1080}.mp4` streams. E2E/tests aur demo ke liye bina live API ke cinema tab chalta hai.

### Client UI (Vite)

`client/src/components/CinemaStageCard.tsx`, `SearchDialog` me Cinema tab → 4 categories (Trending/Movies/Web Series/Anime), genre chips, season/episode picker, **YouTube jaise quality menu** (Auto/4K/1080p... + format/codec/size chips). Streams `DirectVideoPlayer` (HTML5/DASH via dash.js) me sync playback.

---

## 5) SyncTube vs Upstream — Fidelity Check

| Feature | MovieBox-Tui (Rust) | SyncTube (TS) | Match |
|---------|---------------------|---------------|-------|
| SECRET `ef a8 91 97 ... bd 8e` | ✅ | ✅ | ✅ identical |
| HMAC-MD5 signing + sorted query | ✅ | ✅ | ✅ |
| `x-client-token`/`x-tr-signature`/`x-client-info`/`x-forwarded-for` | ✅ full | ✅ fixed UA | ~95% (randomness kam) |
| HOST_POOL (7 hosts) | 7 incl sg | 5 (sg removed) | OK (still works) |
| `visitor-login` + JWT exp | ✅ + disk cache + x-user header | ✅ memory only | OK simplified |
| Search `subjectType` 0/1/2 | ✅ | ✅ | ✅ |
| `tab-operating` trending | ✅ | ✅ | ✅ |
| `resource?resolution=` per quality | ✅ concurrency | ✅ `Promise.allSettled` 5 | ✅ |
| `play-info/v2` DASH `signCookie` → `index.mpd` | ✅ both `urlprefix` + `CloudFront-Policy` | ✅ same | ✅ |
| `isDeprecationNoticeUrl` | ✅ 5 patterns | ✅ same + URL parse | ✅ |
| Subtitles `extCaptions` | ✅ size filter | ✅ same | ✅ |
| `collectionResolutions` ladder | ✅ | ✅ | ✅ |
| Retry on 403/429/5xx + host rotation | ✅ exponential | ✅ simple loop | minor diff |

**Conclusion:** SyncTube ka port **functionally complete** hai — live MovieBox catalogue, search, details, season picker, quality ladder, DASH adaptive, multi-subtitles sab MovieBox-Tui ke same endpoints + same signing se chalta hai. Offline fixture se bina keys ke demo bhi.

---

## 6) Kaise run / test karein

```bash
# Live MovieBox
npm install
npm run dev          # client :5173, server :10000 (proxy /api → :10000)

# Offline demo (no internet needed)
MOVIEBOX_FIXTURE=1 npm run dev -w server
# → Cinema tab me 10 fixture titles, local mp4 streams

# Rust original ko try karna ho
git clone https://github.com/mesamirh/MovieBox-Tui.git
cd MovieBox-Tui && cargo run --release
```

---

## 7) Important Notes

- **Disclaimer:** MovieBox-Tui aur SyncTube koi video host nahi karte — publicly available streams ko embed/proxy karte hain. User apne local laws ka palan kare.
- **Rate limits:** MovieBox API aggressive throttling karta hai (429). Rust me per-host backoff + host rotation hai — SyncTube me simpler retry, heavy load pe 502 aa sakta hai.
- **DASH cookies:** `signCookie` CloudFront-signed hai, expiry ~ few hours. SyncTube token me `cookie` embed karke har segment request pe forward karta hai.
- **Referer:** Streams ko `Referer: https://sportslive.wine` chahiye (upstream `STREAM_REFERER`) — dono codebases same.
- **Version drift:** MovieBox API unofficial hai — `version_name` `4.0.01.0813.03` aur `Cronet/135.0.7012.3` ko kabhi-kabhi upstream update karna padta hai (Rust me 5 version_code rotate karte hain, TS me fixed).

---

## 8) Files to read next

- `src/providers/moviebox/crypto.rs` — signing ko step-by-step samjhne ke liye
- `src/providers/moviebox/adapt.rs` — JSON edge-cases
- `server/src/services/movieProvider.ts:1-560` — TS port
- `server/src/app.ts: ~520-900` — Express routes + DASH/proxy
- `server/src/__tests__/movieProvider.test.ts` — unit tests for deprecation filter + dash token
- `docs/providers.md` (MovieBox-Tui) — provider docs

