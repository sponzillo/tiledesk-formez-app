const express = require('express');
// const uuid = require('uuid');
const bodyParser = require('body-parser');
var jwt = require('jsonwebtoken');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { TiledeskChatbotUtil } = require('@tiledesk/tiledesk-chatbot-util');
const axios = require('axios');
const { Elastic } = require('./search');
var path = require("path");
var fs = require('fs');

const app = express();

app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({ extended: true , limit: '50mb'}));

let db = new Map();

const APP_ENDPOINT = process.env.APP_ENDPOINT;

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
    console.log("***** DB:", db);
    API_URL = apiurlByOrigin(origin);
    console.log("Tiledesk endpoint: ", API_URL);
    const email = req.body.email;
    const fullname = req.body.name;
    const tdclient = new TiledeskClient({project_id:projectId,token:req.body.token, APIURL: API_URL, APIKEY: "___", log:false});
    let message = {}
    tdclient.getWidgetSettings(function(err, result) {
      const users_available = result['user_available']
      let availability = true;
      if (!users_available || users_available.length == 0) {
        availability = false;
      }
      if (availability) {
        message['text'] = `tdFrame,h280:${APP_ENDPOINT}/apps/prechatform/${req.body.payload.message._id}\n* Ho cambiato idea`;
        console.log("message:", message);
        message['attributes'] = {
          disableInputMessage: true,
          inputMessagePlaceholder: 'Compila il form prima di proseguire'
        };
        console.log("sending:", message)
        res.json(message);
      }
      else {
        console.log("CLOSED");
        // message['text'] = 'tdFrame:https://tiledesk-conversation-form-app.tiledesk.repl.co/apps/ticket/' + server + '/' + tokenalias + '/' + req.body.payload.message._id + '\n* Ho cambiato idea';
        message['text'] = `tdFrame,h410:${APP_ENDPOINT}/apps/ticket/${req.body.payload.message._id}\n* Ho cambiato idea`;
        console.log("message:", message);
        message['attributes'] = {
          disableInputMessage: true,
          inputMessagePlaceholder: 'Compila il form prima di proseguire'
        };
        console.log("sending:", message)
        res.json(message);
      }
    })
  }
  else if (intent === 'supporto_al_cittadino') {
    console.log("origin:", req.headers['origin']);
    const origin = req.headers['origin'];
    const request_id = req.body.payload.message.request.request_id;
    const message_id = req.body.payload.message._id;
    req.body.origin = origin;
    db.set(message_id + "-webhook-body", req.body);
    console.log("***** DB:", db);
    API_URL = apiurlByOrigin(origin);
    console.log("Tiledesk endpoint: ", API_URL);
    const email = req.body.email;
    const fullname = req.body.name;
    const tdclient = new TiledeskClient({project_id:projectId,token:req.body.token, APIURL: API_URL, APIKEY: "___", log:false});
    let message = {}
    message['text'] = `tdFrame,h410:${APP_ENDPOINT}/apps/ticket/${req.body.payload.message._id}\n* Ho cambiato idea`;
    console.log("message:", message);
    message['attributes'] = {
      disableInputMessage: true,
      inputMessagePlaceholder: 'Compila il form prima di proseguire'
    };
    console.log("sending:", message)
    res.json(message);
  }
});

