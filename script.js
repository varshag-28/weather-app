/* SkyCast – interactive weather app
   Data: Open-Meteo (free, no API key). Geocoding + forecast are called directly from the browser. */

const $ = (id) => document.getElementById(id);

const state = {
    unit: "celsius",      // "celsius" | "fahrenheit"
    place: null,          // { name, region, lat, lon }
    data: null,           // last forecast response
    selectedDay: null     // null = next 24 hours, otherwise day index 0-6
};


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
    $("heroIcon").textContent = info.icon;
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