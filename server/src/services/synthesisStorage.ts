import {
  readFile,
  readdir,
  rm,
  stat,
  statfs,
} from "node:fs/promises";

import path from "node:path";

import {
  environment,
} from "../config/environment.js";

import type {
  SynthesisCacheMetadata,
} from "./synthesisCache.js";

import {
  getProtectedCacheKeys,
} from "./synthesisQueue.js";


const BYTES_PER_GIGABYTE =
  1024
  * 1024
  * 1024;


export type StorageCleanupReason =
  | "cache-size-limit"
  | "minimum-free-space";


export type SynthesisCacheEntryInfo = {
  cacheKey: string;
  directoryPath: string;
  audioPath: string;
  metadataPath: string;
  sizeBytes: number;
  createdAt: string;
  lastAccessedAt: string;
  protected: boolean;
};


export type SynthesisStorageStatus = {
  cacheDirectory: string;
  cacheSizeBytes: number;
  cacheSizeGb: number;
  maximumCacheBytes: number;
  maximumCacheGb: number;
  freeDiskBytes: number;
  freeDiskGb: number;
  minimumFreeDiskBytes: number;
  minimumFreeDiskGb: number;
  entryCount: number;
  protectedEntryCount: number;
  cacheLimitExceeded: boolean;
  minimumFreeSpaceViolated: boolean;
  cleanupRequired: boolean;
};


export type RemovedCacheEntry = {
  cacheKey: string;
  sizeBytes: number;
  lastAccessedAt: string;
  reason:
    StorageCleanupReason;
};


export type SynthesisCleanupResult = {
  cleanupRequired: boolean;
  removedEntries:
    RemovedCacheEntry[];
  removedEntryCount: number;
  removedBytes: number;
  removedGb: number;
  skippedProtectedKeys:
    string[];
  before:
    SynthesisStorageStatus;
  after:
    SynthesisStorageStatus;
};


function bytesToGigabytes(
  byteCount: number,
): number {
  return Number(
    (
      byteCount
      / BYTES_PER_GIGABYTE
    ).toFixed(3),
  );
}


function gigabytesToBytes(
  gigabytes: number,
): number {
  return Math.floor(
    gigabytes
    * BYTES_PER_GIGABYTE,
  );
}


function isCacheKey(
  value: string,
): boolean {
  return /^[a-f0-9]{64}$/
    .test(
      value,
    );
}


