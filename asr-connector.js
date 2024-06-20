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
const request = require('request');
const axios = require('axios');

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

//============================================================

//==================== Utilities =============================

async function sayText(text, language, uuid) {

  let ttsStyle = 0; // not necessarily the best for a given language code
  let status;

  // normally, there should be a table that maps the language code with the Voice API TTS style number
  if (language == 'en-US') {
    ttsStyle = 11; // preferred standard voice style for en-US
  }

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

async function sendMsgToAi(text, sessionId, sessionToken, uuid) {

    try {

      console.log('\n>>> in sendMsgToAi function');
      console.log('>>> text:', text);
      console.log('>>> sessionId:', sessionId);
      console.log('>>> sessionToken:', sessionToken);
      console.log('>>> uuid:', uuid);

      const stepResponse = await axios.post('https://' + vgAiHost + '/http/' + sessionId + '/step', 
        { 
          "input": text,
          "parameters": [{
            "call_uuid": uuid
          }]
        },
        {
          headers: {
            "Authorization": "Bearer " + sessionToken,
            "Content-Type": 'application/json'
          }
        }
      );

      console.log("AI agent full step response:", stepResponse.data);
      
      const messages = stepResponse.data.messages;
      console.log("AI agent message response:", messages);

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

      return(aiResponse)

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

    const calleeNumber = req.query.callee;

    // in actual use case, the following parameter
    // could be looked up in your db from the callee number
    // or passed as a query parameter when initiating the request /startcall
    const someId = "abcd1234";  // arbitrary value here as illustration

    // WebSocket connection
    const wsUri = 'wss://' + hostName + '/socket'; 
    
    console.log('>>> websocket URI:', wsUri);

    // -- create first the WebSocket leg --
    // -- step 1a <<<<<<<<<<<<<<<<<<<<<<<<<<<

    vonage.voice.createOutboundCall({
      to: [{
        type: 'websocket',
        uri: wsUri,
        'content-type': 'audio/l16;rate=16000',  // NEVER change the content-type parameter argument
        headers: {  // set your desired custom data here
          pstn_caller_number: servicePhoneNumber,
          pstn_callee_number: calleeNumber,
          pstn_call_direction: 'outbound',
          some_id: someId
        }
      }],
      from: {
        type: 'phone',
        number: 19999999999 // cannot use a longer than 15-digit string (e.g. not call_uuid) - value does not matter
      },
      answer_url: ['https://' + hostName + '/ws_answer_1?callee_number=' + calleeNumber + '&caller_number=' + servicePhoneNumber],
      answer_method: 'GET',
      event_url: ['https://' + hostName + '/ws_event_1?callee_number=' + calleeNumber + '&caller_number=' + servicePhoneNumber],
      event_method: 'POST'
      })
      .then(res => console.log(">>> websocket create status:", res))
      .catch(err => console.error(">>> websocket create status:", err));
  }

});

//-----------------------------

app.get('/ws_answer_1', async(req, res) => {

    const nccoResponse = [
      {
        "action": "conversation",
        "name": "conf_" + req.query.uuid, // create a unique named conference (using WebSocket 1 leg uuid)
        "startOnEnter": true

      }
    ];

    res.status(200).json(nccoResponse);

 });

//------------

