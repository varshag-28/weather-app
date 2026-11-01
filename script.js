/* SkyCast – interactive weather app
   Data: Open-Meteo (free, no API key). Geocoding + forecast are called directly from the browser. */

const $ = (id) => document.getElementById(id);

const state = {
    unit: "celsius",      // "celsius" | "fahrenheit"
    place: null,          // { name, region, lat, lon }
    data: null,           // last forecast response
    selectedDay: null     // null = next 24 hours, otherwise day index 0-6
};

// ---------- weather codes (WMO) ----------
const WMO = {
    0: ["Clear sky", "☀️", "🌙"], 1: ["Mainly clear", "🌤️", "🌙"], 2: ["Partly cloudy", "⛅", "☁️"], 3: ["Overcast", "☁️"],
    45: ["Fog", "🌫️"], 48: ["Rime fog", "🌫️"],
    51: ["Light drizzle", "🌦️"], 53: ["Drizzle", "🌦️"], 55: ["Heavy drizzle", "🌧️"],
    56: ["Freezing drizzle", "🌧️"], 57: ["Freezing drizzle", "🌧️"],
    61: ["Light rain", "🌦️"], 63: ["Rain", "🌧️"], 65: ["Heavy rain", "🌧️"],
    66: ["Freezing rain", "🌧️"], 67: ["Freezing rain", "🌧️"],
    71: ["Light snow", "🌨️"], 73: ["Snow", "❄️"], 75: ["Heavy snow", "❄️"], 77: ["Snow grains", "❄️"],
    80: ["Light showers", "🌦️"], 81: ["Showers", "🌧️"], 82: ["Violent showers", "⛈️"],
    85: ["Snow showers", "🌨️"], 86: ["Heavy snow showers", "🌨️"],
    95: ["Thunderstorm", "⛈️"], 96: ["Thunderstorm with hail", "⛈️"], 99: ["Severe thunderstorm", "⛈️"]
};

function describe(code, isDay = true) {
    const e = WMO[code] || ["Unknown", "🌡️"];
    return { text: e[0], icon: (!isDay && e[2]) ? e[2] : e[1] };
}

function themeFor(code, isDay) {
    if (code >= 95) return "storm";
    if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
    if (!isDay) return "night";
    if (code === 45 || code === 48) return "fog";
    if (code === 2 || code === 3) return "cloudy";
    return "clear";
}

// ---------- small helpers ----------
function unitSymbols() {
    return state.unit === "celsius" ? { temp: "°C", wind: "km/h" } : { temp: "°F", wind: "mph" };
}

function fmtTemp(v) { return Math.round(v) + "°"; }

function fmtHour(iso) {              // "2026-10-31T14:00" -> "2 PM"
    const h = parseInt(iso.slice(11, 13), 10);
    const suffix = h >= 12 ? "PM" : "AM";
    return ((h % 12) || 12) + " " + suffix;
}

function fmtClock(iso) {             // "2026-10-31T06:02" -> "6:02 AM"
    const h = parseInt(iso.slice(11, 13), 10);
    const m = iso.slice(14, 16);
    return ((h % 12) || 12) + ":" + m + " " + (h >= 12 ? "PM" : "AM");
}

function dayName(dateStr, index) {
    if (index === 0) return "Today";
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short" });
}

function compass(deg) {
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return dirs[Math.round(deg / 45) % 8];
}

function showMessage(text) {
    const box = $("message");
    box.textContent = text;
    box.hidden = !text;
}

function setBusy(busy) {
    $("content").setAttribute("aria-busy", busy ? "true" : "false");
}

function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
}

// ---------- recent searches (localStorage may be unavailable, so always guarded) ----------
function loadRecents() {
    try { return JSON.parse(localStorage.getItem("skycast.recents") || "[]"); } catch (e) { return []; }
}

function saveRecent(place) {
    if (place.name === "My location") return;
    try {
        const list = loadRecents().filter(p => !(p.name === place.name && p.region === place.region));
        list.unshift(place);
        localStorage.setItem("skycast.recents", JSON.stringify(list.slice(0, 5)));
    } catch (e) { /* ignore */ }
    renderRecents();
}

function renderRecents() {
    const box = $("recents");
    box.textContent = "";
    loadRecents().forEach(p => {
        const chip = el("button", "chip", p.name);
        chip.type = "button";
        chip.addEventListener("click", () => selectPlace(p));
        box.appendChild(chip);
    });
}

