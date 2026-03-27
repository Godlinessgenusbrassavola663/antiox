import { describe, it, expect } from "vitest";
import {
	channel,
	unboundedChannel,
	Sender,
	Receiver,
	SendError,
	TrySendError,
	TryRecvError,
} from "../../src/sync/mpsc";

describe("bounded channel", () => {
	it("send and recv basic flow", async () => {
		const [tx, rx] = channel<string>(8);
		await tx.send("hello");
		expect(await rx.recv()).toBe("hello");
	});

	it("backpressure blocks send when full", async () => {
		const [tx, rx] = channel<number>(1);
		await tx.send(1);

		let sent = false;
		const sendPromise = tx.send(2).then(() => {
			sent = true;
		});

		// send(2) should be blocked
		await new Promise((r) => setTimeout(r, 10));
		expect(sent).toBe(false);

		// Receiving unblocks the sender
		expect(await rx.recv()).toBe(1);
		await sendPromise;
		expect(sent).toBe(true);
		expect(await rx.recv()).toBe(2);
	});

	it("trySend succeeds when space available", () => {
		const [tx, _rx] = channel<number>(2);
		tx.trySend(1);
		tx.trySend(2);
		expect(tx.capacity()).toBe(0);
	});

	it("trySend throws full when at capacity", () => {
		const [tx, _rx] = channel<number>(1);
		tx.trySend(1);
		expect(() => tx.trySend(2)).toThrow(TrySendError);
		try {
			tx.trySend(2);
		} catch (e) {
			expect((e as TrySendError<number>).kind).toBe("full");
			expect((e as TrySendError<number>).value).toBe(2);
		}
	});

	it("tryRecv succeeds when data available", async () => {
		const [tx, rx] = channel<number>(8);
		await tx.send(42);
		expect(rx.tryRecv()).toBe(42);
	});

	it("tryRecv throws empty when no data", () => {
		const [_tx, rx] = channel<number>(8);
		expect(() => rx.tryRecv()).toThrow(TryRecvError);
		try {
			rx.tryRecv();
		} catch (e) {
			expect((e as TryRecvError).kind).toBe("empty");
		}
	});

	it("multi-producer via clone", async () => {
		const [tx, rx] = channel<string>(8);
		const tx2 = tx.clone();
		await tx.send("from-1");
		await tx2.send("from-2");
		const results = [await rx.recv(), await rx.recv()];
		expect(results.sort()).toEqual(["from-1", "from-2"]);
	});

	it("disconnection: all senders drop -> recv returns null", async () => {
		const [tx, rx] = channel<number>(8);
		await tx.send(1);
		tx.close();
		expect(await rx.recv()).toBe(1);
		expect(await rx.recv()).toBeNull();
	});

	it("disconnection: cloned senders all must drop", async () => {
		const [tx, rx] = channel<number>(8);
		const tx2 = tx.clone();
		tx.close();
		await tx2.send(1);
		tx2.close();
		expect(await rx.recv()).toBe(1);
		expect(await rx.recv()).toBeNull();
	});

	it("receiver close -> senders get SendError", async () => {
		const [tx, rx] = channel<number>(8);
		rx.close();
		await expect(tx.send(1)).rejects.toThrow(SendError);
	});

	it("receiver close -> trySend throws closed", () => {
		const [tx, rx] = channel<number>(8);
		rx.close();
		expect(() => tx.trySend(1)).toThrow(TrySendError);
		try {
			tx.trySend(1);
		} catch (e) {
			expect((e as TrySendError<number>).kind).toBe("closed");
		}
	});

	it("async iterator drains then terminates", async () => {
		const [tx, rx] = channel<number>(8);
		await tx.send(1);
		await tx.send(2);
		await tx.send(3);
		tx.close();

		const results: number[] = [];
		for await (const v of rx) {
			results.push(v);
		}
		expect(results).toEqual([1, 2, 3]);
	});

	it("capacity tracks correctly", async () => {
		const [tx, rx] = channel<number>(4);
		expect(tx.capacity()).toBe(4);
		await tx.send(1);
		expect(tx.capacity()).toBe(3);
		await tx.send(2);
		expect(tx.capacity()).toBe(2);
		await rx.recv();
		expect(tx.capacity()).toBe(3);
	});

	it("isClosed reflects receiver state", () => {
		const [tx, rx] = channel<number>(8);
		expect(tx.isClosed()).toBe(false);
		rx.close();
		expect(tx.isClosed()).toBe(true);
	});

	it("closed() resolves when receiver closes", async () => {
		const [tx, rx] = channel<number>(8);
		let resolved = false;
		void tx.closed().then(() => {
			resolved = true;
		});
		await new Promise((r) => setTimeout(r, 10));
		expect(resolved).toBe(false);
		rx.close();
		await new Promise((r) => setTimeout(r, 10));
		expect(resolved).toBe(true);
	});
});

describe("unbounded channel", () => {
	it("send and recv basic flow", async () => {
		const [tx, rx] = unboundedChannel<string>();
		tx.send("hello");
		expect(await rx.recv()).toBe("hello");
	});

	it("send is synchronous", () => {
		const [tx, _rx] = unboundedChannel<number>();
		tx.send(1);
		tx.send(2);
		tx.send(3);
		// No await needed. If this line runs, send is sync.
	});

	it("disconnection: sender drop -> recv returns null", async () => {
		const [tx, rx] = unboundedChannel<number>();
		tx.send(1);
		tx.close();
		expect(await rx.recv()).toBe(1);
		expect(await rx.recv()).toBeNull();
	});

	it("receiver close -> send throws", () => {
		const [tx, rx] = unboundedChannel<number>();
		rx.close();
		expect(() => tx.send(1)).toThrow(SendError);
	});

	it("async iterator", async () => {
		const [tx, rx] = unboundedChannel<number>();
		tx.send(1);
		tx.send(2);
		tx.close();

		const results: number[] = [];
		for await (const v of rx) {
			results.push(v);
		}
		expect(results).toEqual([1, 2]);
	});

	it("tryRecv disconnected throws", () => {
		const [tx, rx] = unboundedChannel<number>();
		tx.close();
		expect(() => rx.tryRecv()).toThrow(TryRecvError);
		try {
			rx.tryRecv();
		} catch (e) {
			expect((e as TryRecvError).kind).toBe("disconnected");
		}
	});
});
