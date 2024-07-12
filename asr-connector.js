'use strict'

//-------------

require('dotenv').config();

//--- for Neru installation ----
const neruHost = process.env.NERU_HOST;
console.log('neruHost:', neruHost);

//--
const express = require('express');
const bodyParser = require('body-parser')
const app = express();
require('express-ws')(app);

app.use(bodyParser.json());

//--

const axios = require('axios');

// const { v4: uuidv4 } = require('uuid');

//---- CORS policy - Update this section as needed ----

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "OPTIONS,GET,POST,PUT,DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
  next();
});

//-------

const servicePhoneNumber = process.env.SERVICE_PHONE_NUMBER;
console.log("Service phone number:", servicePhoneNumber);

//--- Vonage API ---

const { Auth } = require('@vonage/auth');

const credentials = new Auth({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.API_SECRET,
  applicationId: process.env.APP_ID,
  privateKey: './.private.key'    // private key file name with a leading dot 
});

const apiBaseUrl = "https://" + process.env.API_REGION;

const options = {
  apiHost: apiBaseUrl
};

const { Vonage } = require('@vonage/server-sdk');

const vonage = new Vonage(credentials, options);

// Use for direct REST API calls - Sample code
// const appId = process.env.APP_ID; // used by tokenGenerate
// const privateKey = fs.readFileSync('./.private.key'); // used by tokenGenerate
// const { tokenGenerate } = require('@vonage/jwt');

//---- AI Studio ----
const xVgaiKey = process.env.X_VGAI_KEY;
const agentId = process.env.AGENT_ID;
const vgAiHost = process.env.VG_AI_HOST;

//---- DeepGram ASR engine ----

const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");
const fetch = require("cross-fetch");
const dgApiKey = process.env.DEEPGRAM_API_KEY;

//=================================================================================================

//==================== Utilities =============================

async function sayText(text, language, uuid) {

  let ttsStyle = 0; // not necessarily the best for a given language code
  let status;

  // normally, there should be a table that maps the language code with the Voice API TTS style number
  if (language == 'en-US') {
    ttsStyle = 11; // preferred standard voice style for en-US
  }

  // console.log('>>> Play TTS:', text);
  // console.log('>>> on call uuid:', uuid);

  vonage.voice.playTTS(uuid,  
    {
    text: text,
    language: language, 
    style: ttsStyle
    })
    .then(res => status = res)
    .catch(err => status = err);

  return(status)

}

//-----

async function sendMsgToAi(text, sessionId, sessionToken, uuid, callDirection) {

    try {

      console.log('\n>>> in sendMsgToAi function');
      console.log('>>> text:', text);
      console.log('>>> session id:', sessionId);
      console.log('>>> session token:', sessionToken);
      console.log('>>> uuid:', uuid);

      const stepResponse = await axios.post('https://' + vgAiHost + '/http/' + sessionId + '/step', 
        { 
          "input": text,
          "parameters": [
            {
              "name": "uuid",
              "value": uuid
            },
            {
              "name": "calldirection",
              "value": callDirection
            },
          ]
        },
        {
          headers: {
            "Authorization": "Bearer " + sessionToken,
            "Content-Type": 'application/json'
          }
        }
      );

      // console.log("AI agent full step response:", stepResponse.data);
      
      const messages = stepResponse.data.messages;
      // console.log("AI agent message response:", messages);

      let aiResponse = '';

      messages.forEach((message) => {
        // console.log('text entry:', message.text);
        if (message.text) {
          aiResponse += ' ' + message.text
        }
      });

      const aiSessionStatus = stepResponse.data.session_status;

      console.log('>>> aiResponse:', aiResponse);
      console.log('>>> aiSessionStatus:', aiSessionStatus);

      return({
        "aiResponse": aiResponse,
        "aiSessionStatus": aiSessionStatus
      })

    } catch (error) {

      console.log('>>> Step to AI agent failed', error.response);
      return(null)

    }

}

//============= Initiating outbound PSTN calls ===============

