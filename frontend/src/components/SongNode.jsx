import { memo } from 'react';
import { Handle, Position } from 'reactflow';

import { formatArtists } from '../api.js';

function SongNode({ data }) {
  const { track, isCenter, isUnconnected } = data;
  const classes = ['song-node'];
  if (isCenter) classes.push('song-node--center');
  if (isUnconnected) classes.push('song-node--aside');

  if (!track) {
    return (
      <div
        className={[...classes, 'song-node--unknown'].join(' ')}
        title="This song is linked by a transition, but its details have not been loaded from Spotify yet. Run `make warm-cache` once Spotify is responding."
      >
        <Handle type="target" position={Position.Top} isConnectable={false} />
        <span className="song-node__art song-node__art--empty" aria-hidden="true" />
        <span className="song-node__text">
          <span className="song-node__title">Details unavailable</span>
          <span className="song-node__artist">Not loaded yet</span>
        </span>
        <Handle type="source" position={Position.Bottom} isConnectable={false} />
      </div>
    );
  }

  const artists = formatArtists(track);
  return (
    <div className={classes.join(' ')}>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      {track.album_art_url ? (
        <img className="song-node__art" src={track.album_art_url} alt="" />
      ) : (
        <span className="song-node__art song-node__art--empty" aria-hidden="true" />
      )}
      <span className="song-node__text">
        <span className="song-node__title" title={track.name}>
          {track.name}
        </span>
        <span className="song-node__artist" title={artists}>
          {artists}
        </span>
      </span>
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  );
}

export default memo(SongNode);
