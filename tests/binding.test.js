import assert from "node:assert/strict";
import test from "node:test";
import { canRename, resolveTap, verifyClaim } from "../src/binding.js";

const hashFn = (value) => {
  if (typeof value !== "string") throw new TypeError("hashFn requires a string");
  return `hashed:${value}`;
};
const row = { owner_token_hash: hashFn("owner"), recovery_code_hash: hashFn("ABC234") };

for (const [label, inputRow, token, expected] of [
  ["no row", null, null, "NEW"],
  ["no row with existing cookie", null, "owner", "NEW"],
  ["no cookie", row, null, "STRANGER"],
  ["matching cookie", row, "owner", "OWNER"],
  ["wrong cookie", row, "wrong", "STRANGER"],
  ["empty cookie", row, "", "STRANGER"],
  ["object cookie", row, {}, "STRANGER"],
  ["number cookie", row, 123, "STRANGER"],
  ["no owner hash", { ...row, owner_token_hash: null }, "owner", "STRANGER"],
]) {
  test(`resolveTap: ${label}`, () => assert.equal(resolveTap(inputRow, token, hashFn), expected));
}

for (const [label, inputRow, token, expected] of [
  ["no row", null, "owner", false],
  ["no cookie", row, null, false],
  ["matching cookie", row, "owner", true],
  ["wrong cookie", row, "wrong", false],
  ["empty cookie", row, "", false],
  ["object cookie", row, {}, false],
  ["number cookie", row, 123, false],
  ["no owner hash", { ...row, owner_token_hash: null }, "owner", false],
]) {
  test(`canRename: ${label}`, () => assert.equal(canRename(inputRow, token, hashFn), expected));
}

for (const [label, inputRow, code, expected] of [
  ["correct code", row, "ABC234", true],
  ["wrong code", row, "ZZZ999", false],
  ["lowercase code", row, "abc234", true],
  ["code with spaces", row, " a b C 2 3 4 ", true],
  ["code with tabs and newlines", row, "\taBc\n234 ", true],
  ["code with dashes", row, "ABC-234", true],
  ["code with dashes and spaces", row, "A B C - 2 3 4", true],
  ["null row", null, "ABC234", false],
  ["no recovery hash", { ...row, recovery_code_hash: null }, "ABC234", false],
  ["null code", row, null, false],
  ["missing code", row, undefined, false],
  ["non-string code", row, 123456, false],
  ["empty code", row, "", false],
  ["spaces only", row, "   ", false],
]) {
  test(`verifyClaim: ${label}`, () => assert.equal(verifyClaim(inputRow, code, hashFn), expected));
}
