const GaleCrater = require('./index');

async function run() {
  console.log('Landing on Gale Crater...');

  let filename = 'sample.mp4';
  let filepath = './media/sample.mp4';

  let streamingUrl = await GaleCrater.transcode(filename, filepath);
  
  filename = filename.replace('.mp4', '');
  let dashUrl = streamingUrl + filename + '.ism/Manifest(format=mpd-time-csf)';
  console.log('Dash streamingUrl: ', dashUrl);

  return dashUrl;
}

run();
