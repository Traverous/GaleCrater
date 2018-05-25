# Gale Crater
Video On Demand Server in Node.Js on top of Azure Media Service

![](https://cdn-images-1.medium.com/max/2000/1*9GshhDeeSbSyH6JqQoDAiA.jpeg)


## Quick Start
Clone this project
```
$ git clone https://github.com/Traverous/GaleCrater
```

Rename `config-example.js` to `config.js`. Fill in the required variables. Add some MP4 video file to 'media' folder. Rename it to sample.mp4

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

## Larger File Upload
Files larger than 100 MBs are uploaded in chunks via [Azure Storage PUT Block Blobs (REST APIs)](https://docs.microsoft.com/en-us/rest/api/storageservices/put-block). Each chunk (block) can be at most 4 MB in size. Default is 4 in the code.