// ---------- data fetching ----------
async function searchCities(query) {
    const url = "https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(query) +
                "&count=5&language=en&format=json";
    const res = await fetch(url);
    if (!res.ok) throw new Error("Search failed");
    const json = await res.json();
    return (json.results || []).map(r => ({
        name: r.name,
        region: [r.admin1, r.country].filter(Boolean).join(", "),
        lat: r.latitude,
        lon: r.longitude
    }));
}

async function fetchForecast(place) {
    const units = state.unit === "celsius"
        ? "&temperature_unit=celsius&wind_speed_unit=kmh"
        : "&temperature_unit=fahrenheit&wind_speed_unit=mph";
    const url = "https://api.open-meteo.com/v1/forecast?latitude=" + place.lat + "&longitude=" + place.lon +
        "&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m" +
        "&hourly=temperature_2m,precipitation_probability,weather_code" +
        "&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max" +
        "&timezone=auto&forecast_days=7" + units;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Could not load the forecast");
    return res.json();
}

async function selectPlace(place) {
    state.place = place;
    state.selectedDay = null;
    $("searchInput").value = "";
    hideSuggestions();
    await refresh();
}

async function refresh() {
    if (!state.place) return;
    setBusy(true);
    showMessage("");
    try {
        state.data = await fetchForecast(state.place);
        render();
        saveRecent(state.place);
    } catch (err) {
        showMessage("Sorry, I couldn't load the weather. Check your internet connection and try again.");
    } finally {
        setBusy(false);
    }
}

// ---------- rendering ----------
function render() {
    renderHero();
    renderFx();
    renderBuddy();
    renderDetails();
    renderChart();
    renderDaily();
}

