import { Avatar } from '@formrail/core';

// The image is an inline SVG (no network). With no `src`, or if the image fails to load, the avatar
// shows the initials of `name`, which is also its accessible name.
const PHOTO = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" fill="#0a6ed1"/><circle cx="48" cy="38" r="18" fill="#fff"/><rect x="18" y="62" width="60" height="40" rx="30" fill="#fff"/></svg>',
)}`;

export function ApproverAvatars() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Avatar name="Ada Lovelace" src={PHOTO} />
      <Avatar name="Grace Hopper" />
      <Avatar name="Alan Turing" shape="square" size="lg" />
    </div>
  );
}
