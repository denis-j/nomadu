/**
 * Stand-in for `firebase-admin/storage`: remembers what was deleted, so a
 * test can check that sharing ends with the files gone too.
 */

const deleted: string[] = [];

export function __storageDeleted(): string[] {
  return [...deleted];
}

export function __storageReset(): void {
  deleted.length = 0;
}

const bucket = {
  async deleteFiles(options: { prefix: string }): Promise<void> {
    deleted.push(`${options.prefix}*`);
  },
  file(path: string) {
    return {
      async delete(): Promise<void> {
        deleted.push(path);
      },
    };
  },
};

export function getStorage() {
  return { bucket: () => bucket };
}
