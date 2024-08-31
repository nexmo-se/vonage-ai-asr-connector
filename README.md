# Deepgram ASR Connector for Vonage AI Studio

## What this sample HTTP AI Agent and ASR Connector do

It shows how:
- You may extend Vonage AI Studio to use a third-party ASR (Automatic Speech Recognition) engine,</br>
- Or you may augment a Vonage Voice API application with ASR capability to use a Vonage AI Studio Agent for advanced AI capabilities.

An HTTP type **AI Agent** (created in or imported to Vonage AI Studio) uses the **ASR Connector** which handles the voice connectivity including PSTN phone calls, WebRTC calls, or SIP calls, as well as the ASR Engine connection, for speech recognition.</br>

How the call flow happens with the sample HTTP AI Agent and the ASR Connector in this repository:</br>
- A phone call is established first with, let's say, a customer,</br>
- Customer interacts with the Voice bot (via the AI Agent),</br>
- Call gets transferred to, let's say, a Live Agent, and the connection with the AI Agent is terminated. </br>

## How this sample HTTP AI Agent and ASR Connector work

See also the diagram _vonage-ai-asr-connector.png_.</br>

In this diagram, the **ASR Connector** application is shown in two parts for easier description, however both parts are in one source code file in this repository.</br>

First, PSTN 1 leg is established with the customer, it can be an inbound call or an outbound call,</br>
then a WebSocket leg is established with the ASR Connector (part 1) which sends the audio from the customer to the ASR Engine.</br>

With this ASR Connector, we are using Deepgram to do speech recognition.</br>

Received transcriptions are sent to the ASR Connector (part 2).</br>

The ASR Connector (part 2) submits each transcript via HTTP as an _AI Step_ to the AI agent,</br>
a text result is returned by the AI Agent,</br>
which the ASR Connector (part 2) plays via Text-to-Speech (TTS) to the customer.</br>

Then the customer speaks again, and so on, until the AI Agent decides to transfer the call to a Live Agent,</br>
upon transfer request by the AI Agent to the ASR Connector (part 2), the call is effectively transferred to the Live Agent, as PSTN call 2, and the interaction with the AI Agent is terminated.</br>

## Set up

### Node.js

