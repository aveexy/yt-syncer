import * as fs from 'fs/promises';
import * as path from 'path';
import merge from "ts-deepmerge";
import ipc from "./ipc";
import log, {LogWithPrefix} from "./log";
import {defaultStatsObj, List, StatsFile} from "./statsFileTypes";
import YtDlp, {Ret} from "./ytdlp";
import {Channel, Playlist, Video} from "./ytdlpTypes";
import sanitize from "sanitize-filename";
import {filesize} from "filesize";
import {spawn} from "node:child_process";
import {InvalidJsonError, NoneZeroReturnCodeError} from "./errors";

const statsFileName = 'stats.json';

export default class YtDlAutomation {
  private statsFileHandle: fs.FileHandle | null = null;

  private statsFile: StatsFile = defaultStatsObj;

  private initialized: boolean = false;

  private readonly log: LogWithPrefix;

  constructor() {
    this.log = log.getInstanceWithPrefix('AUTO');
  }

  public async initialize() {
    this.log.verbose('Initializing...');
    const success = await ipc.serve();
    if (!success) {
      throw new Error('another instance already running');
    }

    try {
      this.statsFileHandle = await fs.open(statsFileName, 'r+');
    } catch (e) {
      if (e && typeof e === 'object' && 'code' in e && e.code !== 'ENOENT') {
        await this.close();
        throw e;
      }

      this.statsFileHandle = await fs.open(statsFileName, 'w+');
    }

    await this.readStatsFile();
    this.statsFile.instanceNumber += 1;
    await this.writeStatsFile();

    await this.ensureDirectoryExists('execs');
    await this.ensureDirectoryExists('playlists');
    await this.ensureDirectoryExists('channels');
    await this.ensureDirectoryExists('shorts');
    await this.ensureDirectoryExists('explicit_channels');

    this.initialized = true;
    this.log.verbose('Initialized');
  }

  public async close() {
    if (this.statsFileHandle) {
      await this.writeStatsFile();
      await this.statsFileHandle.close();
    }

    await ipc.close();
  }

  public async processUrlFile(urlFilePath: string) {
    const f = await fs.open(urlFilePath);

    for await (const videoUrl of f.readLines()) {
      if (videoUrl === '' || videoUrl[0] === '#') {
        continue;
      }

      // console.log(videoUrlParts, query);

      const dl = this.getYtDlpInst(videoUrl);
      const type = dl.getResourceType();

      this.log.info(`checking ${type} ${videoUrl}`);

      const resource = await dl.getResourcesAndEntries();

      try {
        switch (type) {
          case "playlist":
          case "shorts": {
            if (resource.__type !== 'PLAYLIST') {
              this.log.error('YtDlp.getResourcesAndEntries __type != "PLAYLIST"');
              continue
            }

            const pl = resource;

            const stats = this.statsFile.lists[pl.id];

            if (stats) {
              this.statsFile.lists[pl.id].lastChecked = new Date().getTime();
            }

            if (stats && stats.modified_date === pl.modified_date && stats.entryCount === pl.playlist_count && stats.downloaded.length === stats.entryCount) {
              this.log.info(`not changed ${type} "${pl.title}" ${videoUrl}`);

              // TODO: check if every video has been downloaded
              continue;
            }

            await this.ensureDirectoryExists(`${type.endsWith('s') ? type : `${type}s`}/${sanitize(`${pl.title}_${pl.id}`)}`);

            this.log.info(`getting resources of ${type} "${pl.title}" ${videoUrl}`);
            await this.processPlaylist(pl, pl.entries.map((v) => v.id));

            this.statsFile.lists[pl.id] = merge(this.statsFile.lists[pl.id] || {}, {
              id: pl.id,
              lastChecked: new Date().getTime(),
              modified_date: pl.modified_date,
              entryCount: pl.playlist_count,
              downloaded: [],
            }) as List;

            await this.writeStatsFile();

            break;
          }

          case "channel": {
            if (resource.__type !== 'CHANNEL') {
              this.log.error(`YtDlp.getUrlInfo __type != "CHANNEL"`);
              // this.log.verbose(JSON.stringify(resource));
              continue
            }

            const ch = resource;

            const stats = this.statsFile.channels[ch.id];

            if (stats) {
              this.statsFile.channels[ch.id].lastChecked = new Date().getTime();
            }

            // if (stats && stats.lastVideoId === ch.entries[0]?.id) {
            //   this.log.info(`not changed ${type} "${ch.title}" ${videoUrl}`);
            //   continue;
            // }

            await this.ensureDirectoryExists(`channels/${sanitize(`${ch.title}_${ch.id}`)}`);

            this.log.info(`processing videos of ${type.endsWith('s') ? type : `${type}s`} "${ch.title}" ${videoUrl}`);
            await this.processChannel(ch, ch.entries.map((v) => v.id));

            this.statsFile.channels[ch.id] = merge(this.statsFile.channels[ch.id] || {}, {
              id: ch.id,
              lastChecked: new Date().getTime(),
              lastVideoId: ch.entries[0]?.id || '',
            });

            await this.writeStatsFile();

            break;
          }
        }
      } catch (e) {
        this.log.error(`error checking ${type} ${videoUrl} ${e}`);
      }
    }
  }

