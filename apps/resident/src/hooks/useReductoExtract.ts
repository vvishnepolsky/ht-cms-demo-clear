import { useMutation } from '@apollo/client/react';
import { useCallback, useState } from 'react';
import {
  EXTRACT_DOCUMENT_FIELDS_MUTATION,
  type DocumentExtractionCategory,
  type ExtractedDocumentFields,
} from '../lib/operations';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export interface UseReductoExtractResult {
  extract: (
    file: File,
    category: DocumentExtractionCategory,
  ) => Promise<{ success: boolean; fields: ExtractedDocumentFields | null }>;
  loading: boolean;
}

export function useReductoExtract(): UseReductoExtractResult {
  const [mutate] = useMutation(EXTRACT_DOCUMENT_FIELDS_MUTATION, { fetchPolicy: 'no-cache' });
  const [loading, setLoading] = useState(false);

  const extract = useCallback(
    async (
      file: File,
      category: DocumentExtractionCategory,
    ): Promise<{ success: boolean; fields: ExtractedDocumentFields | null }> => {
      setLoading(true);
      try {
        const fileDataUrl = await readFileAsDataUrl(file);
        const { data } = await mutate({ variables: { input: { fileDataUrl, category } } });

        if (!data?.extractDocumentFields) return { success: false, fields: null };

        const errors = data.extractDocumentFields.errors ?? [];
        if (errors.length > 0) return { success: false, fields: null };

        return { success: true, fields: data.extractDocumentFields.fields };
      } catch {
        return { success: false, fields: null };
      } finally {
        setLoading(false);
      }
    },
    [mutate],
  );

  return { extract, loading };
}
