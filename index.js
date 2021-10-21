const express = require('express');
// const uuid = require('uuid');
const bodyParser = require('body-parser');
var jwt = require('jsonwebtoken');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { TiledeskChatbotUtil } = require('@tiledesk/tiledesk-chatbot-util');
const axios = require('axios');

const app = express();

app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({ extended: true , limit: '50mb'}));

let db = new Map();

// Tiledesk Resolution-bot webhook endpoint
app.post('/mytiledesk', (req, res) => {
  console.log("Webhook. Request body: " + JSON.stringify(req.body));
  // INTENTS
  let intent = null;
  if (req.body.payload.faq) { // old version
    intent = req.body.payload.faq.intent_display_name;
  }
  else { // new version
    intent = req.body.payload.intent.intent_display_name;
  }
  const projectId = req.body.payload.bot.id_project;
  console.log("Got intent:", intent);
  if (intent === 'agent_handoff') {
    console.log("origin:", req.headers['origin']);
    const origin = req.headers['origin'];
    const request_id = req.body.payload.message.request.request_id;
    const message_id = req.body.payload.message._id;
    req.body.origin = origin;
    db.set(message_id + "-webhook-body", req.body);
    API_URL = apiurlByOrigin(origin);
    console.log("Tiledesk endpoint: ", API_URL);
    const email = req.body.email;
    const fullname = req.body.name;
    const tdclient = new TiledeskClient({project_id:projectId,token:req.body.token, APIURL: API_URL, APIKEY: "___", log:true});
    let message = {}
    tdclient.getWidgetSettings(function(err, result) {
      const users_available = result['user_available']
      let availability = true;
      if (!users_available || users_available.length == 0) {
        availability = false;
      }
      if (availability) {
        message['text'] = 'tdFrame:https://tiledesk-conversation-form-app.tiledesk.repl.co/apps/prechatform/' + req.body.payload.message._id + '\n* Ho cambiato idea';
        console.log("message:", message);
        message['attributes'] = {
          hideTextReply: true,
          typeMessagePlaceholder: 'Compila il form prima di proseguire'
        };
        console.log("sending:", message)
        res.json(message);
      }
      else {
        console.log("CLOSED");
        // message['text'] = 'tdFrame:https://tiledesk-conversation-form-app.tiledesk.repl.co/apps/ticket/' + server + '/' + tokenalias + '/' + req.body.payload.message._id + '\n* Ho cambiato idea';
        message['text'] = 'tdFrame:https://tiledesk-conversation-form-app.tiledesk.repl.co/apps/ticket/' + req.body.payload.message._id + '\n* Ho cambiato idea';
        console.log("message:", message);
        message['attributes'] = {
          hideTextReply: true,
          typeMessagePlaceholder: 'Compila il form prima di proseguire'
        };
        console.log("sending:", message)
        res.json(message);
      }
    })
  }
});

