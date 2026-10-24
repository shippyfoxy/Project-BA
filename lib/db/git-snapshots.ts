import { execFileSync, spawn } from "node:child_process";
import type { Readable } from "node:stream";

export interface SnapshotVersion {
  commit: string;
  committedAt: string;
  blob: string;
}

const ZERO_BLOB = /^0+$/;

// Every committed version of `file`, oldest first, with the blob id of the
// file's content at that commit.
export function listSnapshotVersions(file: string, cwd = process.cwd()): SnapshotVersion[] {
  const out = execFileSync(
    "git",
    ["log", "--reverse", "--no-abbrev", "--raw", "--format=@@%H\t%cI", "--", file],
    { cwd, encoding: "utf8", maxBuffer: 1 << 28 },
  );
  const versions: SnapshotVersion[] = [];
  let current: { commit: string; committedAt: string } | null = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("@@")) {
      const [commit, committedAt] = line.slice(2).split("\t");
      current = { commit, committedAt };
    } else if (line.startsWith(":") && current) {
      // :<old mode> <new mode> <old blob> <new blob> <status>\t<path>
      const blob = line.split("\t")[0].split(" ")[3];
      if (blob && !ZERO_BLOB.test(blob)) versions.push({ ...current, blob });
      current = null;
    }
  }
  return versions;
}

// Buffers stdout as a chunk list and concatenates once per read, which keeps
// multi-megabyte blobs from being re-copied on every incoming chunk.
class StreamReader {
  private chunks: Buffer[] = [];
  private len = 0;
  private ended = false;
  private wake: (() => void) | null = null;

  constructor(stream: Readable) {
    stream.on("data", (c: Buffer) => {
      this.chunks.push(c);
      this.len += c.length;
      this.wake?.();
    });
    stream.on("end", () => {
      this.ended = true;
      this.wake?.();
    });
  }

  private async more(): Promise<void> {
    if (this.ended) throw new Error("git cat-file exited early");
    await new Promise<void>((r) => (this.wake = r));
    this.wake = null;
  }

  private take(n: number): Buffer {
    const all = this.chunks.length === 1 ? this.chunks[0] : Buffer.concat(this.chunks, this.len);
    const rest = all.subarray(n);
    this.chunks = rest.length > 0 ? [rest] : [];
    this.len = rest.length;
    return all.subarray(0, n);
  }

  async readLine(): Promise<string> {
    for (;;) {
      let offset = 0;
      for (const c of this.chunks) {
        const i = c.indexOf(0x0a);
        if (i !== -1) return this.take(offset + i + 1).toString("utf8", 0, offset + i);
        offset += c.length;
      }
      await this.more();
    }
  }

  async read(n: number): Promise<Buffer> {
    while (this.len < n) await this.more();
    return this.take(n);
  }
}

export async function* readBlobs(
  blobs: string[],
  cwd = process.cwd(),
): AsyncGenerator<{ blob: string; content: string }> {
  const proc = spawn("git", ["cat-file", "--batch"], { cwd, stdio: ["pipe", "pipe", "inherit"] });
  const reader = new StreamReader(proc.stdout);
  try {
    for (const blob of blobs) {
      proc.stdin.write(`${blob}\n`);
      const header = await reader.readLine();
      const [, type, size] = header.split(" ");
      if (type !== "blob") throw new Error(`git cat-file: unexpected response "${header}"`);
      const body = await reader.read(Number(size) + 1); // trailing newline
      yield { blob, content: body.toString("utf8", 0, Number(size)) };
    }
  } finally {
    proc.stdin.end();
    proc.kill();
  }
}
