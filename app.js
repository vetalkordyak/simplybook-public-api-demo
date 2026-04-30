$(function () {
    'use strict';

    var LS_KEY = 'sb_demo_credentials';
    // ─── localStorage ────────────────────────────────────────────────────────

    function saveCredentials() {
        localStorage.setItem(LS_KEY, JSON.stringify({
            apiUrl:  $('#inp-apiurl').val().trim(),
            company: $('#inp-company').val().trim(),
            apiKey:  $('#inp-apikey').val().trim(),
        }));
    }

    function restoreCredentials() {
        try {
            var saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
            if (saved.apiUrl)  { $('#inp-apiurl').val(saved.apiUrl); }
            if (saved.company) { $('#inp-company').val(saved.company); }
            if (saved.apiKey)  { $('#inp-apikey').val(saved.apiKey); }
        } catch (e) {}
    }

    restoreCredentials();
    $('#inp-apiurl, #inp-company, #inp-apikey').on('input', saveCredentials);

    var s = {
        company:       '',
        token:         '',
        apiClient:     null,
        serviceId:     null,
        unitId:        null,
        date:          null,
        time:          null,
        timeMatrix:    null,
        captchaWidget:  null,
        captchaToken:   null,
        assetBlobUrls:  null,
    };

    // ─── API log ─────────────────────────────────────────────────────────────

    function logApi(label, data) {
        var $entry = $('<div class="log-entry">').html(
            '<span class="log-label">' + $('<span>').text(label).html() + '</span>' +
            '<pre>' + $('<span>').text(JSON.stringify(data, null, 2)).html() + '</pre>'
        );
        $('#log-content').prepend($entry);
    }

    // ─── Alert ───────────────────────────────────────────────────────────────

    function showAlert(msg, type) {
        var $alert = $('<div class="alert alert-dismissible fade show small">')
            .addClass('alert-' + (type || 'danger'))
            .html(msg + '<button type="button" class="btn-close" data-bs-dismiss="alert"></button>');
        $('#alert-area').html($alert);
        setTimeout(function () {
            $alert.alert('close');
        }, 5000);
    }

    // ─── Step navigation ─────────────────────────────────────────────────────

    function showCard(id) {
        $('.demo-card').removeClass('active');
        $('#card-' + id).addClass('active');
        var top = $('#card-' + id).offset().top - 20;
        $('html, body').animate({ scrollTop: top }, 250);
    }

    // ─── CORS proxy helpers ───────────────────────────────────────────────────

    var CORS_PROXIES = [
        function (u) { return 'https://corsproxy.io/?url=' + u; },
        function (u) { return 'https://test.cors.workers.dev/?' + u; },
        function (u) { return 'https://api.allorigins.win/raw?url=' + u; },
function (u) { return 'https://api.cors.lol/?url=' + u; },
    ];

    function shuffleArray(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    // Fetch url via CORS proxies in random order, return as blob: URL with JS MIME type.
    // Blob URL bypasses strict module MIME checking regardless of proxy Content-Type.
    // onSuccess(blobUrl), onFail(msg)
    function fetchAsJsBlob(url, onSuccess, onFail) {
        var proxies = shuffleArray(CORS_PROXIES);
        var idx = 0;

        function tryNext() {
            if (idx >= proxies.length) { onFail('All proxies failed for: ' + url); return; }
            var proxied = proxies[idx++](url);
            fetch(proxied, { mode: 'cors', cache: 'no-store' })
                .then(function (r) {
                    if (!r.ok) { tryNext(); return null; }
                    return r.text();
                })
                .then(function (code) {
                    if (code === null || code === undefined) { return; }
                    var blob = new Blob([code], { type: 'application/javascript' });
                    onSuccess(URL.createObjectURL(blob));
                })
                .catch(tryNext);
        }

        tryNext();
    }

    // Fetch all urls as JS blobs sequentially, call onDone([blobUrls]) when all done.
    function fetchAllAsJsBlobs(urls, onDone, onFail) {
        var blobUrls = [];
        var remaining = urls.slice();

        function next() {
            if (!remaining.length) { onDone(blobUrls); return; }
            var url = remaining.shift();
            fetchAsJsBlob(url, function (blobUrl) {
                blobUrls.push(blobUrl);
                next();
            }, onFail);
        }

        next();
    }

    // ─── Step 1: Connect ─────────────────────────────────────────────────────

    $('#btn-connect').on('click', function () {
        var baseUrl = ($('#inp-apiurl').val().trim() || $('#inp-apiurl').attr('placeholder')).replace(/\/$/, '');
        var company = $('#inp-company').val().trim();
        var apiKey  = $('#inp-apikey').val().trim();
        if (!baseUrl || !company || !apiKey) { showAlert('Fill in all fields.'); return; }

        var $btn = $(this).prop('disabled', true)
            .html('<span class="spinner-border spinner-border-sm me-1"></span>Connecting…');

        var loginClient = new JSONRpcClient({ url: baseUrl + '/login/' });

        loginClient.getToken(company, apiKey, function (token, error) {
            if (error) {
                showAlert('Auth error: ' + error.message);
                $btn.prop('disabled', false).text('Connect');
                return;
            }
            if (!token) {
                showAlert('Authentication failed. Check your credentials.');
                $btn.prop('disabled', false).text('Connect');
                return;
            }

            logApi('getToken → token (first 30 chars)', token.substr(0, 30) + '…');

            s.company = company;
            s.token   = token;

            s.apiClient = new JSONRpcClient({
                url:     baseUrl + '/',
                headers: {
                    'X-Company-Login': company,
                    'X-Token':         token,
                },
            });

            loadServices();
        });
    });

    // ─── Step 2: Services ────────────────────────────────────────────────────

    function loadServices() {
        showCard('service');

        s.apiClient.getEventList(function (events) {
            logApi('getEventList', events);

            var $sel = $('#sel-service').empty()
                .append('<option value="">— Select a service —</option>');

            $.each(events, function (id, ev) {
                $sel.append($('<option>', { value: id, text: ev.name }));
            });

            $('#btn-service').prop('disabled', false);
        });
    }

    $('#btn-service').on('click', function () {
        var id = $('#sel-service').val();
        if (!id) { showAlert('Please select a service.'); return; }
        s.serviceId = id;
        loadProviders();
    });

    // ─── Step 3: Providers ───────────────────────────────────────────────────

    function loadProviders() {
        showCard('provider');

        s.apiClient.getUnitList(function (units) {
            logApi('getUnitList', units);

            var $sel = $('#sel-provider').empty()
                .append('<option value="">— Select a provider —</option>')
                .append('<option value="0">Any available</option>');

            $.each(units, function (id, u) {
                $sel.append($('<option>', { value: id, text: u.name }));
            });

            $('#btn-provider').prop('disabled', false);
        });
    }

    $('#btn-provider').on('click', function () {
        var val = $('#sel-provider').val();
        if (val === '') { showAlert('Please select a provider.'); return; }
        s.unitId = val === '0' ? -1 : val;
        loadCalendar();
    });

    // ─── Step 4: Date ────────────────────────────────────────────────────────

    function loadCalendar() {
        showCard('datetime');
        s.date = null;
        s.time = null;
        $('#time-section').hide();
        $('#btn-datetime').prop('disabled', true);
        $('#sel-date').empty().append('<option>Loading…</option>');

        var now    = new Date();
        var end    = new Date(now);
        end.setDate(end.getDate() + 30);
        var today  = now.toISOString().slice(0, 10);
        var dateTo = end.toISOString().slice(0, 10);

        s.apiClient.getStartTimeMatrix(
            today, dateTo,
            s.serviceId, s.unitId === -1 ? null : s.unitId,
            1,
            function (matrix) {
                logApi('getStartTimeMatrix (dates)', Object.keys(matrix));

                var $sel = $('#sel-date').empty()
                    .append('<option value="">— Select a date —</option>');
                var count = 0;

                s.timeMatrix = matrix;

                $.each(matrix, function (date, slots) {
                    if (slots && slots.length) {
                        $sel.append($('<option>', { value: date, text: date }));
                        count++;
                    }
                });

                if (!count) {
                    $sel.append('<option disabled>No available dates in the next 30 days</option>');
                }
            }
        );
    }

    $('#sel-date').on('change', function () {
        var date = $(this).val();
        $('#time-section').hide();
        $('#btn-datetime').prop('disabled', true);
        s.time = null;
        if (!date) return;
        s.date = date;
        loadTimeSlots(date);
    });

    // ─── Step 4: Time slots ──────────────────────────────────────────────────

    function loadTimeSlots(date) {
        $('#time-section').show();
        $('#time-slots').html('<span class="text-muted small">Loading…</span>');

        s.apiClient.getStartTimeMatrix(
            date, date,
            s.serviceId, s.unitId === -1 ? null : s.unitId,
            1,
            function (matrix) {
                logApi('getStartTimeMatrix [' + date + ']', matrix);

                var slots = matrix[date] || [];
                var $wrap = $('#time-slots').empty();

                if (!slots.length) {
                    $wrap.html('<span class="text-muted small">No slots available for this date.</span>');
                    return;
                }

                $.each(slots, function (i, time) {
                    $('<button class="btn btn-outline-secondary btn-sm time-btn">')
                        .text(time.substr(0, 5))
                        .attr('data-time', time)
                        .appendTo($wrap);
                });
            }
        );
    }

    $('#time-slots').on('click', '.time-btn', function () {
        $('.time-btn').removeClass('active btn-primary').addClass('btn-outline-secondary');
        $(this).addClass('active btn-primary').removeClass('btn-outline-secondary');
        s.time = $(this).data('time');
        $('#btn-datetime').prop('disabled', false);
    });

    $('#btn-datetime').on('click', function () {
        if (!s.date || !s.time) { showAlert('Select a date and time.'); return; }
        loadDetailsAndCaptcha();
    });

    // ─── Step 5: Details + Captcha ───────────────────────────────────────────

    function loadDetailsAndCaptcha() {
        showCard('details');
        s.captchaToken  = null;
        s.captchaWidget = null;

        var serviceName  = $('#sel-service option:selected').text();
        var providerName = $('#sel-provider option:selected').text();
        $('#summary-text').html(
            '<strong>' + serviceName + '</strong> with <strong>' + providerName + '</strong><br>' +
            s.date + ' at ' + s.time.substr(0, 5)
        );
        $('#booking-summary').show();

        $('#captcha-container').empty();
        $('#captcha-wrap').hide();

        s.apiClient.getCaptchaChallenge(function (challenge) {
            if (!challenge || !challenge.provider) {
                logApi('getCaptchaChallenge', { provider: null, note: 'captcha disabled' });
                return;
            }

            // Strip first subdomain: https://user-api.simplybook.me → https://simplybook.me
            var apiBase     = $('#inp-apiurl').val().trim().replace(/\/$/, '');
            var companyBase = apiBase.replace(/^(https?:\/\/)[^.]+\./, '$1');

            // Collect absolute asset URLs (proxy applied later via findCorsProxy)
            var assetUrls = [];
            if (challenge.assets && challenge.assets.js) {
                assetUrls = challenge.assets.js.map(function (url) {
                    return url.charAt(0) === '/' ? companyBase + url : url;
                });
            }

            // widgetUrl may be missing in JSON-RPC v1 response — construct it
            var widgetUrl = challenge.widgetUrl || (companyBase + '/v2/js/lib/captcha/captcha-widget.js');

            logApi('getCaptchaChallenge', { provider: challenge.provider, widgetUrl: widgetUrl });

            function initCaptchaWidget() {
                $('#captcha-wrap').show();
                s.captchaWidget = new SBCaptcha({
                    container: document.getElementById('captcha-container'),
                    challenge:  challenge,
                    onToken:    function (token) {
                        s.captchaToken = token;
                        logApi('captcha onToken', token.substr(0, 40) + '…');
                    },
                });
            }

            function loadWidget() {
                if (typeof SBCaptcha !== 'undefined') {
                    initCaptchaWidget();
                } else {
                    var script = document.createElement('script');
                    script.src = widgetUrl;
                    script.onload = initCaptchaWidget;
                    script.onerror = function () {
                        showAlert('Failed to load captcha widget from: ' + widgetUrl);
                    };
                    document.head.appendChild(script);
                }
            }

            if (assetUrls.length) {
                fetchAllAsJsBlobs(assetUrls, function (blobUrls) {
                    s.assetBlobUrls = blobUrls;
                    challenge.assets = { js: blobUrls };
                    logApi('assets as blobs', blobUrls.length);
                    loadWidget();
                }, function (err) {
                    logApi('asset fetch failed', { err: err });
                    challenge.assets = { js: assetUrls };
                    loadWidget();
                });
            } else {
                loadWidget();
            }
        });
    }

    // ─── Book ────────────────────────────────────────────────────────────────

    $('#btn-book').on('click', function () {
        var name  = $('#inp-name').val().trim();
        var email = $('#inp-email').val().trim();
        var phone = $('#inp-phone').val().trim();

        if (!name || !email) { showAlert('Name and email are required.'); return; }

        var clientData = { name: name, email: email };
        if (phone) { clientData.phone = phone; }

        var finalize = function (captchaToken) {
            var additional = captchaToken ? { captcha_token: captchaToken } : {};

            $('#btn-book').prop('disabled', true)
                .html('<span class="spinner-border spinner-border-sm me-1"></span>Booking…');

            function doBook(unitId) {
                logApi('book request', {
                    serviceId: s.serviceId, unitId: unitId,
                    date: s.date, time: s.time,
                    client: clientData,
                    additional: additional,
                });

                s.apiClient.book(
                    s.serviceId,
                    unitId,
                    s.date,
                    s.time,
                    clientData,
                    additional,
                    1,    // qty
                    null, // batchId
                    function (result, error) {
                        if (error || !result || result.error) {
                            var msg = (error && error.message)
                                || (result && result.error && result.error.message)
                                || 'Booking failed.';
                            showAlert(msg);
                            $('#btn-book').prop('disabled', false).text('Book Now');
                            refreshCaptcha();
                            return;
                        }

                        logApi('book result', result);
                        showResult(result);
                    }
                );
            }

            if (s.unitId === -1) {
                // "Any available" — find first provider free at selected time
                s.apiClient.getCartesianStartTimeMatrix(
                    s.date, s.date, s.serviceId, null, 1,
                    function (matrix) {
                        var pickedUnitId = null;
                        $.each(matrix || [], function (i, item) {
                            var slots = (item.timeslots && item.timeslots[s.date]) || [];
                            if (slots.indexOf(s.time) !== -1) {
                                pickedUnitId = item.provider_id;
                                return false; // break
                            }
                        });
                        if (!pickedUnitId) {
                            showAlert('No available provider for the selected time.');
                            $('#btn-book').prop('disabled', false).text('Book Now');
                            return;
                        }
                        logApi('auto-selected provider', pickedUnitId);
                        doBook(pickedUnitId);
                    }
                );
            } else {
                doBook(s.unitId);
            }
        };

        // imagecaptcha: token must be read manually via getToken()
        // all other providers: token already in s.captchaToken via onToken callback
        if (s.captchaWidget) {
            s.captchaWidget.getToken().then(function (token) {
                finalize(token || s.captchaToken);
            });
        } else {
            finalize(s.captchaToken);
        }
    });

    function refreshCaptcha() {
        if (!s.captchaWidget) { return; }
        s.captchaWidget.reset();
        s.captchaToken = null;

        s.apiClient.getCaptchaChallenge(function (challenge) {
            if (challenge && challenge.provider) {
                if (s.assetBlobUrls && s.assetBlobUrls.length) {
                    challenge.assets = { js: s.assetBlobUrls };
                }
                s.captchaWidget.setChallenge(challenge);
            }
        });
    }

    // ─── Result ──────────────────────────────────────────────────────────────

    function showResult(result) {
        showCard('result');
        var booking = (result.bookings && result.bookings[0]) ? result.bookings[0] : result;
        var serviceName  = $('#sel-service option:selected').text();
        var providerName = $('#sel-provider option:selected').text();
        $('#result-content').html(
            '<table class="table table-sm table-borderless mb-0 result-box">' +
            '<tr><td>Booking ID</td><td><strong>#' + booking.id + '</strong></td></tr>' +
            '<tr><td>Start</td><td>' + booking.start_date_time + '</td></tr>' +
            '<tr><td>End</td><td>' + booking.end_date_time + '</td></tr>' +
            '<tr><td>Service</td><td>' + serviceName + '</td></tr>' +
            '<tr><td>Provider</td><td>' + providerName + '</td></tr>' +
            (booking.code ? '<tr><td>Code</td><td><code>' + booking.code + '</code></td></tr>' : '') +
            '</table>'
        );
    }

});
