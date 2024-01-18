import YtDlp from "./ytdlAutomation";
import log from "./log";

export default async function deleteVideos() {
  try {
    const ytdl = new YtDlp();
    await ytdl.initialize();

    await ytdl.deleteVideosInDir('playlists/to_delete');

    await ytdl.close();
  } catch (e) {
    log.error('APP', `CRITICAL ERROR: ${e}`);

    log.error('APP', e.stack);

    process.exit(1);
  }
}