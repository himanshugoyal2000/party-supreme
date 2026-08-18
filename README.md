# Trip Brain

Reel ingestion for the Thailand trip. Reels shared in the Instagram group get forwarded once a
night to a professional account; Trip Brain captures each one, pulls the spoken words, on-screen
text, places, prices, tips and warnings out of the video, and keeps the original.

The product requirements live in [docs/PRD.md](docs/PRD.md).

## Why it works this way

Meta's Instagram Messaging API cannot read group threads — the documentation states it outright,
and there is no sanctioned workaround. The only way to watch a group automatically is to drive a
logged-in account through Instagram's private API, which violates their terms and risks the
account.

So the group is never automated. The owner forwards the day's reels to a professional account,
which is an ordinary customer-initiated DM, and Meta's official webhook delivers a **signed link
to the video on their own CDN**. Every network call in the production path is sanctioned, and
there is no burner account, no proxy and no ban risk.

Two consequences, both accepted deliberately:

- **A forward carries no permalink, caption or creator handle.** An `asset_id` only resolves to a
  permalink for your own posts. Since the video file itself is archived, "open the original reel"
  becomes "watch our saved copy", which outlives the creator deleting the post.
- **A forward carries no attribution.** `shared_by` is nullable and editable from each reel's page,
  so names can be filled in later without anyone having to do work at capture time.

## Infrastructure to procure

| What | Where | Cost | Needed for |
| --- | --- | --- | --- |
| Postgres | [Supabase](https://supabase.com) free tier, region Singapore | free | everything |
| Gemini API key | [Google AI Studio](https://aistudio.google.com) | free tier, or prepay $5 | extraction |
| One small VM plus a volume | [Fly.io](https://fly.io) | roughly $7/month | hosting |
| Instagram professional account | convert an existing account, free and reversible | free | forwarding path |
| Meta developer app | [developers.facebook.com](https://developers.facebook.com) | free | forwarding path |

Roughly $7 a month, plus single-digit dollars of Gemini for the whole trip. Fly is not special —
any $6 VPS with Docker works, it just needs to be a single always-on instance with a persistent
disk and an HTTPS endpoint for the webhook.

On the Gemini free tier Google may use the content to improve their products. Prepaying $5 moves
you to the paid tier and removes that.

## Local setup

```bash
cp .env.example .env.local     # fill in DATABASE_URL, GEMINI_API_KEY, DASHBOARD_PASSWORD, SESSION_SECRET
# SESSION_SECRET: openssl rand -hex 32
# DATA_DIR: use ./.data locally

npm install
npm run migrate:local
npm run dev
```

`ffmpeg` is required for thumbnails and durations (`brew install ffmpeg`). `yt-dlp` is only needed
by the paste fallback, never by the forwarding path (`brew install yt-dlp`).

## Deploying

```bash
fly launch --no-deploy            # accept the existing fly.toml
fly volumes create trip_brain_data --size 10 --region sin

fly secrets set \
  DATABASE_URL='...' \
  GEMINI_API_KEY='...' \
  GEMINI_MODEL='gemini-3.5-flash' \
  DASHBOARD_PASSWORD='...' \
  SESSION_SECRET="$(openssl rand -hex 32)" \
  IG_APP_SECRET='...' \
  IG_WEBHOOK_VERIFY_TOKEN='...'

# Optional: only needed for setup probes or future outbound Conversations API calls.
fly secrets set IG_ACCESS_TOKEN='...'

fly deploy
fly ssh console -C "node scripts/migrate.mjs"
```

The machine must stay awake, because the worker runs inside the web process. `fly.toml` already
sets `auto_stop_machines = false` and `min_machines_running = 1`; keep it to a single instance.

## Wiring up the forwarding path

Do this after the dashboard is working, since it is the fiddliest part.

1. Convert the receiving Instagram account to a Business or Creator account.
2. Create a Meta app using **Instagram API with Instagram Login** — this variant needs no Facebook
   Page. Add the `instagram_business_basic` and `instagram_business_manage_messages` permissions.
3. Add your personal Instagram account as an app tester so it is allowed to message the
   professional account. Only you ever DM it, so Standard Access should be enough and full App
   Review should not be required.
4. Set the webhook callback URL to `https://YOUR-APP.fly.dev/api/webhooks/instagram`, invent a
   verify token, and subscribe to the `messages` field.
5. `fly secrets set IG_APP_SECRET='...' IG_WEBHOOK_VERIFY_TOKEN='...'`
6. A Creator account must make one Conversations API call before it will receive webhooks at all.
   A Business account does not.

Then forward a reel from the group and watch it appear on the dashboard.

## How ingestion works

```
forward a reel  ──► webhook ─┐
                             ├──► reels (pending) + share_events ──► worker
paste a link    ──► dashboard┘                                        │
                                                    fetch stage ◄─────┘
                                            signed CDN link, or yt-dlp
                                                          │
                                          sha256, thumbnail, dedupe
                                                          │
                                                   extract stage
                                          one Gemini call over the video
                                                          │
                                                  captured_content
```

Fetch and extract are separate stages with separate retries, so a Gemini failure never costs us
the video and never re-downloads a signed link that has since expired.

Reliability follows the PRD's ordering, where missing data is worse than duplicate data:

- The webhook is idempotent on Meta's message id, and answers 500 on failure so Meta retries.
- Claiming a reel takes a ten-minute lease, so a crash mid-job makes it eligible again rather than
  losing it.
- Failures back off exponentially and land on the **Problems** page after `MAX_ATTEMPTS`. Nothing
  is deleted; the share and raw payload survive, so a retry works once the cause is fixed.
- Deduplication is by sha256 of the video, which is the one identifier both intake paths agree on.
  The same reel forwarded by three people becomes one reel with three share events. The duplicate
  row survives with `status = 'merged'`.

## Layers

`reels` and `share_events` are Layer 1, the source. `captured_content` is Layer 2, what the reel
actually communicates, keyed by `extractor_version` so a better model can be run later without
destroying anything.

Layer 3 — cities, categories, budgets, coordinates, itineraries — is intentionally absent. Future
features should add their own tables and must never write into `captured_content`.
