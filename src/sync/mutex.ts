import { Deque } from "../internal/deque";

type Waiter<T> = (guard: MutexGuard<T>) => void;

/**
 * An asynchronous mutual exclusion lock protecting a value of type `T`.
 *
 * Mirrors the semantics of `tokio::sync::Mutex`. The value can only be
 * accessed through the {@link MutexGuard} returned by {@link lock} or
 * {@link tryLock}.
 */
export class Mutex<T> {
	#value: T;
	#locked = false;
	#waiters: Deque<Waiter<T>> = new Deque();

	constructor(value: T) {
		this.#value = value;
	}

	/**
	 * Acquire the lock, waiting if it is currently held.
	 * Returns a {@link MutexGuard} that provides access to the protected value.
	 */
	lock(): Promise<MutexGuard<T>> {
		if (!this.#locked) {
			this.#locked = true;
			return Promise.resolve(new MutexGuard(this));
		}

		return new Promise<MutexGuard<T>>((resolve) => {
			this.#waiters.push(resolve);
		});
	}

	/**
	 * Try to acquire the lock without waiting.
	 * @throws {Error} If the lock is currently held.
	 */
	tryLock(): MutexGuard<T> {
		if (this.#locked) {
			throw new Error("Mutex is already locked");
		}
		this.#locked = true;
		return new MutexGuard(this);
	}

	/** @internal Get the current value. */
	_getValue(): T {
		return this.#value;
	}

	/** @internal Set the current value. */
	_setValue(v: T): void {
		this.#value = v;
	}

	/** @internal Release the lock and wake the next waiter, if any. */
	_unlock(): void {
		const waiter = this.#waiters.shift();
		if (waiter !== undefined) {
			// Hand the lock directly to the next waiter.
			waiter(new MutexGuard(this));
		} else {
			this.#locked = false;
		}
	}

	/** Wake all waiters and release the lock. */
	[Symbol.dispose](): void {
		// Unlock so any waiting tasks can proceed.
		if (this.#locked) {
			this._unlock();
		}
	}
}

/**
 * An RAII guard that provides exclusive access to the value inside a
 * {@link Mutex}. The lock is released when the guard is released or disposed.
 */
export class MutexGuard<T> {
	#mutex: Mutex<T> | null;

	/** @internal */
	constructor(mutex: Mutex<T>) {
		this.#mutex = mutex;
	}

	/** Read the protected value. */
	get value(): T {
		if (this.#mutex === null) {
			throw new Error("MutexGuard has been released");
		}
		return this.#mutex._getValue();
	}

	/** Write the protected value. */
	set value(v: T) {
		if (this.#mutex === null) {
			throw new Error("MutexGuard has been released");
		}
		this.#mutex._setValue(v);
	}

	/** Release the lock. */
	release(): void {
		if (this.#mutex === null) return;
		const mutex = this.#mutex;
		this.#mutex = null;
		mutex._unlock();
	}

	/** Release the lock. */
	[Symbol.dispose](): void {
		this.release();
	}
}
