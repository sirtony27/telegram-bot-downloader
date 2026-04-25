const { execFile, spawn } = require('child_process');

// create a fake yt-dlp script
const fs = require('fs');
fs.writeFileSync('fake-ytdlp.js', `
  let p = 0;
  const interval = setInterval(() => {
    p += 1.5;
    if (p >= 100) {
       console.log('[download] 100% of 50MiB');
       clearInterval(interval);
    } else {
       console.log('[download] ' + p.toFixed(1) + '% of 50MiB at 1MiB/s ETA 00:00');
    }
  }, 100);
`);

const child = execFile('node', ['fake-ytdlp.js'], (err, stdout, stderr) => {
  console.log('DONE');
});

child.stdout.on('data', (chunk) => {
  const str = chunk.toString();
  const match = str.match(/\[download\]\s+([\d\.]+)%/);
  if (match) {
    console.log('Matched:', match[1]);
  }
});
