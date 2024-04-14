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
	private KEY = {
		REACTION: "state:reactions",
	};

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
	private async initializeReactions() {
		const reactions = await this.room.storage.get<Map<Reaction["name"], Reaction>>(this.KEY.REACTION);
		console.log("start", this.room.id, reactions);
		const emojis = [get("+1"), get("balloon"), get("heart")].filter((v): v is string => v !== undefined && v !== "");

		this.reactions = reactions ?? new Map(emojis.map((emoji) => [emoji, { name: emoji, count: 0 }]));
		if (!reactions) {
			await this.room.storage.put(this.KEY.REACTION, this.reactions);
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
			type: "update:reaction",
			reactions: Array.from(this.reactions.values()),
		};
		this.room.broadcast(JSON.stringify(notify));
	}

	async onStart() {
		await this.initializeReactions();
	}

	async onRequest() {
		return Response.json({ reactions: this.getReactions() });
	}

	async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
		const reactions = this.getReactions();
		const msg: MessageType = { type: "connect", payload: { reactions } };
		conn.send(JSON.stringify(msg));
	}

	async onMessage(message: string) {
		try {
			const msg: MessageType = parse(MessageType, JSON.parse(message));

			switch (msg.type) {
				case "connect":
					break;
				case "increment": {
					const reaction = this.getReaction(msg.name);
					if (!reaction) break;

					await this.setReaction({ ...reaction, count: Math.min(reaction.count + 1, 99) });
					await this.notifyUpdateReactions();
					break;
				}
				case "decrement": {
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
}

Server satisfies Party.Worker;
