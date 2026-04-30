/**
 * SBCaptcha — universal SimplyBook.me captcha widget.
 *
 * Accepts pre-fetched challenge data and renders the correct provider widget.
 * Works as an AMD module, CommonJS module, or browser global (UMD).
 *
 * Usage:
 *   fetch('/v2/captcha/challenge')
 *     .then(r => r.json())
 *     .then(function(data) {
 *       var w = new SBCaptcha({ container: el, challenge: data, onToken: fn });
 *       w.getToken().then(function(token) { submitForm(token); });
 *     });
 *
 * The challenge object must include:
 *   provider   — 'fcaptcha' | 'altcha' | 'recaptcha' | 'imagecaptcha'
 *   assets     — { js: [...], css: [...] }
 *   verifyUrl  — (fcaptcha only) where FCaptcha POSTs PoW solutions
 *   challengeUrl — (fcaptcha only) where FCaptcha fetches sub-challenges
 *   imageUrl   — (imagecaptcha only) PNG image src
 *   site_key   — (recaptcha only) public site key
 *   algorithm, challenge, maxnumber, salt, signature — (altcha only)
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.SBCaptcha = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function SBCaptcha(opts) {
        this._container = _resolveEl(opts.container);
        this._onToken   = opts.onToken || function () {};
        this._assetBase = (opts.assetBase !== undefined) ? opts.assetBase : null;
        this._provider  = null;
        this._token     = null;
        this._captchaInput    = null;
        this._challengeToken  = null;
        this._ready           = false;
        this._pendingResolve  = null;

        if (opts.challenge) {
            this._start(opts.challenge);
        }
    }

    SBCaptcha.prototype.setChallenge = function (data) {
        this._start(data);
        return this;
    };

    SBCaptcha.prototype.getToken = function () {
        var self = this;
        return new Promise(function (resolve) {
            if (!self._ready) { resolve(null); return; }
            if (self._provider === 'imagecaptcha') {
                var val = self._captchaInput ? self._captchaInput.value.trim() : '';
                if (!val) { resolve(null); return; }
                resolve(self._challengeToken ? val + '|' + self._challengeToken : val);
                return;
            }
            if (self._token) { resolve(self._token); return; }
            self._pendingResolve = resolve;
        });
    };

    SBCaptcha.prototype.reset = function () {
        this._token = null;
        this._captchaInput = null;
        this._ready = false;
        this._pendingResolve = null;
        if (this._container) { this._container.innerHTML = ''; }
    };

    SBCaptcha.prototype._start = function (data) {
        var self = this;
        self._provider     = data.provider;
        self._restoreFetch = null;

        // For fcaptcha: intercept fetch BEFORE loading the library.
        // - Challenge URL → return pre-fetched challenge data; no actual HTTP request, no auth needed.
        // - Verify URL   → inject auth headers (X-Company-Login / X-Token).
        if (data.provider === 'fcaptcha') {
            self._restoreFetch = _interceptFcaptchaFetch(data);
        }

        self._loadAssets(data.assets || { js: [], css: [] }).then(function () {
            self._render(data);
            self._ready = true;
        });
    };

    SBCaptcha.prototype._loadAssets = function (assets) {
        var assetBase = this._assetBase;

        function resolveAssetUrl(url) {
            if (assetBase === null) { return url; }
            var filename = url.split('/').pop().split('?')[0];
            return assetBase + filename;
        }

        (assets.css || []).forEach(function (href) {
            href = resolveAssetUrl(href);
            if (document.querySelector('link[href="' + href + '"]')) { return; }
            var link = document.createElement('link');
            link.rel  = 'stylesheet';
            link.href = href;
            document.head.appendChild(link);
        });

        var queue = (assets.js || []).map(resolveAssetUrl);
        return new Promise(function (resolve) {
            var next = function () {
                if (!queue.length) { resolve(); return; }
                var src = queue.shift();
                if (document.querySelector('script[src="' + src + '"]')) { next(); return; }
                var s    = document.createElement('script');
                s.src    = src;
                if (/altcha/.test(src)) { s.type = 'module'; }
                s.onload  = next;
                s.onerror = next;
                document.head.appendChild(s);
            };
            next();
        });
    };

    SBCaptcha.prototype._render = function (data) {
        var self = this;
        var el   = self._container;
        if (!el || !data.provider) { return; }

        _injectBrandingStyle();

        if (data.provider === 'fcaptcha' && window.FCaptcha) {
            window.FCaptcha.configure({
                challengeUrl: data.challengeUrl,
                verifyUrl:    data.verifyUrl,
            });
            window.FCaptcha.render(el, {
                callback: function (token) {
                    if (self._restoreFetch) { self._restoreFetch(); self._restoreFetch = null; }
                    self._resolve(token);
                },
            });

        } else if (data.provider === 'altcha') {
            var widget = document.createElement('altcha-widget');
            widget.setAttribute('challengejson', JSON.stringify(data));
            el.appendChild(widget);
            widget.addEventListener('statechange', function (e) {
                if (e.detail && e.detail.state === 'verified') {
                    self._resolve(e.detail.payload);
                }
            });

        } else if (data.provider === 'imagecaptcha' && data.imageUrl) {
            var wrapper           = document.createElement('div');
            wrapper.style.cssText = 'display:inline-block;border:1px solid #d0d5dd;border-radius:8px;padding:10px 12px;background:#f8f9fa;text-align:center;';
            var img           = document.createElement('img');
            img.src           = data.imageUrl;
            img.style.cssText = 'display:block;border-radius:4px;margin:0 auto 8px;';
            var input             = document.createElement('input');
            input.type            = 'text';
            input.autocomplete    = 'off';
            input.placeholder     = '· · · · · ·';
            input.style.cssText   = 'display:block;width:100%;box-sizing:border-box;border:1px solid #d0d5dd;border-radius:6px;padding:6px 10px;font-size:15px;letter-spacing:3px;text-align:center;background:#fff;outline:none;';
            wrapper.appendChild(img);
            wrapper.appendChild(input);
            el.appendChild(wrapper);
            self._captchaInput = input;
            self._challengeToken = data.challengeToken || null;

        } else if (data.provider === 'recaptcha' && window.grecaptcha) {
            window.grecaptcha.render(el, {
                sitekey:  data.site_key,
                callback: function (token) { self._resolve(token); },
            });

        } else if (data.provider === 'recaptchav3') {
            // Invisible — execute immediately after grecaptcha is ready, resolve with token.
            // Token is valid for 2 min which covers normal form-fill time.
            var siteKey = data.site_key;
            window.grecaptcha.ready(function () {
                window.grecaptcha.execute(siteKey, { action: 'booking' }).then(function (token) {
                    self._resolve(token);
                });
            });

        } else if (data.provider === 'turnstile' && window.turnstile) {
            window.turnstile.render(el, {
                sitekey:  data.site_key,
                callback: function (token) { self._resolve(token); },
            });
        }
    };

    SBCaptcha.prototype._resolve = function (token) {
        this._token = token;
        this._onToken(token);
        if (this._pendingResolve) {
            this._pendingResolve(token);
            this._pendingResolve = null;
        }
    };

    function _resolveEl(el) {
        if (!el) { return null; }
        return typeof el === 'string' ? document.querySelector(el) : el;
    }

    /**
     * Intercepts window.fetch for FCaptcha requests before fcaptcha.min.js is loaded:
     *   - Challenge URL → returns pre-fetched server challenge as a mock Response (no HTTP request).
     *   - Verify URL   → injects auth headers (X-Company-Login / X-Token).
     * Returns a restore function to call after the token is received.
     */
    function _interceptFcaptchaFetch(data) {
        if (typeof window.fetch !== 'function') { return function () {}; }

        var challengePrefix  = data.challengeUrl  || '';
        var verifyPrefix     = data.verifyUrl      || '';
        var verifyHeaders    = data.verifyHeaders  || {};
        var challengePayload = JSON.stringify({
            challengeId: data.challengeId,
            prefix:      data.prefix,
            difficulty:  data.difficulty,
            expiresAt:   data.expiresAt,
        });

        var orig = window.fetch;
        window.fetch = function (url, opts) {
            if (typeof url === 'string') {
                if (challengePrefix && url.indexOf(challengePrefix) === 0) {
                    // Return pre-fetched challenge — FCaptcha gets server challenge without any HTTP call.
                    return Promise.resolve(new Response(challengePayload, {
                        status:  200,
                        headers: { 'Content-Type': 'application/json' },
                    }));
                }
                if (verifyPrefix && url.indexOf(verifyPrefix) === 0) {
                    opts = Object.assign({}, opts);
                    opts.headers = Object.assign({}, opts.headers || {}, verifyHeaders);
                    return orig.call(window, url, opts);
                }
            }
            return orig.apply(window, arguments);
        };
        return function () { window.fetch = orig; };
    }

    function _injectBrandingStyle() {
        if (document.getElementById('sb-captcha-style')) { return; }
        var s = document.createElement('style');
        s.id  = 'sb-captcha-style';
        s.textContent = '.fcaptcha-branding{display:none !important}';
        document.head.appendChild(s);
    }

    return SBCaptcha;
}));
