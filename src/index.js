const request = require('request-promise-native')
const queryString = require('query-string')
const parseXmlString = require('./parse-xml')

// strip invalid xml characters including gifs, images, emojis, etc
function stripNonValidXMLCharacters(text){
  const out = [] // Used to hold the output.
  if (!text || text === '') {
    return ''
  }

  for ( var i = 0; i < text.length; i++) {
    const current = text.charCodeAt(i)
    if ((current == 0x9) ||
    (current == 0xA) ||
    (current == 0xD) ||
    ((current >= 0x20) && (current <= 0xD7FF)) ||
    ((current >= 0xE000) && (current <= 0xFFFD)) ||
    ((current >= 0x10000) && (current <= 0x10FFFF)))
    out.push(text.charAt(i))
  }
  return out.join('')
}

// default handlers, to prevent reference errors
const defaultHandlers = {
  onMessageEvent (from, message) {
  },
  onStatusEvent (status, detail) {
  },
  onPresenceEvent (from, status) {
  },
  onPresenceJoined (from) {
  },
  onPresenceLeft (from) {
  },
  onLastParticipantLeft () {
  },
  onTypingEvent (from, status) {
  },
  onTypingStart (from) {
  },
  onTypingStop (from) {
  },
  onOtherEvent (type, ev) {
  },
  onAgentTimeout (message) {
  },
  onChatCreated () {
  },
  onStopPolling () {
  },
  onSessionExpired () {
  }
}

module.exports = class UccxChatClient {
  constructor (params) {
    // the cookie used for REST requests for this session
    this.jar = request.jar()
    // probably no longer needed
    this.jsessionid = null
    // beginning event ID
    this.lastEventId = 0
    // events polling interval
    this.eventsInterval = null
    // number of participants (agents)
    this.participants = 0
    // chat form ID - a number >= 100000
    this.form = params.form
    // base SocialMiner url, like https://sm2-uccx.dcloud.cisco.com/ccp
    this.urlBase = params.urlBase
    // CSQ ID in UCCX
    this.csq = params.csq
    // title of the chat
    this.title = params.title || ''
    // customer's name
    this.customerName = params.customerName || this.title
    // customer's email
    this.customerEmail = params.customerEmail || ''
    // customer's phone
    this.customerPhone = params.customerPhone || ''
    // author
    this.author = params.author || this.customerName

    // callback handlers
    this.handlers = Object.assign(defaultHandlers, params.handlers)
  }

  // update handlers after construction
  setHandlers(handlers) {
    // callback handlers
    this.handlers = Object.assign(this.handlers, handlers)
  }

  start () {
    console.log('creating UCCX chat client at', this.urlBase)
    // start a new chat session on UCCX/SocialMiner
    const qs = {
      author: this.author,
      title: this.title,
      extensionField_Name: this.customerName,
      extensionField_Email: this.customerEmail,
      extensionField_PhoneNumber: this.customerPhone,
      extensionField_ccxqueuetag: this.csq
    }
    request({
      jar: this.jar,
      url: `${this.urlBase}/chat/${this.form}/redirect`,
      resolveWithFullResponse: true,
      simple: false,
      followRedirect: false,
      qs
    }).then(response => {
      if (response.statusCode === 302) {
        this.startPolling()
      } else {
        console.log('failed to start uccx chat client at', this.urlBase, 'with', qs)
        console.log('start uccx chat response message', response.message)
      }
    }).catch(e => {
      console.error('error', e.message)
    })
  }

  startPolling () {
    // poll events every 5 seconds
    this.eventsInterval = setInterval(() => {
      // check for events for this session
      request({
        jar: this.jar,
        url: `${this.urlBase}/chat`,
        qs: {
          eventid: this.lastEventId,
          // use all = true to also get customer messages
          all: false
        }
      }).then(events => {
        // parse xml events string into JSON
        return parseXmlString(events)
      }).then(jsonData => {
        // parse the events in the json
        this.parseEvents(jsonData.chatEvents)
      }).catch(e => {
        console.log('session expired?', e.message)
        this.stopPolling()
      })
    }, 5000)
  }

  stopPolling () {
    // clear the current intervals
    clearInterval(this.eventsInterval)
    this.handlers.onStopPolling.call(this)
  }

  parseEvents (events) {
    const eventTypes = Object.keys(events)
    for (const eventType of eventTypes) {
      for (const ev of events[eventType]) {
        this.processEvent(eventType, ev)
      }
    }
  }

  processEvent (type, ev) {
    // console.log('event', ev)
    // get event ID
    const id = parseInt(ev.id)
    if (id > this.lastEventId) {
      // increment eventid
      this.lastEventId = id
    }
    if (type === 'MessageEvent') {
      // message events
      this.handlers.onMessageEvent.call(this, ev.from[0], decodeURIComponent(ev.body[0].replace(/\+/g, ' ')))
      // console.log(ev)
    } else if (type === 'StatusEvent') {
      // status events
      const status = ev.status[0]
      const detail = ev.detail ? ev.detail[0] : ''
      this.handlers.onStatusEvent.call(this, status, detail)
      switch (status) {
        case 'chat_timedout_waiting_for_agent': {
          this.handlers.onAgentTimeout.call(this, detail)
          break
        }
        case 'chat_ok': {
          this.handlers.onChatCreated.call(this)
          break
        }
      }
    } else if (type === 'PresenceEvent') {
      this.handlers.onPresenceEvent.call(this, ev.from[0], ev.status[0])
      // keep track of the number of participants
      if (ev.status[0] === 'joined') {
        this.handlers.onPresenceJoined.call(this, ev.from[0])
        this.participants++
      } else if (ev.status[0] === 'left') {
        this.handlers.onPresenceLeft.call(this, ev.from[0])
        this.participants--
        // if the last participant left, the chat has ended. stop polling.
        if (this.participants < 1) {
          this.handlers.onLastParticipantLeft.call(this)
          // clear the current intervals
          this.stopPolling()
        }
      }
      console.log('participants =', this.participants)
    } else if (type === 'TypingEvent') {
      this.handlers.onTypingEvent.call(this, ev.from[0], ev.status[0])
      switch (ev.status[0]) {
        case 'composing': {
          this.handlers.onTypingStart.call(this, ev.from[0])
          break
        }
        case 'paused': {
          this.handlers.onTypingStop.call(this, ev.from[0])
          break
        }
      }
    } else {
      this.handlers.onOtherEvent.call(this, type, ev)
    }
  }

  sendMessage (message) {
    const cleanMessage = stripNonValidXMLCharacters(message)
    // send a message as the customer
    request({
      jar: this.jar,
      method: 'PUT',
      url: `${this.urlBase}/chat`,
      headers: {
        'Content-Type': 'application/xml'
      },
      body: `<Message><body>${cleanMessage}</body></Message>`
    }).then(response => {
      console.log('customer message sent.')
    }).catch(e => {
      console.error('failed to send message as customer', e.message)
      if (e.statusCode === 404) {
        // session expired - stop polling
        this.handlers.onSessionExpired.call(this)
        this.stopPolling()
      }
    })
  }
}
