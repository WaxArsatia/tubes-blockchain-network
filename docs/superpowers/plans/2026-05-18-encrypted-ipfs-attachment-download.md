# Encrypted IPFS Attachment Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let requesters download an original medical attachment only after decrypting a granted record, while storing only encrypted attachment bytes in IPFS and no attachment bytes on-chain.

**Architecture:** Add binary attachment encryption/decryption helpers beside the existing payload crypto helpers, and add IPFS helpers for encrypted attachment upload/fetch with SHA-256 verification. The upload workflow encrypts the attachment first, stores attachment metadata inside the encrypted record payload, and the decrypt workflow keeps the recovered DEK in memory long enough to fetch, verify, decrypt, and download the attachment.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Web Crypto API AES-GCM, Kubo IPFS HTTP API/gateway, viem hex helpers, shadcn-style UI components, lucide-react icons.

---

## File Structure

- Modify `tubes-blockchain-fe/src/lib/crypto.ts`: add `EncryptedAttachment`, `generateDekHex`, optional provided-DEK payload encryption, `encryptAttachment`, and `decryptAttachment`.
- Modify `tubes-blockchain-fe/src/lib/crypto.test.ts`: add attachment encryption round-trip and wrong-DEK tests.
- Modify `tubes-blockchain-fe/src/lib/ipfs.ts`: add encrypted attachment upload/fetch helpers while keeping existing payload helpers intact.
- Modify `tubes-blockchain-fe/src/lib/ipfs.test.ts`: add tests for attachment helper upload and hash verification.
- Modify `tubes-blockchain-fe/src/App.tsx`: wire upload and decrypt UI flows, keep attachment DEK only in component state, and trigger browser download after successful granted decrypt.

## Task 1: Attachment Crypto Helpers

**Files:**
- Modify: `tubes-blockchain-fe/src/lib/crypto.test.ts`
- Modify: `tubes-blockchain-fe/src/lib/crypto.ts`

- [ ] **Step 1: Write the failing attachment crypto tests**

Add these imports in `tubes-blockchain-fe/src/lib/crypto.test.ts`:

```ts
  decryptAttachment,
  encryptAttachment,
  generateDekHex,
```

Add these tests inside `describe("crypto helpers", () => { ... })`:

```ts
  it("encrypts payloads with a supplied DEK", async () => {
    const dek = generateDekHex()
    const payload = { diagnosis: "Demam", medication: ["Paracetamol"] }
    const encrypted = await encryptPayload(payload, dek)

    expect(encrypted.dek).toBe(dek)
    await expect(decryptPayload(encrypted, dek)).resolves.toEqual(payload)
  })

  it("encrypts and decrypts binary attachment bytes with a supplied DEK", async () => {
    const dek = generateDekHex()
    const original = new Uint8Array([0, 1, 2, 3, 254, 255])

    const encryptedAttachment = await encryptAttachment(
      original,
      dek
    )

    expect(encryptedAttachment).toMatchObject({
      version: 1,
      iv: expect.any(String),
      ciphertext: expect.any(String),
    })
    await expect(
      decryptAttachment(encryptedAttachment, dek)
    ).resolves.toEqual(original)
  })

  it("rejects attachment decryption with the wrong DEK", async () => {
    const correctDek = generateDekHex()
    const wrongDek = generateDekHex()
    const encryptedAttachment = await encryptAttachment(
      new TextEncoder().encode("hasil lab"),
      correctDek
    )

    await expect(
      decryptAttachment(encryptedAttachment, wrongDek)
    ).rejects.toThrow()
  })
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
cd tubes-blockchain-fe && npm test -- src/lib/crypto.test.ts
```

Expected: FAIL because `decryptAttachment`, `encryptAttachment`, and `generateDekHex` are not exported from `./crypto`.

- [ ] **Step 3: Implement the minimal attachment crypto helpers**

In `tubes-blockchain-fe/src/lib/crypto.ts`, add this type after `EncryptedPayload`:

```ts
export type EncryptedAttachment = {
  version: 1
  iv: string
  ciphertext: string
}
```

Add this helper after `randomBytes`:

```ts
export function generateDekHex() {
  return bytesToHex(randomBytes(32))
}
```

