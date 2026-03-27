import { Deque } from "../internal/deque";

// ============================================================================
// BarrierWaitResult
// ============================================================================

/**
 * The result returned by {@link Barrier.wait}. Exactly one task per
 * generation is designated the "leader" (the final arrival that triggers
 * the barrier).
 */
export class BarrierWaitResult {
	#leader: boolean;

	/** @internal */
	constructor(leader: boolean) {
		this.#leader = leader;
	}

	/**
	 * Returns `true` if this task was the last to arrive at the barrier,
	 * making it the leader for this generation.
	 */
	isLeader(): boolean {
		return this.#leader;
	}
}

// ============================================================================
// Waiter
// ============================================================================

interface Waiter {
	resolve: (result: BarrierWaitResult) => void;
}

// ============================================================================
// Barrier
// ============================================================================

/**
 * A reusable barrier that allows `n` tasks to synchronize.
 *
 * Mirrors the semantics of `tokio::sync::Barrier`. Each call to
 * {@link wait} blocks until all `n` tasks have arrived. The barrier then
 * resets for the next generation, allowing it to be reused.
 *
 * Exactly one task per generation receives a {@link BarrierWaitResult}
 * where {@link BarrierWaitResult.isLeader} returns `true`. This is
 * always the last task to arrive.
 */
export class Barrier {
	#n: number;
	#count = 0;
	#generation = 0;
	#waiters: Deque<Waiter> = new Deque();

	constructor(n: number) {
		if (n < 1) throw new RangeError("Barrier size must be >= 1");
		this.#n = n;
	}

	/**
	 * Wait until all `n` tasks have called {@link wait} for the current
	 * generation.
	 *
	 * The last task to arrive is the leader. All tasks are released
	 * simultaneously and the barrier resets for the next generation.
	 */
	wait(): Promise<BarrierWaitResult> {
		this.#count++;

		if (this.#count === this.#n) {
			// This is the leader. Wake all waiting tasks and reset.
			const result = new BarrierWaitResult(true);

			while (!this.#waiters.isEmpty()) {
				this.#waiters.shift()!.resolve(new BarrierWaitResult(false));
			}

			// Reset for the next generation.
			this.#count = 0;
			this.#generation++;

			return Promise.resolve(result);
		}

		return new Promise<BarrierWaitResult>((resolve) => {
			this.#waiters.push({ resolve });
		});
	}
}
