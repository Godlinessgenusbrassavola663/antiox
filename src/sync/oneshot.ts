/**
 * Single-use channel, mirroring tokio::sync::oneshot.
 *
 * Exactly one value can be sent from the sender to the receiver.
 * The receiver is awaitable via PromiseLike.
 *
 * @module
 */

/** Thrown when the sender is dropped without sending a value. */
export class RecvError extends Error {
	constructor() {
		super("Channel closed without sending a value");
		this.name = "RecvError";
	}
}

/** Thrown when attempting to send on a closed or already-used channel. */
export class SendError<T> extends Error {
	readonly value: T;

	constructor(value: T) {
		super("Failed to send: receiver is closed");
		this.name = "SendError";
		this.value = value;
	}
}

interface SharedState<T> {
	value: T | undefined;
	sent: boolean;
	senderClosed: boolean;
	receiverClosed: boolean;
	resolve: ((value: T) => void) | undefined;
	reject: ((error: RecvError) => void) | undefined;
	closedResolve: (() => void) | undefined;
}

/**
 * Create a oneshot channel.
 *
 * Returns a `[sender, receiver]` pair. The sender can send exactly one value,
 * and the receiver can be awaited to receive it.
 */
export function oneshot<T>(): [OneshotSender<T>, OneshotReceiver<T>] {
	const state: SharedState<T> = {
		value: undefined,
		sent: false,
		senderClosed: false,
		receiverClosed: false,
		resolve: undefined,
		reject: undefined,
		closedResolve: undefined,
	};

	return [new OneshotSender(state), new OneshotReceiver(state)];
}

/** Sends a single value to the paired {@link OneshotReceiver}. */
export class OneshotSender<T> {
	#state: SharedState<T>;
	#dropped = false;

	/** @internal */
	constructor(state: SharedState<T>) {
		this.#state = state;
	}

	/**
	 * Send a value to the receiver.
	 *
	 * @throws {SendError} If the receiver has been closed or the sender has already sent.
	 */
	send(value: T): void {
		if (this.#dropped) {
			throw new SendError(value);
		}
		if (this.#state.sent) {
			throw new SendError(value);
		}
		if (this.#state.receiverClosed) {
			throw new SendError(value);
		}

		this.#state.value = value;
		this.#state.sent = true;
		this.#state.senderClosed = true;

		if (this.#state.resolve) {
			this.#state.resolve(value);
			this.#state.resolve = undefined;
			this.#state.reject = undefined;
		}
	}

	/** Returns `true` if the receiver has been closed or dropped. */
	isClosed(): boolean {
		return this.#state.receiverClosed;
	}

	/**
	 * Returns a promise that resolves when the receiver is dropped.
	 *
	 * Useful for detecting cancellation.
	 */
	closed(): Promise<void> {
		if (this.#state.receiverClosed) {
			return Promise.resolve();
		}
		return new Promise<void>((resolve) => {
			this.#state.closedResolve = resolve;
		});
	}

	/** Drop the sender without sending a value. Rejects the receiver with {@link RecvError}. */
	[Symbol.dispose](): void {
		if (this.#dropped) {
			return;
		}
		this.#dropped = true;
		this.#state.senderClosed = true;

		if (!this.#state.sent && this.#state.reject) {
			this.#state.reject(new RecvError());
			this.#state.resolve = undefined;
			this.#state.reject = undefined;
		}
	}
}

/**
 * Receives a single value from the paired {@link OneshotSender}.
 *
 * Implements `PromiseLike` so it can be directly awaited.
 */
export class OneshotReceiver<T> implements PromiseLike<T> {
	#state: SharedState<T>;
	#promise: Promise<T> | undefined;
	#dropped = false;

	/** @internal */
	constructor(state: SharedState<T>) {
		this.#state = state;
	}

	#getPromise(): Promise<T> {
		if (!this.#promise) {
			if (this.#state.sent) {
				this.#promise = Promise.resolve(this.#state.value as T);
			} else if (this.#state.senderClosed) {
				this.#promise = Promise.reject(new RecvError());
			} else {
				this.#promise = new Promise<T>((resolve, reject) => {
					this.#state.resolve = resolve;
					this.#state.reject = reject;
				});
			}
		}
		return this.#promise;
	}

	/**
	 * PromiseLike implementation. Allows the receiver to be awaited directly.
	 *
	 * Resolves with the sent value, or rejects with {@link RecvError} if the sender is dropped.
	 */
	then<TResult1 = T, TResult2 = never>(
		onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined,
	): Promise<TResult1 | TResult2> {
		return this.#getPromise().then(onfulfilled, onrejected);
	}

	/**
	 * Attempt to receive the value without waiting.
	 *
	 * @throws {RecvError} If no value has been sent yet or the sender was dropped.
	 */
	tryRecv(): T {
		if (this.#state.sent) {
			return this.#state.value as T;
		}
		throw new RecvError();
	}

	/** Close the receiver, signaling to the sender that no value is needed. */
	close(): void {
		if (this.#state.receiverClosed) {
			return;
		}
		this.#state.receiverClosed = true;

		if (this.#state.closedResolve) {
			this.#state.closedResolve();
			this.#state.closedResolve = undefined;
		}
	}

	/** Dispose of the receiver, equivalent to {@link close}. */
	[Symbol.dispose](): void {
		if (this.#dropped) {
			return;
		}
		this.#dropped = true;
		this.close();
	}
}
