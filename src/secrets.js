import { createHash, randomBytes, randomInt } from "node:crypto";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const ownerToken = () => randomBytes(32).toString("base64url");
export const recoveryCode = () => Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
