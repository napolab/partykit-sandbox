import type * as Party from "partykit/server";

export default class Server implements Party.Server {
	readonly options: Party.ServerOptions = { hibernate: true };

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
		console.log("start", await this.room.storage.list());
	}

	async onRequest() {
		return Response.json({ message: "Hello, world!" });
	}

	async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
		console.log(`Connected: id: ${conn.id} room: ${this.room.id} url: ${new URL(ctx.request.url).pathname}`);
		console.log("connect", ctx.request.headers.get("x-before-connect"));
		conn.send("hello from server");
	}

	async onMessage(message: string, sender: Party.Connection) {
		this.room.broadcast(`${sender.id}: ${message}`, [sender.id]);
	}
}

Server satisfies Party.Worker;
