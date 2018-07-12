const request = require('request-promise-native')
const queryString = require('query-string')
const parseXmlString = require('../src/parse-xml')

let jsessionid
let jar = request.jar()
let eventid = 0
// events polling interval
let interval
let participants = 0
// automated message sender interval
let messageInterval

request({
  jar,
  url: 'https://sm2-uccx.dcloud.cisco.com/ccp/chat/100000/redirect',
  resolveWithFullResponse: true,
  simple: false,
  followRedirect: false,
  qs: {
    author: 'Coty Condry',
    title: 'Facebook Messenger',
    extensionField_Name: 'Facebook Messenger',
    extensionField_Email: '',
    extensionField_PhoneNumber: '',
    extensionField_ccxqueuetag: 'Chat_Csq28'
  }
}).then(response => {
  // poll events every 5 seconds
  interval = setInterval(function () {
    // check for events for this session
    request({
      jar,
      url: 'https://sm2-uccx.dcloud.cisco.com/ccp/chat',
      qs: {
        // jsessionid,
        eventid,
        all: true
      }
    }).then(events => {
      // parse xml events string into JSON
      return parseXmlString(events)
    }).then(jsonData => {
      // parse the events in the json
      parseEvents(jsonData.chatEvents)
    }).catch(e => {
      console.log('session expired', e)
      // clear the current intervals
      clearInterval(interval)
      clearInterval(messageInterval)
    })
  }, 5000)
}).catch(e => {
  console.error('error', e.message)
})

function parseEvents (events) {
  // StatusEvent: [ [Object] ],
  // PresenceEvent: [ [Object] ],
  // TypingEvent: [ [Object], [Object] ],
  // MessageEvent: [ [Object], [Object] ]
  const eventTypes = Object.keys(events)
  for (const eventType of eventTypes) {
    for (const ev of events[eventType]) {
      processEvent(eventType, ev)
    }
  }
}

function processEvent (type, ev) {
  // console.log('event', ev)
  // get event ID
  const id = parseInt(ev.id)
  if (id > eventid) {
    // increment eventid
    eventid = id
  }
  if (type === 'MessageEvent') {
    // message events
    console.log(ev.from[0], 'said', decodeURIComponent(ev.body[0].replace(/\+/g, ' ')))
    // console.log(ev)
  } else if (type === 'StatusEvent') {
    const status = ev.status[0]
    // status events
    switch (status) {
      case 'chat_timedout_waiting_for_agent': {
        console.log(ev.detail[0])
        break
      }
      case 'chat_ok': {
        console.log('Chat request created')
        break
      }
      default: {
        console.log('status event', ev)
        break
      }
    }
  } else if (type === 'PresenceEvent') {
    console.log(`presence event: ${ev.from[0]} ${ev.status[0]}`)
    // keep track of the number of participants
    if (ev.status[0] === 'joined') {
      participants++
      console.log('participant joined. start sending messages as customer.')
      // check that there is not a current interval set up for sending messages
      if (messageInterval) {
        // clear the current interval
        clearInterval(messageInterval)
      }
      // set up new interval to send messages to agent every 5 seconds
      messageInterval = setInterval(function () {
        // send a message as the customer
        request({
          jar,
          method: 'PUT',
          url: 'https://sm2-uccx.dcloud.cisco.com/ccp/chat',
          headers: {
            'Content-Type': 'application/xml'
          },
          body: '<Message><body>hi from customer</body></Message>'
        }).then(response => {
          console.log('customer message sent.')
        }).catch(e => {
          console.error('failed to send message as customer', e.message)
        })
      }, 5000)
    } else if (ev.status[0] === 'left') {
      participants--
      // if the last participant left, the chat has ended. stop polling.
      if (participants < 1) {
        console.log('last participant left chat. stop polling.')
        // clear the current intervals
        clearInterval(interval)
        clearInterval(messageInterval)
      }
    }
    console.log('participants =', participants)
  } else if (type === 'TypingEvent') {
    console.log(`typing event: ${ev.from[0]} ${ev.status[0]}`)
  } else {
    console.log(type, ev)
  }
}
