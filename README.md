# Gale Crater
Video On Demand Server in Node.Js on top of Azure Media Service

## Quick Start
Clone this project
```
$ git clone https://github.com/Traverous/GaleCrater
```

Rename `config-example.js` to `config.js`. Fill in the required variables.

Then to run

```
$ node runner.js
```

## Integrate with your existing project
Clone to appropriate folder
```
$ git clone https://github.com/Traverous/GaleCrater ./gale-crater
```

Import and use the code, an example is provided in [`runner.js`](./runner.js)
```
const GaleCrater = require('./index');
let filename = 'sample.mp4';
let filepath = './media/sample.mp4';

let streamingUrl = await GaleCrater.transcode(filename, filepath);
```

You can append this `streamingUrl` with filename excluding extention plus `.ism/Manifest` for Smooth Streaming Protocol's manifest file. With `.ism/Manifest(format=m3u8-aapl)` for HLS's manifest. And with `.ism/Manifest(format=mpd-time-csf)` for DASH manifest.

Once you have the link to DASH Manifest, [you can test the Adaptive Bitrate streaming here](http://mediapm.edgesuite.net/dash/public/nightly/samples/dash-if-reference-player/index.html)