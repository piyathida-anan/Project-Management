# Firestore Security Specification

## 1. Data Invariants
1. **Authorized Multi-Editor Allowlist**: All reads and writes are restricted strictly to verified Google accounts (`request.auth != null && request.auth.token.email_verified == true`) whose email matches the authorized team allowlist (`piyathida.suriya@gmail.com`, `charinyapak9205@gmail.com`).
2. **Email Spoofing Guard**: Email allowlist checks always mandate `request.auth.token.email_verified == true`.
3. **Immutable Attribution**: Every document stores `ownerId == request.auth.uid` on creation, and `ownerId` + `createdAt` + `projectId` are immutable on update.
4. **Master Gate Relational Integrity**: Subcollections (`activities`, `withdrawals`, `evidences`) and linked `deliverables` require parent `/projects/{projectId}` existence (`exists(...)`) on creation.
5. **Strict Key & Size Bounds**: Every document creation/update validates `hasAll(...)` and `hasOnly(...)` keys, action-based `affectedKeys().hasOnly(...)` branches, and strict string/list/number bounds (including `dataUrl <= 950,000` chars).
6. **Temporal Integrity**: `createdAt` and `updatedAt` must equal `request.time` on creation; `updatedAt` must equal `request.time` on update.

## 2. The "Dirty Dozen" Payloads (All Expected: PERMISSION_DENIED)
1. **Unauthenticated Read/Write**: Read or write `/projects/proj_1` with `auth: null`.
2. **Unverified Email Spoofing**: Access `/projects/proj_1` with `email: "piyathida.suriya@gmail.com"` and `email_verified: false`.
3. **Unauthorized Email**: Access `/projects/proj_1` signed in as `"stranger@gmail.com"` (`email_verified: true`).
4. **Identity Spoofing**: Create `/projects/proj_1` with `ownerId: "other_uid"`.
5. **Shadow Field Injection**: Create or update `/projects/proj_1` or `/deliverables/del_1` with extra key `isAdmin: true`.
6. **ID Poisoning**: Create document with invalid characters or length > 128 in `{projectId}` or `{deliverableId}`.
7. **Client Timestamp Forgery**: Create document with client-chosen `createdAt` != `request.time`.
8. **Immutable Field Mutation**: Update `/projects/proj_1` mutating `ownerId` or `createdAt`.
9. **Version Downgrade**: Update `/projects/proj_1` setting `version < existing().version`.
10. **Orphaned Subcollection / Deliverable Write**: Create `/deliverables/del_1` or `/projects/missing/evidences/ev_1` pointing to non-existent project.
11. **Oversized File Payload**: Create `/projects/proj_1/evidences/ev_1` with `dataUrl.size() > 950000` or disallowed MIME type.
12. **Invalid Status Enum Injection**: Update `/projects/proj_1` setting `proposalStatus: "hacked"` or `scheduleStatus: "unknown"`.