app.get('/apps/prechatform/:messageid', (req, res) => {
  const messageid = req.params.messageid;
  prechat_saved = db.get(messageid + '-prechat-saved');
  let html = null;
  if (!prechat_saved) {
    html = `
  <html>
  <head>
  <script>
  </script>
  <style> 
  p {
    font-family:Roboto,'Google Sans',Helvetica,Arial,sans-serif;font-size:12px;color:#1a1a1a;font-weight:300;
  }
  td {
    font-family:Roboto,'Google Sans',Helvetica,Arial,sans-serif;font-size:12px;color:#1a1a1a;font-weight:300;
  }
  input {
    border: 1px solid #d9d9d9!important;border-radius: 5px;
  }
  </style>
  </head>
  <body>
  <div id='form'>
    <p>Ti stiamo mettendo in contatto con un operatore.</p>
    <p>Prima di proseguire puoi fornirci alcuni dati?</p>
    <table>
    <tr><td>Nome:</td><td><input type='text' id='name' value=''/></td></tr>
    <tr><td>Email:</td><td><input type='text' id='email' value=''/></td></tr>
    <tr><td colspan="2"><br>Dichiaro di aver letto e di accettare i termini della Vostra <a href="">privacy policy</a><input type='checkbox' id='privacy' value=''/></td></tr>
    </table>
    
    <input type='hidden' id='messageid' value='${messageid}'/>
    
    <p><input type='button' id='send_btn' value='Send'/></p>
  </div>
  <script>
    const btn = document.getElementById('send_btn');
    function sendData( data ) {
      console.log( 'Sending data' );
      const XHR = new XMLHttpRequest();
      let urlEncodedData = "",
          urlEncodedDataPairs = [],
          name;
      for( name in data ) {
        urlEncodedDataPairs.push( encodeURIComponent( name ) + '=' + encodeURIComponent( data[name] ) );
      }
      urlEncodedData = urlEncodedDataPairs.join( '&' ).replace( /%20/g, '+' );
      XHR.addEventListener("loadend", function(event) {
        console.log( 'Data sent and response loaded.' );
        let form = document.getElementById('form');
        form.innerHTML = "<p style='text-align:center'>Grazie!</p>";
      });
      // XHR.addEventListener( 'load', function(event) {
      //  console.log( 'Data sent and response loaded.' );
      //  let form = document.getElementById('form');
      //  form.innerHTML = "<p style='text-align:center'>Grazie!</p>";
      // } );
      XHR.addEventListener( 'error', function(event) {
        console.log( 'Oops! Something went wrong.' );
      } );
      XHR.open( 'POST', '/apps/prechatform/save' );
      XHR.setRequestHeader( 'Content-Type', 'application/x-www-form-urlencoded' );
      XHR.send( urlEncodedData );
    }
    btn.addEventListener( 'click', function() {
      
      const email = document.getElementById('email');
      const name = document.getElementById('name');
      
      
      const messageid = document.getElementById('messageid');
      sendData( {
        email:email.value,
        name:name.value,
        
        
        messageid:messageid.value} );
    } )
  </script>
  </body>
  </html>
  `;
  }
  else {
    html = `<html>
  <head>
  <script>
  </script>
  <style> 
  p {
    font-family:Roboto,'Google Sans',Helvetica,Arial,sans-serif;font-size:12px;color:#1a1a1a;font-weight:300;
  }
  td {
    font-family:Roboto,'Google Sans',Helvetica,Arial,sans-serif;font-size:12px;color:#1a1a1a;font-weight:300;
  }
  input {
    border: 1px solid #d9d9d9!important;border-radius: 5px;
  }
  </style>
  </head>
  <body>
  <div>
  <p style='text-align:center'>Grazie, i tuoi dati sono stati acquisiti.</p>`
  }
  res.status(200).send(html);
});

app.post('/apps/prechatform/save', (req, res) => {
  //console.log('******* req.body:', req.body);
  //console.log('TOKENS:', tokens)
  const messageid = req.body.messageid;
  const email = req.body.email;
  const fullname = req.body.name;
  console.log("messageid:", messageid);
  // const server = req.body.server;
  const message_webhook_body = db.get(messageid + "-webhook-body");
  const message_payload = message_webhook_body.payload;
  const rawJwtToken = message_webhook_body.token;
  const tk = rawJwtToken;
  if (rawJwtToken.startsWith('JWT ')) {
    tk = rawJwtToken.split('JWT ')[1];
  }
  const decoded = jwt.decode(tk);
  let projectId;
  if (decoded && decoded.id_project) {
    projectId = decoded.id_project;
  }
  console.log("projectId:", projectId);
  // choose the server
  const origin = message_webhook_body.origin;
  API_URL = apiurlByOrigin(origin);
  console.log("Tiledesk endpoint: ", API_URL);
  const tdclient = new TiledeskClient({project_id:projectId,token:rawJwtToken, APIURL: API_URL, APIKEY: "___", log:false});
  const lead_id = message_payload.message.request.lead._id;
  const requestid = message_payload.message.request.request_id;
  tdclient.updateLeadEmailFullname(lead_id, email, fullname, function(err, res, resbody) {
    tdclient.updateRequest(requestid, {updated: Date.now});
  })
  const text = "Grazie " + fullname + ", il tuo indirizzo email " +  email + " è corretto. Ti stiamo connettendo con un operatore 🙂";
  const reply = TiledeskChatbotUtil.parseReply(text);
  let message = reply.message;
  console.log("message:", message);
  if (!message.attributes) {
    message.attributes = {}
  }
  message.attributes['updateUserEmail'] = email;
  message.attributes['updateUserFullname'] = fullname;
  tdclient.sendMessage(requestid, message, function(err) {
    console.log('Sent message:', message);
    db.set(message_payload.message._id + '-prechat-saved', true);
    if (err) {
      console.log('An error occurred', err);
    }
    else {
      tdclient.sendMessage(
        requestid, {
          text:'\\agent',
          attributes: {
            subtype: "info"
          }
        },
        function(err) {
          console.log("\\agent message sent.")
        }
      );
    }
  });
  res.send("ok");
});

