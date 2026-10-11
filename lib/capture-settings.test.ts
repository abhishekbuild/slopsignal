import { expect, test } from "vitest";
import { DEFAULT_CAPTURE, parseCapture } from "./capture-settings";

test("the account's settings are read as they are", () => {
  expect(parseCapture({ dwellSeconds: 30, skipForms: false })).toEqual({ dwellSeconds: 30, skipForms: false });
});

test("nothing, or junk, reads as what capture did before the settings existed", () => {
  expect(parseCapture(undefined)).toEqual(DEFAULT_CAPTURE);
  expect(parseCapture({ dwellSeconds: 2, skipForms: "no" })).toEqual(DEFAULT_CAPTURE);
  expect(parseCapture({ dwellSeconds: 500 })).toEqual(DEFAULT_CAPTURE);
  expect(parseCapture({ dwellSeconds: 7.5 }).dwellSeconds).toBe(15);
});
