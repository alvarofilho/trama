import { displayPath } from "./path-label";

describe("displayPath", () => {
  it.each([
    [String.raw`\\?\C:\Users\Alvaro\Trama`, String.raw`C:\Users\Alvaro\Trama`],
    [String.raw`\\?\UNC\server\share\Trama`, String.raw`\\server\share\Trama`],
    [String.raw`C:\Trama`, String.raw`C:\Trama`],
    ["/home/alvaro/Trama", "/home/alvaro/Trama"],
  ])("formats %s for display", (path, expected) =>
    expect(displayPath(path)).toBe(expected),
  );
});