app.get('/apps/ticket/:messageid', (req, res) => {
  const messageid = req.params.messageid;
  //const server = req.params.server;
  ticket_request_saved = db.get(messageid + '-ticket-request-saved');
  //console.log("server", req.params.server)
  let html;
  if (!ticket_request_saved) {
  html = `
  <html>
  <head>
  <script>
  </script>
  <style> 
  p {
    font-family:Roboto,'Google Sans',Helvetica,Arial,sans-serif;font-size:12px;color:#1a1a1a;font-weight:300;
  }
  td {
    font-family:Roboto,'Google Sans',Helvetica,Arial,sans-serif;font-size:12px;color:#1a1a1a;font-weight:300;
  }
  input {
    border: 1px solid #d9d9d9!important;border-radius: 5px;
  }
  </style>
  </head>
  <body>
  <div id="form">
  <p style="text-align:center">Nessun operatore disponibile. Apriamo un ticket con il supporto?</p>
<table>
  <tr><td>Nome:</td><td><input type='text' id='nome' value=''/></td></tr>
  <tr><td>Email:</td><td><input type='text' id='email' value=''/></td></tr>
  <tr><td colspan="2">Descrivi il tuo problema:</td></tr>
  <tr><td colspan="2"><textarea id='note' value=''/></textarea></td></tr>
  <tr><td colspan="2"><br>Dichiaro di aver letto e di accettare i termini della Vostra <a href="https://tiledesk.com/privacy.html" target="_blank">privacy policy</a><input type='checkbox' id='privacy' value=''/></td></tr>
</table>
    
    <input type='hidden' id='messageid' value='${messageid}'/>
    
    <p><input type='button' id='send_btn' value='Send'/></p>
</div>
  <script>
    function sendData( data ) {
      console.log( 'Sending data' );
      const XHR = new XMLHttpRequest();
      let urlEncodedData = "",
          urlEncodedDataPairs = [],
          name;
      for( name in data ) {
        urlEncodedDataPairs.push( encodeURIComponent( name ) + '=' + encodeURIComponent( data[name] ) );
      }
      urlEncodedData = urlEncodedDataPairs.join( '&' ).replace( /%20/g, '+' );
      XHR.addEventListener("loadend", function(event) {
        console.log( 'Data sent and response loaded.' );
        let form = document.getElementById('form');
        form.innerHTML = "<p style='text-align:center'>Grazie, ticket acquisito!</p>";
      });
      XHR.addEventListener( 'error', function(event) {
        console.log( 'Oops! Something went wrong.' );
      } );
      XHR.open( 'POST', '/apps/ticket/create' );
      XHR.setRequestHeader( 'Content-Type', 'application/x-www-form-urlencoded' );
      XHR.send( urlEncodedData );
    }
    const btn = document.getElementById('send_btn');
    btn.addEventListener( 'click', function() {
      const email = document.getElementById('email');
      const nome = document.getElementById('nome');
      const note = document.getElementById('note');
      
      const messageid = document.getElementById('messageid');
      sendData( {
        email:email.value,
        nome:nome.value,
        note: note.value,
        messageid:messageid.value} );
    } )
  </script>
  </body>
  </html>
`;
  }
  else {
    html = `<html>
  <head>
  <script>
  </script>
  <style> 
  p {
    font-family:Roboto,'Google Sans',Helvetica,Arial,sans-serif;font-size:12px;color:#1a1a1a;font-weight:300;
  }
  td {
    font-family:Roboto,'Google Sans',Helvetica,Arial,sans-serif;font-size:12px;color:#1a1a1a;font-weight:300;
  }
  input {
    border: 1px solid #d9d9d9!important;border-radius: 5px;
  }
  </style>
  </head>
  <body>
  <div>
  <p style='text-align:center'>Grazie, il tuo ticket è stato acquisito.</p>`
  }
  res.status(200).send(html);
});

