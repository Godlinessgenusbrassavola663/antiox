import { describe, it, expect } from "vitest";
import { RwLock, RwLockReadGuard, RwLockWriteGuard } from "../../src/sync/rwlock";

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("RwLock", () => {
	it("multiple concurrent readers", async () => {
		const lock = new RwLock(42);

		const r1 = await lock.read();
		const r2 = await lock.read();
		const r3 = await lock.read();

		expect(r1.value).toBe(42);
		expect(r2.value).toBe(42);
		expect(r3.value).toBe(42);

		r1.release();
		r2.release();
		r3.release();
	});

	it("writer blocks until readers release", async () => {
		const lock = new RwLock(0);

		const r1 = await lock.read();
		const r2 = await lock.read();

		let writerAcquired = false;
		const writerPromise = lock.write().then((w) => {
			writerAcquired = true;
			return w;
		});

		await delay(20);
		expect(writerAcquired).toBe(false);

		r1.release();
		await delay(10);
		// Still blocked because r2 is held.
		expect(writerAcquired).toBe(false);

		r2.release();
		const writer = await writerPromise;
		expect(writerAcquired).toBe(true);
		writer.release();
	});

	it("readers wait when writer holds lock", async () => {
		const lock = new RwLock(0);

		const writer = await lock.write();

		let readerAcquired = false;
		const readerPromise = lock.read().then((r) => {
			readerAcquired = true;
			return r;
		});

		await delay(20);
		expect(readerAcquired).toBe(false);

		writer.release();
		const reader = await readerPromise;
		expect(readerAcquired).toBe(true);
		reader.release();
	});

	it("tryRead succeeds when no writer", () => {
		const lock = new RwLock("data");
		const r = lock.tryRead();
		expect(r.value).toBe("data");
		r.release();
	});

	it("tryRead throws when writer is active", async () => {
		const lock = new RwLock(0);
		const writer = await lock.write();

		expect(() => lock.tryRead()).toThrow();
		writer.release();
	});

	it("tryWrite succeeds when no readers or writers", () => {
		const lock = new RwLock(0);
		const w = lock.tryWrite();
		expect(w.value).toBe(0);
		w.release();
	});

	it("tryWrite throws when readers are active", async () => {
		const lock = new RwLock(0);
		const reader = await lock.read();

		expect(() => lock.tryWrite()).toThrow();
		reader.release();
	});

	it("tryWrite throws when writer is active", async () => {
		const lock = new RwLock(0);
		const writer = await lock.write();

		expect(() => lock.tryWrite()).toThrow();
		writer.release();
	});

	it("guard value access and mutation", async () => {
		const lock = new RwLock(100);

		// Read guard can access value.
		const reader = await lock.read();
		expect(reader.value).toBe(100);
		reader.release();

		// Write guard can read and mutate value.
		const writer = await lock.write();
		expect(writer.value).toBe(100);
		writer.value = 200;
		expect(writer.value).toBe(200);
		writer.release();

		// Verify mutation persisted.
		const reader2 = await lock.read();
		expect(reader2.value).toBe(200);
		reader2.release();
	});

	it("Symbol.dispose releases read guard", async () => {
		const lock = new RwLock(0);
		const reader = await lock.read();

		reader[Symbol.dispose]();

		// Should be able to write now.
		const writer = lock.tryWrite();
		writer.release();
	});

	it("Symbol.dispose releases write guard", async () => {
		const lock = new RwLock(0);
		const writer = await lock.write();

		writer[Symbol.dispose]();

		// Should be able to read now.
		const reader = lock.tryRead();
		reader.release();
	});
});
