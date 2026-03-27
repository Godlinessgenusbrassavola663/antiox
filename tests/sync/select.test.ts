import { describe, it, expect } from "vitest";
import { select } from "../../src/sync/select";

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("select", () => {
	it("first to resolve wins", async () => {
		const result = await select({
			fast: async (_signal) => {
				await delay(10);
				return "fast";
			},
			slow: async (_signal) => {
				await delay(200);
				return "slow";
			},
		});

		expect(result.key).toBe("fast");
		expect(result.value).toBe("fast");
	});

	it("losing branches get aborted", async () => {
		const signals: Record<string, AbortSignal> = {};

		const result = await select({
			winner: async (signal) => {
				signals.winner = signal;
				return "done";
			},
			loser: async (signal) => {
				signals.loser = signal;
				await new Promise((_resolve) => {
					// Never resolves on its own.
				});
				return "never";
			},
		});

		expect(result.key).toBe("winner");

		// Give abort signal propagation a chance to settle.
		await delay(10);
		expect(signals.loser.aborted).toBe(true);
	});

	it("rejection propagates", async () => {
		await expect(
			select({
				fail: async (_signal) => {
					throw new Error("boom");
				},
				slow: async (_signal) => {
					await delay(200);
					return "ok";
				},
			}),
		).rejects.toThrow("boom");
	});

	it("biased by key order when multiple ready synchronously", async () => {
		const result = await select({
			first: async (_signal) => "a",
			second: async (_signal) => "b",
			third: async (_signal) => "c",
		});

		// All resolve synchronously. Promise.race returns the first in iteration order.
		expect(result.key).toBe("first");
		expect(result.value).toBe("a");
	});
});
