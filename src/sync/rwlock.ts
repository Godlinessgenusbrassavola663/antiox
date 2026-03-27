import { Deque } from "../internal/deque";

// ============================================================================
// Waiter types
// ============================================================================

interface ReadWaiter<T> {
	resolve: (guard: RwLockReadGuard<T>) => void;
}

interface WriteWaiter<T> {
	resolve: (guard: RwLockWriteGuard<T>) => void;
}

// ============================================================================
// RwLock
// ============================================================================

/**
 * An asynchronous reader-writer lock protecting a value of type `T`.
 *
 * Mirrors the semantics of `tokio::sync::RwLock`. Multiple readers can hold
 * the lock concurrently, but writers require exclusive access. This
 * implementation is writer-preferring: new readers will wait if a writer is
 * waiting, preventing writer starvation.
 */
export class RwLock<T> {
	#value: T;
	#readerCount = 0;
	#writerActive = false;
	#writerWaiting = 0;
	#readWaiters: Deque<ReadWaiter<T>> = new Deque();
	#writeWaiters: Deque<WriteWaiter<T>> = new Deque();

	constructor(value: T) {
		this.#value = value;
	}

	/**
	 * Acquire a read lock, waiting if a writer is active or waiting.
	 *
	 * Multiple readers can hold the lock simultaneously as long as no writer
	 * is active or waiting.
	 */
	read(): Promise<RwLockReadGuard<T>> {
		// Grant immediately if no writer is active and no writer is waiting.
		if (!this.#writerActive && this.#writerWaiting === 0) {
			this.#readerCount++;
			return Promise.resolve(new RwLockReadGuard(this));
		}

		return new Promise<RwLockReadGuard<T>>((resolve) => {
			this.#readWaiters.push({ resolve });
		});
	}

	/**
	 * Acquire a write lock, waiting if any readers or another writer are active.
	 *
	 * Writers have priority over new readers to prevent starvation.
	 */
	write(): Promise<RwLockWriteGuard<T>> {
		// Grant immediately if no readers and no writer.
		if (!this.#writerActive && this.#readerCount === 0) {
			this.#writerActive = true;
			return Promise.resolve(new RwLockWriteGuard(this));
		}

		this.#writerWaiting++;
		return new Promise<RwLockWriteGuard<T>>((resolve) => {
			this.#writeWaiters.push({ resolve });
		});
	}

	/**
	 * Try to acquire a read lock without waiting.
	 * @throws {Error} If a writer is active or waiting.
	 */
	tryRead(): RwLockReadGuard<T> {
		if (this.#writerActive || this.#writerWaiting > 0) {
			throw new Error("RwLock is held or has a waiting writer");
		}
		this.#readerCount++;
		return new RwLockReadGuard(this);
	}

	/**
	 * Try to acquire a write lock without waiting.
	 * @throws {Error} If any readers or another writer are active.
	 */
	tryWrite(): RwLockWriteGuard<T> {
		if (this.#writerActive || this.#readerCount > 0) {
			throw new Error("RwLock is held");
		}
		this.#writerActive = true;
		return new RwLockWriteGuard(this);
	}

	/** @internal Get the current value. */
	_getValue(): T {
		return this.#value;
	}

	/** @internal Set the current value. */
	_setValue(v: T): void {
		this.#value = v;
	}

	/** @internal Release a read lock and wake waiters if appropriate. */
	_releaseRead(): void {
		this.#readerCount--;
		if (this.#readerCount === 0) {
			this.#wakeNext();
		}
	}

	/** @internal Release a write lock and wake waiters. */
	_releaseWrite(): void {
		this.#writerActive = false;
		this.#wakeNext();
	}

	/**
	 * Wake the next eligible waiters. Writers are preferred: if a writer is
	 * waiting, wake exactly one writer. Otherwise, wake all waiting readers.
	 */
	#wakeNext(): void {
		// Prefer writers to prevent starvation.
		if (!this.#writeWaiters.isEmpty()) {
			this.#writerWaiting--;
			this.#writerActive = true;
			const waiter = this.#writeWaiters.shift()!;
			waiter.resolve(new RwLockWriteGuard(this));
			return;
		}

		// No writers waiting. Wake all readers.
		while (!this.#readWaiters.isEmpty()) {
			this.#readerCount++;
			const waiter = this.#readWaiters.shift()!;
			waiter.resolve(new RwLockReadGuard(this));
		}
	}

	/** Release all waiters and dispose of the lock. */
	[Symbol.dispose](): void {
		// Wake all waiters so they can proceed.
		if (this.#writerActive) {
			this._releaseWrite();
		}
		while (this.#readerCount > 0) {
			this._releaseRead();
		}
	}
}

// ============================================================================
// RwLockReadGuard
// ============================================================================

/**
 * An RAII guard that provides shared read access to the value inside an
 * {@link RwLock}. The read lock is released when the guard is released or
 * disposed.
 */
export class RwLockReadGuard<T> {
	#lock: RwLock<T> | null;

	/** @internal */
	constructor(lock: RwLock<T>) {
		this.#lock = lock;
	}

	/** Read the protected value. */
	get value(): T {
		if (this.#lock === null) {
			throw new Error("RwLockReadGuard has been released");
		}
		return this.#lock._getValue();
	}

	/** Release the read lock. */
	release(): void {
		if (this.#lock === null) return;
		const lock = this.#lock;
		this.#lock = null;
		lock._releaseRead();
	}

	/** Release the read lock. */
	[Symbol.dispose](): void {
		this.release();
	}
}

// ============================================================================
// RwLockWriteGuard
// ============================================================================

/**
 * An RAII guard that provides exclusive write access to the value inside an
 * {@link RwLock}. The write lock is released when the guard is released or
 * disposed.
 */
export class RwLockWriteGuard<T> {
	#lock: RwLock<T> | null;

	/** @internal */
	constructor(lock: RwLock<T>) {
		this.#lock = lock;
	}

	/** Read the protected value. */
	get value(): T {
		if (this.#lock === null) {
			throw new Error("RwLockWriteGuard has been released");
		}
		return this.#lock._getValue();
	}

	/** Write the protected value. */
	set value(v: T) {
		if (this.#lock === null) {
			throw new Error("RwLockWriteGuard has been released");
		}
		this.#lock._setValue(v);
	}

	/** Release the write lock. */
	release(): void {
		if (this.#lock === null) return;
		const lock = this.#lock;
		this.#lock = null;
		lock._releaseWrite();
	}

	/** Release the write lock. */
	[Symbol.dispose](): void {
		this.release();
	}
}
