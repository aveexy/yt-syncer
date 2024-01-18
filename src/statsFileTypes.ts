
export interface List {
  id: string;
  lastChecked: number;
  modified_date: string;
  entryCount: number;
  downloaded: string[];
}

export interface Channel {
  id: string;
  lastChecked: number;
  lastVideoId: string;
  downloaded: string[];
}

export interface StatsFile {
  instanceNumber: number;
  ytDlpInstanceNumber: number;
  lists: { [k: string]: List };
  channels: { [k: string]: Channel };
  videos: string[];
  unavailable_videos: Record<string, string>;
  deleted_videos: string[];
}

export const defaultStatsObj: StatsFile = {
  instanceNumber: 0,
  ytDlpInstanceNumber: 0,
  lists: {},
  channels: {},
  videos: [],
  unavailable_videos: {},
  deleted_videos: [],
};
