import { get, has } from "node-emoji";
import type * as Party from "partykit/server";
import { type Output, array, custom, literal, number, object, parse, string, union } from "valibot";

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
		type: literal("update:reaction"),
		reactions: array(Reaction),
	}),
	object({
		type: literal("increment"),
		name: string(),
	}),
	object({
		type: literal("decrement"),
		name: string(),
	}),
]);
export type MessageType = Output<typeof MessageType>;

export default class Server implements Party.Server {
	readonly options: Party.ServerOptions = { hibernate: true };
	private reactions = new Map<Reaction["name"], Reaction>();

	constructor(readonly room: Party.Room) {
		//
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

	async onStart() {
		await this.room.blockConcurrencyWhile(async () => {
			const reactions = await this.room.storage.get<Map<Reaction["name"], Reaction>>("reactions");
			console.log("start", reactions);
			const emojis = [get("+1"), get("balloon"), get("heart")].filter((v): v is string => v !== undefined && v !== "");

			this.reactions = reactions ?? new Map(emojis.map((emoji) => [emoji, { name: emoji, count: 0 }]));
			if (reactions === undefined) {
				await this.room.storage.put("state:reactions", this.reactions);
			}
		});
	}

	async onRequest() {
		return Response.json({ reactions: Array.from(this.reactions.values()) });
	}

	async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
		const msg: MessageType = {
			type: "connect",
			payload: { reactions: Array.from(this.reactions.values()) },
		};
		conn.send(JSON.stringify(msg));
	}

	async onMessage(message: string) {
		try {
			const msg: MessageType = parse(MessageType, JSON.parse(message));

			switch (msg.type) {
				case "connect":
					break;
				case "increment": {
					let reaction = this.reactions.get(msg.name);
					if (reaction === undefined) {
						if (this.reactions.size < 10) {
							reaction = { name: msg.name, count: 1 };
							this.reactions.set(msg.name, reaction);
						}
					} else {
						reaction.count = Math.min(reaction.count + 1, 99);
						this.reactions.set(msg.name, reaction);
					}
					this.room.storage.put("state:reactions", this.reactions);

					const notify: MessageType = {
						type: "update:reaction",
						reactions: Array.from(this.reactions.values()),
					};
					this.room.broadcast(JSON.stringify(notify));
					break;
				}
				case "decrement": {
					let reaction = this.reactions.get(msg.name);
					if (reaction === undefined) {
						if (this.reactions.size < 10) {
							reaction = { name: msg.name, count: 0 };
							this.reactions.set(msg.name, reaction);
						}
					} else {
						reaction.count = Math.max(0, reaction.count - 1);
						this.reactions.set(msg.name, reaction);
					}
					this.room.storage.put("state:reactions", this.reactions);

					const notify: MessageType = {
						type: "update:reaction",
						reactions: Array.from(this.reactions.values()),
					};
					this.room.broadcast(JSON.stringify(notify));
					break;
				}
			}
		} catch (e) {
			console.error(e);
		}
	}
}

Server satisfies Party.Worker;