app.get('/apps/prechatform/:messageid', (req, res) => {
  const messageid = req.params.messageid;
  prechat_saved = db.get(messageid + '-prechat-saved');
  if (!prechat_saved) {
    fs.readFile(path.join(__dirname + '/html/prechatForm.html'), (err, data) => {
      let html = data.toString().replace('${messageid}', messageid);
      res.status(200).send(html);
    });
  }
  else {
    res.sendFile(path.join(__dirname + '/html/prechatFormEnd.html'));
  }
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
  ticket_request_saved = db.get(messageid + '-ticket-request-saved');
  if (!ticket_request_saved) {
    fs.readFile(path.join(__dirname + '/html/ticketForm.html'), (err, data) => {
      let html = data.toString().replace('${messageid}', messageid);
      res.status(200).send(html);
    });
  }
  else {
    res.sendFile(path.join(__dirname + '/html/ticketEnd.html'));
  }
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
  const tdclient = new TiledeskClient({project_id:projectId,token:rawJwtToken, APIURL: API_URL, APIKEY: "___", log:false});
  
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
      email: email,
      codanagrafica: email,
      cognome: "",
      telefono: "",
      cellulare: "",
      codstato: "",
      codclassificazione: "",
      codoggetto: "PNRR",
      codrichiesta: "CHATBOT",
      codrisposta: "",
      note: note,
      sorgente:"chat"
    };
  axios
    .post('http://lakb.s3c.it/s3netcm/Ticketmanage', postBody, postConfig)
    .then(res => {
      console.log(`statusCode: ${res.status}`)
      const idticket = res.data.idticket;
      console.log("idticket:", res.data.idticket);

      const text = "Grazie " + nome + ", il tuo **ticket #" + idticket + "** è stato inviato al supporto. Ti contatteremo presto all'indirizzo email *" + email + "*.\nDettaglio ticket inviato:\n\n" + note + "\n* Termina tdIntent:CLOSE";
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

app.get('/searchme', (req, res) => {
  console.log('/searchme, query:', req.query['query']);
  res.send("ok")
});

app.get('/search', (req, res) => {
  console.log('/search, query:', req.query['query']);
  const query = req.query['query']
  // create the ticket
  ticketapp_token = "aahfiudsbigshfdgiufhgisjhofshofdpgoiewurfu9845729483t9543nvc27t90vc895432986v30zz";
  const postConfig = {
    headers: { Authorization: `Bearer ${ticketapp_token}` }
  };

  const postBody = {
    "Titolare": "LINEAAMICA",
    "action": "query",
    "Ambito": "FO",
    "Cerca": query,
    "Risultati": 3
  };
  axios
    .post('http://lakb.s3c.it/s3netcm/KNOWLEDGE', postBody, postConfig)
    .then(response => {
      console.log('response.data:', response.data);
      console.log('result:', response.data.Query[0]);
      array.forEach(function (item, index) {
        console.log(item, index);
      });
      res.send(response.data.Query);
    })
    .catch(error => {
      console.error(error);
    })
});

// Webhook endpoint for fallback-to-knowledge-base tutorial.
// Just add a webhook on "Message.create" event targeting this
// endpoint to see it in action.
// This webhook will send an asynchronuos message to the user chat
// if a fallback intent occurs on the chatbot.
// After a fallback (or under an intent confidence threshold) this
// snippet of code uses the original user question to trigger a
// search on a knowledge base (wikipedia) sending back to the user
// chat a set of results coming from the knowledge base (rendered with url-buttons)
app.post('/webhook/search', async (req, res) => {
  console.log("req.headers:", req.headers);
  //const origin = req.headers['origin'];
  console.log('tiledesk webhook. ', req.connection.remoteAddress);
  //console.log('req.body ', JSON.stringify(req.body.payload.attributes));
  res.send(200);
  
  var project_id = req.body.hook.id_project;
  console.log('project_id ', project_id);

  const payload = req.body.payload;

  var sender_id = payload.sender; //"bot_" + bot._id;
  console.log('sender_id ', sender_id);
  
  var senderFullname = payload.senderFullname; //bot.name;
  console.log('senderFullname ', senderFullname);
  
  var token = req.body.token;
  console.log('token ', token);
  
  var request_id = payload.recipient;
  console.log('request_id ', request_id);

  if (!req.body.payload.attributes.intent_info) {
    return;
  }

  console.log("intent_info ok", req.body.payload.attributes.intent_info);

  const is_fallback = req.body.payload.attributes.intent_info.is_fallback;
  const intent_confidence = req.body.payload.attributes.intent_info.confidence;
  console.log("INFO", req.body.payload.attributes.intent_info);
  let confidence_threshold = 0.7;
  console.log("confidence_threshold", confidence_threshold);
  console.log("intent_confidence < confidence_threshold", intent_confidence < confidence_threshold)
  if (is_fallback || (!is_fallback && intent_confidence < confidence_threshold)) {
    console.log("starting Elastic search...");
  }
  else {
    return;
  }
  
  var question_payload = req.body.payload.attributes.intent_info.question_payload;
  console.log("question_payload", question_payload)
  var text = question_payload.text;
  console.log('text ', text);

  const search = new Elastic()
  search.doQuery(text, (err, results) => {
    console.log("got elastic results:", results);
    // ex. results:
    // [{
    //   "title": "Teams",
    //   "path": "https://digitalbrickoffice365.sharepoint.com/SitePages/Teams.aspx"
    // }, {
    //   "title": "Teams",
    //   "path": "https://digitalbrickoffice365.sharepoint.com/SitePages/Microsoft-Teams-prova.aspx"
    // }]
    let attributes = {
      attachment: {
          type:"template",
          buttons: []
      }
    };
    // it creates a set of URL-buttons for the resultset
    results.forEach(content => {
      console.log("CONTENT:", content);
      var button = {type:"url", value: content.title, link: content.path}
      attributes.attachment.buttons.push(button);
    });

    let reply_text;
    if (is_fallback) {
      reply_text = 'Puoi provare con questi contenuti che potrebbero interessarti'
    }
    else {
      reply_text = 'Altre informazioni interessanti'
    }
    var msg = {
      text: reply_text,
      sender: sender_id,
      senderFullname: senderFullname,
      attributes: attributes
    };
    //req.body.origin = origin;
    //API_URL = apiurlByOrigin(origin);
    //console.log("Tiledesk endpoint: ", API_URL);
    const tdclient = new TiledeskClient(
      {
        APIKEY: '__APIKEY__',
        project_id: project_id,
        token: token,
        APIURL: 'https://api.tiledesk.com/v2',
        log: false
      });

    if (attributes.attachment.buttons.length > 0) {
      setTimeout(() => {
        tdclient.sendMessage(request_id, msg, (err, result) => {
          console.log("err?", err);
          setTimeout(() => {
            let _attributes = {
              attachment: {
                type:"template",
                buttons: [
                  {
                    type: "action",
                    value: "OK",
                    action: "OK",
                    show_reply: false
                  },
                  {
                    type: "action",
                    value: "Non ho capito",
                    action: "NO_CAPITO",
                    show_reply: false
                  }
                ]
              }
            };
            var _msg = {
              text: "Sei soddisfatto della risposta?",
              sender: sender_id,
              senderFullname: senderFullname,
              attributes: _attributes
            };
            tdclient.sendMessage(request_id, _msg, (err, result) => {
              
              
              
            });
          }, 2000);
        });
      }, 2000);
      
    }
  });
 });
 
app.get('/', (req, res) => {
  res.send('Hello Tiledesk Widget app!');
});

app.listen(3000, () => {
  console.log('server started');
});
