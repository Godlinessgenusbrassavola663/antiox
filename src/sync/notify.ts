import { Deque } from "../internal/deque";

type Waiter = (value: void) => void;

/**
 * A notification primitive that allows one or more tasks to wait for a signal.
 *
 * Mirrors the semantics of `tokio::sync::Notify`. Calling {@link notifyOne}
 * when no task is waiting stores a single permit that the next
 * {@link notified} call will consume immediately.
 */
export class Notify {
	#waiters: Deque<Waiter> = new Deque();
	#permit = false;

	/**
	 * Wake one waiting task. If no task is currently waiting, store a permit
	 * so that the next call to {@link notified} returns immediately.
	 */
	notifyOne(): void {
		const waiter = this.#waiters.shift();
		if (waiter !== undefined) {
			waiter();
		} else {
			this.#permit = true;
		}
	}

	/**
	 * Wake all tasks that are currently waiting. Does not store a permit.
	 * Tasks that call {@link notified} after this method returns will still
	 * wait until a subsequent notification.
	 */
	notifyWaiters(): void {
		while (!this.#waiters.isEmpty()) {
			this.#waiters.shift()!();
		}
	}

	/**
	 * Wait until this `Notify` is signalled.
	 *
	 * If a permit was previously stored by {@link notifyOne}, it is consumed
	 * and this method returns immediately.
	 */
	notified(): Promise<void> {
		if (this.#permit) {
			this.#permit = false;
			return Promise.resolve();
		}

		return new Promise<void>((resolve) => {
			this.#waiters.push(resolve);
		});
	}

	/** Wake all waiters and release resources. */
	[Symbol.dispose](): void {
		this.notifyWaiters();
	}
}