//-- use case where the first PSTN call is outbound
//-- manually trigger outbound PSTN call to "callee" number - see sample request below
//-- establish first the WebSocket leg before the PSTN leg
//-- sample request: https://<server-address>/startcall?callee=12995550101

app.get('/startcall', async(req, res) => {

  let sessionId;
  let sessionToken;

  if (req.query.callee == null) {
    // code may be added here to make sure the number is in valid E.164 format (without leading '+' sign)
    res.status(200).send('"callee" number missing as query parameter - please check');
  
  } else {
  
    res.status(200).send('Ok');  

    let hostName;

    if (neruHost) {
      hostName = neruHost;
    } else {
      hostName = req.hostname;
    }

    //-- Establish a new session to AI studio agent --

    try {

      const initialData = await axios.post('https://' + vgAiHost + '/http/init', 
        { 
          "agent_id": agentId,
          "calldirection": "incoming"
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-Vgai-Key": xVgaiKey
            // "calldirection": "incoming"
          }
        }
      );

      console.log('Init AI agent response:', initialData.data);
      sessionId = initialData.data.session_id;
      sessionToken = initialData.data.session_token;

    } catch (error) {

      console.log('>>> Init session to AI agent failed', error.response.data)
      // console.log('>>> Init session to AI agent failed', error)

    }

    console.log("AI Studio agent session ID: ", sessionId);
    // console.log("Session token: ", sessionToken)
    
    //-- First (outgoing) PSTN leg --

    vonage.voice.createOutboundCall({
      to: [{
        type: 'phone',
        number: req.query.callee
      }],
      from: {
       type: 'phone',
       number: servicePhoneNumber
      },
      answer_url: ['https://' + hostName + '/answer_1?session_id=' + sessionId + '&session_token=' + sessionToken],
      answer_method: 'GET',
      event_url: ['https://' + hostName + '/event_1?session_id=' + sessionId + '&session_token=' + sessionToken],
      event_method: 'POST'
      })
      .then(res => {
        console.log(">>> outgoing PSTN call 1 status:", res);
      })
      .catch(err => console.error(">>> outgoing PSTN call 1 error:", err))

    }

});

//-----------------------------

app.get('/answer_1', async(req, res) => {

  let hostName;

  if (neruHost) {
    hostName = neruHost;
  } else {
    hostName = req.hostname;
  }

  //--

  const uuid = req.query.uuid;
  const sessionId = req.query.session_id;
  const sessionToken = req.query.session_token;

  const wsUri = 'wss://' + hostName + '/socket?original_uuid=' + uuid + '&session_id=' + sessionId + '&session_token=' + sessionToken  + '&caller_number=' + servicePhoneNumber  + '&call_direction=outgoing';

  const nccoResponse = [
    {
      "action": "connect",
      "eventType": "synchronous",
      "eventUrl": ["https://" + hostName + "/ws_event"],
      "from": req.query.to,    // normally not important, this value matters only if your application logic needs it
      "endpoint": [
        {
          "type": "websocket",
          "uri": wsUri,
          "content-type": "audio/l16;rate=16000", // never modify
          "headers": {
              "param1": "foo1",     // set possible metadata for your application logi
              "param2": 1,
          }
        }
      ]

    }
  ];

  res.status(200).json(nccoResponse);

  //-- Send dummy initial prompt to AI studio agent -- 

  const aiReply = await sendMsgToAi("Hello", sessionId, sessionToken, uuid, "outgoing");

  if (aiReply && aiReply.aiResponse != "") {
    await sayText(aiReply.aiResponse, 'en-US', uuid)
  }

 });

//------------

app.post('/event_1', async(req, res) => {

  res.status(200).send('Ok');

});

//--------------------

app.post('/ws_event', async(req, res) => {

  res.status(200).send('Ok');

});

//============= Processing inbound PSTN calls ===============

//-- Incoming PSTN call --

