# Game invite links

The frontend copies canonical links for a specific onchain game:

- `/share/market/<id>`
- `/share/race/<id>`
- `/share/arena/<id>`

`scripts/share-preview-server.mjs` reads immutable game metadata from Robinhood
Chain, returns Open Graph/Twitter metadata to link crawlers, and redirects a
browser to the existing HashRouter route. It is read-only: it has no wallet and
cannot submit transactions.

The checked-in defaults are the three canary-approved native ETH successors.
Any VPS `SHARE_MARKET_ADDRESS`, `SHARE_RACE_ADDRESS` or `SHARE_ARENA_ADDRESS`
override must be updated to the same addresses at cutover; an environment
override takes precedence over the defaults.

## Images

The three supplied game-specific cards live under `public/share-images/` and
are the defaults. They can still be overridden independently without changing
the server:

```ini
SHARE_MARKET_IMAGE_URL=https://prophetmarkets.fun/share-images/market.jpg
SHARE_RACE_IMAGE_URL=https://prophetmarkets.fun/share-images/race.jpg
SHARE_ARENA_IMAGE_URL=https://prophetmarkets.fun/share-images/arena.jpg
```

The image files belong under `public/share-images/` so Vite copies them into
every production build.

## VPS service

The server accepts `SHARE_RPC_URL`. It can also reuse the existing read-only
`PREDICTION_MARKET_RPC_URL`, `PRICE_ARENA_RPC_URL`, or
`ASSET_RACE_POOL_RPC_URL`; it never reads a private key.

Recommended systemd unit:

```ini
[Unit]
Description=Prophet game share previews
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=prophet-keeper
Group=prophet-keeper
WorkingDirectory=/opt/robinhood-predict
EnvironmentFile=/etc/prophet/prediction-market-rpc.env
Environment=SHARE_PREVIEW_HOST=127.0.0.1
Environment=SHARE_PREVIEW_PORT=8790
Environment=SHARE_CANONICAL_ORIGIN=https://prophetmarkets.fun
ExecStart=/usr/bin/node /opt/robinhood-predict/scripts/share-preview-server.mjs
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Proxy only the share routes to the service, before the SPA `location /`:

```nginx
location /share/ {
    proxy_pass http://127.0.0.1:8790;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 3s;
    proxy_read_timeout 15s;
}
```

Verify the service and all three metadata variants before publishing the
frontend button:

```bash
curl -fsS http://127.0.0.1:8790/health
curl -fsS http://127.0.0.1:8790/share/market/0 | grep 'og:title'
curl -fsS http://127.0.0.1:8790/share/race/0 | grep 'og:title'
curl -fsS http://127.0.0.1:8790/share/arena/0 | grep 'og:title'
```

Use real existing IDs for the final three checks. Telegram, X, and Discord may
cache an old preview; changing the path or using their official card debugger
forces a new scrape.