app.post('/ws_event_1', async(req, res) => {

  res.status(200).send('Ok');

  //--

  let hostName;

  if (neruHost) {
    hostName = neruHost;
  } else {
    hostName = req.hostname;
  }

  //--

  const ws1Uuid = req.body.uuid;

  //--
  
  if (req.body.type == 'transfer') {  // This is when the named conference is fully created (by the first leg)

    //-- call PSTN 1 callee --
    //-- step 1b below <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

    console.log('>>> calling PSTN callee leg 1');
    const calleeNumber = req.query.callee_number;
    // const callerNumber = req.query.caller_number;

    vonage.voice.createOutboundCall({
      to: [{
        type: 'phone',
        number: calleeNumber
      }],
      from: {
       type: 'phone',
       // number: callerNumber
       number: servicePhoneNumber
      },
      answer_url: ['https://' + hostName + '/answer_1?original_uuid=' + ws1Uuid],
      answer_method: 'GET',
      event_url: ['https://' + hostName + '/event_1?original_uuid=' + ws1Uuid],
      event_method: 'POST'
      })
      .then(res => console.log(">>> outgoing PSTN call status:", res))
      .catch(err => console.error(">>> outgoing PSTN call error:", err))
  }

  //--------

  if (req.body.status == 'completed') {

    // TBD - check if call 1 still up, if yes - terminate it 
 
    // if (!app.get('pstn2_from_ws1_' + ws1Uuid)) { // has (outbound) PSTN leg 2 not yet been created?

    //   const pstn1Uuid = app.get('pstn1_from_ws1_' + ws1Uuid);

    //   if (pstn1Uuid) { // has (outbound) PSTN leg 1 been created?

    //     vonage.voice.getCall(pstn1Uuid)
    //       .then(res => {
    //         if (res.status != 'completed') {
    //           vonage.voice.hangupCall(pstn1Uuid)
    //             .then(res => console.log(">>> PSTN 1 leg terminated", pstn1Uuid))
    //             .catch(err => null) // call has already been terminated
    //         }
    //        })
    //       .catch(err => console.error(">>> error get call status of PSTN leg 1", pstn1Uuid, err))  

    //   }  

    // };

  } 

});

//--------------------

app.get('/answer_1', async(req, res) => {

  let hostName;

  if (neruHost) {
    hostName = neruHost;
  } else {
    hostName = req.hostname;
  }

  const ws1Uuid = req.query.original_uuid;
  const pstn1Uuid = req.query.uuid;

  const nccoResponse = [
    {
      "action": "conversation",
      "name": "conf_" + ws1Uuid,
      "startOnEnter": true,
      "endOnExit": true
    }
  ];

 res.status(200).json(nccoResponse);

});

//--------------------

app.post('/event_1', async(req, res) => {

  res.status(200).send('Ok');

  const pstn1Uuid = req.body.uuid;
  const ws1Uuid = req.query.original_uuid;

  //--

  if (req.body.type == 'transfer') {  // This is when the PSTN leg 1 is actually attached to the named conference

    // notify your middleware that PSTN leg 1 call audio just started (other end of WebSocket relative to Vonage platform)
    vonage.voice.playDTMF(ws1Uuid, '#') 
      .then(resp => console.log("Play DTMF to WebSocket", ws1Uuid, resp))
      .catch(err => console.error("Error play DTMF to WebSocket", ws1Uuid, err));
  }  

  if (req.body.status == 'completed') {

    const pstn2Uuid = app.get('pstn2_from_pstn1_' + pstn1Uuid);
    
    if (pstn2Uuid) {
      vonage.voice.getCall(pstn2Uuid)
        .then(res => {
          if (res.status != 'completed') {
            vonage.voice.hangupCall(pstn2Uuid)
              .then(res => console.log(">>> PSTN 2 leg terminated", pstn2Uuid))
              .catch(err => null) // PSTN 2 leg has already been terminated 
          }
         })
        .catch(err => console.error(">>> error get call status of PSTN leg 2", pstn2Uuid, err)) 
    };    

    //--  

    app.set('pstn1_from_ws1_' + req.query.original_uuid, null); // parameter no longer needed

    console.log('>>> Outbound PSTN 1 leg', pstn1Uuid, 'has terminated');

  };

  //--

  if (req.body.status == 'started' || req.body.status == 'ringing') {

    vonage.voice.getCall(ws1Uuid)
      
      .then(res => {

        if (res.status == 'completed') {

          vonage.voice.getCall(pstn1Uuid)
          .then(res => {
              if (res.status != 'completed') {
                vonage.voice.hangupCall(pstn1Uuid)
                  .then(res => console.log(">>> PSTN 1 leg terminated", pstn1Uuid))
                  .catch(err => null) // call has already been terminated 
              }
             })
          .catch(err => console.error(">>> error get call status of PSTN leg 1", pstn1Uuid, err))  
  
        } else {
  
         app.set('pstn1_from_ws1_' + ws1Uuid, pstn1Uuid); // associate to WebSocket 1 leg uuid the PSTN 1 leg uuid
  
        }
       
       })
      
      .catch(err => console.error(">>> error get status of WebSocket", ws1Uuid, err))  
  
  };

});

