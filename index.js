const axios = require('axios');
const querystring = require('querystring');
const config = require('./config');
const REST = require('./rest');

/**
* variables used for requesting or for storing IDs
*/
let VARS = {
  TenantID: "",
  AzureADSTSEndpoint: "",
  RESTAPIEndpoint: "",
  ClientID: "",
  ClientSecret: "",
  AccessToken: "",
  LastAssetId: "",
  UploadAccessPolicyId: "",
  ReadAccessPolicyId: "",
  UploadURL: "",
  MediaFileName: "",
  LastChannelId: "",
  MediaProcessorId: "nb:mpid:UUID:ff4df607-d419-42f0-bc17-a481b1331e56",
  OutputAssetId: "",
  StreamingUrl: ""
};

/**
* if env variables are used set them here
* else get variables from config
*/
function setupVariables () {
  if (process.env.TenantID) {
    VARS.TenantID = process.env.TenantID;
    VARS.AzureADSTSEndpoint = process.env.AzureADSTSEndpoint;
    VARS.RESTAPIEndpoint = process.env.RESTAPIEndpoint;
    VARS.ClientID = process.env.ClientID;
    VARS.ClientSecret = process.env.ClientSecret;
  } else {
    VARS.TenantID = config.TenantID;
    VARS.AzureADSTSEndpoint = config.AzureADSTSEndpoint;
    VARS.RESTAPIEndpoint = config.RESTAPIEndpoint;
    VARS.ClientID = config.ClientID;
    VARS.ClientSecret = config.ClientSecret;
  }
}

/*
* adds a delay of provided miliseconds
*/
function delay(time) {
   return new Promise(function(resolve) { 
       setTimeout(resolve, time)
   });
}

async function transcode (fileName, filePath) {
  setupVariables();

  try {
    /*
    * Retrieve Access Token
    */
    let tokenResp = await REST.getAADAccessToken(VARS.AzureADSTSEndpoint, VARS.ClientID, VARS.ClientSecret);
    VARS.AccessToken = tokenResp.access_token;
    console.log('Fetched AccessToken!');

    /*
    * Access Policy with write permissions. Fetch the policy if one exists with the same name 
    * or create it
    */
    let newPolicyName = 'TravUploadPolicy';
    let aPolicy = await REST.fetchOrCreateAccessPolicy(VARS.RESTAPIEndpoint, VARS.AccessToken, newPolicyName, REST.WRITE_POLICY);
    VARS.UploadAccessPolicyId = aPolicy.Id;
    console.log('Fetched Access Policy: ', VARS.UploadAccessPolicyId);

    /*
    * Prefix assets with a name and suffix with current time
    */
    let assetName = 'TravAsset_' + (new Date()).getTime();
    let asset = await REST.createAsset(VARS.RESTAPIEndpoint, VARS.AccessToken, assetName);
    console.log('Asset created: ', asset.Id, asset.Name);
    VARS.LastAssetId = asset.Id;

    /*
    * SAS Locator for uploading 
    */
    const locator = await REST.fetchLocator(VARS.RESTAPIEndpoint, VARS.AccessToken, VARS.UploadAccessPolicyId, VARS.LastAssetId, REST.WRITE_LOCATOR);
    console.log('Fetched locator: ', locator.Id);

    /*
    * Upload URL
    */
    VARS.UploadURL = locator.BaseUri + '/' + fileName + locator.ContentAccessComponent;
    console.log('UploadURL: ', VARS.UploadURL);

    console.log('Uploading file: ', filePath, ' ...');
    let isUploaded = await REST.uploadFile(VARS.UploadURL, filePath, fileName);

    if (!isUploaded) {
      console.log('File Upload ERRORED');
      return null;
    }

    console.log('File uploaded!');

    /*
    * create file info
    */
    let fileInfoCreated = await REST.createFileInfos(VARS.RESTAPIEndpoint, VARS.AccessToken, VARS.LastAssetId);
    console.log('Created file infos: ', fileInfoCreated);

    /*
    * no need to request media processor each time. We already know the Id of Standard Encoding Media Processor
    * nb:mpid:UUID:ff4df607-d419-42f0-bc17-a481b1331e56
    */
    // let mediaProcessor = await REST.getMediaProcessor(VARS.RESTAPIEndpoint, VARS.AccessToken);
    // console.log('Media Processor: ', mediaProcessor);

    let encodingJob = await REST.createJob(VARS.RESTAPIEndpoint, VARS.AccessToken, VARS.LastAssetId, assetName, VARS.MediaProcessorId);

    let jobId = encodingJob.d.Id;
    let outputMediaAsset = encodingJob.d.OutputMediaAssets;
    /*
    * Format: of OutputMediaAssets:
    OutputMediaAssets: {
      __deferred: {
        uri: '<JOB_URL>/OutputMediaAssets'
      }
    }
    */
    let outputAssetUrl = outputMediaAsset.__deferred.uri;

    console.log('Encoding job started: ', jobId);

    /*
    * Actively tracking job state
    */  
    let isDone = false;
    do {
      console.log('Waiting for few sec before checking job state...');
      await delay(5000);
      let jobState = await REST.monitorJob(VARS.RESTAPIEndpoint, VARS.AccessToken, jobId);

      if (jobState.d.State == 3) {
        console.log('Job done.');
        isDone = true;
      }
    } while(!isDone);

    /*
    * Read Access Policy
    */
    let readPolicyName = 'TravReadPolicy';
    let readPolicy = await REST.fetchOrCreateAccessPolicy(VARS.RESTAPIEndpoint, VARS.AccessToken, readPolicyName, REST.READ_POLICY);
    VARS.ReadAccessPolicyId = readPolicy.Id;
    console.log('Read Access Policy: ', readPolicy.Name, readPolicy.Id);

    let outputAsset = await REST.getOutputAsset(outputAssetUrl, VARS.AccessToken);
    if (outputAsset.value && outputAsset.value.length > 0) {
      outputAsset = outputAsset.value[0];
      console.log('Output Asset: ', outputAsset.Id);
    }

    /*
    * Streaming locator
    */
    const streamingLocator = await REST.fetchLocator(VARS.RESTAPIEndpoint, VARS.AccessToken, VARS.ReadAccessPolicyId, outputAsset.Id, REST.READ_LOCATOR);
    console.log('Streaming locator created: ', streamingLocator.Name, streamingLocator.Id);
    console.log(streamingLocator);

    /*
    * return streaming path for DASH
    */
    return streamingLocator.Path;
  } catch (e) {
    console.log('ERROR: ', e);

    return null;
  }
}

module.exports = {
  transcode: transcode
}