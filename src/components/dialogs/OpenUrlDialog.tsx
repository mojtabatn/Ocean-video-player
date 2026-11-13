import { useState } from 'react';
import { Button, Dialog } from '../ui';

export function OpenUrlDialog({ onOpen, onClose }: { onOpen: (url: string) => void; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const valid = /^(https?|rtmp|rtsp|ftp):\/\/\S+$/i.test(url.trim());
  return (
    <Dialog title="Open URL" width={480} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onOpen(url.trim());
        }}
      >
        <p className="dialog__text">Direct link to a video or stream (MP4, MKV, M3U8, …)</p>
        <input className="input" autoFocus value={url} placeholder="https://" onChange={(e) => setUrl(e.target.value)} dir="ltr" />
        <div className="dialog__actions">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!valid}>Open</Button>
        </div>
      </form>
    </Dialog>
  );
}
