import { describe, it, expect } from "vitest";
import { Barrier, BarrierWaitResult } from "../../src/sync/barrier";

describe("Barrier", () => {
	it("N tasks wait, all released together", async () => {
		const n = 5;
		const barrier = new Barrier(n);
		const arrived: number[] = [];

		const tasks = Array.from({ length: n }, (_, i) =>
			barrier.wait().then((result) => {
				arrived.push(i);
				return result;
			}),
		);

		const results = await Promise.all(tasks);
		expect(arrived).toHaveLength(n);
		expect(results).toHaveLength(n);
	});

	it("exactly one leader per generation", async () => {
		const n = 4;
		const barrier = new Barrier(n);

		const tasks = Array.from({ length: n }, () => barrier.wait());
		const results = await Promise.all(tasks);

		const leaders = results.filter((r) => r.isLeader());
		expect(leaders).toHaveLength(1);

		const nonLeaders = results.filter((r) => !r.isLeader());
		expect(nonLeaders).toHaveLength(n - 1);
	});

	it("barrier is reusable (second wave also works)", async () => {
		const n = 3;
		const barrier = new Barrier(n);

		// First wave.
		const wave1 = Array.from({ length: n }, () => barrier.wait());
		const results1 = await Promise.all(wave1);
		expect(results1.filter((r) => r.isLeader())).toHaveLength(1);

		// Second wave.
		const wave2 = Array.from({ length: n }, () => barrier.wait());
		const results2 = await Promise.all(wave2);
		expect(results2.filter((r) => r.isLeader())).toHaveLength(1);
	});
});
