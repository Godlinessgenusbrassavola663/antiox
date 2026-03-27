import { describe, it, expect } from "vitest";
import { Mutex, MutexGuard } from "../../src/sync/mutex";

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Mutex", () => {
	it("lock/unlock basic flow", async () => {
		const mutex = new Mutex(42);
		const guard = await mutex.lock();
		expect(guard.value).toBe(42);
		guard.release();
	});

	it("second lock waits until first releases", async () => {
		const mutex = new Mutex(0);
		const guard1 = await mutex.lock();

		let secondAcquired = false;
		const waiter = mutex.lock().then((g) => {
			secondAcquired = true;
			return g;
		});

		await delay(20);
		expect(secondAcquired).toBe(false);

		guard1.release();
		const guard2 = await waiter;
		expect(secondAcquired).toBe(true);
		guard2.release();
	});

	it("tryLock succeeds when unlocked", () => {
		const mutex = new Mutex("hello");
		const guard = mutex.tryLock();
		expect(guard.value).toBe("hello");
		guard.release();
	});

	it("tryLock throws when locked", async () => {
		const mutex = new Mutex(0);
		const guard = await mutex.lock();

		expect(() => mutex.tryLock()).toThrow();
		guard.release();
	});

	it("MutexGuard value get/set", async () => {
		const mutex = new Mutex(10);
		const guard = await mutex.lock();

		expect(guard.value).toBe(10);
		guard.value = 20;
		expect(guard.value).toBe(20);

		guard.release();

		// Verify the value persists.
		const guard2 = await mutex.lock();
		expect(guard2.value).toBe(20);
		guard2.release();
	});

	it("Symbol.dispose releases lock", async () => {
		const mutex = new Mutex(0);
		const guard = await mutex.lock();

		// Use Symbol.dispose to release.
		guard[Symbol.dispose]();

		// Should be able to lock again immediately.
		const guard2 = mutex.tryLock();
		expect(guard2.value).toBe(0);
		guard2.release();
	});

	it("concurrent access is serialized", async () => {
		const mutex = new Mutex(0);
		const iterations = 50;

		// Spawn multiple tasks that each increment the counter.
		const tasks = Array.from({ length: iterations }, async () => {
			const guard = await mutex.lock();
			const current = guard.value;
			// Yield to simulate async work.
			await delay(1);
			guard.value = current + 1;
			guard.release();
		});

		await Promise.all(tasks);

		const guard = await mutex.lock();
		expect(guard.value).toBe(iterations);
		guard.release();
	});
});
