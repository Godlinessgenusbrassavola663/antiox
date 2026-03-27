/**
 * Multi-producer multi-consumer bounded broadcast channel, mirroring tokio::sync::broadcast.
 *
 * Messages are stored in a ring buffer. Slow receivers that fall behind
 * receive a "lagged" error with the count of missed messages.
 *
 * @module
 */

/** Thrown when a receive operation fails due to lag or channel closure. */
export class RecvError extends Error {
	readonly kind: "lagged" | "closed";
	readonly lagged?: number;

	constructor(kind: "lagged" | "closed", lagged?: number) {
		if (kind === "lagged") {
			super(`Receiver lagged behind by ${lagged} messages`);
			this.lagged = lagged;
		} else {
			super("Broadcast channel closed");
		}
		this.name = "RecvError";
		this.kind = kind;
	}
}

interface Waiter<T> {
	resolve: (value: T) => void;
	reject: (error: RecvError) => void;
}

interface SharedState<T> {
	buffer: (T | undefined)[];
	capacity: number;
	/** Absolute write position. The next write goes to `writePos % capacity`. */
	writePos: number;
	senderCount: number;
	receiverCount: number;
	closed: boolean;
	/** Waiters per absolute cursor position. */
	waiters: Map<number, Set<Waiter<T>>>;
}

/**
 * Create a broadcast channel with the given capacity.
 *
 * Returns a `[sender, receiver]` pair. Additional receivers can be created
 * via {@link BroadcastSender.subscribe} or {@link BroadcastReceiver.clone}.
 *
 * @param capacity - Maximum number of messages retained in the ring buffer.
 */
export function broadcast<T>(capacity: number): [BroadcastSender<T>, BroadcastReceiver<T>] {
	if (capacity < 1) {
		throw new RangeError("Broadcast channel capacity must be at least 1");
	}

	const state: SharedState<T> = {
		buffer: new Array(capacity),
		capacity,
		writePos: 0,
		senderCount: 1,
		receiverCount: 1,
		closed: false,
		waiters: new Map(),
	};

	return [new BroadcastSender(state), new BroadcastReceiver(state, state.writePos)];
}

/** Sends values to all paired {@link BroadcastReceiver} instances. */
export class BroadcastSender<T> {
	#state: SharedState<T>;
	#closed = false;

	/** @internal */
	constructor(state: SharedState<T>) {
		this.#state = state;
	}

	/**
	 * Send a value to all current receivers.
	 *
	 * @returns The number of receivers that will receive this message.
	 * @throws {Error} If the channel has been closed.
	 */
	send(value: T): number {
		if (this.#closed || this.#state.closed) {
			throw new Error("Broadcast channel is closed");
		}

		const pos = this.#state.writePos;
		const slot = pos % this.#state.capacity;
		this.#state.buffer[slot] = value;
		this.#state.writePos++;

		// Wake any receivers waiting at this position.
		const waiters = this.#state.waiters.get(pos);
		let notified = 0;
		if (waiters) {
			for (const waiter of waiters) {
				waiter.resolve(value);
				notified++;
			}
			this.#state.waiters.delete(pos);
		}

		return notified;
	}