//--------------------

app.get('/answer_2', async(req, res) => {

  const ws1Uuid = req.query.original_uuid;
  const pstn1Uuid = req.query.ptsn_1_uuid;

  const nccoResponse = [
    {
      "action": "conversation",
      "name": "conf_" + ws1Uuid,
      "startOnEnter": true,
      "endOnExit": true
    }
  ];

  res.status(200).json(nccoResponse);

});

//--------------------

app.post('/event_2', async(req, res) => {

  res.status(200).send('Ok');

  const pstn1Uuid = req.query.ptsn_1_uuid;
  const pstn2Uuid = req.body.uuid;
  const ws1Uuid = req.query.original_uuid;
  const status = req.body.status;

  //--

  if (req.body.type == 'transfer') {

    // stop music-on-hold ring back tone (music-on-hold)      
    vonage.voice.stopStreamAudio(pstn1Uuid)
      .then(res => console.log(`>>> stop streaming ring back tone to call ${pstn1Uuid} status:`, res))
      .catch(err => {
        console.log(`>>> stop streaming ring back tone to call ${pstn1Uuid} error:`, err.body);
      });

  };

  //--

  if (status == 'started' || status == 'ringing' || status == 'answered') {
    
    vonage.voice.getCall(pstn1Uuid)
      .then(res => {
        if (res.status == 'completed') { // has PSTN 2 leg terminated?

          vonage.voice.hangupCall(pstn2Uuid)
            .then(res => console.log(">>> PSTN leg 2 terminated", pstn2Uuid))
            .catch(err => null) // PSTN leg 2 has already been terminated 
        
        }
       })
      .catch(err => console.error(">>> error get call status of PSTN leg A", pstnAUuid, err)) 

  };


  //--

  if (status == 'completed') {

    app.set('pstn2_from_ws1_' + ws1Uuid, null); // parameter no longer needed
    app.set('pstn2_from_pstn1_' + pstn1Uuid, null); // parameter no longer needed

  };

});

//============= Processing inbound PSTN calls ===============

//-- incoming PSTN A call --
//-- step a1 below <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
app.get('/answer', async(req, res) => {

  let hostName;

  if (neruHost) {
    hostName = neruHost;
  } else {
    hostName = req.hostname;
  }

  //--

  const pstnAUuid = req.query.uuid;

  //--

  const nccoResponse = [
    {
      "action": "conversation",
      "name": "conf_" + pstnAUuid, // PSTN A
      "startOnEnter": true,
      "endOnExit": true
    }
  ];

  res.status(200).json(nccoResponse);

});

//------------

