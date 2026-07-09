import React, { useEffect, useMemo, useState } from 'react';

interface Props {
  name: string;
  photoUrl?: string | null;
  sizeClassName?: string;
  textClassName?: string;
}

function getInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return 'S';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }

  return parts
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join('');
}

export default function UserAvatar({
  name,
  photoUrl,
  sizeClassName = 'w-12 h-12',
  textClassName = 'text-base',
}: Props) {
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [photoUrl]);

  const initials = useMemo(() => getInitials(name), [name]);
  const showImage = Boolean(photoUrl && !hasImageError);

  return (
    <div
      className={`${sizeClassName} relative overflow-hidden rounded-full bg-tg-primary text-white flex items-center justify-center font-bold shrink-0`}
    >
      {showImage && (
        <img
          src={photoUrl ?? ''}
          alt={`${name} avatar`}
          className="absolute inset-0 z-0 h-full w-full rounded-full object-cover"
          onError={() => setHasImageError(true)}
          referrerPolicy="no-referrer"
        />
      )}
      <span className={`relative z-10 ${showImage ? 'text-transparent' : ''} ${textClassName}`}>{initials}</span>
    </div>
  );
}
