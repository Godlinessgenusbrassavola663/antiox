/**
 * Race multiple async branches, cancelling all losers. Mirrors tokio::select!.
 *
 * @module
 */

/**
 * Discriminated union of possible select results.
 *
 * Each variant carries the key of the winning branch and its resolved value.
 */
export type SelectResult<T extends Record<string, (signal: AbortSignal) => Promise<any>>> = {
	[K in keyof T]: { key: K; value: Awaited<ReturnType<T[K]>> };
}[keyof T];

/**
 * Race multiple async branches, returning the first to settle.
 *
 * Each branch receives an `AbortSignal` that is triggered when another branch
 * wins the race. Branches should respect the signal for prompt cancellation.
 *
 * @param branches - A record of named branch functions. Each function receives
 *   an `AbortSignal` and returns a `Promise`.
 * @returns A promise resolving to `{ key, value }` for the winning branch.
 *
 * @example
 * ```ts
 * const result = await select({
 *   timeout: (signal) => sleep(5000, signal),
 *   data: (signal) => fetchData(signal),
 * });
 *
 * if (result.key === "data") {
 *   console.log("Got data:", result.value);
 * } else {
 *   console.log("Timed out");
 * }
 * ```
 */
export async function select<
	T extends Record<string, (signal: AbortSignal) => Promise<any>>,
>(branches: T): Promise<SelectResult<T>> {
	const parentController = new AbortController();

	const entries = Object.entries(branches) as [keyof T & string, T[keyof T & string]][];

	const wrappedPromises = entries.map(([key, fn]) => {
		const childController = new AbortController();

		// When the parent aborts, abort this child too.
		parentController.signal.addEventListener("abort", () => {
			childController.abort();
		});

		return fn(childController.signal).then(
			(value) => ({ key, value }) as SelectResult<T>,
			(error) => {
				throw error;
			},
		);
	});

	try {
		const result = await Promise.race(wrappedPromises);
		return result;
	} finally {
		parentController.abort();
	}
}
