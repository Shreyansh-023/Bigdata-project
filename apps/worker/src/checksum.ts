import crypto from "node:crypto";
import fs from "node:fs";

export const sha256Buffer = (content: Buffer): string =>
  crypto.createHash("sha256").update(content).digest("hex");

export const sha256File = async (filePath: string): Promise<string> => {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("data", (data) => hash.update(data));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
};
