# ASR Connector for Vonage AI Studio to use an external ASR engine

>>> TBD update below content <<< NOT RELEVANT AT THE MOMENT !!!!!!!

## What this sample HTTP AI Agent and ASR Connector do

It shows you can use a third-party ASR (Automatic Speech Recognition) engine with a Vonage AI Agent.</br>

An HTTP type **AI agent** (created in or imported to Vonage AI Studio) uses the **ASR Connector** to handle the voice connectivity including PSTN phone calls, WebRTC calls, or SIP calls, and the ASR engine connection, for speech recognition.</br>

How the call flow happens with the sample HTTP AI Agent and the ASR Connector in this repository,</br>
- A phone call is established first with, let's say, a customer,</br>
- Customer interacts with the Voice bot (via the AI agent),</br>
- Call gets transferred to, let's say, a live agent, and connection with the AI agent is terminated. </br>

## How this sample HTTP AI Agent and ASR Connector work

See also the diagram _vonage-ai-asr-connector.png_.</br>

In this diagram, the **ASR Connector** application is shown in two parts for easier description, however both parts are in one source code file in this repository.</br>

First, PSTN 1 leg is established with the customer, it can be an inbound call or an outbound call,</br>
then a WebSocket leg is established with the ASR Connector (part 1) which sends the audio from the customer to the ASR engine.</br>

With this ASR Connector, we are using Deepgram to do speech recognition.</br>

Received transcriptions are sent to the ASR Connector (part 2).</br>

The ASR Connector (part 2) submits each transcript as an _HTTP AI Step_ to the AI agent,</br>
a text result is returned by the AI agent,</br>
which the ASR Connector (part 2) plays via TTS (Text-to-Speech) to the customer.</br>

Then the customer speaks again, and so on, until the AI agent decides to transfer the call to a live agent,</br>
upon transfer request by the AI agent to the ASR Connector (part 2), the call is efefctively transferred to the agent, and the interaction with the AI agent is terminated.</br>

## Set up

### Deploy the sample HTTP AI Agent

From AI Studio, import the attached sample AI agent _BlogAgent.zip_.</br>

For this sample agent, for test and demo purpose, you need to set the live agent phone number,</br>
to do that, edit this agent,</br>
go to Properties, Parameters, Custom Parameters, callee,</br>
change the value to your desired recipient number,</br>
it must be a phone number in E.164 format without the leading '+' sign,</br>
click on [Close].</br>

Then [Publish] the AI agent.</br>

Take note of the:</br>
- Agent ID,</br>
and
- The Vonage AI API key, see next lines comments.

Do not confuse your _Vonage **AI API key**_ with your _Vonage **account API key**_

If you already have an existing Vonage AI API key, you keep that one,</br>
if not you may create one,</br>
within AI Studio UI, go to the top right corner,</br>
click on the user icon,</br>
then "Generate API key",</br>
take note of it.</br>

Both Agent ID and AI API key values are needed in a next section.

### Get your credentials from Deepgram

Sign up with or log in to Deepgram.</br>

Create or use an API key,
take note of it (as it will be needed in a next section).</br>


### Set up your Vonage Voice API application credentials and phone number

[Log in to your](https://ui.idp.vonage.com/ui/auth/login) or [sign up for a](https://ui.idp.vonage.com/ui/auth/registration) Vonage APIs account.

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
node asr-connector
```

Default local (not public!) of this application server `port` is: 8000.

## How to test the sample AI agent and ASR Connector

### First PSTN call is outbound

You may trigger the outbound call by opening the following web address<br>
https://<public_host_name>/startcall?callee=<callee_phone_number><br>

for example:<br>
https://myserver.mycompany.com:32000/startcall?callee=12995551515<br>
or<br>
https://xxxx.ngrok.io/startcall?callee=12995551515<br>


### First PSTN call is inbound

Call the phone number linked to your Vonage API account.


### In both cases

Whether the first call is outbound or inbound, the user (e.g. customer) will be asked for a name,<br>
then some jokes will be played instead of music-on-hold,<br>
until the user says "no" for no more jokes,<br>
after which the call is transferred to the other user (e.g. live agent) which phone number is the one that has been set when deploying the AI agent.






