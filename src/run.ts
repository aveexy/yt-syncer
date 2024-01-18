import {spawn} from 'node:child_process';
import * as fs from 'fs';
import YtDlp from "./ytdlAutomation";
import log from './log';

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

const args = processArgs([
  'cookies cookies.txt',
  'download-archive archive.txt',
  'cache-dir cache',
  'paths files',
  'output data/%(id.0:2)s/%(id.2:4)s/%(id)s.%(ext)s',
  // 'output infojson:data/%(id.0:2)s/%(id.2:4)s/info/%(playlist_id|none)s/%(id)s.%(ext)s',
  'output pl_thumbnail:playlist_info/%(playlist_id|id)s/%(id)s.%(ext)s',
  'output pl_description:playlist_info/%(playlist_id|id)s/%(id)s.%(ext)s',
  'output pl_infojson:playlist_info/%(playlist_id|id)s/%(id)s.%(ext)s',
  // 'concurrent-fragments 4',
  'throttled-rate 500K',
  'retries 10',
  'retry-sleep 5',
  'no-keep-fragments',
  'buffer-size 64K',
  'lazy-playlist',
  'xattr-set-filesize',
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
  // 'write-all-thumbnails',

  'progress',
  'newline',

  'video-multistreams',
  'format (bestvideo*[height>1200]+bestvideo*[height>=900][height<=1200]+bestaudio)/(bestvideo*+bestaudio)/best',
  'merge-output-format mkv',
  // 'list-formats',

  // 'write-subs',
  // 'write-auto-subs',
  'embed-subs',
  'sub-langs en,de,live_chat',
  'sub-format srt/best',
  'convert-subs srt',
  // 'list-subs',

  'sponsorblock-mark all',
  'sponsorblock-chapter-title [SB]: %(category_names)l',

  'exec after_move:node postprocess.js %(id.0:2)s/%(id.2:4)s %(id)s %(playlist_id|none)s',
]);

function downloadUrl(url: string) {
  const p = spawn(
    'yt-dlp',
    [
      ...args,
      url,
      // 'https://www.youtube.com/watch?v=OyQ1CpnLyaU',
      // 'https://www.youtube.com/watch?v=OyQ1CpnLyaU&list=LL',
      // 'https://www.youtube.com/watch?v=dhxvXiwE8rY',
      // 'https://www.youtube.com/playlist?list=PL8mG-RkN2uTwNy21Qm1qyCxoSTipfzJ7s',
    ],
    {
      stdio: [0, 0, 0],
    },
  );
}

function executeYtDlpPrintToStdout(args: string[], literalArgs: string[] = []) {
  spawn(
    'yt-dlp',
    [
      ...processArgs(args),
      ...literalArgs,
    ],
    {stdio: [0, 0, 0]},
  );
}

export default async function main() {
  // fs.readdirSync('files').forEach((v) => {
  //   fs.rmSync(`files/${v}`, {recursive: true});
  // });

  try {
    const ytdl = new YtDlp();
    await ytdl.initialize();

    await ytdl.processUrlFile('urls.txt');

    await ytdl.close();
  } catch (e) {
    log.error('APP', `CRITICAL ERROR: ${e}`);

    log.error('APP', e.stack);

    process.exit(1);
  }

  return;

  const url = 'https://www.youtube.com/playlist?list=PL7vUvTEoOwI3eiZPMu3X5-TUSPaRLLC4w';

  executeYtDlpPrintToStdout([
      'dump-single-json',
      'playlist-items 0',
      'print-traffic',
      'write-pages',
    ],
    [url],
  );

  // await getPlaylistInfo(url);
}
