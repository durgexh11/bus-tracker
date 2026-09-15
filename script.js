/* =========================================================
   BUSPULSE — Smart Bus Tracking
   Full logic with Map + Search + Manual pickers,
   Current Location, Saved tab, and Alerts tab
   ========================================================= */

/* ---------------------------------------------------------
   BUS DATA
--------------------------------------------------------- */
const buses = {
    "101": { number: "101", route: "City → College", stops: ["Main Gate", "Market", "City Center", "College Gate", "Station"], speed: 0.055, position: 0.0, status: "On Time", etaMinutes: 4 },
    "102": { number: "102", route: "Station → Campus", stops: ["Station", "Market", "Main Gate", "City Center", "College Gate"], speed: 0.045, position: 0.0, status: "Delayed", etaMinutes: 7 },
    "103": { number: "103", route: "Market → College", stops: ["Market", "City Center", "Main Gate", "College Gate", "Station"], speed: 0.065, position: 0.0, status: "On Time", etaMinutes: 3 },
    "104": { number: "104", route: "Home → City", stops: ["Home", "Main Gate", "Market", "City Center", "Station"], speed: 0.05, position: 0.0, status: "On Time", etaMinutes: 9 }
};

/* ---------------------------------------------------------
   STATE
--------------------------------------------------------- */
let currentUserType = "daily";
let selectedBus = "101";
let selectedRoute = "city-college";
let notificationCount = 0;
let alertTriggered = false;
let savedStop = JSON.parse(localStorage.getItem("busPulseStop")) || null;
let dailyRouteCoords = JSON.parse(localStorage.getItem("busPulseDailyRoute")) || null;
let occasionalRouteCoords = JSON.parse(localStorage.getItem("busPulseOccasionalRoute")) || null;
let routeSetupMode = "daily";

// Alerts history (persisted)
let alertHistory = JSON.parse(localStorage.getItem("busPulseAlertHistory")) || [];

// Live map
let liveMap = null;
let liveRouteLine = null;
let liveBusMarker = null;
let liveFromMarker = null;
let liveToMarker = null;
let routeRoadPath = null;

// Route modal
let routePickerMap = null;
let routeFromMarker = null;
let routeToMarker = null;
let routePathLine = null;
let routePickStage = "from";
let routeFromPoint = null;
let routeToPoint = null;
let routeSearchTarget = "from";
let routeSearchTimeout = null;

// Stop modal
let stopPickerMap = null;
let stopPickerMarker = null;
let stopPickerPoint = null;
let stopSearchTimeout = null;

// Occasional inline
let occInlineMapInst = null;
let occInlineBusMarker = null;
let occInlineInterval = null;

// Alerts filter
let currentAlertFilter = "all";

/* ---------------------------------------------------------
   DOM REFS
--------------------------------------------------------- */
const $ = id => document.getElementById(id);

const dailyPanel = $("dailyPanel");
const occasionalPanel = $("occasionalPanel");
const dailyUserBtn = $("dailyUserBtn");
const occasionalUserBtn = $("occasionalUserBtn");
const dailyMapCard = $("dailyMapCard");
const dailyBusListCard = $("dailyBusListCard");
const dailyEtaCard = $("dailyEtaCard");
const dailySmartCard = $("dailySmartCard");
const dailyRouteSummary = $("dailyRouteSummary");
const routePicker = $("routePicker");
const dailyBusList = $("dailyBusList");
const selectedBusElement = $("selectedBus");
const nextStopElement = $("nextStop");
const etaValueElement = $("etaValue");
const statusTextElement = $("statusText");
const distanceValueElement = $("distanceValue");
const etaMessageElement = $("etaMessage");
const routeProgress = $("routeProgress");
const routeProgressText = $("routeProgressText");
const lastUpdated = $("lastUpdated");
const favoriteBusBtn = $("favoriteBusBtn");
const toastContainer = $("toastContainer");
const notificationPanel = $("notificationPanel");
const notificationBtn = $("notificationBtn");
const notificationList = $("notificationList");
const notificationBadge = $("notificationBadge");
const greetingText = $("greetingText");
const destinationInput = $("destinationInput");
const pickDestinationBtn = $("pickDestinationBtn");
const occasionalResultCard = $("occasionalResultCard");
const occasionalBusResults = $("occasionalBusResults");
const occasionalTripCard = $("occasionalTripCard");
const tripFrom = $("tripFrom");
const tripTo = $("tripTo");
const tripBusNumber = $("tripBusNumber");
const tripStatus = $("tripStatus");
const tripEta = $("tripEta");
const tripDistance = $("tripDistance");
const tripMessage = $("tripMessage");
const occInlineMap = $("occInlineMap");

const routeModal = $("routeModal");
const closeRouteModal = $("closeRouteModal");
const routeModalEyebrow = $("routeModalEyebrow");
const routeModalTitle = $("routeModalTitle");
const routeModalDesc = $("routeModalDesc");
const routeInstruction = $("routeInstruction");
const routeMapEl = $("routeMap");
const routeGpsBtn = $("routeGpsBtn");
const routeFromCard = $("routeFromCard");
const routeToCard = $("routeToCard");
const routeFromName = $("routeFromName");
const routeFromCoord = $("routeFromCoord");
const routeToName = $("routeToName");
const routeToCoord = $("routeToCoord");
const routeDistanceInfo = $("routeDistanceInfo");
const routeResetBtn = $("routeResetBtn");
const routeConfirmBtn = $("routeConfirmBtn");

const stopModal = $("stopModal");
const closeStopModal = $("closeStopModal");
const stopMapEl = $("stopMap");
const stopGpsBtn = $("stopGpsBtn");
const stopSelectedName = $("stopSelectedName");
const stopSelectedCoord = $("stopSelectedCoord");
const saveStopBtn = $("saveStopBtn");
const setupAlertBtn = $("setupAlertBtn");

/* ---------------------------------------------------------
   GREETING
--------------------------------------------------------- */
(function greet() {
    const h = new Date().getHours();
    let g = "Good evening 👋";
    if (h < 12) g = "Good morning ☀️";
    else if (h < 17) g = "Good afternoon 🌤️";
    greetingText.textContent = g;
})();

/* ---------------------------------------------------------
   UTILITIES
--------------------------------------------------------- */
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getUserLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
        navigator.geolocation.getCurrentPosition(
            p => resolve({
                latitude: p.coords.latitude,
                longitude: p.coords.longitude,
                accuracy: p.coords.accuracy
            }),
            e => {
                let msg = "Unable to get location.";
                if (e.code === 1) msg = "Location permission denied.";
                else if (e.code === 2) msg = "Location unavailable.";
                else if (e.code === 3) msg = "Location request timed out.";
                reject(new Error(msg));
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    });
}

async function reverseGeocode(lat, lon) {
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=16`,
            { headers: { "Accept-Language": "en" } }
        );
        const data = await res.json();
        if (data && data.display_name) {
            const parts = data.display_name.split(",");
            return parts.slice(0, 2).join(",").trim();
        }
        return null;
    } catch (e) {
        return null;
    }
}

async function getRoadRoute(fromLat, fromLon, toLat, toLon) {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes && data.routes[0]) {
            return {
                coords: data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]),
                distance: data.routes[0].distance / 1000,
                duration: data.routes[0].duration / 60
            };
        }
    } catch (e) { /* ignore */ }
    return null;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

/* ---------------------------------------------------------
   LEAFLET HELPERS
--------------------------------------------------------- */
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_OPTS = { attribution: '© OpenStreetMap', maxZoom: 19 };

function makeBusIcon() {
    return L.divIcon({
        className: "bus-div-icon",
        html: `<div style="
            position: relative;
            width: 40px; height: 40px;
            display: grid; place-items: center;
            border-radius: 12px;
            background: linear-gradient(135deg, #8b7cff, #5b3df0);
            border: 2px solid white;
            font-size: 18px;
            box-shadow: 0 5px 20px rgba(91, 61, 240,0.6);
        ">🚌</div>`,
        iconSize: [40, 40], iconAnchor: [20, 20]
    });
}

const FROM_ICON = L.divIcon({
    className: "bus-div-icon",
    html: `<div style="
        width: 22px; height: 22px; border-radius: 50%;
        background: #34d399; border: 3px solid white;
        box-shadow: 0 0 15px rgba(52, 211, 153,0.9);
    "></div>`,
    iconSize: [22, 22], iconAnchor: [11, 11]
});

const TO_ICON = L.divIcon({
    className: "bus-div-icon",
    html: `<div style="
        width: 22px; height: 22px; border-radius: 50%;
        background: #fb7185; border: 3px solid white;
        box-shadow: 0 0 15px rgba(251, 113, 133,0.9);
    "></div>`,
    iconSize: [22, 22], iconAnchor: [11, 11]
});