app.get('/answer', async(req, res) => {

  let sessionId;
  let sessionToken;

  //-- Establish a new session to AI studio agent --

  try {

    const initialData = await axios.post('https://' + vgAiHost + '/http/init', 
      { 
        "agent_id": agentId
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Vgai-Key": xVgaiKey,
        }
      }
    );

    console.log('Init AI agent response:', initialData.data);
    sessionId = initialData.data.session_id;
    sessionToken = initialData.data.session_token;

  } catch (error) {

    console.log('>>> Init session to AI agent failed', error.response.data)
    // console.log('>>> Init session to AI agent failed', error)

  }

  console.log("AI Studio agent session ID: ", sessionId);
  // console.log("Session token: ", sessionToken)

  //--

  let hostName;

  if (neruHost) {
    hostName = neruHost;
  } else {
    hostName = req.hostname;
  }

  //--

  const uuid = req.query.uuid;
 
  const wsUri = 'wss://' + hostName + '/socket?original_uuid=' + uuid + '&session_id=' + sessionId + '&session_token=' + sessionToken + '&call_direction=incoming';

  const nccoResponse = [
    {
      "action": "connect",
      "eventType": "synchronous",
      "eventUrl": ["https://" + hostName + "/ws_event"],
      "from": req.query.from,    // normally not important, this value matters only if your application logic needs it
      "endpoint": [
        {
          "type": "websocket",
          "uri": wsUri,
          "content-type": "audio/l16;rate=16000", // never modify
          "headers": {
              "param1": "foo2",     // set possible metadata for your application logic
              "param2": 2,
          }
        }
      ]

    }
  ];

  res.status(200).json(nccoResponse);

  //-- Send dummy initial prompt to AI studio agent -- 

  const aiReply = await sendMsgToAi("Hello", sessionId, sessionToken, uuid, "incoming");

  if (aiReply && aiReply.aiResponse != "") {
    await sayText(aiReply.aiResponse, 'en-US', uuid)
  }

});

//------------

app.post('/event', async(req, res) => {

  res.status(200).send('Ok');

});

//-----------

app.post('/calltransfer', async(req, res) => {

  res.status(200).send('Ok');

  //--

  let hostName;

  if (neruHost) {
    hostName = neruHost;
  } else {
    hostName = req.hostname;
  }

  //--

  const uuid = req.body.uuid;
  const calleeNumber = req.body.callee;

  //--

  const ncco = [
    {
      "action": "talk",
      "text": req.body.announcement,
      "language": "en-US",  // update to your local preference
      "style": 11           // update to your preference
    },
    {
      "action": "connect",
      "eventUrl": ["https://" + hostName + "/event_transferee"],
      "timeout": "45",
      "from": servicePhoneNumber,
      "endpoint": [
        {
          "type": "phone",
          "number": calleeNumber
        }
      ]
    }
  ];

  vonage.voice.getCall(uuid)
    .then(res => {
      if (res.status == 'answered') { // is first PSTN leg still up?

        vonage.voice.transferCallWithNCCO(uuid, ncco) // transfer call to second PSTN party
          .then(res => console.log(">>> Transfer call status:", uuid, calleeNumber, res))
          .catch(err => console.error("Failed transfer call:", uuid, calleeNumber, err));
  
      }
     })
    .catch(err => console.error(">>> Error get call status of first PSTN leg", uuid, err)) 

});

//--------------

app.post('/event_transferee', async(req, res) => {

  console.log('>>> Transferee leg events:', req.body);

  res.status(200).send('Ok');

});

//--------------  

app.post('/callterminate', async(req, res) => {

  res.status(200).send('Ok');

  const uuid = req.body.uuid;

  //--

    vonage.voice.getCall(uuid)
      .then(res => {
        if (res.status != 'completed') { // is first PSTN leg still up?

          vonage.voice.hangupCall(uuid)
            .then(res => console.log(">>> First PSTN leg terminated", uuid))
            .catch(err => null) // First PSTN leg has already been terminated 

        }
       })
      .catch(err => console.error(">>> Error get call status of first PSTN leg", uuid, err))  

});


