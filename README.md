# yt-syncer

a nice (horrobly written) poc (that is used in production) yt downloader based on yt-dlp

## dependencies

nodejs > 16, yt-dlp

install node dependencies with ```yarn install``` / ```npm install```

## usage

add youtube playlists/channels to ```urls.txt```, start yt-syncer:

```yarn run run``` / ```npm run run```

cookies file ```cookies.txt``` is required to download playlists

downloaded data is stored in ```data/```

symlinks to channel/playlist videos are stored in ```channels/```/```playlists/```/```shorts/```

