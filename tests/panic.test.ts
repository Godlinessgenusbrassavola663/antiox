import { describe, it, expect } from "vitest";
import { panic, todo, unreachable } from "../src/panic";

describe("panic", () => {
	it("throws with default message", () => {
		expect(() => panic()).toThrow("explicit panic");
	});

	it("throws with custom message", () => {
		expect(() => panic("invariant violated")).toThrow("invariant violated");
	});
});

describe("todo", () => {
	it("throws not yet implemented", () => {
		expect(() => todo()).toThrow("not yet implemented");
	});

	it("includes custom message", () => {
		expect(() => todo("hover support")).toThrow(
			"not yet implemented: hover support",
		);
	});
});

describe("unreachable", () => {
	it("throws at runtime with the value", () => {
		expect(() => unreachable("oops" as never)).toThrow("unreachable: oops");
	});
});