app.post('/event', async(req, res) => {

  res.status(200).send('Ok');

  let hostName;

  if (neruHost) {
    hostName = neruHost;
  } else {
    hostName = req.hostname;
  }

  //--

  const pstnAUuid = req.body.uuid;
  
  let sessionId;
  let sessionToken;

  //--

  if (req.body.type == 'transfer') {

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

    }

    console.log("AI Studio agent session ID: ", sessionId);
    // console.log("Session token: ", sessionToken)

    //-- create WebSocket A --
    //-- step a2 below <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

    // WebSocket connection
    // const wsUri = 'wss://' + hostName + '/socket';
    const wsUri = 'wss://' + hostName + '/socket?original_uuid=' + pstnAUuid + '&session_id=' + sessionId + '&session_token=' + sessionToken;

    vonage.voice.createOutboundCall({
      to: [{
        type: 'websocket',
        uri: wsUri,
        'content-type': 'audio/l16;rate=16000',  // NEVER change the content-type parameter argument
        headers: {  // pass here some application custom data to the WebSocket server (middleware)
          pstn_caller_number: req.body.from,
          pstn_callee_number: req.body.to,
          pstn_call_direction: "inbound"
        }
      }],
      from: {
        type: 'phone',
        number: 19999999999 // placeholder value, value does not matter, cannot use a longer than 15-digit string
      },
      answer_url: ['https://' + hostName + '/ws_answer_a?original_uuid=' + pstnAUuid + '&session_id=' + sessionId + '&session_token=' + sessionToken],
      answer_method: 'GET',
      event_url: ['https://' + hostName + '/ws_event_a?original_uuid=' + pstnAUuid + '&session_id=' + sessionId + '&session_token=' + sessionToken],
      event_method: 'POST'
      })
      .then(res => {
        app.set('wsa_from_pstna_' + pstnAUuid, res.uuid); // associate to PSTN leg A uuid the WebSocket leg A uuid
        console.log(">>> WebSocket A create status:", res);
      })
      .catch(err => console.error(">>> WebSocket A create error:", err))


    //-- Send dummy initial prompt to AI studio agent -- 

    const aiReply = await sendMsgToAi("Hello", sessionId, sessionToken, pstnAUuid);

    if (aiReply && aiReply != "") {
      await sayText(aiReply, 'en-US', pstnAUuid)
    }  

    //--
      
    // let aiResponse;   
    // let aiSessionStatus;

    // try {

    //   const stepResponse = await axios.post('https://' + vgAiHost + '/http/' + sessionId + '/step', 
    //     { 
    //       "input": "Hello",
    //       "parameters": [{
    //         "call_uuid": pstnAUuid
    //       }]
    //     },
    //     {
    //       headers: {
    //         "Authorization": "Bearer " + sessionToken,
    //         "Content-Type": 'application/json'
    //       }
    //     }
    //   );

    //   console.log("First step AI agent full response:", stepResponse.data);

    //   aiResponse = stepResponse.data.messages[0].text
    //   aiSessionStatus = stepResponse.data.session_status

    // } catch (error) {

    //   console.log('>>> Initial step to AI agent failed', error.response)

    // }

    // //--

    // console.log('>> AI agent - initial step - response message:', aiResponse);
    // console.log('>> AI agent - initial step = session status:', aiSessionStatus);

    // // play "aiResponse" as TTS to PSTN leg
    // if (aiResponse && aiResponse != "") {
    //   sayText(aiResponse, 'en-US', pstnAUuid)
    // }  

    // // nice to add - not necessary
    // if (aiSessionStatus == "ENDED") {
    //   // TBD - terminate WebSocket leg
    // }

  }; // close if req.body.type

  //--

  if (req.body.status == 'completed') {

    //-- terminate WebSocket A leg if in progress
    const wsAUuid = app.get('wsa_from_pstna_' + pstnAUuid);

    if (wsAUuid) {
      vonage.voice.getCall(wsAUuid)
        .then(res => {
          if (res.status != 'completed') {
            vonage.voice.hangupCall(wsAUuid)
              .then(res => console.log(">>> WebSocket A leg terminated", wsAUuid))
              .catch(err => null) // WebSocket A leg has already been terminated
          }
         })
        .catch(err => console.error(">>> error get call status of PSTN leg A", wsAUuid, err))    
    };

    //-- terminate PSTN B leg if in progress
    const pstnBUuid = app.get('pstnb_from_pstna_' + pstnAUuid);

    if (pstnBUuid) {
      vonage.voice.getCall(pstnBUuid)
        .then(res => {
          if (res.status != 'completed') {
            vonage.voice.hangupCall(pstnBUuid)
              .then(res => console.log(">>> Terminating PSTN B leg", pstnBUuid))
              .catch(err => null) // PSTN B leg has already been terminated
          }
         })
        .catch(err => console.error(">>> error get call status of PSTN B leg", pstnBUuid, err))    
    };

    //--

    console.log(">>> Inbound PSTN leg A", pstnAUuid, "has terminated");

  };

});

//--------------

