import { describe, it, expect } from "vitest";
import { Notify } from "../../src/sync/notify";

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Notify", () => {
	it("notifyOne wakes one waiter", async () => {
		const notify = new Notify();
		let woken = false;

		const waiter = notify.notified().then(() => {
			woken = true;
		});

		expect(woken).toBe(false);
		notify.notifyOne();
		await waiter;
		expect(woken).toBe(true);
	});

	it("notifyWaiters wakes all current waiters", async () => {
		const notify = new Notify();
		const results: number[] = [];

		const w1 = notify.notified().then(() => results.push(1));
		const w2 = notify.notified().then(() => results.push(2));
		const w3 = notify.notified().then(() => results.push(3));

		notify.notifyWaiters();
		await Promise.all([w1, w2, w3]);

		expect(results).toHaveLength(3);
		expect(results).toContain(1);
		expect(results).toContain(2);
		expect(results).toContain(3);
	});

	it("stored permit: notifyOne before notified() resolves immediately", async () => {
		const notify = new Notify();

		// Store a permit before anyone waits.
		notify.notifyOne();

		// This should resolve immediately because a permit is stored.
		let resolved = false;
		const p = notify.notified().then(() => {
			resolved = true;
		});

		// The promise created from Promise.resolve() resolves in a microtick.
		await p;
		expect(resolved).toBe(true);
	});

	it("multiple sequential cycles work", async () => {
		const notify = new Notify();

		for (let i = 0; i < 3; i++) {
			let woken = false;
			const waiter = notify.notified().then(() => {
				woken = true;
			});

			notify.notifyOne();
			await waiter;
			expect(woken).toBe(true);
		}
	});

	it("notifyWaiters does not store a permit", async () => {
		const notify = new Notify();

		// Call notifyWaiters with no waiters. This should NOT store a permit.
		notify.notifyWaiters();

		// A subsequent notified() should not resolve immediately.
		let resolved = false;
		notify.notified().then(() => {
			resolved = true;
		});

		// Give microtasks a chance to flush.
		await delay(20);
		expect(resolved).toBe(false);
	});
});