  public async deleteVideosInDir(dirPath: string) {
    this.log.info('loading symlink dir entries');

    const videos: Map<string, string[]> = new Map();
    let symlinks = 0;

    // TODO: improve performance, this is really inefficient
    await Promise.all(["playlists", "channels", "explicit_channels"].map(async (d1) => {
      await Promise.all((await fs.readdir(d1)).map(async (d2) => {
        await Promise.all((await fs.readdir(path.join(d1, d2))).map(async (d3) => {
          const p = path.join(d1, d2, d3);

          const lnkTarget = await fs.readlink(p);
          const videoFileName = path.basename(lnkTarget);
          const id = videoFileName.substring(0, videoFileName.indexOf('.'));

          let vv;
          if (!(vv = videos.get(id))) {
            vv = [];
            videos.set(id, vv);
          }

          vv.push(path.join(d1, d2, d3));
          symlinks += 1;
        }));
      }));
    }));

    this.log.info(`finished loading symlink dir entries, found ${videos.size} unique videos and ${symlinks} symlinks`);

    let completeFreedSize = 0

    const dir = await fs.readdir(dirPath);

    this.log.info(`found ${dir.length} videos to delete`);

    for await (const d of dir) {
      const dPath = path.join(dirPath, d);
      const f = await fs.lstat(dPath);
      if (!f.isSymbolicLink()) {
        this.log.error(`non symlink in delete dir ${d}`);
      }

      const lnkTarget = await fs.readlink(dPath);
      const videoFileName = path.basename(lnkTarget);
      const id = videoFileName.substring(0, videoFileName.indexOf('.'));
      const groupDir = path.join(dirPath, path.dirname(lnkTarget));

      const groupDirContent = (await fs.readdir(groupDir)).filter((v) => v.substring(0, v.indexOf('.')) === id);

      const symlinks = videos.get(id);
      if (!symlinks) {
        throw new Error(`no symlinks for ${id}`);
      }

      this.statsFile.deleted_videos.push(id);

      await Promise.all(symlinks.map(async (v) => {
        // this.log.verbose(`unlink ${v}`);
        await fs.unlink(path.join(v));
      }));

      let freedSize = 0;

      await Promise.all(groupDirContent.map(async (v) => {
        const p = path.join(groupDir, v);
        const size = (await fs.stat(p)).size;
        freedSize += size;

        // this.log.verbose(`unlink ${p} (${filesize(size, {base: 2})})`);
        await fs.unlink(p);
      }));

      await this.writeStatsFile();

      this.log.info(`${id} freed ${filesize(freedSize, {base: 2})}`);

      completeFreedSize += freedSize;
    }

    this.log.info(`freed ${filesize(completeFreedSize, {base: 2})}`)
  }

  private async readStatsFile() {
    if (!this.statsFileHandle) {
      throw new Error('stats file not opened');
    }

    const buf = await this.statsFileHandle.readFile();
    const str = new TextDecoder().decode(buf);

    if (str !== '') {
      const dataFromFile = JSON.parse(str) as StatsFile;
      this.statsFile = merge(defaultStatsObj, dataFromFile);
    }
  }

  private async writeStatsFile() {
    if (!this.statsFileHandle) {
      throw new Error('stats file not opened');
    }

    const buf = new TextEncoder().encode(JSON.stringify(this.statsFile));
    await this.statsFileHandle.write(buf, 0, null, 0);
    await this.statsFileHandle.truncate(buf.length);
  }

