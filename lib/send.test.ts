import { beforeEach, expect, test, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { ask, send } from "./send";

const sendMessage = vi.fn();

beforeEach(() => {
  fakeBrowser.reset();
  vi.resetAllMocks();
  fakeBrowser.runtime.sendMessage = sendMessage;
});

const message = {
  type: "pageStatus",
  host: "example.com",
  url: "https://example.com/an-article",
  title: "An article",
  status: { state: "watching", startedAt: 1_700_000_000_000 },
} as const;

test("a reloaded extension throws rather than rejecting, and it still does not escape", () => {
  // The failure this whole file exists for. An extension reload destroys the context of a content
  // script that is still running, and sendMessage then throws before there is a promise at all —
  // so a .catch on its own leaves an uncaught error in every tab that was open at the time.
  sendMessage.mockImplementation(() => {
    throw new Error("Extension context invalidated.");
  });

  expect(() => send(message)).not.toThrow();
});

test("a rejected send does not escape either", async () => {
  // The background asleep, or the page closing under us.
  sendMessage.mockRejectedValue(new Error("Could not establish connection."));

  expect(() => send(message)).not.toThrow();
  await Promise.resolve(); // let the rejection settle; an unhandled one would fail the run
});

test("an ordinary send reaches the background unchanged", () => {
  sendMessage.mockResolvedValue(undefined);

  send(message);

  expect(sendMessage).toHaveBeenCalledWith(message);
});

test("ask hands back what the background answered", async () => {
  // The video button read `send`'s void as the reply, which is undefined every time, and so told
  // every saved video that it had not been. This is the call it needed.
  const status = { state: "remembered", result: "captured" };
  sendMessage.mockResolvedValue(status);

  await expect(ask(message)).resolves.toEqual(status);
  expect(sendMessage).toHaveBeenCalledWith(message);
});

test("ask answers undefined when there is nobody to answer, whichever way that fails", async () => {
  sendMessage.mockImplementation(() => {
    throw new Error("Extension context invalidated.");
  });
  await expect(ask(message)).resolves.toBeUndefined();

  sendMessage.mockRejectedValue(new Error("Could not establish connection."));
  await expect(ask(message)).resolves.toBeUndefined();
});