const PICK_ICON = L.divIcon({
    className: "bus-div-icon",
    html: `<div style="
        width: 26px; height: 26px; border-radius: 50% 50% 50% 0;
        background: #8b7cff; border: 3px solid white;
        transform: rotate(-45deg);
        box-shadow: 0 0 15px rgba(139, 124, 255,0.9);
    "></div>`,
    iconSize: [26, 26], iconAnchor: [13, 26]
});

const USER_ICON = L.divIcon({
    className: "bus-div-icon",
    html: `<div style="
        width: 20px; height: 20px; border-radius: 50%;
        background: #8b7cff; border: 3px solid white;
        box-shadow: 0 0 15px rgba(139, 124, 255,0.9),
                    0 0 0 8px rgba(139, 124, 255,0.15);
    "></div>`,
    iconSize: [20, 20], iconAnchor: [10, 10]
});

/* ---------------------------------------------------------
   USER TYPE SWITCH
--------------------------------------------------------- */
dailyUserBtn.addEventListener("click", () => switchUserType("daily"));
occasionalUserBtn.addEventListener("click", () => switchUserType("occasional"));

function switchUserType(type) {
    currentUserType = type;
    dailyUserBtn.classList.toggle("active", type === "daily");
    occasionalUserBtn.classList.toggle("active", type === "occasional");
    dailyPanel.classList.toggle("hidden", type !== "daily");
    occasionalPanel.classList.toggle("hidden", type !== "occasional");

    if (type === "daily") {
        if (dailyRouteCoords) showDailyUI(true);
        if (liveMap) setTimeout(() => liveMap.invalidateSize(), 100);
    } else {
        occasionalTripCard.classList.add("hidden");
    }
}