  private async processPlaylist(pl: Playlist, ids: string[]) {
    const deletedVideos = this.statsFile.deleted_videos.filter((v) => ids.includes(v));
    const idsAlreadyDownloaded = ids.filter((v) => this.statsFile.videos.includes(v) && !this.statsFile.deleted_videos.includes(v));
    const idsToDownload = ids.filter((v) => !this.statsFile.videos.includes(v) && !this.statsFile.unavailable_videos.hasOwnProperty(v) && !this.statsFile.deleted_videos.includes(v));

    this.log.info(`playlist "${pl.title}" has ${ids.length} videos of which ${idsToDownload.length} need to be downloaded, ${deletedVideos.length} videos have been deleted`);

    this.statsFile.lists[pl.id] = merge(this.statsFile.lists[pl.id] || {}, {
      id: pl.id,
      lastChecked: new Date().getTime(),
      modified_date: pl.modified_date,
      entryCount: pl.playlist_count,
      downloaded: [],
    }) as List;

    for (const v of idsAlreadyDownloaded) {
      const video = await this.readVideoInfoJson(v);
      if (!video) {
        continue;
      }

      await this.createSymlinks(video, pl);
    }

    for (const vId of idsToDownload) {
      if (vId.trim() === '') {
        continue;
      }

      const ret = await this.downloadVideo(vId);
      if (ret.code === 0) {
        const video = await this.readVideoInfoJson(vId);
        if (!video) {
          this.log.error(`${vId} reading video info failed`);
          continue;
        }

        this.statsFile.lists[pl.id].downloaded.push(vId);
        await this.writeStatsFile();

        await this.createSymlinks(video, pl);
      } else {
        await this.videoDownloadFailed(ret, vId);
      }
    }
  }

  private async processChannel(ch: Channel, ids: string[]) {
    const deletedVideos = this.statsFile.deleted_videos.filter((v) => ids.includes(v));
    const idsAlreadyDownloaded = ids.filter((v) => this.statsFile.videos.includes(v) && !this.statsFile.deleted_videos.includes(v));
    const idsToDownload = ids.filter((v) => !this.statsFile.videos.includes(v) && !this.statsFile.unavailable_videos.hasOwnProperty(v) && !this.statsFile.deleted_videos.includes(v));

    this.log.info(`channel "${ch.title}" has ${ids.length} videos of which ${idsToDownload.length} need to be downloaded, ${deletedVideos.length} videos have been deleted`);

    this.statsFile.channels[ch.id] = merge(this.statsFile.lists[ch.id] || {}, {
      id: ch.id,
      lastChecked: new Date().getTime(),
      lastVideoId: '',
      downloaded: [],
    });

    for (const v of idsAlreadyDownloaded) {
      const video = await this.readVideoInfoJson(v);
      if (!video) {
        continue;
      }

      await this.createSymlinks(video, undefined, true);
    }

    for (const vId of idsToDownload) {
      if (vId.trim() === '') {
        continue;
      }

      const ret = await this.downloadVideo(vId);
      if (ret.code === 0) {
        const video = await this.readVideoInfoJson(vId);
        if (!video) {
          this.log.error(`${vId} reading video info failed`);
          continue;
        }

        this.statsFile.channels[ch.id].downloaded.push(vId);
        await this.writeStatsFile();

        await this.createSymlinks(video, undefined, true);
      } else {
        await this.videoDownloadFailed(ret, vId);
      }
    }
  }

  private async videoDownloadFailed(ret: Ret, vId: string) {
    this.log.error(`video ${vId} not available/download failed`);

    const stderrLines = ret.stderr.split("\n");

    const errorMsgs = ['unavailable', 'not available', 'members on level', 'has been removed for violating', 'Private video'];

    for (let i = 0; i < errorMsgs.length; i++) {
      const keyword = errorMsgs[i];

      if (ret.stderr.includes(keyword)) {
        const line = stderrLines.filter((err) => err.includes(keyword));
        if (line.length !== 1) {
          continue;
        }

        const reason = line[0].substring(line[0].indexOf(':', 7) + 2);

        this.statsFile.unavailable_videos[vId] = reason;
        this.log.verbose(`added unavailable video ${vId} ${reason}`);
        await this.writeStatsFile();
        i = errorMsgs.length;
      }
    }
  }