app.post('/apps/ticket/create', (req, res) => {
  console.log('/openticket, req.body:', req.body);
  //console.log('TOKENS:', tokens)
  const messageid = req.body.messageid;
  const email = req.body.email;
  const nome = req.body.nome;
  const note = req.body.note;
  console.log("messageid:", messageid);
  // const server = req.body.server;
  const message_webhook_body = db.get(messageid + "-webhook-body");
  const message_payload = message_webhook_body.payload;
  const rawJwtToken = message_webhook_body.token;
  let tk = rawJwtToken;
  if (rawJwtToken.startsWith('JWT ')) {
    tk = rawJwtToken.split('JWT ')[1];
  }
  const decoded = jwt.decode(tk);
  let projectId;
  if (decoded && decoded.id_project) {
    projectId = decoded.id_project;
  }
  console.log("projectId:", projectId);
  const origin = message_webhook_body.origin;
  API_URL = apiurlByOrigin(origin);
  console.log("Tiledesk endpoint: ", API_URL);
  const tdclient = new TiledeskClient({project_id:projectId,token:rawJwtToken, APIURL: API_URL, APIKEY: "___", log:true});
  
  /*
  const lead_id = request.lead._id;
  tdclient.updateLeadEmailFullname(lead_id, email, nome, function(err, res, resbody) {
    tdclient.updateRequest(requestid, {updated: Date.now});
  });
  */

  // create the ticket
  ticketapp_token = "aahfiudsbigshfdgiufhgisjhofshofdpgoiewurfu9845729483t9543nvc27t90vc895432986v30zz";
  const postConfig = {
    headers: { Authorization: `Bearer ${ticketapp_token}` }
  };

  const postBody = {
      azione: "NEW",
      codistanza: "LATEST",
      codtitolare: "LINEAAMICA",
      codcampagna: "FO",
      nome: nome,
      Email: email,
      codanagrafica: email,
      cognome: "",
      telefono: "",
      cellulare: "",
      codstato: "",
      codclassificazione: "",
      codoggetto: "PNRR",
      codrichiesta: "CHATBOT",
      codrisposta: "",
      note: note
    };
  axios
    .post('http://lakb.s3c.it/s3netcm/Ticketmanage', postBody, postConfig)
    .then(res => {
      console.log(`statusCode: ${res.status}`)
      const idticket = res.data.idticket;
      console.log("idticket:", res.data.idticket);

      const text = "Grazie " + nome + ", il tuo **ticket #" + idticket + "** è stato inviato al supporto. Ti contatteremo presto all'indirizzo email *" + email + "*.\nDettaglio ticket inviato:\n\n" + note;
      const reply = TiledeskChatbotUtil.parseReply(text);
      let message = reply.message;
      console.log("message:", message);
      if (!message.attributes) {
        message.attributes = {}
      }
      message.attributes['updateUserEmail'] = email;
      message.attributes['updateUserFullname'] = nome;
      const requestid = message_payload.message.request.request_id;
      tdclient.sendMessage(requestid, message, function(err) {
        console.log('Sent message:', message);
        db.set(message_payload.message._id + '-ticket-request-saved', true);
        if (err) {
          console.log('An error occurred', err);
        }
      })
    })
    .catch(error => {
      console.error(error)
    })
    res.send("ok");
});

function apiurlByOrigin(origin) {
  const API_URL_PRE = 'https://tiledesk-server-pre.herokuapp.com';
  const API_URL_PROD = 'https://api.tiledesk.com/v2';
  let server = 'prod';
  if (origin.indexOf('-pre') >= 0) {
    server = 'pre';
  }
  // choose a server
  let API_URL = API_URL_PROD;
  if (server === 'pre') {
    API_URL = API_URL_PRE;
  }
  return API_URL;
}

app.get('/', (req, res) => {
  res.send('Hello Tiledesk Widget app!');
});

app.listen(3000, () => {
  console.log('server started');
});
