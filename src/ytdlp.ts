import {spawn} from "node:child_process";
import {Base, Channel, Playlist, Unknown} from "./ytdlpTypes";
import log, {LogWithPrefix} from "./log";
import * as fs from 'fs/promises';
import {NoneZeroReturnCodeError, TimeoutError} from "./errors";

import querystring from 'node:querystring'
import url from 'node:url';

function processArgs(args: string[]) {
  return args
    .map((v) => {
      const space = v.indexOf(' ');
      if (space === -1) {
        return [`--${v}`];
      }

      return [`--${v.slice(0, space)}`, v.slice(space + 1)];
    })
    .reduce((arr, v) => {
      arr.push(...v);
      return arr;
    }, []);
}

type InferPromiseType<T> = T extends Promise<infer A> ? A : never;

type ExecCallback = (bin: string, args: string[]) => Promise<string>;

export type Ret = { code: number, stderr: string };

export default class YtDlp {
  private static binPath: string = 'yt-dlp';

  private readonly url: string;

  private readonly log: LogWithPrefix;

  private readonly execCallback: ExecCallback;

  private readonly resourceType: 'video' | 'playlist' | 'channel' | 'shorts';

  public static setPath(path: string) {
    YtDlp.binPath = path;
  }

  constructor(resourceUrl: string, execCallback: ExecCallback) {
    this.url = resourceUrl;
    this.execCallback = execCallback;

    this.log = log.getInstanceWithPrefix('DL');

    const videoUrlParts = url.parse(resourceUrl);
    const query = querystring.parse(videoUrlParts.query || '');

    if ('v' in query) {
      this.resourceType = 'video';
    } else if ('list' in query || videoUrlParts.path?.startsWith("/feed/history")) {
      this.resourceType = 'playlist';
    } else if (videoUrlParts.path?.endsWith('/shorts')) {
      this.resourceType = 'shorts';
    } else if (videoUrlParts.path?.startsWith('/@')) {
      this.resourceType = 'channel';
    } else {
      this.log.error(`unknown url type ${resourceUrl}`);
    }
  }

  public getResourceType() {
    return this.resourceType;
  }

  /** @deprecated */
  public async getUrlInfo(): Promise<Playlist | Channel | Unknown> {
    const stdout = await this.executeAndGetStdout([
      'cookies ../../../cookies.txt',
      'dump-single-json',
      'playlist-items 1',
    ], [this.url]);

    return this.urlInfoDataWithType(stdout);
  }

  /** @deprecated */
  public async getPlaylistResources() {
    await this.executeAndGetStdout([
      'cookies ../../../cookies.txt',
      'no-simulate',
      'output ../../../playlist_info/%(playlist_id)s/%(id)s.%(ext)s',
      'write-all-thumbnails',
      'write-info-json',
      'write-playlist-metafiles',
      'flat-playlist',
      'no-overwrites',
    ], [this.url]);
  }

  /** @deprecated */
  public async getChannelResources() {
    await this.executeAndGetStdout([
      'no-simulate',
      'output ../../../channel_info/%(playlist_id)s/%(id)s.%(ext)s',
      'write-all-thumbnails',
      'write-info-json',
      'write-playlist-metafiles',
      'flat-playlist',
    ], [this.url]);
  }

  /** @deprecated */
  public async getPlaylistEntries() {
    const p = await this.executeAndGetStdout([
      'cookies ../../../cookies.txt',
      'print %(id)s',
      'flat-playlist',
      'match-filter !is_live',
    ], [this.url]);

    return p.split(/\r?\n/).filter((v) => v.trim() !== '');
  }

  public async getResourcesAndEntries() {
    const args = [
      'no-simulate',
      `output ../../../${this.resourceType}_info/%(playlist_id)s/%(id)s.%(ext)s`,
      'write-all-thumbnails',
      'write-info-json',
      'write-playlist-metafiles',
      'flat-playlist',
      'no-overwrites',
      // 'print %(id)s',
      'dump-single-json',
    ];

    if (this.resourceType === 'playlist') {
      args.push('cookies ../../../cookies.txt');
    }

    const stdout = await this.executeAndGetStdout(args, [this.url]);

    // return stdout.split(/\r?\n/).filter((v) => v.trim() !== '');
    return this.urlInfoDataWithType(stdout);

  }