[Download and install Node.js](https://nodejs.org/en/download/package-manager) version 18.

This Node.js ASR Connector application has been tested with Node.js version 18.

### Ngrok

[Download and install ngrok](https://ngrok.com/download), an Internet tunelling service.</br>
Sign in or sign up with [ngrok](https://ngrok.com/), from the menu, follow the **Setup and Installation** guide.

Set up a domain to forward to the local port 8000 (as the ASR Connector application will be listening on port 8000).

Start ngrok to listen on port 8000,</br>
please take note of the ngrok **Enpoint URL** as it will be need in the next sections,
that URL looks like:</br>
`https://yyyyyyyy.ngrok.io`

### Deepgram

Sign in or sign up with [Deepgram](https://deepgram.com/).

Create or use an existing project, then create or retrieve an existing API key.

For the next steps, you will need:</br>
- The Deegpram **API key** (as environment variable **`DEEPGRAM_API_KEY`**)</br>

### Vonage API Account - Voice API Application

[Log in to your](https://ui.idp.vonage.com/ui/auth/login) or [sign up for a](https://ui.idp.vonage.com/ui/auth/registration) Vonage API account.

Go to [Your applications](https://dashboard.nexmo.com/applications), access an existing application or [+ Create a new application](https://dashboard.nexmo.com/applications/new).

Under Capabilities section (click on [Edit] if you do not see this section):

Enable Voice</br>

- Under Answer URL, leave HTTP GET, and enter</br>
`https://<host>:<port>/answer`</br>
(replace \<host\> and \<port\> with the public host name and if necessary public port of the server where this sample application is running)</br>

- Under Event URL, **select** HTTP POST, and enter</br>
`https://<host>:<port>/event`</br>
(replace \<host\> and \<port\> with the public host name and if necessary public port of the server where this sample application is running)</br>

Note: If you are using ngrok for this sample application, the Answer URL and Event URL look like:</br>
`https://yyyyyyyy.ngrok.io/answer`</br>
`https://yyyyyyyy.ngrok.io/event`</br> 

- Under Region, select a region, please take note of your selection,	

- Click on [Generate public and private key] if you did not yet create or want new ones, save the private key file in this application folder as .private.key (leading dot in the file name).</br>

**IMPORTANT**: Do not forget to click on [Save changes] at the bottom of the screen if you have created a new key set.</br>

- Link a phone number to this application if none has been linked to the application.

For the next steps, you will need:</br>
- The [Account API key](https://dashboard.nexmo.com/settings) (as environment variable **`API_KEY`**)</br>
- The [Account API secret](https://dashboard.nexmo.com/settings), not signature secret, (as environment variable **`API_SECRET`**)</br>
- The **`application ID`** (as environment variable **`APP_ID`**),</br>
- The selected **`Region`** (as environment variable **`API_REGION`**),</br>
- The **`phone number linked`** to your application (as environment variable **`SERVICE_PHONE_NUMBER`**).</br>


### Deploy the sample HTTP AI Agent 

Login to your [Vonage API account](https://ui.idp.vonage.com/ui/auth/login),

Go to [AI Studio](https://studio.ai.vonage.com/),</br>
import the attached sample AI Agent _**BlogAgent.zip**_,</br>
you may change the _Agent Name_,</br>
click on \[Import Agent\].


Click on the just imported Agent to open it,</br>
for this sample AI Agent, for test and demo purposes, you need to set the live agent phone number,</br>
to do that,</br>
go to Properties (left column icons), Parameters, Custom Parameters, callee,</br>
change the value to your desired recipient number,</br>
it must be a phone number in E.164 format without the leading '+' sign,</br>
click on [Close].</br>

Then [Publish] the AI Agent.</br>

Take note of:</br>
- The **Agent ID**,</br>
and
- The Vonage **AI API key**, see next lines comments.

**Do not confuse** your _Vonage **AI API key**_ with your _Vonage **account API key**_

If you already have an existing Vonage AI API key, you keep that one,</br>
if not you may create one,</br>
to do so, within AI Studio UI, go to the top right corner,</br>
click on the user icon,</br>
then "Generate API key",</br>
take note of it.</br>

For the next steps, you will need:</br>
- The **AI API key** (as environment variable **`X_VGAI_KEY`**)</br>
- The **Agent ID** (as environment variable **`AGENT_ID`**)</br>


### Setup to run locally the ASR Connector application on your computer

Copy or rename .env-example to .env<br>

Update all the parameters in .env file as per previous sections contents.<br>
The argument for environment variable **`VG_AI_HOST`** should be consistent with the argument of environment variable **`API_REGION`**.

This application has been tested with Node.js version 18.19.1<br>

Install node modules with the command:<br>
 ```bash
npm install
```

Launch the application:<br>
```bash
node asr-connector
```
Default local (not public!) of this application listening `port` is: 8000.

Make sure ngrok is running as per previous section.

## How to test the sample AI Agent and ASR Connector

### First PSTN call is outbound

You may trigger the outbound call by opening the following web address<br>
`https://<public_host_name>/startcall?callee=<callee_phone_number>`<br>

for example:<br>
`https://myserver.mycompany.com:32000/startcall?callee=12995551515`<br>
or<br>
`https://yyyyyyyy.ngrok.io/startcall?callee=12995551515`<br>


### First PSTN call is inbound

Call the phone number linked to your Vonage API account.


### In both cases

Whether the first call is outbound or inbound, the user (e.g. customer) will be asked for a name,<br>
then some jokes will be played instead of music-on-hold,<br>
until the user says "no" for no more jokes,<br>
after which the call is transferred to the other user (e.g. live agent) which phone number is the one that has been set when deploying the AI Agent.






