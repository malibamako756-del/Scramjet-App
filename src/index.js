import { createServer } from "node:http";
import { fileURLToPath } from "url";
import { hostname } from "node:os";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";

import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const publicPath = fileURLToPath(new URL("../public/", import.meta.url));

// Wisp Configuration: Refer to the documentation at https://www.npmjs.com/package/@mercuryworkshop/wisp-js

const defaultWispPath = normalizePath(process.env.WISP_PATH || "/wisp/");
const defaultSearchTemplate = process.env.DEFAULT_SEARCH_TEMPLATE ||
  "https://www.google.com/search?q=%s";
const defaultTransport = process.env.DEFAULT_TRANSPORT || "/epoxy/index.mjs";
const availableTransports = ["/epoxy/index.mjs", "/baremux/worker.js"];

logging.set_level(resolveLogLevel(process.env.WISP_LOG_LEVEL));
Object.assign(wisp.options, {
  allow_udp_streams: parseEnvBool(process.env.WISP_ALLOW_UDP_STREAMS) || false,
  hostname_blacklist: resolveBlacklist(process.env.WISP_HOSTNAME_BLACKLIST),
  dns_servers: resolveDns(process.env.WISP_DNS),
});

const fastify = Fastify({
        serverFactory: (handler) => {
                return createServer()
                        .on("request", (req, res) => {
                                res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
                                res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
                                handler(req, res);
                        })
                        .on("upgrade", (req, socket, head) => {
                                if (matchesPath(req.url, defaultWispPath)) wisp.routeRequest(req, socket, head);
                                else socket.end();
                        });
        },
});

fastify.get("/config.js", (_req, reply) => {
        reply
                .type("application/javascript")
                .header("Cache-Control", "no-store")
                .send(`window._CONFIG = ${JSON.stringify(runtimeConfig())};`);
});

fastify.get("/healthz", (_req, reply) => {
        reply
                .type("application/json")
                .header("Cache-Control", "no-store")
                .send({
                        status: "ok",
                        ...runtimeConfig(),
                        dnsServers: wisp.options.dns_servers,
                        allowUdpStreams: wisp.options.allow_udp_streams,
                        hostnameBlacklist: (wisp.options.hostname_blacklist || []).map((exp) => exp.toString()),
                });
});

fastify.register(fastifyStatic, {
	root: publicPath,
	decorateReply: true,
});

fastify.register(fastifyStatic, {
  root: scramjetPath,
  prefix: "/scram/",
  decorateReply: false,
});

fastify.register(fastifyStatic, {
	root: epoxyPath,
	prefix: "/epoxy/",
	decorateReply: false,
});

fastify.register(fastifyStatic, {
	root: baremuxPath,
	prefix: "/baremux/",
	decorateReply: false,
});

fastify.setNotFoundHandler((_request, reply) => {
        return reply.code(404).type("text/html").sendFile("404.html");
});

fastify.server.on("listening", () => {
	const address = fastify.server.address();

	// by default we are listening on 0.0.0.0 (every interface)
	// we just need to list a few
	console.log("Listening on:");
	console.log(`\thttp://localhost:${address.port}`);
	console.log(`\thttp://${hostname()}:${address.port}`);
	console.log(
		`\thttp://${
			address.family === "IPv6" ? `[${address.address}]` : address.address
		}:${address.port}`
	);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
        console.log("SIGTERM signal received: closing HTTP server");
        fastify.close();
        process.exit(0);
}

function matchesPath(urlPath, expectedPath) {
        const pathname = new URL(urlPath, "http://localhost").pathname;
        return normalizePath(pathname) === expectedPath;
}

function normalizePath(path) {
        const prefixed = path.startsWith("/") ? path : `/${path}`;
        return prefixed.endsWith("/") ? prefixed : `${prefixed}/`;
}

function parseEnvBool(value) {
        if (!value) return undefined;
        return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function resolveBlacklist(value) {
        if (!value) return [/example\.com/];
        return value
                .split(",")
                .map((entry) => entry.trim())
                .filter(Boolean)
                .map((entry) => new RegExp(entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

function resolveDns(value) {
        if (!value) return ["1.1.1.3", "1.0.0.3"];
        return value
                .split(",")
                .map((entry) => entry.trim())
                .filter(Boolean);
}

function resolveLogLevel(value) {
        if (!value) return logging.NONE;
        const normalized = value.toLowerCase();

        if (normalized === "debug") return logging.DEBUG;
        if (normalized === "info") return logging.INFO;
        if (normalized === "warn") return logging.WARN;
        if (normalized === "error") return logging.ERROR;

        return logging.NONE;
}

function runtimeConfig() {
        return {
                wispPath: defaultWispPath,
                defaultSearch: defaultSearchTemplate,
                defaultTransport,
                transports: availableTransports,
        };
}

let port = parseInt(process.env.PORT || "");

if (isNaN(port)) port = 8080;

fastify
        .listen({
                port,
                host: "0.0.0.0",
        })
        .catch((err) => {
                console.error("Failed to start server", err);
                process.exit(1);
        });
