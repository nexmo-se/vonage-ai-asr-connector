
# Connector for Vonage AI Studio to use an external ASR engine

>>> TBD update below content <<< NOT RELEVANT AT THE MOMENT !!!!!!!

## Set up

### Set up your Vonage Voice API application credentials and phone number

[Log in to your](https://dashboard.nexmo.com/sign-in) or [sign up for a](https://dashboard.nexmo.com/sign-up) Vonage APIs account.

Go to [Your applications](https://dashboard.nexmo.com/applications), access an existing application or [+ Create a new application](https://dashboard.nexmo.com/applications/new).

Under Capabilities section (click on [Edit] if you do not see this section):

Enable Voice
- Under Answer URL, leave HTTP GET, and enter https://\<host\>:\<port\>/answer (replace \<host\> and \<port\> with the public host name and if necessary public port of the server where this sample application is running)</br>
- Under Event URL, **select** HTTP POST, and enter https://\<host\>:\<port\>/event (replace \<host\> and \<port\> with the public host name and if necessary public port of the server where this sample application is running)</br>
Note: If you are using ngrok for this sample application, the answer URL and event URL look like:</br>
https://yyyyyyyy.ngrok.io/answer</br>
https://yyyyyyyy.ngrok.io/event</br> 	
- Click on [Generate public and private key] if you did not yet create or want new ones, save the private key file in this application folder as .private.key (leading dot in the file name).</br>
**IMPORTANT**: Do not forget to click on [Save changes] at the bottom of the screen if you have created a new key set.</br>
- Link a phone number to this application if none has been linked to the application.

Please take note of your **application ID** and the **linked phone number** (as they are needed in the very next section).

For the next steps, you will need:</br>
- Your [Vonage API key](https://dashboard.nexmo.com/settings) (as **`API_KEY`**)</br>
- Your [Vonage API secret](https://dashboard.nexmo.com/settings), not signature secret, (as **`API_SECRET`**)</br>
- Your `application ID` (as **`APP_ID`**),</br>
- The **`phone number linked`** to your application (as **`SERVICE_PHONE_NUMBER`**), your phone will **call that number**,</br>

### Local setup

Copy or rename .env-example to .env<br>
Update parameters in .env file<br>
Have Node.js installed on your system, this application has been tested with Node.js version 18.19.1<br>

Install node modules with the command:<br>
 ```bash
npm install
```

Launch the application:<br>
```bash
node pstn-websocket-app
```

Default local (not public!) of this application server `port` is: 8000.

## How this application works

### When first PSTN call is outbound

See corresponding diagram first-pstn-call-is-outbound.png

For testing purposes, you may trigger the corresponding call flow with the web address where this application is running
https://<public_host_name>/startcall?callee=<callee_phone_number>

for example:
https://myserver.mycompany.com:32000/startcall?callee=12995551212
or
https://xxxx.ngrok.io/startcall?callee=12995551212

To make sure the WebSocket hears the inbound audio on the outbound PSTN call from the very beginning, in the call flow, the WebSocket is established first, then the outbound PSTN call.


Step 1a - Establish WebSocket 1, once answered by the middleware, drop that leg into a unique named conference (NCCO with action conversation),

Step 1b - Place outbound PSTN 1 call, once answered by remote party, drop that leg into same named conference (NCCO with action conversation),


If the voice API application decides to transfer PSTN 1 party with another party, identified as PSTN 2 party, then execute following steps.


Step 2a - Place outbound PSTN 2 call, once answered by remote party, drop that leg into same named conference (NCCO with action conversation),

Step 1c - Terminate WebSocket 1 leg.


Additional info:
For testing purposes, step 2a and step 1c are trigerred in the application some time after step 1b has completed. In real deployment, your application decides when to transfer call to PSTN 2 party, if needed at all.

In step 1a, the NCCO with action conversation does not include endOnExit true flag because it may automatically terminate both PSTN calls which is an undesired behavior. Instead the application decides what to do in that case, e.g. terminate PSTN 1 leg or let proceed.

In step 1b and in step 2a, both NCCOs with action conversation include endOnExit true flag because if either PSTN 1 or PSTN 2 remote party ends the call, then all legs attached to the same conference should be terminated.

Application automatically terminates PSTN 1 leg if WebSocket 1 has been terminated from the middleware side and if PSTN 2 leg call has not yet been initiated.

Application automatically terminates PSTN 2 leg call setup in progress (e.g. in ringing state, ...) if PSTN 1 leg remote party hung up.


### When first PSTN call is inbound

See corresponding diagram first-pstn-call-is-inbound.png

Step a1 - Answer incoming PSTN A call, drop that leg into a unique named conference (NCCO with action conversation),

Step a2 - Establish WebSocket A leg, once answered drop that leg into same named conference (NCCO with action conversation).


If the voice API application decides to transfer PSTN A party with another party, identified as PSTN B party, then execute following steps.

Step b1 - Place outbound PSTN B call, once answered by remote party, drop that leg into same named conference (NCCO with action conversation),

Step a3 - Terminate WebSocket A leg.


Additional info:
For testing purposes, step b1 and step a3 are trigerred in the application some time after step a2 has completed. In real deployment, your application decides when to transfer call to PSTN B party, if needed at all.

In step a2, the NCCO with action conversation does not include endOnExit true flag because it may automatically terminate both PSTN calls which is an undesired behavior. Instead the application decides what to do in that case, e.g. terminate PSTN A leg or let proceed.

In step a1 and in step b1, both NCCOs with action conversation include endOnExit true flag because if either PSTN A or PSTN B remote party ends the call, then all legs attached to the same conference should be terminated.

Application automatically terminates PSTN A leg if WebSocket A has been terminated from the middleware side and if PSTN B leg call has not yet been initiated.

Application automatically terminates PSTN B leg call setup in progress (e.g. in ringing state, ...) if PSTN A leg remote party hung up.