Change `encryptPayload` to accept an optional provided DEK:

```ts
export async function encryptPayload(
  payload: unknown,
  dekHex = generateDekHex()
): Promise<EncryptedPayload> {
  const dek = hexToBytes(dekHex as `0x${string}`)
  const iv = randomBytes(12)
  const key = await importAesKey(dek, ["encrypt"])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: bufferSource(iv) },
      key,
      bufferSource(encoder.encode(JSON.stringify(payload)))
    )
  )
  return {
    version: 1,
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
    dek: bytesToHex(dek),
  }
}
```

Add these helpers after `decryptPayload`:

```ts
export async function encryptAttachment(
  bytes: Uint8Array,
  dekHex: string
): Promise<EncryptedAttachment> {
  const iv = randomBytes(12)
  const key = await importAesKey(hexToBytes(dekHex as `0x${string}`), [
    "encrypt",
  ])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: bufferSource(iv) },
      key,
      bufferSource(bytes)
    )
  )
  return {
    version: 1,
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
  }
}

export async function decryptAttachment(
  attachment: EncryptedAttachment,
  dekHex: string
) {
  const key = await importAesKey(hexToBytes(dekHex as `0x${string}`), [
    "decrypt",
  ])
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bufferSource(fromBase64(attachment.iv)) },
    key,
    bufferSource(fromBase64(attachment.ciphertext))
  )
  return new Uint8Array(plaintext)
}
```

- [ ] **Step 4: Run the tests and verify GREEN**

Run:

```bash
cd tubes-blockchain-fe && npm test -- src/lib/crypto.test.ts
```

Expected: PASS for all crypto helper tests.

- [ ] **Step 5: Commit**

```bash
git add tubes-blockchain-fe/src/lib/crypto.ts tubes-blockchain-fe/src/lib/crypto.test.ts
git commit -m "feat: add encrypted attachment crypto helpers"
```

## Task 2: IPFS Attachment Helpers

**Files:**
- Modify: `tubes-blockchain-fe/src/lib/ipfs.test.ts`
- Modify: `tubes-blockchain-fe/src/lib/ipfs.ts`

- [ ] **Step 1: Write the failing IPFS helper tests**

Change the import in `tubes-blockchain-fe/src/lib/ipfs.test.ts` to:

```ts
import {
  computeCiphertextHash,
  fetchEncryptedAttachment,
  uploadEncryptedAttachment,
  verifyCiphertextHash,
} from "./ipfs"
```

Change the Vitest import to:

```ts
import { afterEach, describe, expect, it, vi } from "vitest"
```

Add cleanup inside the `describe` block:

```ts
  afterEach(() => {
    vi.restoreAllMocks()
  })
```

Add these tests inside the same `describe` block:

```ts
  it("uploads encrypted attachment bytes with an attachment filename", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ Hash: "bafyAttachment" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    const cid = await uploadEncryptedAttachment(
      "http://localhost:5001/",
      new TextEncoder().encode("encrypted-json")
    )

    expect(cid).toBe("bafyAttachment")
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:5001/api/v0/add?pin=true",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      })
    )
  })

  it("rejects fetched encrypted attachment bytes when the hash mismatches", async () => {
    const expectedHash = await computeCiphertextHash(
      new TextEncoder().encode("expected")
    )
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new TextEncoder().encode("changed"), { status: 200 })
    )

    await expect(
      fetchEncryptedAttachment(
        "http://localhost:8080",
        "bafyAttachment",
        expectedHash
      )
    ).rejects.toThrow("Hash ciphertext attachment IPFS tidak cocok")
  })
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
cd tubes-blockchain-fe && npm test -- src/lib/ipfs.test.ts
```

Expected: FAIL because `fetchEncryptedAttachment` and `uploadEncryptedAttachment` are not exported.

- [ ] **Step 3: Implement attachment IPFS helpers**

Add these functions to `tubes-blockchain-fe/src/lib/ipfs.ts` after `uploadEncryptedPayload`:

