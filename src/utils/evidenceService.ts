import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  FIELD_LIMITS,
  type EvidenceCategory,
  type ProjectEvidence,
} from '../types/budget';
import { generateSafeId } from './formatters';
import {
  processWithdrawalAttachment,
  type ProcessedAttachment,
} from './fileUpload';

export async function saveProcessedProjectEvidence(params: {
  projectId: string;
  ownerId: string;
  category: EvidenceCategory;
  attachment: ProcessedAttachment;
}): Promise<{ evidenceId: string; fileName: string }> {
  const evidenceId = generateSafeId('ev');
  const path = `projects/${params.projectId}/evidences/${evidenceId}`;
  const fullDataUrl = params.attachment.dataUrl;

  if (fullDataUrl.length <= FIELD_LIMITS.INLINE_DATA_URL_MAX) {
    try {
      await setDoc(
        doc(db, 'projects', params.projectId, 'evidences', evidenceId),
        {
          projectId: params.projectId,
          ownerId: params.ownerId,
          category: params.category,
          fileName: params.attachment.name,
          mimeType: params.attachment.mimeType,
          dataUrl: fullDataUrl,
          chunkCount: 0,
          createdAt: serverTimestamp(),
        }
      );
      return { evidenceId, fileName: params.attachment.name };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  }

  // Split files > 700KB (up to 5 MB) into chunk documents under evidences/{evidenceId}/chunks
  const chunks: string[] = [];
  for (
    let offset = 0;
    offset < fullDataUrl.length;
    offset += FIELD_LIMITS.CHUNK_SIZE_CHARS
  ) {
    chunks.push(
      fullDataUrl.slice(offset, offset + FIELD_LIMITS.CHUNK_SIZE_CHARS)
    );
  }

  try {
    await setDoc(
      doc(db, 'projects', params.projectId, 'evidences', evidenceId),
      {
        projectId: params.projectId,
        ownerId: params.ownerId,
        category: params.category,
        fileName: params.attachment.name,
        mimeType: params.attachment.mimeType,
        dataUrl: '',
        chunkCount: chunks.length,
        createdAt: serverTimestamp(),
      }
    );

    // Commit up to 3 chunks per batch (~2.1 MB per RPC) to stay safely under request limits
    for (let i = 0; i < chunks.length; i += 3) {
      const batch = writeBatch(db);
      const slice = chunks.slice(i, i + 3);
      slice.forEach((chunkData, sliceIdx) => {
        const chunkIndex = i + sliceIdx;
        const chunkRef = doc(
          db,
          'projects',
          params.projectId,
          'evidences',
          evidenceId,
          'chunks',
          `chunk_${String(chunkIndex).padStart(3, '0')}`
        );
        batch.set(chunkRef, {
          projectId: params.projectId,
          evidenceId,
          ownerId: params.ownerId,
          index: chunkIndex,
          data: chunkData,
          createdAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }

    return { evidenceId, fileName: params.attachment.name };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function uploadProjectEvidence(params: {
  projectId: string;
  ownerId: string;
  category: EvidenceCategory;
  file: File;
}): Promise<{ evidenceId: string; fileName: string }> {
  const processed = await processWithdrawalAttachment(params.file);
  return saveProcessedProjectEvidence({
    projectId: params.projectId,
    ownerId: params.ownerId,
    category: params.category,
    attachment: processed,
  });
}

export async function fetchProjectEvidence(
  projectId: string,
  evidenceId: string
): Promise<ProjectEvidence | null> {
  const path = `projects/${projectId}/evidences/${evidenceId}`;
  try {
    const snap = await getDoc(
      doc(db, 'projects', projectId, 'evidences', evidenceId)
    );
    if (!snap.exists()) return null;
    const data = snap.data();
    const chunkCount = Number(data.chunkCount ?? 0);
    let dataUrl = String(data.dataUrl ?? '');

    if (!dataUrl && chunkCount > 0) {
      const chunksSnap = await getDocs(
        query(
          collection(
            db,
            'projects',
            projectId,
            'evidences',
            evidenceId,
            'chunks'
          ),
          where('projectId', '==', projectId),
          where('evidenceId', '==', evidenceId)
        )
      );
      const sortedChunks = chunksSnap.docs
        .map((c) => c.data())
        .sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0));
      dataUrl = sortedChunks.map((c) => String(c.data ?? '')).join('');
    }

    return {
      id: snap.id,
      projectId: String(data.projectId ?? projectId),
      ownerId: String(data.ownerId ?? ''),
      category: data.category as EvidenceCategory,
      fileName: String(data.fileName ?? ''),
      mimeType:
        data.mimeType === 'image/jpeg' || data.mimeType === 'image/png'
          ? data.mimeType
          : 'application/pdf',
      dataUrl,
      chunkCount,
      createdAt: data.createdAt ?? null,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}