app.get('/ws_answer_a', async(req, res) => {

  let hostName;

  if (neruHost) {
    hostName = neruHost;
  } else {
    hostName = req.hostname;
  }

  //--

  const pstnAUuid = req.query.original_uuid;
  const wsAUuid = req.query.uuid;

  const nccoResponse = [
    {
      "action": "conversation",
      "name": "conf_" + pstnAUuid,
      // "canHear": [pstnAUuid],      // depends on the use case, WebSocket hears only one PSTN leg, or all PSTN legs?
      "startOnEnter": true
      // following parameter MUST NOT BE SET otherwise call between first (incoming) PSTN leg A 
      // and bridged call to other second (outbound) PSTN leg B would be terminated
      // "endOnExit": true
    }
  ];

  res.status(200).json(nccoResponse);


  // //-- All following "setTimeout" are just to trigger and simulate a call transfer to another line (second PSTN leg)
  // //-- In actual usage, your application would trigger the transfer if needed after interaction from the first
  // //-- PSTN A leg user with some voice bot or human interaction
  // //-- What's important here is to understand the sequence of call flows and used API requests

  // setTimeout(() => {

  //   vonage.voice.getCall(pstnAUuid)
  //     .then(res => {
  //       if (res.status == 'answered') { // is PSTN leg A still up?

  //         console.log("play TTS", pstnAUuid);

  //         vonage.voice.playTTS(pstnAUuid,  
  //           {
  //           text: 'Please wait while we are transferring your call',
  //           language: 'en-US', 
  //           style: 11
  //           })
  //           .then(res => console.log("Play TTS on:", pstnAUuid, res))
  //           .catch(err => console.error("Failed to play TTS on:", pstnAUuid, err));
        
  //       }
  //      })
  //     .catch(err => console.error(">>> error get call status of PSTN leg A", pstnAUuid, err))  

  // }, Number(simulatedDelay) );


  // //-- play audio file with ring back tone sound to PSTN leg A --
  // setTimeout(() => {

  //   vonage.voice.getCall(pstnAUuid)
  //     .then(res => {
  //       if (res.status == 'answered') { // is PSTN leg A still up?

  //         vonage.voice.streamAudio(pstnAUuid, 'http://client-sdk-cdn-files.s3.us-east-2.amazonaws.com/us.mp3', 0, -0.6)
  //           .then(res => console.log(`>>> streaming ring back tone to call ${pstnAUuid} status:`, res))
  //           .catch(err => {
  //             console.error(`>>> streaming ring back tone to call ${pstnAUuid} error:`, err)
  //           });

  //       }
  //      })
  //     .catch(err => console.error(">>> error get call status of PSTN leg A", pstnAUuid, err))  

  //   // 5000 ms: approximate duration of above TTS (there are ways to detect exact end of TTS, using RTC webhooks)      
  // }, Number(simulatedDelay) + Number(5000) );   

  // //-- place outbound PSTN call leg B --

  // setTimeout(() => {

  //   vonage.voice.getCall(pstnAUuid)
  //     .then(res => {
  //       if (res.status == 'answered') { // is PSTN leg A still up?

  //         console.log('>>> call pstn leg B');
  //         //-- step b1 below <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

  //         vonage.voice.createOutboundCall({
  //           to: [{
  //             type: 'phone',
  //             number: pstnCalleeNumber
  //           }],
  //           from: {
  //            type: 'phone',
  //            number: servicePhoneNumber
  //           },
  //           answer_url: ['https://' + hostName + '/answer_b?original_uuid=' + pstnAUuid],
  //           answer_method: 'GET',
  //           event_url: ['https://' + hostName + '/event_b?original_uuid=' + pstnAUuid],
  //           event_method: 'POST'
  //           })
  //           .then(res => {
  //             console.log(">>> outgoing PSTN B call status:", res);
  //             app.set('pstnb_from_pstna_' + pstnAUuid, res.uuid);
  //             })
  //           .catch(err => console.error(">>> outgoing PSTN B call error:", err))

  //       }
  //      })
  //     .catch(err => console.error(">>> error get call status of PSTN leg A", pstnAUuid, err)) 

  //     // 5000 ms: approximate duration of above TTS (there are ways to detect exact end of TTS, using RTC webhooks)      
  // }, Number(simulatedDelay) + Number(5000)); 

  // //-- terminate WebSocket leg A - no longer needed in this sample use case --

  // setTimeout(() => {

  //   console.log('>>> end WebSocket A');
  //   //-- step a3 below <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

  //   vonage.voice.getCall(wsAUuid)
  //     .then(res => {
  //       if (res.status != 'completed') {
  //         vonage.voice.hangupCall(wsAUuid)
  //           .then(res => console.log(">>> Terminating WebSocket A leg", wsAUuid))
  //           .catch(err => null) // WebSocket A leg has already been terminated
  //       }
  //      })
  //     .catch(err => console.error(">>> error get call status of WebSocket A leg", wsAUuid, err))  


  // // 5000 ms: approximate duration of above TTS (there are ways to detect exact end of TTS, using RTC webhooks)      
  // }, Number(simulatedDelay) + Number(5000)); 

 });

