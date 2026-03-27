import { describe, it, expect } from "vitest";
import {
	oneshot,
	OneshotSender,
	OneshotReceiver,
	RecvError,
	SendError,
} from "../../src/sync/oneshot";

describe("oneshot", () => {
	it("send then recv", async () => {
		const [tx, rx] = oneshot<number>();
		tx.send(42);
		const value = await rx;
		expect(value).toBe(42);
	});

	it("recv awaits until send", async () => {
		const [tx, rx] = oneshot<string>();
		setTimeout(() => tx.send("hello"), 20);
		const value = await rx;
		expect(value).toBe("hello");
	});

	it("receiver is PromiseLike (await works)", async () => {
		const [tx, rx] = oneshot<number>();
		tx.send(7);
		const value = await rx.then((v) => v * 2);
		expect(value).toBe(14);
	});

	it("sender dispose -> receiver rejects with RecvError", async () => {
		const [tx, rx] = oneshot<number>();
		{
			using _sender = tx;
		}
		await expect(rx).rejects.toThrow(RecvError);
	});

	it("receiver close -> sender throws SendError on send", () => {
		const [tx, rx] = oneshot<number>();
		rx.close();
		expect(() => tx.send(1)).toThrow(SendError);
	});

	it("tryRecv before send throws RecvError", () => {
		const [_tx, rx] = oneshot<number>();
		expect(() => rx.tryRecv()).toThrow(RecvError);
	});

	it("tryRecv after send returns value", () => {
		const [tx, rx] = oneshot<number>();
		tx.send(99);
		expect(rx.tryRecv()).toBe(99);
	});

	it("double send throws SendError", () => {
		const [tx, _rx] = oneshot<number>();
		tx.send(1);
		expect(() => tx.send(2)).toThrow(SendError);
	});

	it("isClosed returns false initially, true after receiver close", () => {
		const [tx, rx] = oneshot<number>();
		expect(tx.isClosed()).toBe(false);
		rx.close();
		expect(tx.isClosed()).toBe(true);
	});

	it("closed() resolves when receiver is dropped", async () => {
		const [tx, rx] = oneshot<number>();
		let resolved = false;
		const closedPromise = tx.closed().then(() => {
			resolved = true;
		});
		expect(resolved).toBe(false);
		rx.close();
		await closedPromise;
		expect(resolved).toBe(true);
	});

	it("closed() resolves immediately if receiver already closed", async () => {
		const [tx, rx] = oneshot<number>();
		rx.close();
		await tx.closed();
		expect(tx.isClosed()).toBe(true);
	});

	it("SendError preserves the value", () => {
		const [tx, rx] = oneshot<number>();
		rx.close();
		try {
			tx.send(123);
		} catch (e) {
			expect(e).toBeInstanceOf(SendError);
			expect((e as SendError<number>).value).toBe(123);
		}
	});
});