	/**
	 * Create a new receiver starting at the current write position.
	 *
	 * The new receiver will only see messages sent after this call.
	 */
	subscribe(): BroadcastReceiver<T> {
		this.#state.receiverCount++;
		return new BroadcastReceiver(this.#state, this.#state.writePos);
	}

	/** Returns the number of active receivers. */
	receiverCount(): number {
		return this.#state.receiverCount;
	}

	/** Create a clone of this sender sharing the same channel. */
	clone(): BroadcastSender<T> {
		this.#state.senderCount++;
		return new BroadcastSender(this.#state);
	}

	/**
	 * Close the channel. All pending and future receive operations will
	 * fail with a "closed" {@link RecvError}.
	 */
	close(): void {
		if (this.#closed) {
			return;
		}
		this.#closed = true;
		this.#state.senderCount--;

		if (this.#state.senderCount === 0) {
			this.#state.closed = true;

			// Reject all waiting receivers.
			for (const [, waiters] of this.#state.waiters) {
				for (const waiter of waiters) {
					waiter.reject(new RecvError("closed"));
				}
			}
			this.#state.waiters.clear();
		}
	}

	/** Dispose of this sender, equivalent to {@link close}. */
	[Symbol.dispose](): void {
		this.close();
	}
}

/** Receives values from the paired {@link BroadcastSender}. */
export class BroadcastReceiver<T> {
	#state: SharedState<T>;
	/** Absolute read cursor. */
	#cursor: number;
	#closed = false;

	/** @internal */
	constructor(state: SharedState<T>, cursor: number) {
		this.#state = state;
		this.#cursor = cursor;
	}

	/**
	 * Wait for the next message.
	 *
	 * @throws {RecvError} With `kind: "lagged"` if this receiver fell behind, or
	 *   `kind: "closed"` if the channel is closed.
	 */
	recv(): Promise<T> {
		// Check for lag: the cursor has fallen behind the ring buffer window.
		if (this.#cursor < this.#state.writePos - this.#state.capacity) {
			const missed = this.#state.writePos - this.#state.capacity - this.#cursor;
			// Advance cursor to the oldest available message.
			this.#cursor = this.#state.writePos - this.#state.capacity;
			return Promise.reject(new RecvError("lagged", missed));
		}

		// A message is already available.
		if (this.#cursor < this.#state.writePos) {
			const slot = this.#cursor % this.#state.capacity;
			const value = this.#state.buffer[slot] as T;
			this.#cursor++;
			return Promise.resolve(value);
		}

		// Channel is closed and fully consumed.
		if (this.#state.closed) {
			return Promise.reject(new RecvError("closed"));
		}

		// Wait for the next message at our cursor position.
		return new Promise<T>((resolve, reject) => {
			const waiter: Waiter<T> = {
				resolve: (value: T) => {
					this.#cursor++;
					resolve(value);
				},
				reject,
			};

			let set = this.#state.waiters.get(this.#cursor);
			if (!set) {
				set = new Set();
				this.#state.waiters.set(this.#cursor, set);
			}
			set.add(waiter);
		});
	}

	/**
	 * Attempt to receive the next message without waiting.
	 *
	 * @throws {RecvError} With `kind: "lagged"` if behind, `kind: "closed"` if
	 *   closed, or a generic error if no message is available.
	 */
	tryRecv(): T {
		// Check for lag.
		if (this.#cursor < this.#state.writePos - this.#state.capacity) {
			const missed = this.#state.writePos - this.#state.capacity - this.#cursor;
			this.#cursor = this.#state.writePos - this.#state.capacity;
			throw new RecvError("lagged", missed);
		}

		// A message is available.
		if (this.#cursor < this.#state.writePos) {
			const slot = this.#cursor % this.#state.capacity;
			const value = this.#state.buffer[slot] as T;
			this.#cursor++;
			return value;
		}

		// No message available.
		if (this.#state.closed) {
			throw new RecvError("closed");
		}

		throw new Error("No message available");
	}

	/**
	 * Create a clone of this receiver sharing the same channel.
	 *
	 * The clone starts at the same cursor position as this receiver.
	 */
	clone(): BroadcastReceiver<T> {
		this.#state.receiverCount++;
		return new BroadcastReceiver(this.#state, this.#cursor);
	}

	/** Close this receiver, decrementing the receiver count. */
	close(): void {
		if (this.#closed) {
			return;
		}
		this.#closed = true;
		this.#state.receiverCount--;
	}

	/** Dispose of this receiver, equivalent to {@link close}. */
	[Symbol.dispose](): void {
		this.close();
	}

	/** Async iterator that yields messages until the channel is closed. */
	async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
		while (true) {
			try {
				yield await this.recv();
			} catch (err) {
				if (err instanceof RecvError && err.kind === "closed") {
					return;
				}
				throw err;
			}
		}
	}
}