  private async createSymlinks(video: Video, pl?: Playlist, explicit_channel: boolean = false) {
    if (pl) {
      await this.ensureDirectoryExists(`playlists/${sanitize(`${pl.title}_${pl.id}`)}`);

      try {
        await fs.access(`playlists/${sanitize(`${pl.title}_${pl.id}`)}/${sanitize(`${video.title}_${video.id}.${video.ext}`)}`);
      } catch (e) {
        await this.createSymlink(
          `../../data/${video.id[0]}/${video.id[1]}/${video.id}.${video.ext}`,
          `playlists/${sanitize(`${pl.title}_${pl.id}`)}/${sanitize(`${video.title}_${video.id}.${video.ext}`)}`,
        );
      }
    }

    await this.ensureDirectoryExists(`channels/${sanitize(`${video.channel}_${video.channel_id}`)}`);
    try {
      await fs.access(`channels/${sanitize(`${video.channel}_${video.channel_id}`)}/${sanitize(`${video.title}_${video.id}.${video.ext}`)}`);
    } catch (e) {
      await this.createSymlink(
        `../../data/${video.id[0]}/${video.id[1]}/${video.id}.${video.ext}`,
        `channels/${sanitize(`${video.channel}_${video.channel_id}`)}/${sanitize(`${video.title}_${video.id}.${video.ext}`)}`,
      );
    }

    if (explicit_channel) {
      await this.ensureDirectoryExists(`explicit_channels/${sanitize(`${video.channel}_${video.channel_id}`)}`);
      try {
        await fs.access(`explicit_channels/${sanitize(`${video.channel}_${video.channel_id}`)}/${sanitize(`${video.title}_${video.id}.${video.ext}`)}`);
      } catch (e) {
        await this.createSymlink(
            `../../data/${video.id[0]}/${video.id[1]}/${video.id}.${video.ext}`,
            `explicit_channels/${sanitize(`${video.channel}_${video.channel_id}`)}/${sanitize(`${video.title}_${video.id}.${video.ext}`)}`,
        );
      }
    }
  }

  private async downloadVideo(id: string) {
    this.log.info(`download video ${id}`);
    const dl = this.getYtDlpInst(`https://youtube.com/watch?v=${id}`);

    const ret = await dl.downloadVideo();
    if (ret.code === 0) {
      const json = await fs.readFile(`/tmp/ytdlp/${id}/${id}.info.json`, {encoding: 'utf-8'});
      const video = JSON.parse(json) as Video;

      await this.ensureDirectoryExists(`data/${id[0]}`);
      await this.ensureDirectoryExists(`data/${id[0]}/${id[1]}`);

      const ffprobe = await this.ffprobeVideoFile(`/tmp/ytdlp/${id}/${id}.${video.ext}`);
      await fs.writeFile(`/tmp/ytdlp/${id}/${id}.${video.ext}.ffprobe.json`, JSON.stringify(ffprobe));

      this.log.info(`[${id}] copying files`);
      await fs.cp(`/tmp/ytdlp/${id}`, `data/${id[0]}/${id[1]}/`, { recursive: true });

      await fs.rm(`/tmp/ytdlp/${id}`, { recursive: true, force: true });

      this.statsFile.videos.push(id);
      await this.writeStatsFile();
    } else {
      this.log.error(`[${id}] ytdlp return code ${ret.code}`);
    }

    return ret;
  }

  private getYtDlpInst(url: string) {

    return new YtDlp(url, this.ytDlExecCallback.bind(this));
  }

  private async ytDlExecCallback(bin: string, args: string[]) {
    this.statsFile.ytDlpInstanceNumber += 1;

    const execsDir = Math.floor(this.statsFile.ytDlpInstanceNumber / 100);

    await this.ensureDirectoryExists(`execs/${execsDir}`);
    await this.ensureDirectoryExists(`execs/${execsDir}/${this.statsFile.ytDlpInstanceNumber}`);

    return `execs/${execsDir}/${this.statsFile.ytDlpInstanceNumber}`;
  }

  private async ensureDirectoryExists(path: string) {
    try {
      await fs.access(path);
    } catch (e) {
      await fs.mkdir(path);
    }
  }

  private async createSymlink(target: string, path: string) {
    await fs.symlink(target, path);
  }

  private async readVideoInfoJson(id: string) {
    try {
      const json = await fs.readFile(`data/${id[0]}/${id[1]}/${id}.info.json`, {encoding: 'utf-8'});
      return JSON.parse(json) as Video;
    } catch (e) {
      return null;
    }
  }

  private async ffprobeVideoFile(path: string) {
    const bin = "ffprobe";
    const finalArgs = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      '-i', path,
    ];

    return new Promise<object>(async (resolve, reject) => {
      const p = spawn(
        bin,
        finalArgs,
      );

      p.stdout.setEncoding('utf-8');
      p.stderr.setEncoding('utf-8');

      p.stderr.on('data', (v: string) => {
        v.trim().split(/\r?\n/).forEach((str) => {
          this.log.error(`[STDERR] ${str}`);
        });
      });

      let dataStr = '';
      p.stdout.on('data', (data) => {
        dataStr += data;
      });

      p.on('close', (code) => {
        if (code !== 0) {
          reject(new NoneZeroReturnCodeError(code || -1));
        }

        try {
          const jsonStr = JSON.parse(dataStr);

          resolve(jsonStr);
        } catch (e) {
          reject(new InvalidJsonError(`${e}`));
        }
      });
    });
  }
}