//--- Websocket server (for WebSockets from Vonage Voice API platform)- Deepgram transcribe live streaming audio ---

app.ws('/socket', async (ws, req) => {

  console.log('WebSocket from Vonage platform to /socket')

  const originalUuid = req.query.original_uuid;
  const callDirection = req.query.call_direction;

  let canSendAiStep = true;

  const vgAiSessionId = req.query.session_id;
  const vgAiSessionToken = req.query.session_token;
  const webhookBaseUrl = req.query.webhook_base_url;
  const referenceBack = req.query.reference_back;

  //--

  console.log('>>> websocket connected with');
  console.log('original call uuid:', originalUuid);

  //--

  console.log('Opening client connection to DeepGram');

  const deepgramClient = createClient(dgApiKey);

  let deepgram = deepgramClient.listen.live({       
    model: "nova-2",
    smart_format: true,      
    language: "en-US",        
    encoding: "linear16",
    sample_rate: 16000
  });

  deepgram.addListener(LiveTranscriptionEvents.Open, async () => {
    console.log("deepgram: connected");

    deepgram.addListener(LiveTranscriptionEvents.Transcript, async (data) => {
      // console.log(JSON.stringify(data));
      const transcript = data.channel.alternatives[0].transcript;

      if (transcript != '') {

      console.log('\n>>> Transcript:', transcript);

        if (canSendAiStep) {
          
          const aiReply = await sendMsgToAi(transcript, vgAiSessionId, vgAiSessionToken, originalUuid, callDirection);
          
          console.log('>>> Response from AI agent:', aiReply);

          if (aiReply) {
            if (aiReply.aiSessionStatus != 'AWAITING_INPUT') {
              canSendAiStep = false;
              console.log('>>> No longer possible to send steps to the AI agent');
            }

            const message = aiReply.aiResponse;

            if (message != "")
            console.log('>>> Play TTS:', message);
            await sayText(message, 'en-US', originalUuid)
          }

        } 

      }   

    });

    deepgram.addListener(LiveTranscriptionEvents.Close, async () => {
      console.log("deepgram: disconnected");
      clearInterval(keepAlive);
      deepgram.finish();
    });

    deepgram.addListener(LiveTranscriptionEvents.Error, async (error) => {
      console.log("deepgram: error received");
      console.error(error);
    });

    deepgram.addListener(LiveTranscriptionEvents.Warning, async (warning) => {
      console.log("deepgram: warning received");
      console.warn(warning);
    });

    deepgram.addListener(LiveTranscriptionEvents.Metadata, (data) => {
      console.log("deepgram: metadata received");
      console.log("ws: metadata sent to client");
      // ws.send(JSON.stringify({ metadata: data }));
      console.log(JSON.stringify({ metadata: data }));
    });
  
  });

  //---------------

  ws.on('message', async (msg) => {
    
    if (typeof msg === "string") {
    
      console.log("\n>>> Websocket text message:", msg);
    
    } else {

      if (deepgram.getReadyState() === 1 /* OPEN */) {
        deepgram.send(msg);
      } else if (deepgram.getReadyState() >= 2 /* 2 = CLOSING, 3 = CLOSED */) {
        // console.log("ws: data couldn't be sent to deepgram");
        null
      } else {
        // console.log("ws: data couldn't be sent to deepgram");
        null
      }

    }

  });

  //--

  ws.on('close', async () => {

    deepgram.finish();
    deepgram.removeAllListeners();
    deepgram = null;
    
    console.log("WebSocket closed");
  });

});

//--- If this application is hosted on VCR (Vonage Code Runtime) serverless infrastructure (aka Neru) --------

app.get('/_/health', async(req, res) => {

  res.status(200).send('Ok');

});

//=========================================

const port = process.env.NERU_APP_PORT || process.env.PORT || 8000;

app.listen(port, () => console.log(`Voice API application listening on port ${port}!`));

//------------
