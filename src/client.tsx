import usePartySocket from "partysocket/react";
import { type FC, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { parse } from "valibot";
import { MessageType, type Reaction } from "./server";

import "./styles.css";

type RoomProps = {
	id: string;
};
const Root: FC<RoomProps> = ({ id }) => {
	const [reactions, setReactions] = useState<Reaction[]>([]);
	const socket = usePartySocket({
		room: id,
		async onMessage(message) {
			if (typeof message.data !== "string") return;

			try {
				const msg = parse(MessageType, JSON.parse(message.data));
				switch (msg.type) {
					case "connect":
						setReactions(msg.payload.reactions);
						break;
					case "reaction:update":
						setReactions(msg.reactions);
						break;
					case "ping":
						await socket.send(JSON.stringify({ type: "pong" } satisfies MessageType));
						break;
					default:
						console.log("Unknown message type", msg);
						break;
				}
			} catch (e) {
				console.error(e);
			}
		},
	});

	const decrement = useCallback(
		(name: string) => {
			socket.send(JSON.stringify({ type: "reaction:decrement", name: name } satisfies MessageType));
		},
		[socket],
	);
	const increment = useCallback(
		(name: string) => {
			socket.send(JSON.stringify({ type: "reaction:increment", name: name } satisfies MessageType));
		},
		[socket],
	);

	return (
		<section>
			<h2>Room: {id}</h2>

			<ul className="reaction-list">
				{reactions.map((reaction) => (
					<li key={reaction.name} className="reactions-list__item">
						<button type="button" onClick={() => decrement(reaction.name)} className="decrement">
							-
						</button>

						<span className="emoji">
							<span>{reaction.name}</span>
							<span>{`${reaction.count}`.padStart(2, "0")}</span>
						</span>

						<button type="button" onClick={() => increment(reaction.name)} className="increment">
							+
						</button>
					</li>
				))}
			</ul>
		</section>
	);
};

const ROOM_ID_KEY = "id";
const App = () => {
	const url = useMemo(() => new URL(location.href), []);
	const [room] = useState(url.searchParams.get(ROOM_ID_KEY) ?? "room");

	useEffect(() => {
		url.searchParams.set(ROOM_ID_KEY, room);
		history.replaceState(null, "", url.toString());
	}, [room, url]);

	return (
		<div className="root">
			<h1>PartyKit Demo</h1>
			<Root id={room} />
		</div>
	);
};

const app = document.getElementById("app");
if (app) {
	createRoot(app).render(<App />);
}