/* ---------------------------------------------------------
   ROUTE CHIP
--------------------------------------------------------- */
routePicker.addEventListener("click", e => {
    const chip = e.target.closest(".route-chip");
    if (!chip) return;
    routePicker.querySelectorAll(".route-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    selectedRoute = chip.dataset.route;
});

/* ---------------------------------------------------------
   BUTTON TRIGGERS
--------------------------------------------------------- */
$("setDailyRouteBtn").addEventListener("click", () => {
    routeSetupMode = "daily";
    openRouteModal();
});

pickDestinationBtn.addEventListener("click", () => {
    routeSetupMode = "occasional";
    openRouteModal();
});

document.querySelectorAll(".route-chip[data-dest]").forEach(chip => {
    chip.addEventListener("click", () => {
        document.querySelectorAll(".route-chip[data-dest]").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        destinationInput.value = chip.dataset.dest;
    });
});

/* ---------------------------------------------------------
   TAB SWITCHING (Map / Search / Manual)
--------------------------------------------------------- */
document.querySelectorAll(".picker-tab").forEach(tab => {
    tab.addEventListener("click", function () {
        const picker = this.dataset.picker || "route";
        const mode = this.dataset.mode;
        switchPickerTab(picker, mode);
    });
});

function switchPickerTab(picker, mode) {
    const tabs = document.querySelectorAll(`.picker-tab[data-picker="${picker}"]`);
    const panes = picker === "route"
        ? { map: "routePaneMap", search: "routePaneSearch", manual: "routePaneManual" }
        : { map: "stopPaneMap", search: "stopPaneSearch", manual: "stopPaneManual" };

    tabs.forEach(t => t.classList.toggle("active", t.dataset.mode === mode));
    Object.keys(panes).forEach(k => {
        const el = $(panes[k]);
        if (el) el.classList.toggle("active", k === mode);
    });

    if (mode === "map") {
        const mapInst = picker === "route" ? routePickerMap : stopPickerMap;
        if (mapInst) setTimeout(() => mapInst.invalidateSize(), 100);
    }

    if (mode === "manual" && picker === "route") {
        if (routeFromPoint) {
            $("manualFromName").value = routeFromPoint.name || "";
            $("manualFromLat").value = routeFromPoint.lat.toFixed(6);
            $("manualFromLon").value = routeFromPoint.lon.toFixed(6);
        }
        if (routeToPoint) {
            $("manualToName").value = routeToPoint.name || "";
            $("manualToLat").value = routeToPoint.lat.toFixed(6);
            $("manualToLon").value = routeToPoint.lon.toFixed(6);
        }
    }
    if (mode === "manual" && picker === "stop") {
        if (stopPickerPoint) {
            $("manualStopName").value = stopPickerPoint.name || "";
            $("manualStopLat").value = stopPickerPoint.lat.toFixed(6);
            $("manualStopLon").value = stopPickerPoint.lon.toFixed(6);
        }
    }
}

/* =========================================================
   ROUTE MODAL
   ========================================================= */
function openRouteModal() {
    routeModal.classList.add("show");

    routeFromPoint = null;
    routeToPoint = null;
    routeRoadPath = null;
    routePickStage = "from";

    routeFromCard.classList.remove("show");
    routeToCard.classList.remove("show");
    routeFromName.textContent = "Not selected";
    routeToName.textContent = "Not selected";
    routeFromCoord.textContent = "--";
    routeToCoord.textContent = "--";
    routeConfirmBtn.disabled = true;
    routeDistanceInfo.innerHTML = "💡 Route distance will appear once both points are set";

    routeModalEyebrow.textContent = routeSetupMode === "daily" ? "SET DAILY ROUTE" : "SET YOUR TRIP";
    routeModalTitle.textContent = "Set start & end points";
    routeModalDesc.innerHTML = `<b>Step 1:</b> Set your <span style="color:var(--green);">START</span> point.`;

    switchPickerTab("route", "map");

    $("routeSearchInput").value = "";
    $("routeSearchClear").style.display = "none";
    $("routeSearchResults").innerHTML = `<div class="search-hint"><i class="fas fa-info-circle"></i> Type at least 3 characters to search</div>`;
    routeSearchTarget = "from";
    $("searchTargetFrom").classList.add("active");
    $("searchTargetTo").classList.remove("active");

    $("manualFromName").value = "";
    $("manualFromLat").value = "";
    $("manualFromLon").value = "";
    $("manualToName").value = "";
    $("manualToLat").value = "";
    $("manualToLon").value = "";

    if (!routePickerMap) {
        routePickerMap = L.map(routeMapEl, { zoomControl: true, attributionControl: true }).setView([20.0, 74.0], 13);
        L.tileLayer(TILE_URL, TILE_OPTS).addTo(routePickerMap);
        routePickerMap.on("click", handleRouteMapClick);
    }

    if (routeFromMarker) { routePickerMap.removeLayer(routeFromMarker); routeFromMarker = null; }
    if (routeToMarker) { routePickerMap.removeLayer(routeToMarker); routeToMarker = null; }
    if (routePathLine) { routePickerMap.removeLayer(routePathLine); routePathLine = null; }

    const existing = routeSetupMode === "daily" ? dailyRouteCoords : occasionalRouteCoords;
    if (existing) {
        routeFromPoint = { lat: existing.from.lat, lon: existing.from.lon, name: existing.from.name };
        routeToPoint = { lat: existing.to.lat, lon: existing.to.lon, name: existing.to.name };
        routeFromMarker = L.marker([existing.from.lat, existing.from.lon], { icon: FROM_ICON }).addTo(routePickerMap);
        routeToMarker = L.marker([existing.to.lat, existing.to.lon], { icon: TO_ICON }).addTo(routePickerMap);
        routeFromCard.classList.add("show");
        routeToCard.classList.add("show");
        routeFromName.textContent = existing.from.name;
        routeToName.textContent = existing.to.name;
        routeFromCoord.textContent = `${existing.from.lat.toFixed(5)}, ${existing.from.lon.toFixed(5)}`;
        routeToCoord.textContent = `${existing.to.lat.toFixed(5)}, ${existing.to.lon.toFixed(5)}`;
        routeConfirmBtn.disabled = false;
        routePickStage = "done";

        $("manualFromName").value = existing.from.name;
        $("manualFromLat").value = existing.from.lat.toFixed(6);
        $("manualFromLon").value = existing.from.lon.toFixed(6);
        $("manualToName").value = existing.to.name;
        $("manualToLat").value = existing.to.lat.toFixed(6);
        $("manualToLon").value = existing.to.lon.toFixed(6);

        drawRoutePath(routeFromPoint, routeToPoint);

        const bounds = L.latLngBounds([[existing.from.lat, existing.from.lon], [existing.to.lat, existing.to.lon]]);
        routePickerMap.fitBounds(bounds, { padding: [40, 40] });
    } else {
        routeInstruction.innerHTML = `<i class="fas fa-hand-pointer"></i><span>Tap to set START point</span>`;
        getUserLocation().then(loc => {
            routePickerMap.setView([loc.latitude, loc.longitude], 15);
        }).catch(() => {});
    }

    setTimeout(() => routePickerMap.invalidateSize(), 200);
}

function closeRouteModalFn() {
    routeModal.classList.remove("show");
}

closeRouteModal.addEventListener("click", closeRouteModalFn);
routeModal.addEventListener("click", e => {
    if (e.target === routeModal) closeRouteModalFn();
});

$("searchTargetFrom").addEventListener("click", () => {
    routeSearchTarget = "from";
    $("searchTargetFrom").classList.add("active");
    $("searchTargetTo").classList.remove("active");
});
$("searchTargetTo").addEventListener("click", () => {
    routeSearchTarget = "to";
    $("searchTargetTo").classList.add("active");
    $("searchTargetFrom").classList.remove("active");
});

$("routeSearchInput").addEventListener("input", function () {
    const q = this.value.trim();
    $("routeSearchClear").style.display = q ? "flex" : "none";
    if (routeSearchTimeout) clearTimeout(routeSearchTimeout);
    if (q.length < 3) {
        $("routeSearchResults").innerHTML = `<div class="search-hint"><i class="fas fa-info-circle"></i> Type at least 3 characters to search</div>`;
        return;
    }
    $("routeSearchResults").innerHTML = `<div class="search-hint"><i class="fas fa-spinner fa-spin"></i> Searching...</div>`;
    routeSearchTimeout = setTimeout(() => performRouteSearch(q), 600);
});

$("routeSearchClear").addEventListener("click", () => {
    $("routeSearchInput").value = "";
    $("routeSearchClear").style.display = "none";
    $("routeSearchResults").innerHTML = `<div class="search-hint"><i class="fas fa-info-circle"></i> Type at least 3 characters to search</div>`;
});

async function performRouteSearch(query) {
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(query)}`;
        const res = await fetch(url, { headers: { "Accept-Language": "en" } });
        const data = await res.json();

        if (!data || data.length === 0) {
            $("routeSearchResults").innerHTML = `<div class="search-empty"><i class="fas fa-map-pin"></i> No places found</div>`;
            return;
        }

        const html = data.map(item => {
            const name = item.name || item.display_name.split(",")[0];
            return `
                <div class="search-result-item" data-lat="${item.lat}" data-lon="${item.lon}" data-name="${escapeHtml(name)}">
                    <i class="fas fa-map-marker-alt result-icon"></i>
                    <div class="result-content">
                        <div class="result-name">${escapeHtml(name)}</div>
                        <div class="result-detail">${escapeHtml(item.display_name)}</div>
                    </div>
                </div>
            `;
        }).join("");
        $("routeSearchResults").innerHTML = html;

        document.querySelectorAll("#routeSearchResults .search-result-item").forEach(el => {
            el.addEventListener("click", () => {
                const lat = parseFloat(el.dataset.lat);
                const lon = parseFloat(el.dataset.lon);
                const name = el.dataset.name;
                applyRouteSearchResult(lat, lon, name);
            });
        });
    } catch (e) {
        $("routeSearchResults").innerHTML = `<div class="search-empty"><i class="fas fa-exclamation-triangle"></i> Search failed. Try again.</div>`;
    }
}

function applyRouteSearchResult(lat, lon, name) {
    const point = { lat, lon, name };

    if (routeSearchTarget === "from") {
        routeFromPoint = point;
        routeFromCard.classList.add("show");
        routeFromName.textContent = name;
        routeFromCoord.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        if (routeFromMarker) routePickerMap.removeLayer(routeFromMarker);
        routeFromMarker = L.marker([lat, lon], { icon: FROM_ICON, draggable: true }).addTo(routePickerMap);
        attachFromDrag();
    } else {
        routeToPoint = point;
        routeToCard.classList.add("show");
        routeToName.textContent = name;
        routeToCoord.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        if (routeToMarker) routePickerMap.removeLayer(routeToMarker);
        routeToMarker = L.marker([lat, lon], { icon: TO_ICON, draggable: true }).addTo(routePickerMap);
        attachToDrag();
    }

    if (routePickerMap) routePickerMap.setView([lat, lon], 15);

    if (routeFromPoint && routeToPoint) {
        drawRoutePath(routeFromPoint, routeToPoint);
        routeConfirmBtn.disabled = false;
        routePickStage = "done";
        const bounds = L.latLngBounds([
            [routeFromPoint.lat, routeFromPoint.lon],
            [routeToPoint.lat, routeToPoint.lon]
        ]);
        if (routePickerMap) routePickerMap.fitBounds(bounds, { padding: [40, 40] });
    } else {
        routeConfirmBtn.disabled = true;
        if (routeSearchTarget === "from") {
            routeModalDesc.innerHTML = `<b>Step 2:</b> Now set your <span style="color:var(--red);">DESTINATION</span> point.`;
        }
    }

    updateRouteDistanceInfo();
    showToast("✅", "Place selected", name);
}

$("manualApplyBtn").addEventListener("click", () => {
    const fLat = parseFloat($("manualFromLat").value);
    const fLon = parseFloat($("manualFromLon").value);
    const tLat = parseFloat($("manualToLat").value);
    const tLon = parseFloat($("manualToLon").value);
    const fName = $("manualFromName").value.trim() || "Start Point";
    const tName = $("manualToName").value.trim() || "Destination";

    if (isNaN(fLat) || isNaN(fLon)) {
        showToast("⚠️", "Invalid START", "Enter valid start latitude & longitude");
        return;
    }
    if (isNaN(tLat) || isNaN(tLon)) {
        showToast("⚠️", "Invalid DESTINATION", "Enter valid destination latitude & longitude");
        return;
    }
    if (fLat < -90 || fLat > 90 || tLat < -90 || tLat > 90) {
        showToast("⚠️", "Invalid latitude", "Latitude must be -90 to 90");
        return;
    }
    if (fLon < -180 || fLon > 180 || tLon < -180 || tLon > 180) {
        showToast("⚠️", "Invalid longitude", "Longitude must be -180 to 180");
        return;
    }

    routeFromPoint = { lat: fLat, lon: fLon, name: fName };
    routeToPoint = { lat: tLat, lon: tLon, name: tName };

    if (routeFromMarker) routePickerMap.removeLayer(routeFromMarker);
    if (routeToMarker) routePickerMap.removeLayer(routeToMarker);
    routeFromMarker = L.marker([fLat, fLon], { icon: FROM_ICON, draggable: true }).addTo(routePickerMap);
    routeToMarker = L.marker([tLat, tLon], { icon: TO_ICON, draggable: true }).addTo(routePickerMap);
    attachFromDrag();
    attachToDrag();

    routeFromCard.classList.add("show");
    routeToCard.classList.add("show");
    routeFromName.textContent = fName;
    routeToName.textContent = tName;
    routeFromCoord.textContent = `${fLat.toFixed(5)}, ${fLon.toFixed(5)}`;
    routeToCoord.textContent = `${tLat.toFixed(5)}, ${tLon.toFixed(5)}`;

    drawRoutePath(routeFromPoint, routeToPoint);
    routeConfirmBtn.disabled = false;
    routePickStage = "done";

    const bounds = L.latLngBounds([[fLat, fLon], [tLat, tLon]]);
    if (routePickerMap) {
        routePickerMap.fitBounds(bounds, { padding: [40, 40] });
        setTimeout(() => routePickerMap.invalidateSize(), 100);
    }

    showToast("✅", "Coordinates applied", `${fName} → ${tName}`);
});

function attachFromDrag() {
    if (!routeFromMarker) return;
    routeFromMarker.on("dragend", async ev => {
        const p = ev.target.getLatLng();
        routeFromPoint.lat = p.lat;
        routeFromPoint.lon = p.lng;
        routeFromCoord.textContent = `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
        const name = await reverseGeocode(p.lat, p.lng);
        if (name) routeFromPoint.name = name;
        routeFromName.textContent = routeFromPoint.name;
        $("manualFromName").value = routeFromPoint.name;
        $("manualFromLat").value = p.lat.toFixed(6);
        $("manualFromLon").value = p.lng.toFixed(6);
        updateRouteDistanceInfo();
        if (routeToPoint) drawRoutePath(routeFromPoint, routeToPoint);
    });
}