//------------

app.post('/ws_event_a', async(req, res) => {

  res.status(200).send('Ok');

  const wsAUuid = req.body.uuid;
  const pstnAUuid = req.query.original_uuid;

  //--
  
  // if (req.body.type == 'transfer') {

  //   let hostName;

  //   if (neruHost) {
  //     hostName = neruHost;
  //   } else {
  //     hostName = req.hostname;
  //   }

  // };

  //--

  if (req.body.status == 'completed') {

    if (!app.get('pstnb_from_pstna_' + pstnAUuid)) { // has (outbound) PSTN leg B not yet been created?

      vonage.voice.getCall(pstnAUuid)
        .then(res => {
          if (res.status != 'completed') {
            vonage.voice.hangupCall(pstnAUuid)
              .then(res => console.log(">>> Terminating PSTN A leg", pstnAUuid))
              .catch(err => null) // PSTN A leg has already been terminated
          }
         })
        .catch(err => console.error(">>> error get call status of PSTN leg A", pstnAUuid, err))  

    };

    // close AI Studio session

    console.log('>>> WebSocket A',  wsAUuid, 'closed');

    //-- no longer need stored info
    app.set('wsa_from_pstna_' + pstnAUuid, null);

  };

  //--

  if (req.body.status == 'started' || req.body.status == 'ringing') {

    vonage.voice.getCall(pstnAUuid)
      
      .then(res => {

        if (res.status == 'completed') {

          vonage.voice.getCall(wsAUuid)
          .then(res => {
              if (res.status != 'completed') {
                vonage.voice.hangupCall(wsAUuid)
                  .then(res => console.log(">>> WebSocket leg A terminated", wsAUuid))
                  .catch(err => null) // WebSocket leg A  has already been terminated 
              }
             })
          .catch(err => console.error(">>> error get call status of WebSocket leg A", wsAUuid, err))  
  
        }
       
       })
      
      .catch(err => console.error(">>> error get status of PSTN leg A", pstnAUuid, err))  
  
  };

});

//--------------

app.get('/answer_b', async(req, res) => {

  const nccoResponse = [
    {
      "action": "conversation",
      "name": "conf_" + req.query.original_uuid,
      "startOnEnter": true,
      "endOnExit": true
    }
  ];

  res.status(200).json(nccoResponse);

});

//--------------

