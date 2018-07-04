const axios = require('axios');
const querystring = require('querystring');
const fs = require('fs');
const util = require('util');

/**
* Methods for interacting with Azure Media Services
* using REST APIs
*/
const REST = {

  DEBUG: true,

  /*
  * for uploading, locator type is 1
  * for streaming, locator type is 2
  Azure Docs:
  - None = 0: This is the default enumeration value. No valid locator will have this type
  - SAS = 1: Specifies Shared Access Signature (Sas) locator type
  - OnDemandOrigin = 2: Specifies a locator type, which refers to an Azure Media Service On-Demand Origin streaming endpoint
  */
  READ_LOCATOR: "2",
  WRITE_LOCATOR: "1",

  /*
  * for reading, policy type is 1
  * for writing, policy type is 2
  */
  READ_POLICY: "1",
  WRITE_POLICY: "2",

  /**
  * logs to console in debug mode
  */
  log: (caller, ...msgs) => {
    if (REST.DEBUG) {
      console.log(`${caller}: ${msgs.join(" ")}`);
    }
  },

  /**
  * Standard AMS Headers used for most reqeusts
  * @return {Object} Headers for Media Service
  */
  getAzureHeaders: (AccessToken) => {
    const authHeader = `Bearer ${AccessToken}`;
    return {
      'x-ms-version': '2.15',
      Accept: 'application/json',
      'Content-Type': 'application/json',
      DataServiceVersion: '3.0',
      MaxDataServiceVersion: '3.0',
      'User-Agent': 'Gale Crater - Node',
      Authorization: authHeader
    };
  },
  
  /**
  * Get Azure Active Directory AccessToken
  */
  getAADAccessToken: async (AzureADSTSEndpoint, ClientID, ClientSecret) => {
    try {
      const encodedData = querystring.stringify({
        grant_type: 'client_credentials',
        client_id: ClientID,
        client_secret: ClientSecret,
        resource: "https://rest.media.azure.net"
      });

      const resp = await axios.post(AzureADSTSEndpoint, encodedData);

      return resp.data;
    } catch (e) {
      console.log('Error getting AccessToken: ', e.response);
      return null;
    }
  },

  /**
  * create Access Policy for Media Services assets
  * AccessPolicy permissions:
  *   1: read
  *   2: write
  */
  createAccessPolicy: async (RESTAPIEndpoint, AccessToken, newPolicyName, policyType) => {
    const AZURE_HEADERS = REST.getAzureHeaders(AccessToken);
    const reqUrl = `${RESTAPIEndpoint}/AccessPolicies`;

    let durationInMinutes = 1576800; // 3 years

    try {
      const resp = await axios.post(reqUrl, 
        JSON.stringify({
          "Name": newPolicyName, 
          "DurationInMinutes" : durationInMinutes, 
          "Permissions" : policyType
        })
        ,{
        headers: AZURE_HEADERS
      });

      return resp.data;
    } catch (e) {
      console.log('createAccessPolicy: ERROR: ', e.response);
      return null;
    }
  },

  /**
  * get already created access policies
  */
  getAccessPolicies: async (RESTAPIEndpoint, AccessToken) => {
    const AZURE_HEADERS = REST.getAzureHeaders(AccessToken);
    const reqUrl = `${RESTAPIEndpoint}/AccessPolicies`;

    try {
      const resp = await axios.get(reqUrl, {
        headers: AZURE_HEADERS
      });

      return resp.data;
    } catch (e) {
      console.log('getAccessPolicies: ERROR: ', e.response);
      return null;
    }
  },

  /**
  * Enforces a rule: Creates a new policy only if policy with that name doesn't exist.
  * Though this rule is not enforced by Azure Media Services.
  * Fetches access policy or creates new
  */
  fetchOrCreateAccessPolicy: async (RESTAPIEndpoint, AccessToken, policyName, policyType) => {
    const policies = await REST.getAccessPolicies(RESTAPIEndpoint, AccessToken);

    for (let i = 0; i < policies.value.length; i++) {
      if (policies.value[i].Name === policyName && policies.value[i].Type == policyType) {
        return policies.value[i];
      }
    }

    if (policyName !== '') {
      const policy = await REST.createAccessPolicy(RESTAPIEndpoint, AccessToken, policyName, policyType);
      return policy;
    } else {
      console.log('Provide a name for New Access Policy');
      return null;
    }
  },

  /**
  * create an Asset (actually container) in Azure Blob Storage
  */
  createAsset: async (RESTAPIEndpoint, AccessToken, newAssetName) => {
    const AZURE_HEADERS = REST.getAzureHeaders(AccessToken);
    const reqUrl = `${RESTAPIEndpoint}/Assets`;

    try {
      const resp = await axios.post(reqUrl, 
        JSON.stringify({
          "Name": newAssetName
        })
        ,{
        headers: AZURE_HEADERS
      });

      return resp.data;
    } catch (e) {
      console.log('createAsset: ERROR: ', e.response);
      return null;
    }
  },

  /**
  * Asset is actually Azure Blob Storage Container
  * @return {Array} assets
  */
  getAssets: async (RESTAPIEndpoint, AccessToken) => {
    const AZURE_HEADERS = REST.getAzureHeaders(AccessToken);
    const reqUrl = `${RESTAPIEndpoint}/Assets`;

    try {
      const resp = await axios.get(reqUrl, {
        headers: AZURE_HEADERS
      });

      return resp.data;
    } catch (e) {
      console.log('getAssets: ERROR: ', e.response);
      return null;
    }
  },

  /**
  * Creates a new asset if none already exist with the same name. 
  * Else returns the existing one.
  */
  fetchOrCreateAsset: async (RESTAPIEndpoint, AccessToken, assetName) => {
    const assets = await REST.getAssets(RESTAPIEndpoint, AccessToken);

    if (assets != null) {
     for (let i = 0; i < assets.value.length; i++) {
        if (assets.value[i].Name === assetName) {
          return assets.value[i];
        }
      }
    }

    if (assetName !== '') {
      const policy = await REST.createAsset(RESTAPIEndpoint, AccessToken, assetName);
      return policy;
    } else {
      console.log('Provide a name for New Asset container');
      return null;
    }
  },

  /**
  * YYYY-MM-DDTHH:mm:ssZ (for example, "2014-05-23T17:53:50Z")
  */
  getMediaServicesTime: (time) => {
    return time.toISOString().replace(/\..+/,'Z');
  },

  /**
  * creates a locator for the give policy & asset
  */
  createLocator: async (RESTAPIEndpoint, AccessToken, policyId, assetId, locatorType, name='GaleCrater') => {
    const AZURE_HEADERS = REST.getAzureHeaders(AccessToken);
    const reqUrl = `${RESTAPIEndpoint}/Locators`;

    let StartTime = new Date((new Date()).getTime() - 1000*60*5); // five minutes before current time
    StartTime = REST.getMediaServicesTime(StartTime);

    if (locatorType == REST.WRITE_LOCATOR) {
      name = name + 'Uploader';
    } else if (locatorType == REST.READ_LOCATOR) {
      name = name + 'Streamer';
    }

    // FIXME: ExpirationDateTime not working
    try {
      const resp = await axios.post(reqUrl, 
        JSON.stringify({
          "AccessPolicyId": policyId,
          "AssetId" : assetId,
          "Type": locatorType,
          "StartTime": StartTime,
          "Name": name
        })
        ,{
        headers: AZURE_HEADERS
      });

      return resp.data;
    } catch (e) {
      if (e.response.status == 409) {
        // more than one resource has the same name in this asset.
        // FIXME cater this
      }
      console.log('createLocator: ERROR: ', e.response);
      return null;
    }
  },

  /**
  * fetches locators for this policy and asset
  */
  getLocators: async (RESTAPIEndpoint, AccessToken) => {
    const AZURE_HEADERS = REST.getAzureHeaders(AccessToken);
    const reqUrl = `${RESTAPIEndpoint}/Locators`;

    try {
      const resp = await axios.get(reqUrl, {
        headers: AZURE_HEADERS
      });

      return resp.data;
    } catch (e) {
      console.log('getLocators: ERROR: ', e.response);
      return null;
    }
  },

  /**
  * deletes a locator
  */
  deleteLocator: async (RESTAPIEndpoint, AccessToken, locatorId) => {
    const AZURE_HEADERS = REST.getAzureHeaders(AccessToken);
    const reqUrl = `${RESTAPIEndpoint}/Locators('${locatorId}')`;

    try {
      const resp = await axios.delete(reqUrl, {
        headers: AZURE_HEADERS
      });

      /*
      * response status is 204 (done) 
      */
      if (resp.status == 204) {
        console.log('deleteLocator: locatorId: ', locatorId);
      }
      return true;
    } catch (e) {
      if (e.response.status == 404) {
        // 404 (not found)
        console.log('deleteLocator: 404 no locator to delete: locatorId: ', locatorId);
        return false;
      }
      console.log('deleteLocator: ERROR: ', e.response);
      return false;
    }
  },

  /**
  * Fetches valid locators. Else creates new and returns first matching one
  */
  fetchLocator: async (RESTAPIEndpoint, AccessToken, policyId, assetId, locatorType) => {
    const locators = await REST.getLocators(RESTAPIEndpoint, AccessToken);

    let maxLocator;
    let minLocator;
    for (let i = 0; i < locators.value.length; i++) {
      let loc = locators.value[i];
      if (loc.AccessPolicyId === policyId && loc.AssetId == assetId && loc.Type == locatorType) {

        /*
        * for this asset return the locator with largest VALID expiration date
        * our VALID ExpirationDateTime crieteria is current date + 24 hours
        */

        let expiry = new Date(loc.ExpirationDateTime);
        // time after 24 hours from now
        let validDate = new Date(new Date().getTime() + 86400000); // 1000*3600*24 

        if (expiry > validDate && maxLocator == undefined) {
          maxLocator = loc;
          console.log('MaxLOC: ', maxLocator.Id, ' EDT: ', maxLocator.ExpirationDateTime);
        } else if (expiry > validDate && expiry > (new Date(maxLocator.ExpirationDateTime))) {
          // i-th locatoer has higher valid expiration date than maxLocator
          maxLocator = loc;
          console.log('MaxLOC: ', maxLocator.Id, ' EDT: ', maxLocator.ExpirationDateTime);
        } 
        else {
          console.log('Expired Locator: ', loc.Id);
        }

        // also selecting min locator
        if (minLocator == undefined) {
          minLocator = loc;
          // console.log('MinLOC: ', minLocator.Id, ' EDT: ', minLocator.ExpirationDateTime);
        }
        else if ((new Date(loc.ExpirationDateTime)) < (new Date(minLocator.ExpirationDateTime))) {
          minLocator = loc;
          // console.log('MinLOC: ', minLocator.Id, ' EDT: ', minLocator.ExpirationDateTime);
        }
      }
    }

    if (maxLocator != undefined) return maxLocator;

    /*
    * we have to create a new locator
    */
    if (locators.value.length === 5 && minLocator != undefined) {
      // delete the locator with smallest Expiration date
      console.log('fetchLocator: 5 locators exist for this Asset.')
      console.log('fetchLocator: deleteing: ', minLocator.Id)
      await REST.deleteLocator(RESTAPIEndpoint, AccessToken, minLocator.Id);
    } 
    
    /*
    * create a new one with startTime of 5 minutes before current time to start the upload immediately
    */
    const locator = await REST.createLocator(RESTAPIEndpoint, AccessToken, policyId, assetId, locatorType);
    console.log('Created Locator: ', locator.Id);
    return locator;
  },

  /**
  * Uploads the file to azure storage's asset
  */
  uploadFile: async (UploadURL, filePath, fileName) => {
    try {
      const readFile = util.promisify(fs.readFile);
      // const fileBuffer = fs.readFileSync(filePath);
      const fileBuffer = await readFile(filePath);
      const fileSize = fileBuffer.length;
      console.log('File size: ', fileSize);

      let fileMBs = fileSize / (1024*1024);
      console.log('File size in MBs: ', fileMBs);
      
      // for all cases, uploading in chunks
      return await REST.uploadFileChunks(UploadURL, fileBuffer, filePath, fileName);

      // previously, only the files larger than 100MBs were uploaded in chunks
      // if (fileMBs > 100) {
      //   console.log('File size more than 100 MBs: ', fileMBs, ' MBs', ' Upload in CHUNKS');
      //   return await REST.uploadFileChunks(UploadURL, fileBuffer);
      // }
      // console.log('Uploading file the normal way since less than 100MBs');
      // const resp = await axios.put(UploadURL, fileBuffer,{
      //   headers: {
      //     'Content-Type': ' video/mp4',
      //     'x-ms-blob-type': 'BlockBlob'
      //   },
      //   maxContentLength: fileSize
      // });
      // // console.log('Status: ', resp.status);
      // // resp.status == 201
      // return true;
    } catch (e) {
      console.log('uploadFile: ERROR: ', e);
      return false;
    }
  },

  /**
  * Upload in chunks
  */
  uploadFileChunks: async (UploadURL, fileBuffer, filePath, fileName) => {
    console.log('\n****TODO: upload file in buffer: ..: ***');

    let fileSize = fileBuffer.length;
    let maxBlockSize = 4 * 1024 * 1024; //Each file will be split in X MBs chunks
    
    let blockIds = [];
    // let blockIdPrefix = "block-";
    // something like b-sCLV last. All block ids would be (almost) unique now,
    // because fileNames are usually the unique objectIds from Journeys Parse Class
    let blockIdPrefix = "b-" + fileName.substr(0, 4); 
    let submitUri = UploadURL;

    let numbBlocks = 0;
    if (fileSize % maxBlockSize == 0) {
      numbBlocks = fileSize / maxBlockSize;
    } else {
      numbBlocks = parseInt(fileSize / maxBlockSize, 10) + 1;
    }

    /*
    * upload each block 1 at a time
    */
    for (var i = 0; i < numbBlocks; i++) {
      let blockId = blockIdPrefix + REST.pad(i, 8);
      console.log('blockId: ', blockId);
      blockId = Buffer.from(blockId).toString('base64');
      console.log('blockId base64: ', blockId);

      blockIds.push(blockId);

      let startIdx = i*maxBlockSize;
      let endIdx = startIdx + maxBlockSize;
      if (endIdx > fileSize) {
        endIdx = fileSize;
      }

      let blockData = fileBuffer.slice(startIdx, endIdx);
      let blockUrl = UploadURL + '&comp=block&blockid=' + blockId;

      console.log('Uploading block# ', i, 'from bytes: ', startIdx, ' to ', endIdx);

      try {
        const resp = await axios({
          method: 'put',
          url: blockUrl,
          data: blockData,
          headers: {
            'x-ms-blob-type': 'BlockBlob',
            'Content-Length': blockData.length
          }
        });
      } catch (e) {
        console.log(`REST#uploadFileChunks: ${i}th block upload. ERROR: `, e);
        return false;
      }
    }

    // commit the blob
    var uri = UploadURL + '&comp=blocklist';
    var requestBody = '<?xml version="1.0" encoding="utf-8"?><BlockList>';
    for (var i = 0; i < blockIds.length; i++) {
        requestBody += '<Latest>' + blockIds[i] + '</Latest>';
    }
    requestBody += '</BlockList>';

    console.log('REST#uploadFileChunks: Commiting Block List: ', uri);

    try {
      const resp = await axios({
        method: 'put',
        url: uri,
        data: requestBody,
        headers: {
          'x-ms-blob-content-type': 'video/mp4',
          'Content-Length': requestBody.length
        }
      });

      console.log('Block List commit:', resp.status);
      return true;
    } catch (e) {
      console.log('REST#uploadFileChunks: commiting block list: ERROR: ', e);
    }

    return false;
  },

  /**
  * pad 0s
  * @return string
  */
  pad: (number, length) => {
      var str = '' + number;
      while (str.length < length) {
          str = '0' + str;
      }
      return str;
  },

  /**
  * create file infos
  */
  createFileInfos: async (RESTAPIEndpoint, AccessToken, LastAssetId) => {
    const reqUrl = `${RESTAPIEndpoint}/CreateFileInfos?assetid='${LastAssetId}'`;
    const AZURE_HEADERS = REST.getAzureHeaders(AccessToken);

    try {
      const resp = await axios.get(reqUrl, {
        headers: {
          DataServiceVersion: '1.0;NetFx',
          MaxDataServiceVersion: '3.0;NetFx',
          Accept: 'application/json',
          'Accept-Charset': 'UTF-8',
          Authorization: `Bearer ${AccessToken}`,
          'x-ms-version': '2.17'
        }
      });

      return true;
    } catch (e) {
      console.log('createFileInfos: ERROR: ', e.response);
      return false;
    }
  },

  /**
  * Get Media Processor for encoding job
  */
  getMediaProcessor: async (RESTAPIEndpoint, AccessToken) => {
    const reqUrl = `${RESTAPIEndpoint}/MediaProcessors()?$filter=Name eq 'Media Encoder Standard'`;
    try {
      const resp = await axios.get(reqUrl, {
        headers: {
          DataServiceVersion: '1.0;NetFx',
          MaxDataServiceVersion: '3.0;NetFx',
          Accept: 'application/json',
          'Accept-Charset': 'UTF-8',
          Authorization: `Bearer ${AccessToken}`,
          'x-ms-version': '2.17',
          'User-Agent': 'Gale Crater - Node'
        }
      });

      if (resp.data.value.length > 0) {
        return resp.data.value[0];
      }
    } catch (e) {
      console.log('getMediaProcessor: ERROR: ', e);
    }

    return null;
  },

  /**
  *
  */
  createJob: async (RESTAPIEndpoint, AccessToken, assetId, assetName, mediaProcessorId) => {
    const reqUrl = `${RESTAPIEndpoint}/Jobs`;

    try {
      const resp = await axios.post(reqUrl, {
        "Name" : `${assetName}_Encoding_Job`,
        "InputMediaAssets" : [{
            "__metadata" : {
              "uri" : `https://media.windows.net/api/Assets('${assetId}')`
            }
          }],
          "Tasks" : [{
            "Configuration" : "Adaptive Streaming", 
            "MediaProcessorId" : mediaProcessorId,
            "TaskBody" : `<?xml version=\"1.0\" encoding=\"utf-8\"?><taskBody><inputAsset>JobInputAsset(0)</inputAsset><outputAsset assetName=\"${assetName}\">JobOutputAsset(0)</outputAsset></taskBody>`
          }]
      }, {
        headers: {
          'Content-Type': 'application/json;odata=verbose',
          'Accept': 'application/json;odata=verbose',
          'DataServiceVersion': '3.0',
          'MaxDataServiceVersion': '3.0',
          'x-ms-version': '2.17',
          'Authorization': `Bearer ${AccessToken}`
        }
      });

      if (resp.status == 201) {
        console.log('createJob: resp.statusText: ', resp.statusText);
        // console.log('createJob: response: ', resp.data);
        return resp.data;
      }
    } catch (e) {
      console.log('createJob: ERROR: ', e.response);
      if (!e.response) {
        console.log('createJob: ERROR: ', e);
      }
    }
    return false;
  },

  /**
  * Monitor the status of a job
  */
  monitorJob: async (RESTAPIEndpoint, AccessToken, jobId) => {
    const reqUrl = `${RESTAPIEndpoint}Jobs('${jobId}')/State`;
    // console.log('Job monitor url:', reqUrl);

    try {
      const resp = await axios.get(reqUrl, {
        headers: {
          'Content-Type': 'application/json;odata=verbose',
          'Accept': 'application/json;odata=verbose',
          'DataServiceVersion': '3.0',
          'MaxDataServiceVersion': '3.0',
          'x-ms-version': '2.17',
          'Authorization': `Bearer ${AccessToken}`
        }
      });

      // console.log('monitorJob: resp.statusText: ', resp.statusText);
      console.log('monitorJob: response: ', resp.data);

      /*
      * if resp.data.d.State == 2 means job is being processed
      * elif resp.data.d.State == 3 means job has been processed
      */

      return resp.data;
    } catch (e) {
      console.log('monitorJob: ERROR: ', e.response);
      return false;
    }
  },

  /**
  * after the job is done, output asset gets create which contains encoded videos & DASH/HLS manifests
  */
  getOutputAsset: async (outputAssetUrl, AccessToken) => {
    const AZURE_HEADERS = REST.getAzureHeaders(AccessToken);

    try {
      const resp = await axios.get(outputAssetUrl, {
        headers: AZURE_HEADERS
      });

      return resp.data;
    } catch (e) {
      console.log('getOutputAsset: ERROR: ', e.response);
      return null;
    }
  }

}

module.exports = REST;
