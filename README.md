# NetSpeed

Browser-based network speed test toolkit supporting **Cloudflare** (HTTP) and **Ookla/Speedtest.net** (WebSocket) providers.

## Usage

```bash
npm install
npm run dev
```

## Providers

| Provider | Method | Server Discovery |
|---|---|---|
| **Cloudflare** | HTTP fetch (`__down`/`__up` via CORS) | Single global endpoint |
| **Ookla** | WebSocket protocol (`ws://host:8080/ws`) | 100+ ISPs from GitHub, 30 embedded fallback |

## Features

- Multi-provider architecture with unified interface
- Parallel stream download/upload tests
- Ping + jitter + packet loss measurement
- Connection diagnostics (IP, ISP, ASN, location, browser, network info)
- Adjustable test duration, streams, chunk sizes
- Smooth animated gauge (NumberFlow) + speed graph
- Dark/light theme
- Server search

## Deployment

Deploys as a static site. Currently hosted on Surge.sh.