```ts
export async function uploadEncryptedAttachment(
  apiUrl: string,
  bytes: Uint8Array
) {
  const form = new FormData()
  form.append(
    "file",
    new Blob([bytes.slice().buffer as ArrayBuffer], {
      type: "application/json",
    }),
    "attachment.enc.json"
  )
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/api/v0/add?pin=true`, {
    method: "POST",
    body: form,
  })
  if (!response.ok) {
    throw new Error(`IPFS upload attachment gagal: ${response.status} ${response.statusText}`)
  }
  const body = (await response.json()) as { Hash?: string }
  if (!body.Hash) {
    throw new Error("IPFS tidak mengembalikan CID attachment")
  }
  return body.Hash
}
```

Add this function after `fetchEncryptedPayload`:

```ts
export async function fetchEncryptedAttachment(
  gatewayUrl: string,
  cid: string,
  expectedHash: string
) {
  const response = await fetch(`${gatewayUrl.replace(/\/$/, "")}/${cid}`)
  if (!response.ok) {
    throw new Error(`IPFS fetch attachment gagal: ${response.status} ${response.statusText}`)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!(await verifyCiphertextHash(bytes, expectedHash))) {
    throw new Error("Hash ciphertext attachment IPFS tidak cocok")
  }
  return bytes
}
```

- [ ] **Step 4: Run the tests and verify GREEN**

Run:

```bash
cd tubes-blockchain-fe && npm test -- src/lib/ipfs.test.ts
```

Expected: PASS for all IPFS helper tests.

- [ ] **Step 5: Commit**

```bash
git add tubes-blockchain-fe/src/lib/ipfs.ts tubes-blockchain-fe/src/lib/ipfs.test.ts
git commit -m "feat: add encrypted attachment ipfs helpers"
```

## Task 3: Upload Encrypted Attachments With Record Payloads

**Files:**
- Modify: `tubes-blockchain-fe/src/App.tsx`

- [ ] **Step 1: Add imports and local payload types**

In `tubes-blockchain-fe/src/App.tsx`, add `DownloadIcon` to the lucide-react import list.

Add these crypto imports:

```ts
  decryptAttachment,
  encryptAttachment,
  generateDekHex,
  type EncryptedAttachment,
```

Add these IPFS imports:

```ts
  fetchEncryptedAttachment,
  uploadEncryptedAttachment,
```

Add this type near the existing app-local types:

```ts
type RecordAttachmentMetadata = {
  name: string
  type: string
  size: number
  encryptedCid: string
  encryptedHash: Hex
}

type DecryptedMedicalPayload = {
  diagnosis?: string
  treatment?: string
  medication?: string
  notes?: string
  attachmentName?: string
  attachment?: RecordAttachmentMetadata
  createdAt?: string
}
```

- [ ] **Step 2: Update uploadRecord to encrypt and upload attachment before payload upload**

In `uploadRecord`, replace the current `payload` construction with:

```ts
    const attachmentFile = form.get("attachment")
    const attachment =
      attachmentFile instanceof File && attachmentFile.size > 0
        ? attachmentFile
        : null
    const dek = generateDekHex()
    let attachmentMetadata: RecordAttachmentMetadata | undefined

    if (attachment) {
      const attachmentBytes = new Uint8Array(await attachment.arrayBuffer())
      const encryptedAttachment = await encryptAttachment(
        attachmentBytes,
        dek
      )
      const attachmentPayloadBytes = new TextEncoder().encode(
        JSON.stringify(encryptedAttachment)
      )
      const attachmentHash = (await computeCiphertextHash(
        attachmentPayloadBytes
      )) as Hex
      const attachmentCid = await uploadEncryptedAttachment(
        appEnv.ipfsApiUrl,
        attachmentPayloadBytes
      )
      attachmentMetadata = {
        name: attachment.name,
        type: attachment.type || "application/octet-stream",
        size: attachment.size,
        encryptedCid: attachmentCid,
        encryptedHash: attachmentHash,
      }
    }

    const payload: DecryptedMedicalPayload = {
      diagnosis: String(form.get("diagnosis")),
      treatment: String(form.get("treatment")),
      medication: String(form.get("medication")),
      notes: String(form.get("notes")),
      attachmentName: attachmentMetadata?.name ?? "",
      attachment: attachmentMetadata,
      createdAt: new Date().toISOString(),
    }
    const payloadEncrypted = await encryptPayload(payload, dek)