app.post('/event_b', async(req, res) => {

  res.status(200).send('Ok');

  const pstnAUuid = req.query.original_uuid;
  const pstnBUuid = req.body.uuid;
  const status = req.body.status;

  //--

  if (req.body.type == 'transfer') {

    vonage.voice.getCall(pstnAUuid)
      .then(res => {
        if (res.status == 'answered') { // is PSTN A leg still up?

          // stop music-on-hold ring back tone (music-on-hold)      
          vonage.voice.stopStreamAudio(pstnAUuid)
            .then(res => console.log(`>>> stop streaming ring back tone to call ${pstnAUuid} status:`, res))
            .catch(err => {
              console.log(`>>> stop streaming ring back tone to call ${pstnAUuid} error:`, err.body);
            });
        }
       })
      .catch(err => console.error(">>> error get call status of PSTN leg A", pstnAUuid, err)) 
  
  };

  //--

  if (status == 'started' || status == 'ringing' || status == 'answered') {
    
    vonage.voice.getCall(pstnAUuid)
      .then(res => {
        if (res.status == 'completed') { // has PSTN A leg terminated?

          vonage.voice.hangupCall(pstnBUuid)
            .then(res => console.log(">>> PSTN leg B terminated", pstnBUuid))
            .catch(err => null) // PSTN leg B has already been terminated 
        
        }
       })
      .catch(err => console.error(">>> error get call status of PSTN leg A", pstnAUuid, err)) 

  };

  //--

  if (status == 'completed') {
    
    app.set('pstnb_from_pstna_' + pstnAUuid, null);  //-- no longer need stored info
    console.log('>>> PSTN B leg',  pstnBUuid, 'terminated');
  
  };

});

//--------------

app.post('/rtc', async(req, res) => {

  res.status(200).send('Ok');

});

//--------------

app.post('/calltransfer', async(req, res) => {

  res.status(200).send('Ok');

  const uuidToConnect = req.body.uuid;
  const calleeNumber = req.body.callee;
  // const firstLegUuid = req.body.first_leg_uuid;
  // const sessionId = req.body.session_id; // for your own application logic

  //--

  vonage.voice.getCall(uuidToConnect)
    .then(res => {
      if (res.status == 'answered') { // is first PSTN leg still up?

        vonage.voice.playTTS(uuidToConnect,  
          {
          text: 'Please wait while we are connecting your call',
          language: 'en-US', 
          style: 11
          })
          .then(res => console.log("Play TTS on:", uuidToConnect, res))
          .catch(err => console.error("Failed to play TTS on:", uuidToConnect, err));
      
      }
     })
    .catch(err => console.error(">>> error get call status of first PSTN leg", uuidToConnect, err)) 

  //-- play audio file with ring back tone sound (US sounding ring back tone) to first PSTN leg  --

  console.log('>>> moh');

  vonage.voice.getCall(uuidToConnect)
    .then(res => {
      if (res.status == 'answered') { // is PSTN leg 1 still up?

        vonage.voice.streamAudio(uuidToConnect, 'http://client-sdk-cdn-files.s3.us-east-2.amazonaws.com/us.mp3', 0, -0.6)
          .then(res => console.log(`>>> streaming ring back tone to call ${uuidToConnect} status:`, res))
          .catch(err => {
            console.error(`>>> streaming ring back tone to call ${uuidToConnect} error:`, err)
          });

      }
     })
    .catch(err => console.error(">>> error get call status of PSTN leg 1", uuidToConnect, err)) 

  //-- place outbound PSTN call leg, i.e. second PSTN leg, to "call transfer" recipient --

  vonage.voice.getCall(uuidToConnect)
    .then(res => {
      if (res.status == 'answered') { // is PSTN leg A still up?

        console.log('>>> calling transferee at', calleeNumber);
        //-- step 2a below <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

        vonage.voice.createOutboundCall({
          to: [{
            type: 'phone',
            number: calleeNumber
          }],
          from: {
           type: 'phone',
           number: servicePhoneNumber
          },
          answer_url: ['https://' + hostName + '/answer_2?original_uuid=' + ws1Uuid + '&ptsn_1_uuid=' + pstn1Uuid],
          answer_method: 'GET',
          event_url: ['https://' + hostName + '/event_2?original_uuid=' + ws1Uuid + '&ptsn_1_uuid=' + pstn1Uuid],
          event_method: 'POST'
          })
          .then(res => {
            console.log(">>> outgoing PSTN 2 call status:", res);
            app.set('pstn2_from_pstn1_' + pstn1Uuid, res.uuid);
            })
          .catch(err => console.error(">>> outgoing PSTN B call error:", err))

      }
     })
    .catch(err => console.error(">>> error get call status of PSTN leg 1", pstn1Uuid, err)) 

  //-- terminate WebSocket leg 1 - no longer needed in this sample use case --

  app.set('pstn2_from_ws1_' + ws1Uuid, true); // will prevent from hanging up PSTN 1 when WebSocket is effectively terminated

  console.log('>>> end WebSocket 1', ws1Uuid);
  //-- step 1c below <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

  vonage.voice.hangupCall(ws1Uuid)
    .then(res => console.log(">>> WebSocket 1 leg terminated", ws1Uuid))
    .catch(err => null) // WebSocket 1 leg has already been terminated  

});

