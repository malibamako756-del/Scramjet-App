"use strict";
/**
 * @type {HTMLFormElement}
 */
const form = document.getElementById("sj-form");
/**
 * @type {HTMLInputElement}
 */
const address = document.getElementById("sj-address");
/**
 * @type {HTMLInputElement}
 */
const searchEngine = document.getElementById("sj-search-engine");
/**
 * @type {HTMLParagraphElement}
 */
const error = document.getElementById("sj-error");
/**
 * @type {HTMLPreElement}
 */
const errorCode = document.getElementById("sj-error-code");

const settingsCard = document.getElementById("sj-settings");
const settingsToggle = document.getElementById("sj-settings-toggle");
const wispPathInput = document.getElementById("sj-wisp-path");
const searchTemplateInput = document.getElementById("sj-search-template");
const transportSelect = document.getElementById("sj-transport");
const connectionTestButton = document.getElementById("sj-connection-test");
const connectionStatus = document.getElementById("sj-connection-status");
const connectionDetails = document.getElementById("sj-connection-details");

const runtimeConfig = window._CONFIG || {};
const availableTransports = Array.isArray(runtimeConfig.transports) && runtimeConfig.transports.length
        ? runtimeConfig.transports
        : ["/epoxy/index.mjs", "/baremux/worker.js"];
const defaults = {
        wispPath: normalizePath(runtimeConfig.wispPath || "/wisp/"),
        searchTemplate: runtimeConfig.defaultSearch || "https://www.google.com/search?q=%s",
        transport: runtimeConfig.defaultTransport || availableTransports[0] || "/epoxy/index.mjs",
};

const storedSettings = safeParse(localStorage.getItem("scramjet-settings"));
const settings = { ...defaults, ...storedSettings };

let scramjet;
let connection;
let connectivityTimer;

bootstrap();

function bootstrap() {
        try {
                assertRuntime();

                hydrateSettings();
                hydrateTransportOptions();
                renderSettingsToggle();

                const { ScramjetController } = $scramjetLoadController();
                scramjet = new ScramjetController({
                        files: {
                                wasm: "/scram/scramjet.wasm.wasm",
                                all: "/scram/scramjet.all.js",
                                sync: "/scram/scramjet.sync.js",
                        },
                });

                scramjet.init();

                connection = new BareMux.BareMuxConnection("/baremux/worker.js");

                attachEvents();

                // probe connectivity on load so the user immediately knows whether the
                // proxy endpoint is reachable.
                runConnectivityCheck();
        } catch (err) {
                setError("Failed to initialize the proxy UI. Check that static assets loaded correctly.", err);
                ensureSettingsVisible();
        }
}

function attachEvents() {
        settingsToggle?.addEventListener("click", () => {
                const hidden = settingsCard.hidden;
                settingsCard.hidden = !hidden;
                renderSettingsToggle();
        });

        wispPathInput?.addEventListener("change", () => updateSetting("wispPath", normalizePath(wispPathInput.value)));
        searchTemplateInput?.addEventListener("change", () => updateSetting("searchTemplate", searchTemplateInput.value));
        transportSelect?.addEventListener("change", () => updateSetting("transport", transportSelect.value));
        connectionTestButton?.addEventListener("click", () => runConnectivityCheck());
}

form.addEventListener("submit", async (event) => {
        event.preventDefault();

        try {
                if (!connection || !scramjet) throw new Error("Proxy runtime is unavailable.");

                await registerSW();
                searchEngine.value = settings.searchTemplate;
                const url = search(address.value, settings.searchTemplate);
                const wispUrl = buildWispUrl(settings.wispPath);

                await connection.setTransport(settings.transport, [{ wisp: wispUrl }]);

                const frame = scramjet.createFrame();
                frame.frame.id = "sj-frame";
                removeExistingFrame();
                document.body.appendChild(frame.frame);
                frame.go(url);

                clearError();
        } catch (err) {
                setError("Failed to start the proxy", err);
                ensureSettingsVisible();
        }
});

function buildWispUrl(path) {
        const scheme = location.protocol === "https:" ? "wss" : "ws";
        return `${scheme}://${location.host}${normalizePath(path)}`;
}

function normalizePath(path) {
        if (!path) return "/wisp/";
        const prefixed = path.startsWith("/") ? path : `/${path}`;
        return prefixed.endsWith("/") ? prefixed : `${prefixed}/`;
}

function renderSettingsToggle() {
        if (!settingsToggle || !settingsCard) return;

        const expanded = !settingsCard.hidden;
        settingsToggle.textContent = expanded ? "Hide panel" : "Show panel";
        settingsToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
}

