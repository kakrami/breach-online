import { roomId } from "../../../packages/shared/src/ids.js";
import { BREACH_VERSION, PROTOCOL_VERSION } from "../../../packages/shared/src/version.js";
export { GameRoom } from "./room/GameRoom.js";
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (request.method === "OPTIONS")
            return cors(new Response(null, { status: 204 }), request, env);
        if (url.pathname === "/health") {
            return cors(Response.json({ ok: true, version: BREACH_VERSION, protocol: PROTOCOL_VERSION, phase: 4 }), request, env);
        }
        const match = url.pathname.match(/^\/api\/rooms\/([^/]+)\/socket$/);
        if (match) {
            try {
                const rid = roomId(match[1]);
                url.searchParams.set("room", rid);
                const id = env.ROOMS.idFromName(rid);
                const response = await env.ROOMS.get(id).fetch(new Request(url.toString(), request));
                return response;
            }
            catch (error) {
                return cors(Response.json({ ok: false, error: error instanceof Error ? error.message : "bad_room" }, { status: 400 }), request, env);
            }
        }
        return cors(Response.json({ ok: false, error: "not_found" }, { status: 404 }), request, env);
    }
};
function cors(response, request, env) {
    const headers = new Headers(response.headers);
    const origin = request.headers.get("Origin") ?? "*";
    const allowed = !env.GAME_ORIGIN || env.GAME_ORIGIN === "*" || origin === env.GAME_ORIGIN ? origin : env.GAME_ORIGIN;
    headers.set("Access-Control-Allow-Origin", allowed || "*");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Allow-Methods", "GET,OPTIONS");
    headers.set("Vary", "Origin");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