  public async downloadVideo() {
    const p = await this.execute([
      'cookies ../../../cookies.txt',
      // 'download-archive archive.txt',
      // 'paths files',
      'output /tmp/ytdlp/%(id)s/%(id)s.%(ext)s',
      // 'output infojson:data/%(id.0:2)s/%(id.2:4)s/info/%(playlist_id|none)s/%(id)s.%(ext)s',
      'concurrent-fragments 8',
      'throttled-rate 500K',
      'retries 10',
      'retry-sleep 5',
      'no-keep-fragments',
      'buffer-size 64K',
      // 'lazy-playlist',
      // 'xattr-set-filesize',
      'no-restrict-filenames',
      'windows-filenames',
      'no-overwrites',
      'continue',

      'embed-metadata',
      'embed-chapters',
      'no-split-chapters',
      'no-remove-chapters',
      'no-embed-info-json',
      'write-info-json',

      'write-description',
      // 'write-comments',
      'embed-thumbnail',
      'write-all-thumbnails',

      'progress',
      'newline',

      'video-multistreams',
      'format (bestvideo*[height>1200]+bestvideo*[height>=900][height<=1200]+bestaudio)/(bestvideo*+bestaudio)/best',
      'merge-output-format mkv',
      // 'list-formats',

      'write-subs',
      'write-auto-subs',
      'embed-subs',
      'sub-langs en,en-orig,en-uk,en-US,en-en-US,en-de,en-de-AT,en-GB,de', //live_chat
      'sub-format srt/best',
      'convert-subs srt',
      // 'list-subs',

      'sponsorblock-mark all',
      'sponsorblock-chapter-title [SB]: %(category_names)l',

      // 'exec after_move:node postprocess.js %(id.0:2)s/%(id.2:4)s %(id)s %(playlist_id|none)s',
    ], [this.url]);

    const urlParts = url.parse(this.url);
    const query = querystring.parse(urlParts.query || '');

    const videoId = query.v || this.url;

    p.stdout.on('data', (v: string) => {
      v.trim().split(/\r?\n/).forEach((str) => {
        this.log.verbose(`[${videoId}]${str}`);
      })
    });

    let err = "";
    p.stderr.on('data', (v) => {
      err += v;

    });

    return new Promise<Ret>((resolve, reject) => {
      p.on('close', (code: number) => resolve({
        code: code,
        stderr: err,
      }));
    });
  }

  private urlInfoDataWithType(stdout: string): Playlist | Channel | Unknown {
    const data = JSON.parse(stdout) as Base;

    if (data.id.startsWith('@') || data.id === data.uploader_id || (data._type === 'playlist' && data.title.endsWith('- Videos'))) {
      data.__type = 'CHANNEL';
      return data as Channel;
    } else if (data._type === 'playlist') {
      data.__type = 'PLAYLIST';
      return data as Playlist;
    }

    data.__type = 'UNKNOWN';
    return data as Unknown;
  }

  private async execute(optionArgs: string[] = [], args: string[] = []) {
    const bin = YtDlp.binPath;
    const finalArgs = [
      ...processArgs([
        ...optionArgs,
        'write-pages',
        'cache-dir ../../../cache',
      ]),
      ...args
    ];

    const workingDir = await this.execCallback(bin, finalArgs);

    await fs.writeFile(`${workingDir}/command.json`, JSON.stringify({bin, args: finalArgs}));

    try {
      const p = spawn(
        bin,
        finalArgs,
        {
          cwd: workingDir,
        }
      );

      p.stdout.setEncoding('utf-8');
      p.stderr.setEncoding('utf-8');

      p.stderr.on('data', (v: string) => {
        v.trim().split(/\r?\n/).forEach((str) => {
          this.log.error(`[STDERR] ${str}`);
        });
      });

      return p;
    } catch (e) {
      this.log.error(`[SPNW] catched error ${e}`);
    }
  }

  private executeAndGetStdout(optionArgs: string[], args: string[], timeoutSec?: number) {
    return new Promise<string>(async (resolve, reject) => {
      let p: InferPromiseType<ReturnType<typeof this.execute>> | null = null;

      const timeout = timeoutSec ? setTimeout(() => {
        if (p) {
          p.kill("SIGKILL")

          this.log.error(`Timeout of ${timeoutSec}s reached`);
          reject(new TimeoutError(timeoutSec));
        }
      }, timeoutSec * 1000) : null;

      p = await this.execute(optionArgs, args);

      let dataStr = '';
      p.stdout.on('data', (data) => {
        dataStr += data;
      });

      // p.stderr?.on('data', (data) => {
      //   reject(new TextDecoder().decode(data));
      //   p!.kill("SIGKILL");
      // });

      p.on('close', (code) => {
        if (code !== 0) {
          reject(new NoneZeroReturnCodeError(code || -1));
        }

        p = null;
        if (timeout) {
          clearTimeout(timeout);
        }

        resolve(dataStr);

        // try {
        //   const jsonStr = JSON.parse(dataStr);
        //
        //   resolve(jsonStr);
        // } catch (e) {
        //   reject(new InvalidJsonError(`${e}`));
        // }
      });
    })
  }
}