function hydrateSettings() {
        if (wispPathInput) wispPathInput.value = settings.wispPath;
        if (searchTemplateInput) searchTemplateInput.value = settings.searchTemplate;
        if (transportSelect) transportSelect.value = settings.transport;
        searchEngine.value = settings.searchTemplate;

        // Keep the settings visible by default so users always see the current
        // configuration and diagnostics feedback.
        ensureSettingsVisible();
}

function hydrateTransportOptions() {
        if (!transportSelect) return;

        transportSelect.innerHTML = "";
        availableTransports.forEach((value) => {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = describeTransport(value);
                transportSelect.appendChild(option);
        });

        transportSelect.value = settings.transport;
}

function describeTransport(value) {
        if (value.includes("epoxy")) return "Epoxy";
        if (value.includes("bare")) return "Bare-mux";
        return value;
}

function updateSetting(key, value) {
        settings[key] = value;
        localStorage.setItem("scramjet-settings", JSON.stringify(settings));
        hydrateSettings();
        scheduleConnectivityCheck();
}

function safeParse(value) {
        if (!value) return {};
        try {
                return JSON.parse(value);
        } catch (err) {
                return {};
        }
}

function assertRuntime() {
        if (!window.$scramjetLoadController) {
                throw new Error("Scramjet runtime failed to load (missing scramjet.all.js)");
        }

        if (!window.BareMux || !BareMux.BareMuxConnection) {
                throw new Error("BareMux runtime failed to load (missing /baremux/index.js)");
        }
}

function ensureSettingsVisible() {
        if (!settingsCard) return;
        settingsCard.hidden = false;
        renderSettingsToggle();
}

function scheduleConnectivityCheck() {
        if (!connectionTestButton) return;

        if (connectivityTimer) clearTimeout(connectivityTimer);
        connectivityTimer = setTimeout(() => runConnectivityCheck(), 500);
}

function removeExistingFrame() {
        const existing = document.getElementById("sj-frame");
        existing?.remove();
}

async function runConnectivityCheck() {
        if (!connectionStatus || !connectionDetails) return;

        setStatus("checking", "Probing server and WebSocket upgrade...");

        if (connectionTestButton) {
                connectionTestButton.disabled = true;
                connectionTestButton.textContent = "Checking...";
        }

        try {
                const healthStart = performance.now();
                const health = await fetch("/healthz", { cache: "no-store" });

                if (!health.ok) throw new Error(`Health check failed with ${health.status}`);

                const healthData = await health.json();
                const healthMs = Math.round(performance.now() - healthStart);
                const wispUrl = buildWispUrl(healthData.wispPath || settings.wispPath);

                const wsMs = await probeWebsocket(wispUrl);

                const dnsDescription = Array.isArray(healthData?.dnsServers)
                        ? ` | DNS: ${healthData.dnsServers.join(", ")}`
                        : "";

                setStatus(
                        "ok",
                        `Health: ${healthMs} ms | WebSocket: ${wsMs} ms | ${wispUrl}${dnsDescription} | ${new Date().toLocaleTimeString()}`
                );
        } catch (err) {
                setStatus("error", err?.message || "Unable to reach Wisp endpoint");
        }

        if (connectionTestButton) {
                connectionTestButton.disabled = false;
                connectionTestButton.textContent = "Test connectivity";
        }
}

function setStatus(state, details) {
        if (!connectionStatus || !connectionDetails) return;

        connectionStatus.classList.remove("status-idle", "status-checking", "status-ok", "status-error", "status-warn");
        connectionStatus.classList.add(`status-${state}`);

        if (state === "checking") connectionStatus.textContent = "Checking";
        else if (state === "ok") connectionStatus.textContent = "Ready";
        else if (state === "warn") connectionStatus.textContent = "Warning";
        else if (state === "error") connectionStatus.textContent = "Error";
        else connectionStatus.textContent = "Idle";

        connectionDetails.textContent = details;
}

function setError(message, err) {
        if (!error || !errorCode) return;
        error.textContent = message;
        errorCode.textContent = err?.stack || err?.message || String(err || "");
        console.error(message, err);
}

function clearError() {
        if (!error || !errorCode) return;
        error.textContent = "";
        errorCode.textContent = "";
}

function probeWebsocket(url) {
        return new Promise((resolve, reject) => {
                const start = performance.now();
                const socket = new WebSocket(url);
                const timer = setTimeout(() => {
                        socket.close();
                        reject(new Error("WebSocket timed out"));
                }, 5000);

                socket.addEventListener("open", () => {
                        clearTimeout(timer);
                        socket.close(1000, "probe");
                        resolve(Math.round(performance.now() - start));
                });

                socket.addEventListener("error", (event) => {
                        clearTimeout(timer);
                        reject(event.error || new Error("WebSocket connection failed"));
                });

                socket.addEventListener("close", (event) => {
                        if (event.wasClean || event.code === 1000) return;
                        clearTimeout(timer);
                        reject(new Error(`WebSocket closed abnormally (${event.code})`));
                });
        });
}
