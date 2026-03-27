import { Deque } from "../internal/deque";

// ============================================================================
// Errors
// ============================================================================

/** Thrown when acquiring from a closed semaphore or when permits are unavailable for a try-acquire. */
export class AcquireError extends Error {
	constructor(message = "Semaphore closed") {
		super(message);
		this.name = "AcquireError";
	}
}

// ============================================================================
// Waiter
// ============================================================================

interface Waiter {
	n: number;
	resolve: (permit: SemaphorePermit) => void;
	reject: (err: AcquireError) => void;
}

// ============================================================================
// Semaphore
// ============================================================================

/**
 * A counting semaphore that limits concurrent access to a resource.
 *
 * Mirrors the semantics of `tokio::sync::Semaphore`. Callers acquire one
 * or more permits before accessing the resource and release them when done.
 */
export class Semaphore {
	#permits: number;
	#closed = false;
	#waiters: Deque<Waiter> = new Deque();

	constructor(permits: number) {
		if (permits < 0) throw new RangeError("Permit count must be >= 0");
		this.#permits = permits;
	}

	/**
	 * Acquire a single permit, waiting if necessary.
	 * @throws {AcquireError} If the semaphore is closed.
	 */
	acquire(): Promise<SemaphorePermit> {
		return this.acquireMany(1);
	}

	/**
	 * Acquire `n` permits, waiting if necessary.
	 * @throws {AcquireError} If the semaphore is closed.
	 */
	acquireMany(n: number): Promise<SemaphorePermit> {
		if (n < 1) throw new RangeError("Must acquire at least 1 permit");
		if (this.#closed) return Promise.reject(new AcquireError());

		// If enough permits are available and nobody is waiting ahead, grant immediately.
		if (this.#waiters.isEmpty() && this.#permits >= n) {
			this.#permits -= n;
			return Promise.resolve(new SemaphorePermit(this, n));
		}

		return new Promise<SemaphorePermit>((resolve, reject) => {
			this.#waiters.push({ n, resolve, reject });
		});
	}

	/**
	 * Try to acquire a single permit without waiting.
	 * @throws {AcquireError} If the semaphore is closed or no permits are available.
	 */
	tryAcquire(): SemaphorePermit {
		return this.tryAcquireMany(1);
	}

	/**
	 * Try to acquire `n` permits without waiting.
	 * @throws {AcquireError} If the semaphore is closed or insufficient permits are available.
	 */
	tryAcquireMany(n: number): SemaphorePermit {
		if (n < 1) throw new RangeError("Must acquire at least 1 permit");
		if (this.#closed) throw new AcquireError();
		if (this.#permits < n) throw new AcquireError("Insufficient permits");
		this.#permits -= n;
		return new SemaphorePermit(this, n);
	}

	/** Return the number of permits currently available. */
	availablePermits(): number {
		return this.#permits;
	}

	/**
	 * Close the semaphore. All current and future waiters receive an
	 * {@link AcquireError}.
	 */
	close(): void {
		if (this.#closed) return;
		this.#closed = true;
		const err = new AcquireError();
		while (!this.#waiters.isEmpty()) {
			this.#waiters.shift()!.reject(err);
		}
	}

	/** Returns `true` if the semaphore has been closed. */
	isClosed(): boolean {
		return this.#closed;
	}

	/** @internal Called by {@link SemaphorePermit.release}. */
	_release(n: number): void {
		this.#permits += n;
		this.#drain();
	}

	/** Drain the waiter queue, granting permits to waiters that can be satisfied. */
	#drain(): void {
		while (!this.#waiters.isEmpty()) {
			// Peek at the head without removing it.
			const head = this.#waiters.shift()!;
			if (this.#closed) {
				head.reject(new AcquireError());
				continue;
			}
			if (this.#permits >= head.n) {
				this.#permits -= head.n;
				head.resolve(new SemaphorePermit(this, head.n));
			} else {
				// Not enough permits. Re-queue at the front by creating a new
				// deque with this waiter first. Since Deque only supports push
				// (append), we put it back and stop draining.
				// We shifted it off, so we need a way to "unshift". Instead,
				// we simply stop and add it back. Because we already shifted
				// it, we create a fresh deque with the waiter at the front.
				const old = this.#waiters;
				this.#waiters = new Deque();
				this.#waiters.push(head);
				while (!old.isEmpty()) {
					this.#waiters.push(old.shift()!);
				}
				break;
			}
		}
	}

	/** Close the semaphore and release resources. */
	[Symbol.dispose](): void {
		this.close();
	}
}

// ============================================================================
// SemaphorePermit
// ============================================================================

/**
 * An RAII guard representing acquired semaphore permits. The permits are
 * returned to the semaphore when the guard is released or disposed.
 */
export class SemaphorePermit {
	#semaphore: Semaphore | null;
	#n: number;

	/** @internal */
	constructor(semaphore: Semaphore, n: number) {
		this.#semaphore = semaphore;
		this.#n = n;
	}

	/** Release the permits back to the semaphore. */
	release(): void {
		if (this.#semaphore === null) return;
		this.#semaphore._release(this.#n);
		this.#semaphore = null;
	}

	/** Release the permits back to the semaphore. */
	[Symbol.dispose](): void {
		this.release();
	}
}
