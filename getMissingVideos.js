JSON.parse((require('fs').readFileSync('./stats.json'))).videos.map((v) => [v, (require('fs')).existsSync(`./data/${v[0]}/${v[1]}/${v}.mkv`)]).filter((v) => !v[1]);
