import { describe, it, expect } from "vitest";
import {
	broadcast,
	BroadcastSender,
	BroadcastReceiver,
	RecvError,
} from "../../src/sync/broadcast";

describe("broadcast", () => {
	it("all receivers get every message", async () => {
		const [tx, rx1] = broadcast<number>(16);
		const rx2 = tx.subscribe();

		tx.send(1);
		tx.send(2);

		expect(await rx1.recv()).toBe(1);
		expect(await rx1.recv()).toBe(2);
		expect(await rx2.recv()).toBe(1);
		expect(await rx2.recv()).toBe(2);
	});

	it("new subscriber starts from current position", async () => {
		const [tx, rx1] = broadcast<number>(16);
		tx.send(1);
		tx.send(2);

		const rx2 = tx.subscribe();
		tx.send(3);

		expect(await rx2.recv()).toBe(3);
		expect(await rx1.recv()).toBe(1);
		expect(await rx1.recv()).toBe(2);
		expect(await rx1.recv()).toBe(3);
	});

	it("slow receiver gets lagged error when buffer wraps", async () => {
		const [tx, rx] = broadcast<number>(2);

		tx.send(1);
		tx.send(2);
		tx.send(3);
		tx.send(4);

		try {
			await rx.recv();
			expect.unreachable("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(RecvError);
			expect((e as RecvError).kind).toBe("lagged");
			expect((e as RecvError).lagged).toBeGreaterThan(0);
		}

		const val = await rx.recv();
		expect(val).toBe(3);
	});

	it("sender close -> receivers get closed RecvError", async () => {
		const [tx, rx] = broadcast<number>(16);
		tx.close();
		try {
			await rx.recv();
			expect.unreachable("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(RecvError);
			expect((e as RecvError).kind).toBe("closed");
		}
	});

	it("sender close rejects pending recv", async () => {
		const [tx, rx] = broadcast<number>(16);
		const p = rx.recv();
		tx.close();
		await expect(p).rejects.toThrow(RecvError);
	});

	it("receiverCount() tracks correctly", () => {
		const [tx, rx1] = broadcast<number>(16);
		expect(tx.receiverCount()).toBe(1);

		const rx2 = tx.subscribe();
		expect(tx.receiverCount()).toBe(2);

		const rx3 = rx2.clone();
		expect(tx.receiverCount()).toBe(3);

		rx1.close();
		expect(tx.receiverCount()).toBe(2);

		rx2.close();
		rx3.close();
		expect(tx.receiverCount()).toBe(0);
	});

	it("async iterator works, stops on close", async () => {
		const [tx, rx] = broadcast<number>(16);

		tx.send(10);
		tx.send(20);
		tx.send(30);
		setTimeout(() => tx.close(), 10);

		const results: number[] = [];
		for await (const msg of rx) {
			results.push(msg);
		}
		expect(results).toEqual([10, 20, 30]);
	});

	it("async iterator propagates lagged error", async () => {
		const [tx, rx] = broadcast<number>(2);

		tx.send(1);
		tx.send(2);
		tx.send(3);
		tx.send(4);

		try {
			for await (const _msg of rx) {
				// should not iterate without error
			}
			expect.unreachable("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(RecvError);
			expect((e as RecvError).kind).toBe("lagged");
		}
	});

	it("clone sender works", async () => {
		const [tx, rx] = broadcast<number>(16);
		const tx2 = tx.clone();

		tx.send(1);
		tx2.send(2);

		expect(await rx.recv()).toBe(1);
		expect(await rx.recv()).toBe(2);

		tx.close();
		tx2.send(3);
		expect(await rx.recv()).toBe(3);

		tx2.close();
		await expect(rx.recv()).rejects.toThrow(RecvError);
	});
});
