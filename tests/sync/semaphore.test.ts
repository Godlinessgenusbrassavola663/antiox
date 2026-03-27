import { describe, it, expect } from "vitest";
import { Semaphore, SemaphorePermit, AcquireError } from "../../src/sync/semaphore";

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Semaphore", () => {
	it("acquire/release basic cycle", async () => {
		const sem = new Semaphore(1);
		expect(sem.availablePermits()).toBe(1);

		const permit = await sem.acquire();
		expect(sem.availablePermits()).toBe(0);

		permit.release();
		expect(sem.availablePermits()).toBe(1);
	});

	it("blocks when no permits, unblocks on release", async () => {
		const sem = new Semaphore(1);
		const permit1 = await sem.acquire();

		let acquired = false;
		const waiter = sem.acquire().then((p) => {
			acquired = true;
			return p;
		});

		await delay(20);
		expect(acquired).toBe(false);

		permit1.release();
		const permit2 = await waiter;
		expect(acquired).toBe(true);
		permit2.release();
	});

	it("acquireMany acquires multiple permits", async () => {
		const sem = new Semaphore(5);
		const permit = await sem.acquireMany(3);
		expect(sem.availablePermits()).toBe(2);

		permit.release();
		expect(sem.availablePermits()).toBe(5);
	});

	it("tryAcquire succeeds when permits available", () => {
		const sem = new Semaphore(1);
		const permit = sem.tryAcquire();
		expect(sem.availablePermits()).toBe(0);
		permit.release();
	});

	it("tryAcquire throws when no permits available", async () => {
		const sem = new Semaphore(1);
		const permit = await sem.acquire();

		expect(() => sem.tryAcquire()).toThrow(AcquireError);
		permit.release();
	});

	it("tryAcquireMany succeeds when enough permits available", () => {
		const sem = new Semaphore(3);
		const permit = sem.tryAcquireMany(2);
		expect(sem.availablePermits()).toBe(1);
		permit.release();
	});

	it("tryAcquireMany throws when insufficient permits", () => {
		const sem = new Semaphore(2);
		expect(() => sem.tryAcquireMany(3)).toThrow(AcquireError);
	});

	it("availablePermits accuracy after acquire/release", async () => {
		const sem = new Semaphore(3);
		expect(sem.availablePermits()).toBe(3);

		const p1 = await sem.acquire();
		expect(sem.availablePermits()).toBe(2);

		const p2 = await sem.acquireMany(2);
		expect(sem.availablePermits()).toBe(0);

		p1.release();
		expect(sem.availablePermits()).toBe(1);

		p2.release();
		expect(sem.availablePermits()).toBe(3);
	});

	it("close() wakes waiters with AcquireError", async () => {
		const sem = new Semaphore(0);

		const waiter = sem.acquire();
		sem.close();

		await expect(waiter).rejects.toThrow(AcquireError);
	});

	it("close() causes future acquires to reject", async () => {
		const sem = new Semaphore(1);
		sem.close();

		await expect(sem.acquire()).rejects.toThrow(AcquireError);
	});

	it("isClosed()", () => {
		const sem = new Semaphore(1);
		expect(sem.isClosed()).toBe(false);

		sem.close();
		expect(sem.isClosed()).toBe(true);
	});

	it("Symbol.dispose releases permit", async () => {
		const sem = new Semaphore(1);
		const permit = await sem.acquire();
		expect(sem.availablePermits()).toBe(0);

		permit[Symbol.dispose]();
		expect(sem.availablePermits()).toBe(1);
	});
});
