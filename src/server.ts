import { get, has } from "node-emoji";
import type * as Party from "partykit/server";
import {
	type Output,
	array,
	custom,
	literal,
	number,
	object,
	optional,
	parse,
	safeParse,
	string,
	union,
} from "valibot";

export const Reaction = object({
	name: string([custom((value) => has(value))]),
	count: number(),
});
export type Reaction = Output<typeof Reaction>;

export const MessageType = union([
	object({
		type: literal("connect"),
		payload: object({
			reactions: array(Reaction),
		}),
	}),
	object({
		type: literal("reaction:update"),
		reactions: array(Reaction),
	}),
	object({
		type: literal("reaction:increment"),
		name: string(),
	}),
	object({
		type: literal("reaction:decrement"),
		name: string(),
	}),
	object({
		type: literal("ping"),
	}),
	object({
		type: literal("pong"),
	}),
]);
export type MessageType = Output<typeof MessageType>;

export const SocketPayload = object({
	ping: optional(number(), undefined),
});
export type SocketPayload = Output<typeof SocketPayload>;

export default class Server implements Party.Server {
	readonly options: Party.ServerOptions = { hibernate: true };
	private reactions = new Map<Reaction["name"], Reaction>();
	private KEY = {
		REACTION: "state:reactions",
	};

	constructor(readonly room: Party.Room) {
		console.log("Server constructor");
	}

	static async onFetch(req: Party.Request, lobby: Party.FetchLobby, ctx: Party.ExecutionContext) {
		return new Response("Hello, world!", { status: 200 });
	}

	static async onBeforeRequest(req: Party.Request, lobby: Party.Lobby, ctx: Party.ExecutionContext) {
		console.log("before request", req.url);
		req.headers.set("x-before-request", `${Date.now()}`);
		return req;
	}
	static async onBeforeConnect(req: Party.Request, lobby: Party.Lobby, ctx: Party.ExecutionContext) {
		console.log("before connect", req.url);
		req.headers.set("x-before-connect", `${Date.now()}`);
		return req;
	}
	private async initializeReactions() {
		try {
			const reactions = await this.room.storage.get<Map<Reaction["name"], Reaction>>(this.KEY.REACTION);
			console.log("start", Array.from(reactions?.values() ?? []));
			const emojis = [get("+1"), get("balloon"), get("heart")].filter((v): v is string => v !== undefined && v !== "");

			this.reactions = reactions ?? new Map(emojis.map((emoji) => [emoji, { name: emoji, count: 0 }]));
			if (!reactions) {
				await this.room.storage.put(this.KEY.REACTION, this.reactions);
			}
		} catch (e) {
			console.error("initializeReactions", e);
			throw e;
		}
	}

	private getReactions() {
		return Array.from(this.reactions.values());
	}
	private getReaction(name: string) {
		return this.reactions.get(name);
	}
	private async setReaction(reaction: Reaction) {
		if (!has(reaction.name)) throw new Error("Invalid reaction name");

		this.reactions.set(reaction.name, reaction);
		await this.room.storage.put(this.KEY.REACTION, this.reactions);
	}
	private notifyUpdateReactions() {
		const notify: MessageType = {
			type: "reaction:update",
			reactions: Array.from(this.reactions.values()),
		};
		this.room.broadcast(JSON.stringify(notify));
	}
	private updateAttachment(ws: Party.Connection, payload: SocketPayload) {
		const attachment = ws.deserializeAttachment();
		ws.serializeAttachment({ ...attachment, ...payload });
	}
	private typedAttachment(ws: Party.Connection): SocketPayload {
		const attachment = ws.deserializeAttachment();
		const result = safeParse(SocketPayload, attachment);

		return result.success ? result.output : { ping: 0 };
	}

	async onStart() {
		await this.room.storage.deleteAlarm();

		try {
			await this.initializeReactions();
		} finally {
			await this.room.storage.setAlarm(Date.now() + 30 * 1000);
		}
	}

	async onRequest() {
		return Response.json({ reactions: this.getReactions() });
	}

	async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
		const reactions = this.getReactions();
		const msg: MessageType = { type: "connect", payload: { reactions } };
		conn.send(JSON.stringify(msg));

		this.updateAttachment(conn, { ping: Date.now() });
	}

	async onMessage(message: string, sender: Party.Connection) {
		try {
			const msg: MessageType = parse(MessageType, JSON.parse(message));

			switch (msg.type) {
				case "connect":
					break;
				case "pong":
					this.updateAttachment(sender, { ping: Date.now() });
					console.log("pong", sender.id);
					break;
				case "ping":
					sender.send(JSON.stringify({ type: "pong" } satisfies MessageType));
					break;
				case "reaction:increment": {
					const reaction = this.getReaction(msg.name);
					if (!reaction) break;

					await this.setReaction({ ...reaction, count: Math.min(reaction.count + 1, 99) });
					await this.notifyUpdateReactions();
					break;
				}
				case "reaction:decrement": {
					const reaction = this.getReaction(msg.name);
					if (!reaction) break;

					await this.setReaction({ ...reaction, count: Math.max(0, reaction.count - 1) });
					await this.notifyUpdateReactions();
					break;
				}
			}
		} catch (e) {
			console.error(e);
		}
	}

	async onClose(connection: Party.Connection) {
		console.log("close", connection.id);
	}
	async onError(connection: Party.Connection, error: Error) {
		console.error("error", connection.id, error.message);
	}

	async onAlarm() {
		console.log("alarm");
		try {
			const conns = Array.from(this.room.getConnections());
			if (conns.length < 1) {
				console.log("no connection");
				return;
			}

			for (const ws of conns) {
				const attachment = this.typedAttachment(ws);
				if (typeof attachment.ping !== "number") {
					this.updateAttachment(ws, { ping: Date.now() });
					continue;
				}

				if (Date.now() - attachment.ping > 60 * 1000) {
					console.log("close connection by ping timeout", ws.id);
					ws.close();
				}
			}
			const msg: MessageType = { type: "ping" };
			await this.room.broadcast(JSON.stringify(msg));
			console.log("ping");
			await this.room.storage.setAlarm(Date.now() + 30 * 1000);
		} catch (e) {
			console.error("onAlarm Error", e);
		}
	}
}

Server satisfies Party.Worker;