//--------------

app.post('/callterminate', async(req, res) => {

  res.status(200).send('Ok');

  const uuidToTerminate = req.body.uuid;
  // const firstLegUuid = req.body.first_leg_uuid;
  // const sessionId = req.body.session_id; // for your own application logic

  //--

    vonage.voice.getCall(uuidToTerminate)
      .then(res => {
        if (res.status != 'completed') { // is PSTN leg A still up?

          vonage.voice.hangupCall(uuidToTerminate)
            .then(res => console.log(">>> PSTN A leg terminated", uuidToTerminate))
            .catch(err => null) // PSTN A leg has already been terminated 

        }
       })
      .catch(err => console.error(">>> error get call status of PSTN leg A", uuidToTerminate, err))  

});  

//----------------------------- Websocket - Deepgram transcribe live streaming audio ------------------

app.ws('/socket', async (ws, req) => {

  console.log('WebSocket from Vonage platform to /socket')

  const originalUuid = req.query.original_uuid;
  const vgAiSessionId = req.query.session_id;
  const vgAiSessionToken = req.query.session_token;

  let vadFeedback = false;
  if (req.query.vad_feedback === 'true') { vadFeedback = true}; // barge-in support

  console.log('>>> vadFeedback:', vadFeedback);
  let voiceMsgCount = 0;

  let callerNumber; // value set in  ws.on('message' ... section)

  console.log('>>> websocket connected with');
  console.log('original call uuid:', originalUuid);

  const webhookUrl = req.query.webhook_url;

  console.log('>>> webhookUrl:', webhookUrl);

  let xCustomFields = [];
  let customQueryParams = '';

  for (const queryParameter in req.query){    
    if (`${queryParameter}`.substring(0, 2) == 'x_') {
      xCustomFields.push(`"${queryParameter}": "${req.query[`${queryParameter}`]}"`);
    }
  };

  customQueryParams = "{" + xCustomFields.join(", ") + "}";
  console.log('>>> websocket custom query parameters:', customQueryParams);

  // let wsDgOpened = false;

  console.log('Opening WebSocket client to DeepGram');

  const deepgramClient = createClient(dgApiKey);

  let deepgram = deepgramClient.listen.live({
    // tier: "nova",          
    model: "nova-2",
    smart_format: true,      
    language: "en-US",        
    encoding: "linear16",
    sample_rate: 16000,
    // punctuate: true
  });

  deepgram.addListener(LiveTranscriptionEvents.Open, async () => {
    console.log("deepgram: connected");

    deepgram.addListener(LiveTranscriptionEvents.Transcript, async (data) => {
      // console.log(JSON.stringify(data));
      const transcript = data.channel.alternatives[0].transcript;

      if (transcript != '') {

        console.log('\n>>> transcript:', transcript);
        
        const aiReply = await sendMsgToAi(transcript, vgAiSessionId, vgAiSessionToken, originalUuid);

        console.log('>>> Response from AI agent:', aiReply);

        if (aiReply && aiReply != "") {
          console.log('>>> Play TTS:', aiReply);
          await sayText(aiReply, 'en-US', originalUuid)
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
    
      console.log("\n>>> Websocket settings:", msg);

      const wsconfig = JSON.parse(msg);
      callerNumber = wsconfig.caller_number;
    
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