function attachToDrag() {
    if (!routeToMarker) return;
    routeToMarker.on("dragend", async ev => {
        const p = ev.target.getLatLng();
        routeToPoint.lat = p.lat;
        routeToPoint.lon = p.lng;
        routeToCoord.textContent = `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
        const name = await reverseGeocode(p.lat, p.lng);
        if (name) routeToPoint.name = name;
        routeToName.textContent = routeToPoint.name;
        $("manualToName").value = routeToPoint.name;
        $("manualToLat").value = p.lat.toFixed(6);
        $("manualToLon").value = p.lng.toFixed(6);
        updateRouteDistanceInfo();
        if (routeFromPoint) drawRoutePath(routeFromPoint, routeToPoint);
    });
}

async function handleRouteMapClick(e) {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;

    if (routePickStage === "from" || !routeFromPoint) {
        routeFromPoint = { lat, lon, name: "Loading..." };
        if (routeFromMarker) routePickerMap.removeLayer(routeFromMarker);
        routeFromMarker = L.marker([lat, lon], { icon: FROM_ICON, draggable: true }).addTo(routePickerMap);
        attachFromDrag();

        routeFromCard.classList.add("show");
        routeFromCoord.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        routeFromName.textContent = "Loading name...";

        routeInstruction.innerHTML = `<i class="fas fa-hand-pointer"></i><span>Now tap to set DESTINATION</span>`;
        routePickStage = "to";
        routeModalDesc.innerHTML = `<b>Step 2:</b> Set your <span style="color:var(--red);">DESTINATION</span> point.`;

        $("searchTargetFrom").classList.remove("active");
        $("searchTargetTo").classList.add("active");
        routeSearchTarget = "to";

        const name = await reverseGeocode(lat, lon);
        routeFromPoint.name = name || "Start Point";
        routeFromName.textContent = routeFromPoint.name;
        $("manualFromName").value = routeFromPoint.name;
        $("manualFromLat").value = lat.toFixed(6);
        $("manualFromLon").value = lon.toFixed(6);

    } else if (routePickStage === "to") {
        routeToPoint = { lat, lon, name: "Loading..." };
        if (routeToMarker) routePickerMap.removeLayer(routeToMarker);
        routeToMarker = L.marker([lat, lon], { icon: TO_ICON, draggable: true }).addTo(routePickerMap);
        attachToDrag();

        routeToCard.classList.add("show");
        routeToCoord.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        routeToName.textContent = "Loading name...";

        routeInstruction.innerHTML = `<i class="fas fa-check-circle" style="color:var(--green)"></i><span>Looking good! Tap Confirm</span>`;
        routePickStage = "done";
        routeConfirmBtn.disabled = false;

        const name = await reverseGeocode(lat, lon);
        routeToPoint.name = name || "Destination";
        routeToName.textContent = routeToPoint.name;
        $("manualToName").value = routeToPoint.name;
        $("manualToLat").value = lat.toFixed(6);
        $("manualToLon").value = lon.toFixed(6);

        drawRoutePath(routeFromPoint, routeToPoint);

        const bounds = L.latLngBounds([
            [routeFromPoint.lat, routeFromPoint.lon],
            [lat, lon]
        ]);
        routePickerMap.fitBounds(bounds, { padding: [50, 50] });

        updateRouteDistanceInfo();
    }
}

async function drawRoutePath(from, to) {
    if (!from || !to) return;
    if (routePathLine) routePickerMap.removeLayer(routePathLine);

    routeInstruction.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>Fetching road route...</span>`;
    const road = await getRoadRoute(from.lat, from.lon, to.lat, to.lon);

    if (road && road.coords.length > 1) {
        routePathLine = L.polyline(road.coords, {
            color: "#8b7cff", weight: 5, opacity: 0.85, lineJoin: "round"
        }).addTo(routePickerMap);
        routeRoadPath = road.coords;
        routeDistanceInfo.innerHTML = `📏 Road: <b style="color:var(--primary);">${road.distance.toFixed(2)} km</b> • ~${Math.round(road.duration)} min`;
    } else {
        routePathLine = L.polyline(
            [[from.lat, from.lon], [to.lat, to.lon]],
            { color: "#8b7cff", weight: 4, opacity: 0.7, dashArray: "8,6" }
        ).addTo(routePickerMap);
        const dist = getDistanceFromLatLonInKm(from.lat, from.lon, to.lat, to.lon);
        routeDistanceInfo.innerHTML = `📏 Straight: <b style="color:var(--primary);">${dist.toFixed(2)} km</b>`;
    }

    routeInstruction.innerHTML = `<i class="fas fa-check-circle" style="color:var(--green)"></i><span>Route ready — tap Confirm</span>`;
}

function updateRouteDistanceInfo() {
    if (routeFromPoint && routeToPoint && !routeRoadPath) {
        const dist = getDistanceFromLatLonInKm(
            routeFromPoint.lat, routeFromPoint.lon,
            routeToPoint.lat, routeToPoint.lon
        );
        routeDistanceInfo.innerHTML = `📏 Straight: <b style="color:var(--primary);">${dist.toFixed(2)} km</b>`;
    }
}

routeResetBtn.addEventListener("click", () => {
    routeFromPoint = null;
    routeToPoint = null;
    routeRoadPath = null;
    routePickStage = "from";
    if (routeFromMarker) { routePickerMap.removeLayer(routeFromMarker); routeFromMarker = null; }
    if (routeToMarker) { routePickerMap.removeLayer(routeToMarker); routeToMarker = null; }
    if (routePathLine) { routePickerMap.removeLayer(routePathLine); routePathLine = null; }
    routeFromCard.classList.remove("show");
    routeToCard.classList.remove("show");
    routeConfirmBtn.disabled = true;
    routeInstruction.innerHTML = `<i class="fas fa-hand-pointer"></i><span>Tap to set START point</span>`;
    routeDistanceInfo.innerHTML = "💡 Route distance will appear once both points are set";
    routeModalDesc.innerHTML = `<b>Step 1:</b> Set your <span style="color:var(--green);">START</span> point.`;

    $("manualFromName").value = "";
    $("manualFromLat").value = "";
    $("manualFromLon").value = "";
    $("manualToName").value = "";
    $("manualToLat").value = "";
    $("manualToLon").value = "";

    routeSearchTarget = "from";
    $("searchTargetFrom").classList.add("active");
    $("searchTargetTo").classList.remove("active");
});

routeGpsBtn.addEventListener("click", async function () {
    const btn = this;
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;
    try {
        const loc = await getUserLocation();
        routePickerMap.setView([loc.latitude, loc.longitude], 16);

        if (routePickStage === "from" || !routeFromPoint) {
            routeFromPoint = { lat: loc.latitude, lon: loc.longitude, name: "My Current Location" };
            if (routeFromMarker) routePickerMap.removeLayer(routeFromMarker);
            routeFromMarker = L.marker([loc.latitude, loc.longitude], { icon: FROM_ICON, draggable: true }).addTo(routePickerMap);
            attachFromDrag();
            routeFromCard.classList.add("show");
            routeFromName.textContent = "My Current Location";
            routeFromCoord.textContent = `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`;
            routePickStage = "to";
            $("manualFromName").value = "My Current Location";
            $("manualFromLat").value = loc.latitude.toFixed(6);
            $("manualFromLon").value = loc.longitude.toFixed(6);
            $("searchTargetFrom").classList.remove("active");
            $("searchTargetTo").classList.add("active");
            routeSearchTarget = "to";
            routeModalDesc.innerHTML = `<b>Step 2:</b> Now set your <span style="color:var(--red);">DESTINATION</span>.`;
        } else {
            routeToPoint = { lat: loc.latitude, lon: loc.longitude, name: "My Current Location" };
            if (routeToMarker) routePickerMap.removeLayer(routeToMarker);
            routeToMarker = L.marker([loc.latitude, loc.longitude], { icon: TO_ICON, draggable: true }).addTo(routePickerMap);
            attachToDrag();
            routeToCard.classList.add("show");
            routeToName.textContent = "My Current Location";
            routeToCoord.textContent = `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`;
            routeConfirmBtn.disabled = false;
            $("manualToName").value = "My Current Location";
            $("manualToLat").value = loc.latitude.toFixed(6);
            $("manualToLon").value = loc.longitude.toFixed(6);
        }

        if (routeFromPoint && routeToPoint) {
            drawRoutePath(routeFromPoint, routeToPoint);
            const bounds = L.latLngBounds([
                [routeFromPoint.lat, routeFromPoint.lon],
                [routeToPoint.lat, routeToPoint.lon]
            ]);
            routePickerMap.fitBounds(bounds, { padding: [40, 40] });
        }

        showToast("📍", "Current location set", `Accuracy ±${Math.round(loc.accuracy)}m`);
    } catch (err) {
        showToast("⚠️", "Location error", err.message);
    } finally {
        btn.innerHTML = orig;
        btn.disabled = false;
    }
});

routeConfirmBtn.addEventListener("click", () => {
    if (!routeFromPoint || !routeToPoint) return;

    const distKm = routeDistanceInfo.textContent.match(/([\d.]+)\s*km/);
    const roadKm = distKm ? parseFloat(distKm[1]) : getDistanceFromLatLonInKm(
        routeFromPoint.lat, routeFromPoint.lon, routeToPoint.lat, routeToPoint.lon
    );

    const data = {
        from: { lat: routeFromPoint.lat, lon: routeFromPoint.lon, name: routeFromPoint.name },
        to: { lat: routeToPoint.lat, lon: routeToPoint.lon, name: routeToPoint.name },
        distance: roadKm,
        roadPath: routeRoadPath || null
    };

    if (routeSetupMode === "daily") {
        dailyRouteCoords = data;
        localStorage.setItem("busPulseDailyRoute", JSON.stringify(data));
        showToast("✅", "Daily route saved", `${data.from.name} → ${data.to.name}`);
        addAlert("route", "Daily route saved", `${data.from.name} → ${data.to.name} • ${roadKm.toFixed(1)} km`);
        dailyRouteSummary.innerHTML = `✅ <b>${data.from.name}</b> → <b>${data.to.name}</b><br><small style="color:var(--muted)">${roadKm.toFixed(1)} km • saved</small>`;
        dailyRouteSummary.classList.remove("hidden");
        showDailyUI(true);
        renderSavedPage();
    } else {
        occasionalRouteCoords = data;
        localStorage.setItem("busPulseOccasionalRoute", JSON.stringify(data));
        showToast("✅", "Trip route saved", `${data.from.name} → ${data.to.name}`);
        addAlert("route", "Trip route saved", `${data.from.name} → ${data.to.name}`);
        findBusesForRealRoute(data);
    }

    closeRouteModalFn();
});

/* =========================================================
   LIVE MAP
   ========================================================= */
function initLiveMap() {
    if (liveMap) return;
    liveMap = L.map("liveMap", {
        zoomControl: false,
        attributionControl: true
    }).setView([20.0, 74.0], 13);

    L.tileLayer(TILE_URL, TILE_OPTS).addTo(liveMap);
    L.control.zoom({ position: "topright" }).addTo(liveMap);
}

function renderLiveRoute(route) {
    initLiveMap();
    if (!liveMap) return;

    if (liveRouteLine) { liveMap.removeLayer(liveRouteLine); liveRouteLine = null; }
    if (liveFromMarker) { liveMap.removeLayer(liveFromMarker); liveFromMarker = null; }
    if (liveToMarker) { liveMap.removeLayer(liveToMarker); liveToMarker = null; }
    if (liveBusMarker) { liveMap.removeLayer(liveBusMarker); liveBusMarker = null; }

    if (route.roadPath && route.roadPath.length > 1) {
        liveRouteLine = L.polyline(route.roadPath, {
            color: "#8b7cff", weight: 5, opacity: 0.8, lineJoin: "round"
        }).addTo(liveMap);
    } else {
        liveRouteLine = L.polyline(
            [[route.from.lat, route.from.lon], [route.to.lat, route.to.lon]],
            { color: "#8b7cff", weight: 4, opacity: 0.7, dashArray: "8,6" }
        ).addTo(liveMap);
    }

    liveFromMarker = L.marker([route.from.lat, route.from.lon], { icon: FROM_ICON })
        .addTo(liveMap)
        .bindPopup(`<b style="color:#34d399">🟢 ${route.from.name}</b>`);

    liveToMarker = L.marker([route.to.lat, route.to.lon], { icon: TO_ICON })
        .addTo(liveMap)
        .bindPopup(`<b style="color:#fb7185">🔴 ${route.to.name}</b>`);

    const startPos = route.roadPath && route.roadPath.length
        ? route.roadPath[0]
        : [route.from.lat, route.from.lon];
    liveBusMarker = L.marker(startPos, { icon: makeBusIcon() })
        .addTo(liveMap)
        .bindPopup(`🚌 Bus ${selectedBus}`);

    const bounds = L.latLngBounds([
        [route.from.lat, route.from.lon],
        [route.to.lat, route.to.lon]
    ]);
    liveMap.fitBounds(bounds, { padding: [40, 40] });

    setTimeout(() => liveMap.invalidateSize(), 200);
}

function moveBusOnLiveMap() {
    if (!liveMap || !liveBusMarker || !dailyRouteCoords) return;
    const bus = buses[selectedBus];
    const route = dailyRouteCoords;
    bus.position += bus.speed / 100;
    if (bus.position >= 1) {
        bus.position = 0;
        alertTriggered = false;
    }

    let newLat, newLon;
    if (route.roadPath && route.roadPath.length > 1) {
        const path = route.roadPath;
        const idx = Math.min(Math.floor(bus.position * (path.length - 1)), path.length - 2);
        const t = (bus.position * (path.length - 1)) - idx;
        newLat = path[idx][0] + (path[idx + 1][0] - path[idx][0]) * t;
        newLon = path[idx][1] + (path[idx + 1][1] - path[idx][1]) * t;
    } else {
        newLat = route.from.lat + (route.to.lat - route.from.lat) * bus.position;
        newLon = route.from.lon + (route.to.lon - route.from.lon) * bus.position;
    }

    liveBusMarker.setLatLng([newLat, newLon]);

    const remainingKm = route.distance * (1 - bus.position);
    const eta = Math.max(1, Math.round((remainingKm / 25) * 60));

    let status = "On Time";
    if (selectedBus === "102") status = "Delayed";
    if (eta <= 2) status = "Arriving";

    nextStopElement.textContent = route.to.name;
    etaValueElement.textContent = String(eta).padStart(2, "0");
    distanceValueElement.textContent = `${remainingKm.toFixed(1)} km`;
    statusTextElement.textContent = status;

    if (status === "Delayed") {
        statusTextElement.style.color = "var(--yellow)";
        etaMessageElement.innerHTML = `⚠️ Bus ${bus.number} is slightly late`;
    } else if (status === "Arriving") {
        statusTextElement.style.color = "var(--primary)";
        etaMessageElement.innerHTML = `🚨 Bus ${bus.number} almost at ${route.to.name}`;
    } else {
        statusTextElement.style.color = "var(--green)";
        etaMessageElement.innerHTML = `🚌 Bus ${bus.number} → ${route.to.name} • ${remainingKm.toFixed(1)} km`;
    }

    const progressPercent = Math.round(bus.position * 100);
    routeProgress.style.width = progressPercent + "%";
    routeProgressText.textContent = progressPercent + "%";

    lastUpdated.textContent = new Date().toLocaleTimeString([], {
        hour: "2-digit", minute: "2-digit", second: "2-digit"
    });

    checkSmartAlertReal(route);
}

function checkSmartAlertReal(route) {
    if (!savedStop) return;
    const bus = buses[selectedBus];
    const remainingKm = route.distance * (1 - bus.position);
    const threshold = Number(savedStop.alertDistance);
    if (remainingKm <= threshold && !alertTriggered) {
        alertTriggered = true;
        const msg = `Bus ${bus.number} is ${remainingKm.toFixed(1)} km from ${savedStop.name}`;
        addAlert("bus", "🚨 Bus approaching", msg);
        showToast("🔔", "Smart Stop Alert", msg);
        if ("Notification" in window && Notification.permission === "granted") {
            new Notification("BusPulse", { body: msg });
        }
    }
    if (remainingKm > threshold + 0.5) alertTriggered = false;
}

function showDailyUI(show) {
    const m = show ? "remove" : "add";
    dailyMapCard.classList[m]("hidden");
    dailyBusListCard.classList[m]("hidden");
    dailyEtaCard.classList[m]("hidden");
    dailySmartCard.classList[m]("hidden");

    if (show) {
        populateDailyBusList();
        updateSavedStopUI();
        updateFavoriteButton();
        setTimeout(() => {
            renderLiveRoute(dailyRouteCoords);
        }, 200);
    }
}

function populateDailyBusList() {
    const routeMap = {
        "city-college": ["101", "103"],
        "station-campus": ["102"],
        "market-college": ["103", "101"],
        "home-city": ["104"]
    };
    const nums = routeMap[selectedRoute] || ["101"];
    dailyBusList.innerHTML = "";
    nums.forEach(num => {
        const bus = buses[num];
        if (!bus) return;
        const btn = document.createElement("button");
        btn.className = "bus-option" + (num === selectedBus ? " active" : "");
        btn.dataset.bus = num;
        const color = bus.status === "Delayed" ? "yellow" : "green";
        btn.innerHTML = `
            <div class="bus-number">${bus.number}</div>
            <div class="bus-info">
                <strong>${bus.route}</strong>
                <span>${bus.stops.length} stops • ${bus.etaMinutes} min</span>
            </div>
            <span class="status-dot ${color}"></span>
        `;
        btn.addEventListener("click", () => selectBus(num));
        dailyBusList.appendChild(btn);
    });
}

function selectBus(num) {
    selectedBus = num;
    const bus = buses[num];
    if (!bus) return;
    document.querySelectorAll(".bus-option").forEach(b => {
        b.classList.toggle("active", b.dataset.bus === num);
    });
    selectedBusElement.textContent = bus.number;
    updateFavoriteButton();
    alertTriggered = false;
    showToast("🚌", `Bus ${num} selected`, bus.route);
    if (liveBusMarker) liveBusMarker.setIcon(makeBusIcon());
}

function updateFavoriteButton() {
    const isFav = localStorage.getItem(`favoriteBus_${selectedBus}`);
    if (isFav) {
        favoriteBusBtn.textContent = "★ Favorite";
        favoriteBusBtn.classList.add("favorite");
    } else {
        favoriteBusBtn.textContent = "☆ Favorite";
        favoriteBusBtn.classList.remove("favorite");
    }
}

favoriteBusBtn.addEventListener("click", () => {
    const key = `favoriteBus_${selectedBus}`;
    if (localStorage.getItem(key)) {
        localStorage.removeItem(key);
        updateFavoriteButton();
        showToast("☆", "Removed from favorites", `Bus ${selectedBus}`);
        renderSavedPage();
    } else {
        localStorage.setItem(key, "true");
        updateFavoriteButton();
        showToast("⭐", "Added to favorites", `Bus ${selectedBus}`);
        addAlert("system", "Bus added to favorites", `Bus ${selectedBus}`);
        renderSavedPage();
    }
});

/* =========================================================
   STOP MODAL
   ========================================================= */
setupAlertBtn.addEventListener("click", openStopModal);

function openStopModal() {
    stopModal.classList.add("show");
    stopPickerPoint = null;
    stopSelectedName.textContent = "Not selected";
    stopSelectedCoord.textContent = "--";
    saveStopBtn.disabled = true;

    switchPickerTab("stop", "map");

    $("stopSearchInput").value = "";
    $("stopSearchClear").style.display = "none";
    $("stopSearchResults").innerHTML = `<div class="search-hint"><i class="fas fa-info-circle"></i> Type at least 3 characters</div>`;

    $("manualStopName").value = "";
    $("manualStopLat").value = "";
    $("manualStopLon").value = "";

    if (!stopPickerMap) {
        stopPickerMap = L.map(stopMapEl, { zoomControl: true }).setView([20.0, 74.0], 14);
        L.tileLayer(TILE_URL, TILE_OPTS).addTo(stopPickerMap);
        stopPickerMap.on("click", handleStopMapClick);
    }

    if (stopPickerMarker) { stopPickerMap.removeLayer(stopPickerMarker); stopPickerMarker = null; }

    if (savedStop && savedStop.latitude && savedStop.longitude) {
        const lat = parseFloat(savedStop.latitude);
        const lon = parseFloat(savedStop.longitude);
        stopPickerMap.setView([lat, lon], 16);
        stopPickerMarker = L.marker([lat, lon], { icon: PICK_ICON, draggable: true }).addTo(stopPickerMap);
        attachStopDrag();
        stopPickerPoint = { lat, lon, name: savedStop.name };
        stopSelectedName.textContent = savedStop.name;
        stopSelectedCoord.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        saveStopBtn.disabled = false;

        $("manualStopName").value = savedStop.name;
        $("manualStopLat").value = lat.toFixed(6);
        $("manualStopLon").value = lon.toFixed(6);
    } else {
        getUserLocation().then(loc => {
            stopPickerMap.setView([loc.latitude, loc.longitude], 15);
        }).catch(() => {});
    }

    setTimeout(() => stopPickerMap.invalidateSize(), 200);
}

function closeStopModalFn() {
    stopModal.classList.remove("show");
}

closeStopModal.addEventListener("click", closeStopModalFn);
stopModal.addEventListener("click", e => {
    if (e.target === stopModal) closeStopModalFn();
});

async function handleStopMapClick(e) {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;
    stopPickerPoint = { lat, lon, name: "Loading..." };
    if (stopPickerMarker) stopPickerMap.removeLayer(stopPickerMarker);
    stopPickerMarker = L.marker([lat, lon], { icon: PICK_ICON, draggable: true }).addTo(stopPickerMap);
    attachStopDrag();

    stopSelectedName.textContent = "Loading name...";
    stopSelectedCoord.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

    const name = await reverseGeocode(lat, lon);
    stopPickerPoint.name = name || "My Stop";
    stopSelectedName.textContent = stopPickerPoint.name;
    saveStopBtn.disabled = false;

    $("manualStopName").value = stopPickerPoint.name;
    $("manualStopLat").value = lat.toFixed(6);
    $("manualStopLon").value = lon.toFixed(6);
}

function attachStopDrag() {
    if (!stopPickerMarker) return;
    stopPickerMarker.on("dragend", async ev => {
        const p = ev.target.getLatLng();
        stopPickerPoint.lat = p.lat;
        stopPickerPoint.lon = p.lng;
        stopSelectedCoord.textContent = `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
        const name = await reverseGeocode(p.lat, p.lng);
        if (name) stopPickerPoint.name = name;
        stopSelectedName.textContent = stopPickerPoint.name;
        $("manualStopName").value = stopPickerPoint.name;
        $("manualStopLat").value = p.lat.toFixed(6);
        $("manualStopLon").value = p.lng.toFixed(6);
    });
}

$("stopSearchInput").addEventListener("input", function () {
    const q = this.value.trim();
    $("stopSearchClear").style.display = q ? "flex" : "none";
    if (stopSearchTimeout) clearTimeout(stopSearchTimeout);
    if (q.length < 3) {
        $("stopSearchResults").innerHTML = `<div class="search-hint"><i class="fas fa-info-circle"></i> Type at least 3 characters</div>`;
        return;
    }
    $("stopSearchResults").innerHTML = `<div class="search-hint"><i class="fas fa-spinner fa-spin"></i> Searching...</div>`;
    stopSearchTimeout = setTimeout(() => performStopSearch(q), 600);
});

$("stopSearchClear").addEventListener("click", () => {
    $("stopSearchInput").value = "";
    $("stopSearchClear").style.display = "none";
    $("stopSearchResults").innerHTML = `<div class="search-hint"><i class="fas fa-info-circle"></i> Type at least 3 characters</div>`;
});

async function performStopSearch(query) {
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(query)}`;
        const res = await fetch(url, { headers: { "Accept-Language": "en" } });
        const data = await res.json();

        if (!data || data.length === 0) {
            $("stopSearchResults").innerHTML = `<div class="search-empty"><i class="fas fa-map-pin"></i> No places found</div>`;
            return;
        }

        const html = data.map(item => {
            const name = item.name || item.display_name.split(",")[0];
            return `
                <div class="search-result-item" data-lat="${item.lat}" data-lon="${item.lon}" data-name="${escapeHtml(name)}">
                    <i class="fas fa-map-marker-alt result-icon"></i>
                    <div class="result-content">
                        <div class="result-name">${escapeHtml(name)}</div>
                        <div class="result-detail">${escapeHtml(item.display_name)}</div>
                    </div>
                </div>
            `;
        }).join("");
        $("stopSearchResults").innerHTML = html;

        document.querySelectorAll("#stopSearchResults .search-result-item").forEach(el => {
            el.addEventListener("click", () => {
                const lat = parseFloat(el.dataset.lat);
                const lon = parseFloat(el.dataset.lon);
                const name = el.dataset.name;

                stopPickerPoint = { lat, lon, name };
                stopSelectedName.textContent = name;
                stopSelectedCoord.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
                saveStopBtn.disabled = false;

                if (stopPickerMarker) stopPickerMap.removeLayer(stopPickerMarker);
                stopPickerMarker = L.marker([lat, lon], { icon: PICK_ICON, draggable: true }).addTo(stopPickerMap);
                attachStopDrag();
                if (stopPickerMap) stopPickerMap.setView([lat, lon], 16);

                $("manualStopName").value = name;
                $("manualStopLat").value = lat.toFixed(6);
                $("manualStopLon").value = lon.toFixed(6);

                showToast("✅", "Stop selected", name);
            });
        });
    } catch (e) {
        $("stopSearchResults").innerHTML = `<div class="search-empty"><i class="fas fa-exclamation-triangle"></i> Search failed</div>`;
    }
}

$("manualStopApplyBtn").addEventListener("click", () => {
    const lat = parseFloat($("manualStopLat").value);
    const lon = parseFloat($("manualStopLon").value);
    const name = $("manualStopName").value.trim() || "My Stop";

    if (isNaN(lat) || isNaN(lon)) {
        showToast("⚠️", "Invalid coordinates", "Enter valid latitude & longitude");
        return;
    }
    if (lat < -90 || lat > 90) {
        showToast("⚠️", "Invalid latitude", "Must be -90 to 90");
        return;
    }
    if (lon < -180 || lon > 180) {
        showToast("⚠️", "Invalid longitude", "Must be -180 to 180");
        return;
    }

    stopPickerPoint = { lat, lon, name };
    stopSelectedName.textContent = name;
    stopSelectedCoord.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    saveStopBtn.disabled = false;

    if (stopPickerMarker) stopPickerMap.removeLayer(stopPickerMarker);
    stopPickerMarker = L.marker([lat, lon], { icon: PICK_ICON, draggable: true }).addTo(stopPickerMap);
    attachStopDrag();

    if (stopPickerMap) {
        stopPickerMap.setView([lat, lon], 16);
        setTimeout(() => stopPickerMap.invalidateSize(), 100);
    }

    showToast("✅", "Coordinates applied", name);
});

stopGpsBtn.addEventListener("click", async function () {
    const btn = this;
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;
    try {
        const loc = await getUserLocation();
        stopPickerMap.setView([loc.latitude, loc.longitude], 16);
        if (stopPickerMarker) stopPickerMap.removeLayer(stopPickerMarker);
        stopPickerMarker = L.marker([loc.latitude, loc.longitude], { icon: PICK_ICON, draggable: true }).addTo(stopPickerMap);
        attachStopDrag();
        stopPickerPoint = { lat: loc.latitude, lon: loc.longitude, name: "My Current Location" };

        const name = await reverseGeocode(loc.latitude, loc.longitude);
        if (name) stopPickerPoint.name = name;
        stopSelectedName.textContent = stopPickerPoint.name;
        stopSelectedCoord.textContent = `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`;
        saveStopBtn.disabled = false;

        $("manualStopName").value = stopPickerPoint.name;
        $("manualStopLat").value = loc.latitude.toFixed(6);
        $("manualStopLon").value = loc.longitude.toFixed(6);

        showToast("📍", "Current location set", `Accuracy ±${Math.round(loc.accuracy)}m`);
    } catch (err) {
        showToast("⚠️", "Location error", err.message);
    } finally {
        btn.innerHTML = orig;
        btn.disabled = false;
    }
});

saveStopBtn.addEventListener("click", () => {
    if (!stopPickerPoint) return;
    const alertDistance = $("alertDistanceInput").value;
    savedStop = {
        name: stopPickerPoint.name,
        latitude: stopPickerPoint.lat.toFixed(6),
        longitude: stopPickerPoint.lon.toFixed(6),
        alertDistance
    };
    localStorage.setItem("busPulseStop", JSON.stringify(savedStop));
    updateSavedStopUI();
    closeStopModalFn();
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }
    showToast("📍", "Stop saved", `${savedStop.name} is now monitored.`);
    addAlert("stop", "Smart Stop Alert Enabled", `${savedStop.name} saved for Bus ${selectedBus}`);
    renderSavedPage();
});

function updateSavedStopUI() {
    const nameEl = $("savedStopName");
    const coordEl = $("savedStopCoordinates");
    const statusEl = $("alertStatus");
    if (!savedStop) {
        nameEl.textContent = "No stop saved";
        coordEl.textContent = "Tap to pick on map";
        statusEl.textContent = "OFF";
        statusEl.classList.remove("on");
        return;
    }
    nameEl.textContent = savedStop.name;
    coordEl.textContent = `${savedStop.latitude}, ${savedStop.longitude}`;
    statusEl.textContent = "ON";
    statusEl.classList.add("on");
}

/* =========================================================
   OCCASIONAL RIDER
   ========================================================= */
function findBusesForRealRoute(route) {
    occasionalResultCard.classList.remove("hidden");
    occasionalBusResults.innerHTML = "";

    const destName = route.to.name.toLowerCase();
    const matched = Object.values(buses).filter(bus =>
        bus.stops.some(s => s.toLowerCase().includes(destName)) ||
        bus.route.toLowerCase().includes(destName)
    );
    const list = matched.length ? matched : Object.values(buses);

    list.forEach(bus => {
        const eta = Math.max(1, Math.round((route.distance / 25) * 60));
        const div = document.createElement("div");
        div.className = "result-bus";
        div.innerHTML = `
            <div>
                <div class="bus-num">${bus.number}</div>
                <div class="bus-route">${bus.route}</div>
            </div>
            <div class="bus-eta">${eta} min<small>${route.distance.toFixed(1)} km trip</small></div>
        `;
        div.addEventListener("click", () => selectOccasionalBus(bus, route));
        occasionalBusResults.appendChild(div);
    });

    showToast("🔍", "Buses found", `${list.length} bus(es) for your trip`);
}

function selectOccasionalBus(bus, route) {
    selectedBus = bus.number;
    buses[bus.number].position = 0;

    occasionalTripCard.classList.remove("hidden");
    tripFrom.textContent = route.from.name;
    tripTo.textContent = route.to.name;
    tripBusNumber.textContent = bus.number;
    const eta = Math.max(1, Math.round((route.distance / 25) * 60));
    tripEta.textContent = eta + " min";
    tripDistance.textContent = route.distance.toFixed(1) + " km";
    tripStatus.textContent = "En Route";
    tripStatus.style.color = "var(--green)";
    tripMessage.innerHTML = `🚌 Tracking ${route.from.name} → ${route.to.name}`;

    renderOccInlineMap(route);
    showToast("🚌", `Bus ${bus.number} selected`, `Tracking to ${route.to.name}`);
}

function renderOccInlineMap(route) {
    occInlineMap.style.display = "block";
    if (!occInlineMapInst) {
        occInlineMapInst = L.map(occInlineMap, {
            zoomControl: false,
            attributionControl: false
        });
        L.tileLayer(TILE_URL, TILE_OPTS).addTo(occInlineMapInst);
    }

    occInlineMapInst.eachLayer(l => {
        if (l instanceof L.Marker || l instanceof L.Polyline) occInlineMapInst.removeLayer(l);
    });

    if (route.roadPath && route.roadPath.length > 1) {
        L.polyline(route.roadPath, { color: "#8b7cff", weight: 4, opacity: 0.8 }).addTo(occInlineMapInst);
    } else {
        L.polyline(
            [[route.from.lat, route.from.lon], [route.to.lat, route.to.lon]],
            { color: "#8b7cff", weight: 3, opacity: 0.7, dashArray: "6,5" }
        ).addTo(occInlineMapInst);
    }

    L.marker([route.from.lat, route.from.lon], { icon: FROM_ICON }).addTo(occInlineMapInst);
    L.marker([route.to.lat, route.to.lon], { icon: TO_ICON }).addTo(occInlineMapInst);

    const startPos = route.roadPath && route.roadPath.length
        ? route.roadPath[0]
        : [route.from.lat, route.from.lon];
    occInlineBusMarker = L.marker(startPos, { icon: makeBusIcon() }).addTo(occInlineMapInst);

    const bounds = L.latLngBounds([
        [route.from.lat, route.from.lon],
        [route.to.lat, route.to.lon]
    ]);
    occInlineMapInst.fitBounds(bounds, { padding: [30, 30] });

    setTimeout(() => occInlineMapInst.invalidateSize(), 200);

    if (occInlineInterval) clearInterval(occInlineInterval);
    let pos = 0;
    occInlineInterval = setInterval(() => {
        pos += 0.015;
        if (pos > 1) pos = 0;
        let lat, lon;
        if (route.roadPath && route.roadPath.length > 1) {
            const path = route.roadPath;
            const idx = Math.min(Math.floor(pos * (path.length - 1)), path.length - 2);
            const t = (pos * (path.length - 1)) - idx;
            lat = path[idx][0] + (path[idx + 1][0] - path[idx][0]) * t;
            lon = path[idx][1] + (path[idx + 1][1] - path[idx][1]) * t;
        } else {
            lat = route.from.lat + (route.to.lat - route.from.lat) * pos;
            lon = route.from.lon + (route.to.lon - route.from.lon) * pos;
        }
        if (occInlineBusMarker) occInlineBusMarker.setLatLng([lat, lon]);

        const remainingKm = route.distance * (1 - pos);
        const eta = Math.max(1, Math.round((remainingKm / 25) * 60));
        tripEta.textContent = eta + " min";
        tripDistance.textContent = remainingKm.toFixed(1) + " km";
        if (eta <= 2) {
            tripStatus.textContent = "Arriving";
            tripStatus.style.color = "var(--primary)";
            tripMessage.innerHTML = "🚨 Bus is almost at destination";
        } else {
            tripStatus.textContent = "En Route";
            tripStatus.style.color = "var(--green)";
            tripMessage.innerHTML = `🚌 Bus is on the way • ${remainingKm.toFixed(1)} km left`;
        }
    }, 1000);
}

/* =========================================================
   ALERTS SYSTEM (persisted history)
   ========================================================= */
function addAlert(type, title, message) {
    const alert = {
        id: Date.now() + Math.random(),
        type,
        title,
        message,
        time: new Date().toISOString()
    };
    alertHistory.unshift(alert);
    if (alertHistory.length > 100) alertHistory = alertHistory.slice(0, 100);
    localStorage.setItem("busPulseAlertHistory", JSON.stringify(alertHistory));

    // Also push to notification panel
    notificationCount++;
    notificationBadge.style.display = "flex";
    notificationBadge.textContent = notificationCount;
    const empty = notificationList.querySelector(".empty-notification");
    if (empty) empty.remove();
    const item = document.createElement("div");
    item.className = "notification-item";
    item.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
    notificationList.prepend(item);

    // Re-render alerts page if visible
    if ($("alertsPage").classList.contains("show")) {
        renderAlertsPage();
    }
}

notificationBtn.addEventListener("click", () => notificationPanel.classList.toggle("show"));

$("clearNotifications").addEventListener("click", () => {
    notificationCount = 0;
    notificationBadge.style.display = "none";
    notificationList.innerHTML = `<div class="empty-notification">No new notifications</div>`;
});

/* =========================================================
   TOAST
   ========================================================= */
function showToast(icon, title, message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div>
            <strong>${title}</strong>
            <span>${message}</span>
        </div>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(20px)";
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

$("recenterMap").addEventListener("click", () => {
    if (!liveMap || !dailyRouteCoords) return;
    const bounds = L.latLngBounds([
        [dailyRouteCoords.from.lat, dailyRouteCoords.from.lon],
        [dailyRouteCoords.to.lat, dailyRouteCoords.to.lon]
    ]);
    liveMap.fitBounds(bounds, { padding: [40, 40] });
});

/* =========================================================
   SAVED TAB PAGE
   ========================================================= */
function renderSavedPage() {
    // Route
    const routeList = $("savedRouteList");
    if (dailyRouteCoords) {
        routeList.innerHTML = `
            <div class="saved-card">
                <div class="icon-box blue"><i class="fas fa-route"></i></div>
                <div class="content">
                    <strong>${escapeHtml(dailyRouteCoords.from.name)} → ${escapeHtml(dailyRouteCoords.to.name)}</strong>
                    <span>${dailyRouteCoords.distance.toFixed(1)} km • saved route</span>
                </div>
                <button class="action-btn" data-delete-route>
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        routeList.querySelector("[data-delete-route]").addEventListener("click", () => {
            if (confirm("Delete saved route?")) {
                dailyRouteCoords = null;
                localStorage.removeItem("busPulseDailyRoute");
                renderSavedPage();
                showDailyUI(false);
                dailyRouteSummary.classList.add("hidden");
                showToast("🗑️", "Route deleted", "Your daily route removed");
            }
        });
    } else {
        routeList.innerHTML = `
            <div class="empty-saved">
                <i class="fas fa-route"></i>
                No daily route saved yet.<br>Set one from the home screen.
            </div>
        `;
    }

    // Stop
    const stopList = $("savedStopList");
    if (savedStop) {
        stopList.innerHTML = `
            <div class="saved-card">
                <div class="icon-box green"><i class="fas fa-map-pin"></i></div>
                <div class="content">
                    <strong>${escapeHtml(savedStop.name)}</strong>
                    <span>${savedStop.latitude}, ${savedStop.longitude}<br>Alert within ${savedStop.alertDistance} km</span>
                </div>
                <button class="action-btn" data-delete-stop>
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        stopList.querySelector("[data-delete-stop]").addEventListener("click", () => {
            if (confirm("Delete saved stop?")) {
                savedStop = null;
                localStorage.removeItem("busPulseStop");
                updateSavedStopUI();
                renderSavedPage();
                showToast("🗑️", "Stop deleted", "Your stop was removed");
            }
        });
    } else {
        stopList.innerHTML = `
            <div class="empty-saved">
                <i class="fas fa-map-pin"></i>
                No stop saved yet.<br>Pick one to get bus alerts.
            </div>
        `;
    }

    // Favorites
    const favList = $("savedFavoriteList");
    const favorites = Object.keys(buses).filter(num =>
        localStorage.getItem(`favoriteBus_${num}`)
    );
    if (favorites.length === 0) {
        favList.innerHTML = `
            <div class="empty-saved">
                <i class="fas fa-star"></i>
                No favorite buses yet.<br>Tap ☆ on any bus to save it.
            </div>
        `;
    } else {
        favList.innerHTML = favorites.map(num => {
            const bus = buses[num];
            return `
                <div class="saved-card">
                    <div class="icon-box yellow"><i class="fas fa-bus"></i></div>
                    <div class="content">
                        <strong>Bus ${bus.number}</strong>
                        <span>${bus.route} • ${bus.stops.length} stops</span>
                    </div>
                    <button class="action-btn" data-remove-fav="${num}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        }).join("");
        favList.querySelectorAll("[data-remove-fav]").forEach(btn => {
            btn.addEventListener("click", () => {
                const num = btn.dataset.removeFav;
                localStorage.removeItem(`favoriteBus_${num}`);
                renderSavedPage();
                updateFavoriteButton();
                showToast("☆", "Removed from favorites", `Bus ${num}`);
            });
        });
    }
}

/* =========================================================
   ALERTS TAB PAGE
   ========================================================= */
function renderAlertsPage() {
    const list = $("alertsList");
    let filtered = alertHistory;
    if (currentAlertFilter !== "all") {
        filtered = alertHistory.filter(a => a.type === currentAlertFilter);
    }

    if (filtered.length === 0) {
        list.innerHTML = `
            <div class="empty-saved">
                <i class="fas fa-bell-slash"></i>
                No alerts yet.<br>Your bus activity will appear here.
            </div>
        `;
        return;
    }

    list.innerHTML = filtered.map(a => {
        const timeAgo = formatTimeAgo(new Date(a.time));
        const dotClass = a.type === "bus" ? "danger"
            : a.type === "route" ? "info"
            : a.type === "stop" ? "success"
            : "warn";
        return `
            <div class="alert-item">
                <div class="alert-dot ${dotClass}"></div>
                <div class="alert-content">
                    <strong>${escapeHtml(a.title)}</strong>
                    <span>${escapeHtml(a.message)}</span>
                    <div class="alert-time">
                        <i class="far fa-clock"></i> ${timeAgo}
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

function formatTimeAgo(date) {
    const sec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (sec < 60) return "Just now";
    if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)} hr ago`;
    return `${Math.floor(sec / 86400)} days ago`;
}

document.querySelectorAll(".alert-filter").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".alert-filter").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentAlertFilter = btn.dataset.filter;
        renderAlertsPage();
    });
});

/* =========================================================
   TAB PAGE OPEN/CLOSE
   ========================================================= */
function openTabPage(id) {
    document.querySelectorAll(".tab-page").forEach(p => p.classList.remove("show"));
    $(id).classList.add("show");
    if (id === "savedPage") renderSavedPage();
    if (id === "alertsPage") renderAlertsPage();
}

function closeTabPage(id) {
    $(id).classList.remove("show");
}

document.querySelectorAll("[data-close-tab]").forEach(btn => {
    btn.addEventListener("click", () => closeTabPage(btn.dataset.closeTab));
});

/* =========================================================
   MOBILE NAV
   ========================================================= */
document.querySelectorAll(".mobile-nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".mobile-nav-item").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const nav = btn.dataset.nav;

        if (nav === "home") {
            closeTabPage("savedPage");
            closeTabPage("alertsPage");
            window.scrollTo({ top: 0, behavior: "smooth" });
        } else if (nav === "buses") {
            closeTabPage("savedPage");
            closeTabPage("alertsPage");
            if (currentUserType === "daily") {
                if (!dailyMapCard.classList.contains("hidden"))
                    dailyBusListCard.scrollIntoView({ behavior: "smooth" });
                else
                    showToast("🚌", "Buses", "Set your route first to see buses");
            } else {
                if (!occasionalResultCard.classList.contains("hidden"))
                    occasionalResultCard.scrollIntoView({ behavior: "smooth" });
                else
                    showToast("🚌", "Buses", "Pick your destination first");
            }
        } else if (nav === "alerts") {
            closeTabPage("savedPage");
            openTabPage("alertsPage");
        } else if (nav === "saved") {
            closeTabPage("alertsPage");
            openTabPage("savedPage");
        }
    });
});

/* =========================================================
   INIT
   ========================================================= */
window.addEventListener("load", () => {
    if (dailyRouteCoords) {
        showDailyUI(true);
        dailyRouteSummary.innerHTML = `✅ <b>${dailyRouteCoords.from.name}</b> → <b>${dailyRouteCoords.to.name}</b><br><small style="color:var(--muted)">${dailyRouteCoords.distance.toFixed(1)} km • saved</small>`;
        dailyRouteSummary.classList.remove("hidden");
    }
    if (savedStop) {
        $("alertDistanceInput").value = savedStop.alertDistance || "1";
    }
    updateSavedStopUI();
    updateFavoriteButton();
    populateDailyBusList();
    renderSavedPage();
    renderAlertsPage();

    setTimeout(() => {
        addAlert("system", "Live tracking active", `Bus ${selectedBus} is being tracked`);
    }, 1500);
});

setInterval(() => {
    if (currentUserType === "daily" && dailyRouteCoords && liveMap) {
        moveBusOnLiveMap();
    }
}, 1500);

console.log("🚌 BusPulse loaded — with Saved + Alerts tabs and Current Location");
/* =========================================================
   PWA: SERVICE WORKER + INSTALL PROMPT
   ========================================================= */
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch((err) => {
            console.log("Service worker registration failed:", err);
        });
    });
}

let deferredInstallPrompt = null;
const installBtn = $("installBtn");

window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (installBtn) installBtn.classList.remove("hidden");
});

if (installBtn) {
    installBtn.addEventListener("click", async () => {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === "accepted") {
            showToast("✅", "App installed", "BusPulse added to your home screen");
        }
        deferredInstallPrompt = null;
        installBtn.classList.add("hidden");
    });
}

window.addEventListener("appinstalled", () => {
    if (installBtn) installBtn.classList.add("hidden");
});
