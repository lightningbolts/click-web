'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera } from 'lucide-react';
import { Avatar } from '@/components/ds/Avatar';
import { toast } from '@/components/ds/Toast';
import { useAuth } from '@/lib/AuthContext';
import { AVATAR_IMAGE_ACCEPT, AVATAR_IMAGE_MIME_TYPES, USER_AVATAR_ENDPOINT } from '@/lib/uploads/constants';
import { useImageUpload } from '@/lib/uploads/useImageUpload';

/** Avatar 96 with the 32 px camera badge that opens the photo picker (spec §7.7). */
export function MeAvatar({ id, name, src }: { id: string; name: string; src: string | null }) {
  const router = useRouter();
  const { setProfileImageUrl, refreshUser } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState(src);
  const { uploading, upload } = useImageUpload({
    endpoint: USER_AVATAR_ENDPOINT,
    acceptedMimeTypes: AVATAR_IMAGE_MIME_TYPES,
    onSuccess: (url) => {
      setImage(url);
      setProfileImageUrl(url);
      void refreshUser();
      router.refresh();
      toast.success('Photo updated');
    },
  });

  return (
    <span className="relative inline-block">
      <Avatar seed={id} name={name} src={image} size={96} priority />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        aria-label="Change photo"
        className="press absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full bg-action text-on-action ring-[3px] ring-bg disabled:opacity-60"
      >
        <Camera size={16} strokeWidth={2} aria-hidden />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept={AVATAR_IMAGE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void upload(file);
        }}
      />
    </span>
  );
}
