import "./styles.css";

import PartySocket, { type PartyFetchOptions } from "partysocket";

declare const PARTYKIT_HOST: string;

let pingInterval: ReturnType<typeof setInterval>;

// Let's append all the messages we get into this DOM element
const output = document.getElementById("app") as HTMLDivElement;

// Helper function to add a new line to the DOM
function add(text: string) {
	output.appendChild(document.createTextNode(text));
	output.appendChild(document.createElement("br"));
}

// A PartySocket is like a WebSocket, except it's a bit more magical.
// It handles reconnection logic, buffering messages while it's offline, and more.
const conn = new PartySocket({
	host: "localhost:1999",
	room: "1",
});
const partyFetch = (options: Omit<PartyFetchOptions, "host" | "room">, init?: RequestInit) => {
	return PartySocket.fetch({ host: conn.host, room: conn.room ?? "1", ...options }, init);
};

// You can even start sending messages before the connection is open!
conn.addEventListener("message", (event) => {
	add(`Received -> ${event.data}`);
});

// Let's listen for when the connection opens
// And send a ping every 2 seconds right after
conn.addEventListener("open", async () => {
	add("Connected!");
	add("Sending a ping every 2 seconds...");
	const res = await partyFetch({ path: "" });
	if (res.ok) {
		console.log(await res.text());
	}

	// TODO: make this more interesting / nice
	clearInterval(pingInterval);
	pingInterval = setInterval(() => {
		conn.send("ping");
	}, 1000);
});