async function getDirectorySize(
  directoryPath: string,
): Promise<number> {
  let totalBytes = 0;

  let entries;

  try {
    entries =
      await readdir(
        directoryPath,
        {
          withFileTypes: true,
        },
      );

  } catch {
    return 0;
  }

  for (
    const entry
    of entries
  ) {
    const entryPath =
      path.join(
        directoryPath,
        entry.name,
      );

    if (entry.isDirectory()) {
      totalBytes +=
        await getDirectorySize(
          entryPath,
        );

      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    try {
      const information =
        await stat(
          entryPath,
        );

      totalBytes +=
        information.size;

    } catch {
      continue;
    }
  }

  return totalBytes;
}


async function readCacheMetadata(
  metadataPath: string,
): Promise<
  SynthesisCacheMetadata
  | null
> {
  try {
    const metadataText =
      await readFile(
        metadataPath,
        "utf8",
      );

    const metadata =
      JSON.parse(
        metadataText,
      ) as
        SynthesisCacheMetadata;

    if (
      metadata.version !== 1
      || !metadata.cacheKey
    ) {
      return null;
    }

    return metadata;

  } catch {
    return null;
  }
}


async function getFallbackTimestamp(
  directoryPath: string,
): Promise<string> {
  try {
    const information =
      await stat(
        directoryPath,
      );

    return information
      .mtime
      .toISOString();

  } catch {
    return new Date(0)
      .toISOString();
  }
}


async function getCacheEntryInfo(
  cacheKey: string,
  directoryPath: string,
  protectedKeys:
    Set<string>,
): Promise<SynthesisCacheEntryInfo> {
  const audioPath =
    path.join(
      directoryPath,
      "audio.wav",
    );

  const metadataPath =
    path.join(
      directoryPath,
      "metadata.json",
    );

  const metadata =
    await readCacheMetadata(
      metadataPath,
    );

  const fallbackTimestamp =
    await getFallbackTimestamp(
      directoryPath,
    );

  const sizeBytes =
    await getDirectorySize(
      directoryPath,
    );

  return {
    cacheKey,

    directoryPath,

    audioPath,

    metadataPath,

    sizeBytes,

    createdAt:
      metadata?.createdAt
      ?? fallbackTimestamp,

    lastAccessedAt:
      metadata?.lastAccessedAt
      ?? metadata?.createdAt
      ?? fallbackTimestamp,

    protected:
      protectedKeys.has(
        cacheKey,
      ),
  };
}


export async function listSynthesisCacheEntries():
Promise<SynthesisCacheEntryInfo[]> {
  const cacheDirectory =
    environment
      .directories
      .synthesisCache;

  const protectedKeys =
    getProtectedCacheKeys();

  let prefixEntries;

  try {
    prefixEntries =
      await readdir(
        cacheDirectory,
        {
          withFileTypes: true,
        },
      );

  } catch {
    return [];
  }

  const cacheEntries:
    SynthesisCacheEntryInfo[] = [];

  for (
    const prefixEntry
    of prefixEntries
  ) {
    if (
      !prefixEntry.isDirectory()
    ) {
      continue;
    }

    const prefixPath =
      path.join(
        cacheDirectory,
        prefixEntry.name,
      );

    let entryDirectories;

    try {
      entryDirectories =
        await readdir(
          prefixPath,
          {
            withFileTypes: true,
          },
        );

    } catch {
      continue;
    }

    for (
      const entryDirectory
      of entryDirectories
    ) {
      if (
        !entryDirectory.isDirectory()
        || !isCacheKey(
          entryDirectory.name,
        )
      ) {
        continue;
      }

      const entryPath =
        path.join(
          prefixPath,
          entryDirectory.name,
        );

      const entryInformation =
        await getCacheEntryInfo(
          entryDirectory.name,
          entryPath,
          protectedKeys,
        );

      cacheEntries.push(
        entryInformation,
      );
    }
  }

  return cacheEntries.sort(
    (
      first,
      second,
    ) => (
      first.lastAccessedAt
        .localeCompare(
          second.lastAccessedAt,
        )
    ),
  );
}


async function getFreeDiskBytes():
Promise<number> {
  const fileSystem =
    await statfs(
      environment
        .directories
        .synthesisCache,
    );

  return Number(
    fileSystem.bavail,
  )
    * Number(
      fileSystem.bsize,
    );
}


function buildStorageStatus(
  entries:
    SynthesisCacheEntryInfo[],

  freeDiskBytes:
    number,
): SynthesisStorageStatus {
  const cacheSizeBytes =
    entries.reduce(
      (
        currentTotal,
        entry,
      ) => (
        currentTotal
        + entry.sizeBytes
      ),
      0,
    );

  const maximumCacheBytes =
    gigabytesToBytes(
      environment
        .synthesisCacheMaxGb,
    );

  const minimumFreeDiskBytes =
    gigabytesToBytes(
      environment
        .synthesisCacheMinFreeGb,
    );

  const cacheLimitExceeded =
    cacheSizeBytes
    > maximumCacheBytes;

  const minimumFreeSpaceViolated =
    freeDiskBytes
    < minimumFreeDiskBytes;

  return {
    cacheDirectory:
      environment
        .directories
        .synthesisCache,

    cacheSizeBytes,

    cacheSizeGb:
      bytesToGigabytes(
        cacheSizeBytes,
      ),

    maximumCacheBytes,

    maximumCacheGb:
      environment
        .synthesisCacheMaxGb,

    freeDiskBytes,

    freeDiskGb:
      bytesToGigabytes(
        freeDiskBytes,
      ),

    minimumFreeDiskBytes,

    minimumFreeDiskGb:
      environment
        .synthesisCacheMinFreeGb,

    entryCount:
      entries.length,

    protectedEntryCount:
      entries.filter(
        (
          entry,
        ) => (
          entry.protected
        ),
      ).length,

    cacheLimitExceeded,

    minimumFreeSpaceViolated,

    cleanupRequired:
      cacheLimitExceeded
      || minimumFreeSpaceViolated,
  };
}


export async function getSynthesisStorageStatus():
Promise<SynthesisStorageStatus> {
  const entries =
    await listSynthesisCacheEntries();

  const freeDiskBytes =
    await getFreeDiskBytes();

  return buildStorageStatus(
    entries,
    freeDiskBytes,
  );
}


function getCleanupReason(
  status:
    SynthesisStorageStatus,
): StorageCleanupReason {
  if (
    status
      .minimumFreeSpaceViolated
  ) {
    return "minimum-free-space";
  }

  return "cache-size-limit";
}


async function removeCacheEntry(
  entry:
    SynthesisCacheEntryInfo,
): Promise<void> {
  await rm(
    entry.directoryPath,
    {
      recursive: true,
      force: true,
    },
  );

  const prefixDirectory =
    path.dirname(
      entry.directoryPath,
    );

  try {
    const remainingEntries =
      await readdir(
        prefixDirectory,
      );

    if (
      remainingEntries.length === 0
    ) {
      await rm(
        prefixDirectory,
        {
          recursive: false,
          force: true,
        },
      );
    }

  } catch {
    return;
  }
}


export async function enforceSynthesisStorageLimits():
Promise<SynthesisCleanupResult> {
  const initialEntries =
    await listSynthesisCacheEntries();

  const initialFreeDiskBytes =
    await getFreeDiskBytes();

  const before =
    buildStorageStatus(
      initialEntries,
      initialFreeDiskBytes,
    );

  const removedEntries:
    RemovedCacheEntry[] = [];

  const skippedProtectedKeys:
    string[] = [];

  if (!before.cleanupRequired) {
    return {
      cleanupRequired:
        false,

      removedEntries,

      removedEntryCount: 0,

      removedBytes: 0,

      removedGb: 0,

      skippedProtectedKeys,

      before,

      after:
        before,
    };
  }

  let currentEntries = [
    ...initialEntries,
  ];

  let currentFreeDiskBytes =
    initialFreeDiskBytes;

  let currentStatus =
    before;

  for (
    const entry
    of initialEntries
  ) {
    if (
      !currentStatus
        .cleanupRequired
    ) {
      break;
    }

    if (entry.protected) {
      skippedProtectedKeys.push(
        entry.cacheKey,
      );

      continue;
    }

    const reason =
      getCleanupReason(
        currentStatus,
      );

    try {
      await removeCacheEntry(
        entry,
      );

    } catch {
      continue;
    }

    removedEntries.push({
      cacheKey:
        entry.cacheKey,

      sizeBytes:
        entry.sizeBytes,

      lastAccessedAt:
        entry.lastAccessedAt,

      reason,
    });

    currentEntries =
      currentEntries.filter(
        (
          currentEntry,
        ) => (
          currentEntry.cacheKey
          !== entry.cacheKey
        ),
      );

    currentFreeDiskBytes =
      await getFreeDiskBytes();

    currentStatus =
      buildStorageStatus(
        currentEntries,
        currentFreeDiskBytes,
      );
  }

  const removedBytes =
    removedEntries.reduce(
      (
        total,
        entry,
      ) => (
        total
        + entry.sizeBytes
      ),
      0,
    );

  return {
    cleanupRequired:
      before.cleanupRequired,

    removedEntries,

    removedEntryCount:
      removedEntries.length,

    removedBytes,

    removedGb:
      bytesToGigabytes(
        removedBytes,
      ),

    skippedProtectedKeys,

    before,

    after:
      currentStatus,
  };
}


export async function ensureSynthesisStorageCapacity():
Promise<SynthesisCleanupResult> {
  const cleanupResult =
    await enforceSynthesisStorageLimits();

  if (
    cleanupResult
      .after
      .cleanupRequired
  ) {
    const protectedCount =
      cleanupResult
        .after
        .protectedEntryCount;

    throw new Error(
      "The synthesis cache cannot "
      + "free enough disk space. "
      + "Protected entries: "
      + protectedCount
      + ".",
    );
  }

  return cleanupResult;
}