```

Then replace subsequent uses of `encrypted` in this function with `payloadEncrypted`:

```ts
    const bytes = serializeEncryptedPayload(payloadEncrypted)
```

and:

```ts
    cacheDek({ hash, cid, dek: payloadEncrypted.dek as Hex })
```

and:

```ts
      dek: payloadEncrypted.dek as Hex,
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
cd tubes-blockchain-fe && npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tubes-blockchain-fe/src/App.tsx
git commit -m "feat: upload encrypted record attachments to ipfs"
```

## Task 4: Download Attachment After Granted Decrypt

**Files:**
- Modify: `tubes-blockchain-fe/src/App.tsx`

- [ ] **Step 1: Add decrypt workspace state**

Inside `DecryptWorkspace`, after the existing `passphrase` state, add:

```ts
  const [openedRecord, setOpenedRecord] =
    React.useState<DecryptedMedicalPayload | null>(null)
  const [openedDek, setOpenedDek] = React.useState<Hex | null>(null)
```

- [ ] **Step 2: Preserve decrypted payload and DEK in memory**

In the `decrypt` function, replace:

```ts
    const opened = await decryptPayload(payload, dek)
    setPlaintext(JSON.stringify(opened, null, 2))
```

with:

```ts
    const opened = await decryptPayload<DecryptedMedicalPayload>(payload, dek)
    setOpenedRecord(opened)
    setOpenedDek(dek as Hex)
    setPlaintext(JSON.stringify(opened, null, 2))
```

- [ ] **Step 3: Add the attachment download function**

Add this function inside `DecryptWorkspace` after `decrypt`:

```ts
  async function downloadAttachment() {
    const attachment = openedRecord?.attachment
    if (!attachment) throw new Error("Attachment tidak tersedia")
    if (!openedDek) throw new Error("DEK hasil dekripsi tidak tersedia")

    const encryptedBytes = await fetchEncryptedAttachment(
      appEnv.ipfsGatewayUrl,
      attachment.encryptedCid,
      attachment.encryptedHash
    )
    const encryptedAttachment = JSON.parse(
      new TextDecoder().decode(encryptedBytes)
    ) as EncryptedAttachment
    const plaintextBytes = await decryptAttachment(
      encryptedAttachment,
      openedDek
    )
    const blob = new Blob([plaintextBytes], {
      type: attachment.type || "application/octet-stream",
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = attachment.name || `record-attachment-${Date.now()}`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }
```

- [ ] **Step 4: Render the download action only after successful decrypt**

Replace the trailing `<Textarea ... />` in the decrypt card with:

```tsx
        <div className="grid gap-3">
          <Textarea
            value={plaintext}
            readOnly
            className="min-h-72 font-mono text-xs"
            placeholder="Plaintext muncul di sini dan tidak disimpan."
          />
          {openedRecord?.attachment && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const promise = downloadAttachment()
                toast.promise(promise, {
                  loading: "Mengambil attachment terenkripsi...",
                  success: "Attachment siap diunduh",
                  error: (error: unknown) =>
                    error instanceof Error
                      ? error.message
                      : "Download attachment gagal",
                })
                void promise.catch(() => undefined)
              }}
            >
              <DownloadIcon data-icon="inline-start" />
              Download attachment
            </Button>
          )}
        </div>
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
cd tubes-blockchain-fe && npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tubes-blockchain-fe/src/App.tsx
git commit -m "feat: download decrypted record attachments"
```

## Task 5: Final Verification

**Files:**
- Verify all changed frontend files.

- [ ] **Step 1: Run focused tests**

Run:

```bash
cd tubes-blockchain-fe && npm test -- src/lib/crypto.test.ts src/lib/ipfs.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full frontend tests**

Run:

```bash
cd tubes-blockchain-fe && npm test
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
cd tubes-blockchain-fe && npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run production build**

Run:

```bash
cd tubes-blockchain-fe && npm run build
```

Expected: PASS and Vite emits `dist`.

- [ ] **Step 5: Inspect final diff**

Run:

```bash
git status --short
git diff --stat HEAD
```

Expected: no unexpected files; any uncommitted files should be intentional final verification artifacts or none.
