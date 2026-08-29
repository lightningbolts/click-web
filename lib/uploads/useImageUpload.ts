'use client';

import { useCallback, useState } from 'react';
import {
  uploadImageFile,
  type ImageUploadConfig,
} from '@/lib/uploads/imageUpload';

type UseImageUploadOptions = ImageUploadConfig & {
  onSuccess?: (url: string) => void;
};

export function useImageUpload({
  endpoint,
  acceptedMimeTypes,
  maxBytes,
  compressOversize,
  onSuccess,
}: UseImageUploadOptions) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File): Promise<string | null> => {
      setUploading(true);
      setError(null);

      const result = await uploadImageFile(file, {
        endpoint,
        acceptedMimeTypes,
        maxBytes,
        compressOversize,
      });

      setUploading(false);

      if (!result.ok) {
        setError(result.error);
        return null;
      }

      setUrl(result.url);
      onSuccess?.(result.url);
      return result.url;
    },
    [acceptedMimeTypes, compressOversize, endpoint, maxBytes, onSuccess],
  );

  const reset = useCallback(() => {
    setError(null);
    setUrl(null);
  }, []);

  return {
    uploading,
    error,
    url,
    setUrl,
    upload,
    reset,
  };
}