function renderHero() {
    const d = state.data, c = d.current, u = unitSymbols();
    const info = describe(c.weather_code, c.is_day === 1);
    document.body.dataset.theme = themeFor(c.weather_code, c.is_day === 1);

    $("placeName").textContent = state.place.name + (state.place.region ? ", " + state.place.region : "");
    $("localTime").textContent = "Local time: " + fmtClock(c.time) + " · " +
        new Date(c.time.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    $("heroIcon").innerHTML = mascotSVG(themeFor(c.weather_code, c.is_day === 1));
    $("heroTemp").textContent = Math.round(c.temperature_2m);
    $("heroUnit").textContent = u.temp;
    $("heroDesc").textContent = info.text;
    $("heroFeels").textContent = "Feels like " + fmtTemp(c.apparent_temperature);
    $("heroRange").textContent = "High " + fmtTemp(d.daily.temperature_2m_max[0]) +
        "  ·  Low " + fmtTemp(d.daily.temperature_2m_min[0]);
}

function renderDetails() {
    const d = state.data, c = d.current, u = unitSymbols();
    $("dHumidity").textContent = c.relative_humidity_2m + "%";
    $("dWind").textContent = Math.round(c.wind_speed_10m) + " " + u.wind + " " + compass(c.wind_direction_10m);
    $("dRain").textContent = (d.daily.precipitation_probability_max[0] ?? "--") + "%";
    $("dUv").textContent = d.daily.uv_index_max[0] != null ? d.daily.uv_index_max[0].toFixed(1) : "--";
    $("dSunrise").textContent = fmtClock(d.daily.sunrise[0]);
    $("dSunset").textContent = fmtClock(d.daily.sunset[0]);
    $("dPressure").textContent = Math.round(c.surface_pressure) + " hPa";
    $("dPrecip").textContent = c.precipitation + " mm";
}

function renderDaily() {
    const d = state.data.daily;
    const box = $("daily");
    box.textContent = "";
    d.time.forEach((date, i) => {
        const info = describe(d.weather_code[i], true);
        const btn = el("button", "day");
        btn.type = "button";
        btn.setAttribute("aria-pressed", state.selectedDay === i ? "true" : "false");
        btn.append(
            el("span", "d-name", dayName(date, i)),
            el("span", "d-ico", info.icon),
            el("span", "d-hi", fmtTemp(d.temperature_2m_max[i])),
            el("span", "d-lo", fmtTemp(d.temperature_2m_min[i])),
            el("span", "d-pop", "💧 " + (d.precipitation_probability_max[i] ?? 0) + "%")
        );
        btn.addEventListener("click", () => {
            state.selectedDay = state.selectedDay === i ? null : i;
            renderChart();
            renderDaily();
        });
        box.appendChild(btn);
    });
}


// =====================================================
// Cute weather animations (all markup below is static, written by me – no user text inside)
// =====================================================
function faceSVG(x, y, mouth) {
    const m = mouth === "o"
        ? '<ellipse cx="0" cy="15" rx="5" ry="6" fill="#7a3b3b"/>'
        : '<path d="M-9 10 Q0 21 9 10" stroke="#3b2f2f" stroke-width="3" fill="none" stroke-linecap="round"/>';
    return '<g transform="translate(' + x + ' ' + y + ')">' +
        '<ellipse class="eye" cx="-17" cy="0" rx="5" ry="6.5" fill="#3b2f2f"/>' +
        '<ellipse class="eye" cx="17" cy="0" rx="5" ry="6.5" fill="#3b2f2f"/>' +
        '<circle cx="-28" cy="12" r="6" fill="#ff8fa3" opacity="0.7"/>' +
        '<circle cx="28" cy="12" r="6" fill="#ff8fa3" opacity="0.7"/>' + m + '</g>';
}

function cloudShape(fill, dy) {
    return '<g transform="translate(0 ' + dy + ')" fill="' + fill + '">' +
        '<circle cx="70" cy="110" r="32"/><circle cx="106" cy="84" r="42"/><circle cx="142" cy="110" r="30"/>' +
        '<rect x="40" y="104" width="130" height="38" rx="19"/></g>';
}

function mascotSVG(theme) {
    const open = '<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">';
    if (theme === "clear") {
        let rays = "";
        for (let i = 0; i < 12; i++) rays += '<rect x="96" y="8" width="8" height="26" rx="4" fill="#ffd43b" transform="rotate(' + (i * 30) + ' 100 100)"/>';
        return open + '<defs><radialGradient id="sunG" cx="40%" cy="35%"><stop offset="0" stop-color="#fff7a8"/><stop offset="1" stop-color="#ffbe0b"/></radialGradient></defs>' +
            '<g class="rays">' + rays + '</g><circle cx="100" cy="100" r="50" fill="url(#sunG)"/>' + faceSVG(100, 98) + '</svg>';
    }
    if (theme === "night") {
        return open + '<circle cx="100" cy="100" r="52" fill="#fff3c4"/><circle cx="130" cy="72" r="9" fill="#f1e2a3"/><circle cx="72" cy="130" r="7" fill="#f1e2a3"/>' +
            '<g transform="translate(100 98)"><path d="M-23 0 Q-17 7 -11 0" stroke="#3b2f2f" stroke-width="3" fill="none" stroke-linecap="round"/>' +
            '<path d="M11 0 Q17 7 23 0" stroke="#3b2f2f" stroke-width="3" fill="none" stroke-linecap="round"/>' +
            '<circle cx="-28" cy="12" r="6" fill="#ff8fa3" opacity="0.7"/><circle cx="28" cy="12" r="6" fill="#ff8fa3" opacity="0.7"/>' +
            '<path d="M-8 12 Q0 20 8 12" stroke="#3b2f2f" stroke-width="3" fill="none" stroke-linecap="round"/></g>' +
            '<text class="zzz" x="150" y="48" font-size="22" fill="#fff" font-weight="700">z</text>' +
            '<text class="zzz" x="166" y="30" font-size="15" fill="#fff" font-weight="700" style="animation-delay:.6s">z</text></svg>';
    }
    if (theme === "cloudy") {
        return open + cloudShape("#ffffff", 0) + faceSVG(106, 112) + '</svg>';
    }
    if (theme === "fog") {
        return open + cloudShape("#eef2f5", -14) + faceSVG(106, 98) +
            '<rect class="mist" x="46" y="150" width="108" height="9" rx="4.5" fill="#fff" opacity="0.85"/>' +
            '<rect class="mist" x="62" y="168" width="84" height="9" rx="4.5" fill="#fff" opacity="0.7" style="animation-delay:1s"/></svg>';
    }
    if (theme === "rain") {
        let drops = "";
        [70, 100, 130, 155].forEach((x, i) => {
            drops += '<g transform="translate(' + x + ' 140)"><g class="drop-g" style="animation-delay:' + (i * 0.35) + 's">' +
                '<path d="M0 0 Q7 11 0 18 Q-7 11 0 0" fill="#7cc4ff"/></g></g>';
        });
        return open + cloudShape("#d5dde8", -26) + faceSVG(106, 88) + drops + '</svg>';
    }
    if (theme === "snow") {
        let flakes = "";
        [70, 105, 140].forEach((x, i) => {
            flakes += '<g transform="translate(' + x + ' 138)"><g class="flake-g" style="animation-delay:' + (i * 0.6) + 's">' +
                '<circle r="6" fill="#fff"/><circle r="2" fill="#bfe3ff"/></g></g>';
        });
        return open + cloudShape("#e6eef7", -26) + faceSVG(106, 88) + flakes + '</svg>';
    }
    // storm
    return open + cloudShape("#8493a5", -26) + faceSVG(106, 88, "o") +
        '<polygon class="bolt" points="108,128 88,162 104,162 94,192 128,150 110,150 120,128" fill="#ffd43b" stroke="#fff3a0" stroke-width="2" stroke-linejoin="round"/></svg>';
}

function umbrellaSVG() {
    return '<svg viewBox="0 0 160 170" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M80 84 V132 q0 16 -15 16 q-13 0 -13 -13" stroke="#7a5238" stroke-width="7" fill="none" stroke-linecap="round"/>' +
        '<path d="M10 84 A70 70 0 0 1 150 84 Q133 70 115 84 Q98 70 80 84 Q62 70 45 84 Q27 70 10 84 Z" fill="#ff6b8b"/>' +
        '<path d="M80 14 Q45 30 45 84 Q62 70 80 84 Z" fill="#ff8fa8"/>' +
        '<path d="M80 14 Q115 30 115 84 Q98 70 80 84 Z" fill="#ff8fa8"/>' +
        '<circle cx="80" cy="12" r="5" fill="#7a5238"/>' +
        '<g transform="translate(80 56)"><ellipse class="eye" cx="-14" cy="0" rx="4" ry="5.5" fill="#3b2f2f"/><ellipse class="eye" cx="14" cy="0" rx="4" ry="5.5" fill="#3b2f2f"/>' +
        '<circle cx="-23" cy="9" r="5" fill="#fff" opacity="0.5"/><circle cx="23" cy="9" r="5" fill="#fff" opacity="0.5"/>' +
        '<path d="M-7 8 Q0 16 7 8" stroke="#3b2f2f" stroke-width="2.6" fill="none" stroke-linecap="round"/></g></svg>';
}

function plainCloudSVG() {
    return '<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg"><g fill="#fff">' +
        '<circle cx="70" cy="90" r="32"/><circle cx="106" cy="64" r="42"/><circle cx="142" cy="90" r="30"/>' +
        '<rect x="40" y="84" width="130" height="38" rx="19"/></g></svg>';
}

// Will it rain? Looks at the current condition and the next 12 hours.
function rainInfo() {
    const c = state.data.current, h = state.data.hourly;
    const code = c.weather_code;
    const rainingNow = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
    const nowKey = c.time.slice(0, 13);
    const start = Math.max(0, h.time.findIndex(t => t.slice(0, 13) === nowKey));
    let chance = 0;
    for (let i = start; i < Math.min(start + 12, h.time.length); i++) {
        chance = Math.max(chance, h.precipitation_probability[i] ?? 0);
    }
    return { rainingNow, chance };
}

function renderFx() {
    const fx = $("fx");
    fx.textContent = "";
    const c = state.data.current;
    const theme = themeFor(c.weather_code, c.is_day === 1);
    const { rainingNow, chance } = rainInfo();
    const rainy = rainingNow || chance >= 50;
    const small = window.innerWidth < 600;
    const rnd = (a, b) => a + Math.random() * (b - a);

    const add = (cls, style, html) => {
        const d = document.createElement("div");
        d.className = cls;
        Object.assign(d.style, style);
        if (html) d.innerHTML = html;
        fx.appendChild(d);
    };

    if (theme === "clear") add("fx-glow", {});

    const cloudCount = { clear: 2, cloudy: 5, fog: 4, rain: 4, storm: 5, night: 1, snow: 3 }[theme] || 2;
    for (let i = 0; i < cloudCount; i++) {
        const w = rnd(140, 260);
        add("fx-cloud", {
            top: rnd(2, 55) + "vh", width: w + "px",
            animationDuration: rnd(60, 110) + "s", animationDelay: "-" + rnd(0, 90) + "s"
        }, plainCloudSVG());
    }

    if (rainy) {
        let count = rainingNow ? (theme === "storm" ? 110 : 80) : 30;
        if (small) count = Math.round(count / 2);
        for (let i = 0; i < count; i++) {
            add("fx-drop", {
                left: rnd(0, 115) + "vw", opacity: rnd(0.4, 0.9),
                animationDuration: rnd(0.7, 1.3) + "s", animationDelay: "-" + rnd(0, 2) + "s"
            });
        }
    }

    if (theme === "snow") {
        const count = small ? 30 : 60;
        for (let i = 0; i < count; i++) {
            const size = rnd(4, 9);
            add("fx-flake", {
                left: rnd(0, 100) + "vw", width: size + "px", height: size + "px", opacity: rnd(0.6, 1),
                animationDuration: rnd(7, 14) + "s", animationDelay: "-" + rnd(0, 14) + "s"
            });
        }
    }

    if (theme === "night" || (!c.is_day && !rainy && theme !== "snow")) {
        const count = small ? 25 : 45;
        for (let i = 0; i < count; i++) {
            add("fx-star", {
                left: rnd(0, 100) + "vw", top: rnd(0, 65) + "vh",
                animationDelay: "-" + rnd(0, 3) + "s", animationDuration: rnd(1.8, 3.4) + "s"
            });
        }
    }

    if (theme === "storm") add("fx-flash", {});
}

// A friendly tip with an animated helper: umbrella for rain, scarf for snow, sunglasses for strong sun.
function renderBuddy() {
    const c = state.data.current;
    const theme = themeFor(c.weather_code, c.is_day === 1);
    const { rainingNow, chance } = rainInfo();
    const uv = state.data.daily.uv_index_max[0] || 0;
    const box = $("buddy"), art = $("buddyArt"), text = $("buddyText");
    let tip = null;

    if (rainingNow) {
        tip = { art: umbrellaSVG(), text: "It's raining right now. Don't forget your umbrella! ☔" };
    } else if (chance >= 50) {
        tip = { art: umbrellaSVG(), text: "Rain is likely (" + chance + "% in the next 12 hours). Take an umbrella with you! ☔" };
    } else if (theme === "snow") {
        tip = { art: "🧣", text: "Cold and snowy outside. Wrap up warm!" };
    } else if (theme === "clear" && uv >= 6) {
        tip = { art: "😎", text: "Very sunny today (UV " + uv.toFixed(1) + "). Sunglasses and sunscreen are a good idea!" };
    }

    if (!tip) { box.hidden = true; return; }
    art.innerHTML = tip.art;          // static markup only
    text.textContent = tip.text;
    box.hidden = false;
    box.style.animation = "none";
    void box.offsetWidth;             // restart the pop-in animation
    box.style.animation = "";
}

// ---------- hourly chart (SVG, interactive) ----------
const CH = { w: 800, h: 300, left: 40, right: 20, top: 24, bottom: 84 };
let chartPoints = [];

function hourlySlice() {
    const h = state.data.hourly;
    let start, label;
    if (state.selectedDay === null) {
        const nowKey = state.data.current.time.slice(0, 13);
        start = Math.max(0, h.time.findIndex(t => t.slice(0, 13) === nowKey));
        label = "Next 24 hours";
    } else {
        const dateKey = state.data.daily.time[state.selectedDay];
        start = Math.max(0, h.time.findIndex(t => t.slice(0, 10) === dateKey));
        label = dayName(dateKey, state.selectedDay) === "Today" ? "Today" :
            new Date(dateKey + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    }
    const idx = [];
    for (let i = start; i < Math.min(start + 24, h.time.length); i++) idx.push(i);
    return { idx, label };
}

function renderChart() {
    const h = state.data.hourly;
    const { idx, label } = hourlySlice();
    $("chartTitle").textContent = label;
    $("resetDay").hidden = state.selectedDay === null;
    $("tooltip").hidden = true;

    // size the SVG to its container so text is never stretched
    const wrap = $("chartWrap");
    CH.w = Math.max(300, wrap.clientWidth);
    CH.h = Math.max(220, wrap.clientHeight);
    $("chart").setAttribute("viewBox", "0 0 " + CH.w + " " + CH.h);

    const temps = idx.map(i => h.temperature_2m[i]);
    const min = Math.floor(Math.min(...temps)) - 2;
    const max = Math.ceil(Math.max(...temps)) + 2;
    const plotW = CH.w - CH.left - CH.right;
    const plotH = CH.h - CH.top - CH.bottom;
    const x = (n) => CH.left + (idx.length === 1 ? plotW / 2 : (n / (idx.length - 1)) * plotW);
    const y = (t) => CH.top + (1 - (t - min) / (max - min)) * plotH;

    chartPoints = idx.map((hi, n) => ({
        x: x(n), y: y(h.temperature_2m[hi]),
        time: h.time[hi], temp: h.temperature_2m[hi],
        pop: h.precipitation_probability[hi] ?? 0, code: h.weather_code[hi]
    }));

    const svg = $("chart");
    svg.textContent = "";
    const NS = "http://www.w3.org/2000/svg";
    const add = (tag, attrs, text) => {
        const n = document.createElementNS(NS, tag);
        Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
        if (text !== undefined) n.textContent = text;
        svg.appendChild(n);
        return n;
    };

    // horizontal grid lines + y labels
    for (let g = 0; g <= 3; g++) {
        const val = min + ((max - min) * g) / 3;
        const gy = y(val);
        add("line", { x1: CH.left, x2: CH.w - CH.right, y1: gy, y2: gy, stroke: "rgba(255,255,255,0.22)", "stroke-dasharray": "4 4" });
        add("text", { x: CH.left - 8, y: gy + 4, "text-anchor": "end", fill: "rgba(255,255,255,0.8)", "font-size": 12 }, Math.round(val) + "°");
    }

    // rain-chance bars along the bottom
    const barW = Math.max(6, plotW / idx.length - 8);
    chartPoints.forEach(p => {
        const bh = (p.pop / 100) * 40;
        add("rect", { x: p.x - barW / 2, y: CH.h - 8 - bh, width: barW, height: Math.max(bh, 1.5), rx: 3, fill: "rgba(173,216,255,0.8)" });
    });

    // area + line
    const linePath = chartPoints.map((p, n) => (n ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1)).join(" ");
    const areaPath = linePath + " L" + chartPoints[chartPoints.length - 1].x.toFixed(1) + " " + (CH.top + plotH) +
        " L" + chartPoints[0].x.toFixed(1) + " " + (CH.top + plotH) + " Z";
    add("path", { d: areaPath, fill: "rgba(255,255,255,0.18)" });
    add("path", { d: linePath, fill: "none", stroke: "#fff", "stroke-width": 3, "stroke-linejoin": "round", "stroke-linecap": "round" });

    // dots + x labels every 3 hours
    chartPoints.forEach((p, n) => {
        add("circle", { cx: p.x, cy: p.y, r: 3.5, fill: "#fff" });
        if (n % 3 === 0) {
            add("text", { x: p.x, y: CH.top + plotH + 22, "text-anchor": "middle", fill: "rgba(255,255,255,0.85)", "font-size": 12 }, fmtHour(p.time));
        }
    });

    // hover marker (moved by pointer events)
    add("line", { id: "hoverLine", x1: 0, x2: 0, y1: CH.top, y2: CH.top + plotH, stroke: "#fff", "stroke-width": 1.5, visibility: "hidden" });
    add("circle", { id: "hoverDot", cx: 0, cy: 0, r: 7, fill: "#fff", stroke: "rgba(0,0,0,0.25)", "stroke-width": 2, visibility: "hidden" });
}

function handleChartPointer(evt) {
    if (!chartPoints.length) return;
    const svg = $("chart");
    const rect = svg.getBoundingClientRect();
    const px = ((evt.clientX - rect.left) / rect.width) * CH.w;
    let best = 0, bestDist = Infinity;
    chartPoints.forEach((p, i) => {
        const d = Math.abs(p.x - px);
        if (d < bestDist) { bestDist = d; best = i; }
    });
    const p = chartPoints[best];
    const line = $("hoverLine"), dot = $("hoverDot");
    line.setAttribute("x1", p.x); line.setAttribute("x2", p.x); line.setAttribute("visibility", "visible");
    dot.setAttribute("cx", p.x); dot.setAttribute("cy", p.y); dot.setAttribute("visibility", "visible");

    const tip = $("tooltip");
    const info = describe(p.code, true);
    tip.textContent = "";
    tip.append(
        el("strong", "", fmtHour(p.time) + "  " + info.icon + " " + Math.round(p.temp) + unitSymbols().temp),
        document.createElement("br"),
        document.createTextNode(info.text + " · 💧 " + p.pop + "%")
    );
    tip.hidden = false;
    const leftPct = Math.min(88, Math.max(12, (p.x / CH.w) * 100));
    tip.style.left = leftPct + "%";
}

function hideChartHover() {
    $("tooltip").hidden = true;
    const line = $("hoverLine"), dot = $("hoverDot");
    if (line) line.setAttribute("visibility", "hidden");
    if (dot) dot.setAttribute("visibility", "hidden");
}

// ---------- search suggestions ----------
let suggestTimer = null;
let suggestions = [];
let activeIndex = -1;

function hideSuggestions() {
    $("suggestions").hidden = true;
    $("suggestions").textContent = "";
    suggestions = [];
    activeIndex = -1;
}

function renderSuggestions() {
    const ul = $("suggestions");
    ul.textContent = "";
    suggestions.forEach((p, i) => {
        const li = el("li", i === activeIndex ? "active" : "");
        li.setAttribute("role", "option");
        li.append(document.createTextNode(p.name), el("small", "", p.region));
        li.addEventListener("mousedown", (e) => { e.preventDefault(); selectPlace(p); });
        ul.appendChild(li);
    });
    ul.hidden = suggestions.length === 0;
}

async function runSearch(query) {
    try {
        suggestions = await searchCities(query);
        activeIndex = -1;
        renderSuggestions();
        if (!suggestions.length) showMessage('No city found for "' + query + '". Try another spelling.');
        else showMessage("");
    } catch (e) {
        showMessage("City search is unavailable right now. Please check your connection.");
    }
}

// ---------- events ----------
$("searchInput").addEventListener("input", (e) => {
    const q = e.target.value.trim();
    clearTimeout(suggestTimer);
    if (q.length < 2) { hideSuggestions(); return; }
    suggestTimer = setTimeout(() => runSearch(q), 300);
});

$("searchInput").addEventListener("keydown", async (e) => {
    if (e.key === "ArrowDown" && suggestions.length) {
        e.preventDefault();
        activeIndex = (activeIndex + 1) % suggestions.length;
        renderSuggestions();
    } else if (e.key === "ArrowUp" && suggestions.length) {
        e.preventDefault();
        activeIndex = (activeIndex - 1 + suggestions.length) % suggestions.length;
        renderSuggestions();
    } else if (e.key === "Enter") {
        e.preventDefault();
        const q = e.target.value.trim();
        if (suggestions.length) {
            selectPlace(suggestions[Math.max(activeIndex, 0)]);
        } else if (q.length >= 2) {
            try {
                const found = await searchCities(q);
                if (found.length) selectPlace(found[0]);
                else showMessage('No city found for "' + q + '". Try another spelling.');
            } catch (err) {
                showMessage("City search is unavailable right now. Please check your connection.");
            }
        }
    } else if (e.key === "Escape") {
        hideSuggestions();
    }
});

$("searchInput").addEventListener("blur", () => setTimeout(hideSuggestions, 120));

$("locateBtn").addEventListener("click", () => {
    if (!navigator.geolocation) { showMessage("Your browser does not support location."); return; }
    showMessage("");
    navigator.geolocation.getCurrentPosition(
        (pos) => selectPlace({ name: "My location", region: "", lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => showMessage("I couldn't get your location. Allow location access or search for a city."),
        { timeout: 10000 }
    );
});

function setUnit(unit) {
    if (state.unit === unit) return;
    state.unit = unit;
    $("unitC").classList.toggle("active", unit === "celsius");
    $("unitF").classList.toggle("active", unit === "fahrenheit");
    $("unitC").setAttribute("aria-pressed", unit === "celsius");
    $("unitF").setAttribute("aria-pressed", unit === "fahrenheit");
    refresh();
}
$("unitC").addEventListener("click", () => setUnit("celsius"));
$("unitF").addEventListener("click", () => setUnit("fahrenheit"));

$("resetDay").addEventListener("click", () => {
    state.selectedDay = null;
    renderChart();
    renderDaily();
});

const chartSvg = $("chart");
chartSvg.addEventListener("pointermove", handleChartPointer);
chartSvg.addEventListener("pointerdown", handleChartPointer);
chartSvg.addEventListener("pointerleave", hideChartHover);

let resizeTimer = null;
window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (state.data) renderChart(); }, 150);
});

// ---------- start ----------
renderRecents();
const startPlace = loadRecents()[0] || { name: "Chennai", region: "Tamil Nadu, India", lat: 13.0827, lon: 80.2707 };
selectPlace(startPlace);
