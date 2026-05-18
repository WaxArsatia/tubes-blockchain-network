# Encrypted IPFS Attachment Download Design

## Goal

Add a frontend feature that lets an approved requester download a medical record attachment after decrypting a granted record, without storing attachment bytes on-chain and without exposing plaintext attachment content through public IPFS access.

## Current Context

The frontend currently encrypts a JSON medical record payload in the browser, uploads the encrypted payload JSON to IPFS, stores the payload CID and hash on-chain through `MedicalRecord.addRecord`, and lets a requester decrypt the payload after the requester has a granted access request and a wrapped DEK. The upload form accepts an attachment file, but the payload only stores `attachmentName`; the file bytes are not uploaded or downloadable.

Kubo/IPFS retrieval is content-addressed by CID. Any party with a CID can request the bytes from a public gateway or IPFS node. Therefore the privacy boundary cannot be "CID secrecy" or gateway access alone. The privacy boundary must be client-side encryption: public IPFS may expose ciphertext, but plaintext bytes are only recoverable by someone who obtains the DEK through the existing approval flow.

## Approved Approach

Store the attachment as a separate encrypted IPFS object. During record upload, the frontend encrypts the attachment bytes in the browser with the same record DEK used for the medical payload, uploads the encrypted attachment bytes to IPFS, verifies and stores its hash, then writes attachment metadata into the encrypted medical payload. The blockchain continues to store only the encrypted payload CID and hash.

After a requester decrypts a granted record, the decrypted JSON includes attachment metadata. The decrypt workspace then shows a download action. When clicked, the browser fetches the encrypted attachment from IPFS, verifies the ciphertext hash, decrypts the bytes with the record DEK recovered from the wrapped access key, and triggers a local browser download using the original filename and MIME type.

## Data Model

The decrypted payload gains an optional `attachment` object:

```ts
type RecordAttachmentMetadata = {
  name: string
  type: string
  size: number
  encryptedCid: string
  encryptedHash: `0x${string}`
  iv: string
}
```

The encrypted attachment object stored in IPFS contains only encrypted bytes and minimal encryption metadata:

```ts
type EncryptedAttachment = {
  version: 1
  iv: string
  ciphertext: string
}
```

The plaintext attachment bytes, original file name, and MIME type are never written on-chain. The attachment name and MIME type are inside the encrypted medical payload, so they become visible only after successful record decryption.

## Components

`src/lib/crypto.ts` owns encryption and decryption primitives. It will add binary attachment helpers that accept a `File` or `Uint8Array` and a DEK hex string, producing or consuming `EncryptedAttachment` JSON.

`src/lib/ipfs.ts` owns IPFS upload, fetch, and hash verification. It will add attachment-specific helpers that upload arbitrary encrypted bytes with a safe filename and fetch them back with SHA-256 hash verification.

`src/App.tsx` owns the current upload and decrypt workflows. Upload will encrypt and upload the attachment before encrypting the main record payload, then include the attachment metadata in the payload. Decrypt will keep the recovered DEK in local React state only after successful decryption and use it for the attachment download action.

## Error Handling

Upload fails before the on-chain transaction if attachment encryption, attachment IPFS upload, payload encryption, payload IPFS upload, or hash calculation fails. This prevents on-chain records from pointing to incomplete attachment metadata.

Download fails with a user-facing toast if the encrypted attachment cannot be fetched, its hash does not match the decrypted metadata, the DEK is unavailable, or AES-GCM decryption fails.

Records without attachments continue to decrypt normally and show no download action.

## Testing

Add focused tests for attachment encryption and decryption in `src/lib/crypto.test.ts`, including a round trip with binary bytes and a failure with the wrong DEK.

Add focused tests for attachment IPFS helpers in `src/lib/ipfs.test.ts`, including upload body construction and fetch hash verification rejection.

Run the frontend test suite and typecheck after implementation.
