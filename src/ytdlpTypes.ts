export interface Thumbnail {
  id: string;
  url: string;
  height?: number;
  width?: number;
  resolution?: string;
  preference: number;
}

export interface Fragment {
  url: string;
  duration: number;
}

export interface Headers {
  'User-Agent': string;
  Accept: string;
  'Accept-Language': string;
  'Sec-Fetch-Mode': string;
}

export interface Format {
  format_id: string;
  format_note: string;
  ext: string;
  protocol: string;
  acodec: string;
  vcodec: string;
  url: string;
  width: number;
  height: number;
  fps: number;
  rows: number;
  columns: number;
  fragments: Fragment[];
  resolution: string;
  aspect_ratio: number;
  http_headers: Headers[];
  audio_ext: string;
  video_ext: string;
  format: string;
}

// TODO
export interface Video extends Base {
  formats: Format[];
  thumbnail: string;
  duration: number;
  view_count: number;
  age_limit: number;
  webpage_url: string;
  categories: string[];

  ext: string;
}

export interface Base {
  __type: string,
  _type: string;
  id: string;
  title: string,
  description: string;
  tags: string[];
  thumbnails: Thumbnail[];

  uploader: string;
  uploader_id: string;
  uploader_url: string;

  channel: string;
  channel_id: string;
  channel_url: string;
}

export interface Unknown extends Base {
  __type: 'UNKNOWN',
}

export interface List extends Base {
  entries: Video[];
}

export interface Playlist extends List {
  __type: 'PLAYLIST',
  availability: string;
  modified_date: string;
  view_count: number;
  playlist_count: number;
}

export interface Channel extends List {
  __type: 'CHANNEL',
  channel_follower_count: number;
}
