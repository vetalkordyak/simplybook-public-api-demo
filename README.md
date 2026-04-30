# SimplyBook.me JSON-RPC API Booking Demo

An interactive demo page that walks through the full booking flow using the [SimplyBook.me](https://simplybook.me) public **JSON-RPC v1 API** (`user-api.simplybook.me`).

## Features

- Connect to any SimplyBook.me company using a public API key
- Browse services and providers
- Pick an available date and time slot (next 30 days)
- Fill in client details
- Captcha support (FCaptcha, Altcha, reCAPTCHA, Turnstile, ImageCaptcha)
- Display booking confirmation

## Files

| File | Description |
|------|-------------|
| `index.html` | Main demo page (Bootstrap 5) |
| `app.js` | Booking flow logic |
| `app.css` | Custom styles |
| `json-rpc-client.js` | JSON-RPC client (patched to pass errors to callbacks) |
| `serve-https.py` | Local HTTPS server (Python) |
| `localhost.pem` | Self-signed TLS certificate (mkcert, localhost only) |
| `localhost-key.pem` | Private key for the certificate |

## Running locally

```bash
python3 serve-https.py
```

Open **https://localhost:8443** in your browser.

> The certificate is issued for `localhost` via [mkcert](https://github.com/FiloSottile/mkcert).
> Run `mkcert -install` once to trust it system-wide, or click **Advanced → Proceed** in the browser.

## Generating a new certificate

```bash
mkcert -install
mkcert localhost
```

## API credentials

1. Log in to your SimplyBook.me account
2. Go to **Settings → Integrations → API**
3. Copy the **Public API key**
4. Enter your company login and the key in the demo form
